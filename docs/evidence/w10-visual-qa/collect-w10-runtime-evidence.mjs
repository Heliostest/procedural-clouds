import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { execSync } from 'node:child_process';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(OUT, '../../..');
const WARMUP = Number(process.env.W10_TIMING_WARMUP || 30);
const SAMPLES = Number(process.env.W10_TIMING_SAMPLES || 60);

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function p90(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1);
  return s[idx];
}
function statsOf(values) {
  return {
    count: values.length,
    median: median(values),
    p90: p90(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

function gitText(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function collectGitProvenance() {
  const headCommit = gitText('rev-parse HEAD') || 'unknown';
  const porcelain = gitText('status --porcelain');
  const dirtyPaths = porcelain
    ? porcelain.split(/\r?\n/).filter(Boolean).map((line) => {
      const m = line.match(/^.. ?(.+)$/);
      const p = (m ? m[1] : line).trim();
      return p.replace(/^"/, '').replace(/"$/, '');
    })
    : [];
  const dirty = dirtyPaths.length > 0;
  const srcDirtyPaths = dirtyPaths.filter((p) => p.startsWith('src/') || p.startsWith('src\\'));
  const shaderDirtyPaths = dirtyPaths.filter((p) => (
    p.includes('shader') || p.endsWith('.wgsl') || p.includes('/shaders/') || p.includes('\\shaders\\')
  ));
  const runtimeSourceDirty = srcDirtyPaths.length > 0 || shaderDirtyPaths.length > 0;
  const docsOrOpenspecDirty = dirtyPaths.some((p) => (
    p.startsWith('docs/') || p.startsWith('docs\\')
    || p.startsWith('openspec/') || p.startsWith('openspec\\')
  ));
  const runtimeSourceMatchesHead = !runtimeSourceDirty;
  return {
    headCommit,
    gitDirty: dirty,
    dirtyPaths,
    srcDirtyPaths,
    shaderDirtyPaths,
    runtimeSourceDirty,
    docsOrOpenspecDirty,
    runtimeSourceMatchesHead,
    note: runtimeSourceMatchesHead
      ? (dirty
        ? 'src/shaders clean vs HEAD; working tree has docs/OpenSpec/other dirty paths only'
        : 'working tree clean vs HEAD')
      : 'src and/or shaders dirty vs HEAD — do not treat timings as clean-revision Gate data',
  };
}

async function waitFrames(page, count = 12) {
  await page.evaluate((frameCount) => new Promise((resolve) => {
    let remaining = frameCount;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
}

async function applyMode(page, options) {
  const before = await page.evaluate(() => (
    window.densityBenchmark.getRuntimeDiagnostics().raymarch.raymarchCounterSampleId
  ));
  await page.evaluate((next) => window.densityBenchmark.setW10Options(next), options);
  await waitFrames(page, 16);
  await page.waitForFunction((sampleBefore) => {
    const raymarch = window.densityBenchmark.getRuntimeDiagnostics().raymarch;
    return raymarch.raymarchCounterSampleId > sampleBefore
      && raymarch.raymarchCounterConfigGeneration === raymarch.raymarchConfigGeneration;
  }, before, { timeout: 60_000, polling: 100 });
  await waitFrames(page, 4);
}

async function startCase(page, caseId) {
  const startFrame = await page.evaluate((id) => {
    const start = window.densityBenchmark.getRuntimeDiagnostics().raymarch.raymarchCurrentFrameIndex;
    window.densityBenchmark.start(id);
    return start;
  }, caseId);
  await page.waitForFunction(() => {
    const state = window.densityBenchmark.getStatus().state;
    return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
  }, null, { timeout: 180_000, polling: 250 });
  const status = await page.evaluate(() => window.densityBenchmark.getStatus());
  if (status.state === 'invalid') throw new Error(`invalid case ${caseId}: ${status.message}`);
  await page.waitForFunction((frame) => {
    const raymarch = window.densityBenchmark.getRuntimeDiagnostics().raymarch;
    const cloudFrame = window.densityBenchmark.getRuntimeDiagnostics().cloudFrame;
    return raymarch.raymarchCounterFrameIndex > frame
      && raymarch.raymarchCounterConfigGeneration === raymarch.raymarchConfigGeneration
      && Array.isArray(cloudFrame.gpuValidationErrors)
      && cloudFrame.gpuValidationErrors.length === 0;
  }, startFrame, { timeout: 60_000, polling: 100 });
}

async function sampleTimings(page, count) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    await waitFrames(page, 2);
    samples.push(await page.evaluate(() => {
      const d = window.densityBenchmark.getRuntimeDiagnostics();
      const ev = window.densityBenchmark.getEvidence();
      return {
        cloudCurrentMs: d.cloudFrame.cloudCurrentMs,
        temporalResolveMs: d.cloudFrame.temporalResolveMs,
        compositeMs: d.cloudFrame.compositeMs,
        path: d.cloudFrame.cloudFrameActivePath,
        world: d.raymarch.worldStepActive,
        stoch: d.raymarch.stochasticSamplingActive,
        iter: d.raymarch.raymarchPrimaryIterationsPerPixel,
        avgStep: d.raymarch.raymarchAverageStepMeters,
        coarseHints: d.raymarch.raymarchCoarseHintsPerPixel,
        supportSkips: d.raymarch.raymarchSupportSkipsPerPixel,
        candidateSkips: d.raymarch.raymarchCandidateSkipsPerPixel,
        gpuValidationErrors: d.cloudFrame.gpuValidationErrors,
        deviceInfo: ev.deviceInfo,
        revision: ev.sourceRevision,
      };
    }));
  }
  return samples;
}

const provenance = collectGitProvenance();

const viteServer = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  clearScreen: false,
});
await viteServer.listen();
const address = viteServer.httpServer?.address();
const base = `http://127.0.0.1:${address.port}/procedural-clouds/?benchmark=1`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const evidence = {
  generatedAt: new Date().toISOString(),
  base,
  revision: provenance.headCommit,
  viewport: { width: 1280, height: 720 },
  warmupFrames: WARMUP,
  sampleCount: SAMPLES,
  apiPolicy: 'HEAD benchmark APIs only (setW10Options/start/getRuntimeDiagnostics/getEvidence). Withdrawn uncommitted markCameraCut/setFixedCanvasSize/isCameraPinned evidence APIs are not used.',
  provenance,
  checks: {},
  timing: {},
  meta: {},
};

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 6;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 3;
  });

  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const ua = await page.evaluate(() => navigator.userAgent);
  const hasMarkCameraCut = await page.evaluate(() => typeof window.densityBenchmark.markCameraCut === 'function');
  const hasSetFixedCanvasSize = await page.evaluate(() => typeof window.densityBenchmark.setFixedCanvasSize === 'function');
  evidence.meta = {
    dpr,
    userAgent: ua,
    revision: provenance.headCommit,
    runtimeSourceMatchesHead: provenance.runtimeSourceMatchesHead,
    gitDirty: provenance.gitDirty,
    exposedWithdrawnApis: { markCameraCut: hasMarkCameraCut, setFixedCanvasSize: hasSetFixedCanvasSize },
  };
  if (hasMarkCameraCut || hasSetFixedCanvasSize) {
    evidence.meta.warning = 'Withdrawn evidence APIs still visible in loaded page; abort treating timings as HEAD-clean';
  }

  const caseSc = 'w9--single-stratocumulus--recipe-v2--hierarchical--cached--normal';
  await startCase(page, caseSc);

  await applyMode(page, {
    cloudFrameEnabled: true,
    worldStepEnabled: false,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  });
  await waitFrames(page, WARMUP);
  const samplesB = await sampleTimings(page, SAMPLES);
  const timingAvailable = samplesB.every((s) => (
    Number.isFinite(s.cloudCurrentMs) && s.cloudCurrentMs + s.temporalResolveMs + s.compositeMs > 0
  ));
  evidence.timing.w10a_modeB_cloudFrame_fixed = {
    mode: 'B',
    description: 'cloud-frame + fixed-step + IGN/Halton',
    available: timingAvailable,
    reason: timingAvailable ? '' : 'pass timings zero/non-finite (timestamp-query may be unavailable)',
    cloudCurrentMs: statsOf(samplesB.map((s) => s.cloudCurrentMs)),
    temporalResolveMs: statsOf(samplesB.map((s) => s.temporalResolveMs)),
    compositeMs: statsOf(samplesB.map((s) => s.compositeMs)),
    deviceInfo: samplesB[0]?.deviceInfo ?? null,
  };

  await applyMode(page, {
    cloudFrameEnabled: false,
    worldStepEnabled: false,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  });
  await waitFrames(page, WARMUP);
  const samplesA = await sampleTimings(page, SAMPLES);
  evidence.timing.w10a_modeA_combined_fixed = {
    mode: 'A',
    description: 'combined-feature-off + fixed-step',
    available: samplesA.every((s) => Number.isFinite(s.cloudCurrentMs)),
    cloudCurrentMs: statsOf(samplesA.map((s) => s.cloudCurrentMs)),
    temporalResolveMs: statsOf(samplesA.map((s) => s.temporalResolveMs)),
    compositeMs: statsOf(samplesA.map((s) => s.compositeMs)),
  };

  await applyMode(page, {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  });
  await waitFrames(page, WARMUP);
  const samplesC = await sampleTimings(page, SAMPLES);
  evidence.timing.w10b_modeC_world_ign = {
    mode: 'C',
    description: 'cloud-frame + world-step + IGN/Halton',
    available: samplesC.every((s) => Number.isFinite(s.cloudCurrentMs) && s.world === true),
    cloudCurrentMs: statsOf(samplesC.map((s) => s.cloudCurrentMs)),
    temporalResolveMs: statsOf(samplesC.map((s) => s.temporalResolveMs)),
    compositeMs: statsOf(samplesC.map((s) => s.compositeMs)),
    iter: statsOf(samplesC.map((s) => s.iter)),
    avgStep: statsOf(samplesC.map((s) => s.avgStep)),
    coarseHints: statsOf(samplesC.map((s) => s.coarseHints)),
  };

  await applyMode(page, {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: true,
    stbnFrozenSlice: 7,
    taaEnabled: true,
    debugView: 0,
  });
  await waitFrames(page, WARMUP);
  const samplesD = await sampleTimings(page, SAMPLES);
  evidence.timing.w10b_modeD_world_stbn = {
    mode: 'D',
    description: 'cloud-frame + world-step + STBN freeze 7',
    available: samplesD.every((s) => Number.isFinite(s.cloudCurrentMs) && s.stoch === 'stbn'),
    cloudCurrentMs: statsOf(samplesD.map((s) => s.cloudCurrentMs)),
    temporalResolveMs: statsOf(samplesD.map((s) => s.temporalResolveMs)),
    compositeMs: statsOf(samplesD.map((s) => s.compositeMs)),
    iter: statsOf(samplesD.map((s) => s.iter)),
  };

  evidence.checks.depthVelocityCameraMotionApi = {
    status: 'UNABLE',
    reason: 'HEAD has no reliable camera-cut/discontinuity evidence API; setCamera is overwritten by interactive orbit follow and does not prove depth/velocity pixels',
  };
  evidence.checks.emptySkyLookApi = {
    status: 'OBSERVATION',
    reason: 'Weak API only: empty validation errors after camera nudge — not empty-sky depth/velocity pixel proof',
  };
  evidence.checks.windOrTimeContentRevisionApi = {
    status: 'OBSERVATION',
    reason: 'Weak API only: contentRevision non-decreasing — not wind-advection depth/velocity pixel proof',
  };
  evidence.checks.historyPathOwnershipApi = {
    status: 'OBSERVATION',
    reason: 'Path ownership cloud-frame observed; sky/ground/gizmo non-contamination remains owner visual PENDING',
  };
  evidence.checks.resizeDiscontinuityApi = {
    status: 'UNABLE',
    reason: 'HEAD has no setFixedCanvasSize evidence API; playwright viewport resize ignored under benchmark fixed canvas',
  };

  await applyMode(page, { cloudFrameEnabled: false, worldStepEnabled: false });
  const featureOff = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().cloudFrame);
  evidence.checks.featureOffFallbackApi = {
    status: featureOff.cloudFrameActivePath === 'combined-feature-off' ? 'PASS' : 'FAIL',
    reason: `path=${featureOff.cloudFrameActivePath} fallback=${featureOff.cloudFrameFallbackReason}`,
    path: featureOff.cloudFrameActivePath,
    fallback: featureOff.cloudFrameFallbackReason,
  };
  evidence.checks.deviceLossApi = {
    status: 'UNABLE',
    reason: 'No safe automated WebGPU device-loss injection in this harness',
  };
  evidence.checks.pipelineFailureEmergencyApi = {
    status: 'UNABLE',
    reason: 'No safe automated MRT/pipeline-failure injection; feature-off path covered separately',
  };

  await applyMode(page, {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: false,
    debugView: 0,
  });
  await waitFrames(page, 20);
  const skipOn = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().raymarch);
  await applyMode(page, {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: false,
    worldStepCandidateSkipping: true,
    stochasticSampling: false,
    debugView: 0,
  });
  await waitFrames(page, 20);
  const skipOff = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().raymarch);
  const rejectRuntimeOk = skipOn.worldStepActive && skipOff.worldStepActive
    && skipOff.raymarchPrimaryIterationsPerPixel >= skipOn.raymarchPrimaryIterationsPerPixel;
  evidence.checks.hardRejectRuntimeSupportToggle = {
    status: rejectRuntimeOk ? 'PASS' : 'FAIL',
    reason: rejectRuntimeOk
      ? 'Support-skip off does not reduce primary iterations vs on (conservative direction); not FN=0 pixel suite'
      : 'Support-skip toggle produced unexpected iteration ordering',
    iterOn: skipOn.raymarchPrimaryIterationsPerPixel,
    iterOff: skipOff.raymarchPrimaryIterationsPerPixel,
    supportSkipsOn: skipOn.raymarchSupportSkipsPerPixel,
    supportSkipsOff: skipOff.raymarchSupportSkipsPerPixel,
  };

  evidence.checks.coarseHintIndependentToggle = {
    status: 'UNABLE',
    reason: 'No CloudParams/W10RuntimeOverrides field for coarse-hint; counter raymarchCoarseHintsPerPixel observed only',
    observedCoarseHintsModeC: evidence.timing.w10b_modeC_world_ign.coarseHints,
  };

  const thinCase = 'w9--w9-thin-ridge-proxy--recipe-v2--hierarchical--cached--normal';
  const thinShots = path.join(OUT, 'screenshots');
  mkdirSync(thinShots, { recursive: true });
  try {
    await startCase(page, thinCase);
    await applyMode(page, {
      cloudFrameEnabled: true,
      worldStepEnabled: false,
      stochasticSampling: false,
      taaEnabled: true,
      debugView: 0,
    });
    await waitFrames(page, 16);
    const thinFixed = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
    await page.screenshot({ path: path.join(thinShots, 'thin-ridge__mode-B-fixed__clean.png') });
    await applyMode(page, {
      cloudFrameEnabled: true,
      worldStepEnabled: true,
      worldStepSupportSkipping: true,
      worldStepCandidateSkipping: true,
      stochasticSampling: false,
      taaEnabled: true,
      debugView: 0,
    });
    await waitFrames(page, 16);
    const thinWorld = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
    await page.screenshot({ path: path.join(thinShots, 'thin-ridge__mode-C-world__clean.png') });
    evidence.checks.thinRidgeHierarchicalCapture = {
      status: thinFixed.cloudFrame.gpuValidationErrors.length === 0
        && thinWorld.cloudFrame.gpuValidationErrors.length === 0
        && thinWorld.raymarch.worldStepActive
        ? 'PASS'
        : 'FAIL',
      reason: 'Captured hierarchical thin-ridge fixed vs world diagnostics/screenshots; owner visual miss judgment still PENDING',
      caseId: thinCase,
      fixedIter: thinFixed.raymarch.raymarchPrimaryIterationsPerPixel,
      worldIter: thinWorld.raymarch.raymarchPrimaryIterationsPerPixel,
      worldAvgStep: thinWorld.raymarch.raymarchAverageStepMeters,
      storageActive: thinWorld.producer?.storageActive ?? thinFixed.producer?.storageActive,
      shots: [
        'screenshots/thin-ridge__mode-B-fixed__clean.png',
        'screenshots/thin-ridge__mode-C-world__clean.png',
      ],
    };
    evidence.checks.thinRidgeHierarchicalVisual = {
      status: 'UNABLE',
      reason: 'Screenshots captured; owner must judge sampling miss vs fixed-step (not auto PASS)',
    };
  } catch (error) {
    evidence.checks.thinRidgeHierarchicalCapture = {
      status: 'UNABLE',
      reason: error instanceof Error ? error.message : String(error),
    };
    evidence.checks.thinRidgeHierarchicalVisual = {
      status: 'UNABLE',
      reason: 'thin-ridge case failed to run',
    };
  }
} catch (error) {
  evidence.fatal = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(path.join(OUT, 'runtime-evidence.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
  await viteServer.close();
}

console.log(JSON.stringify({
  out: path.join(OUT, 'runtime-evidence.json'),
  provenance: evidence.provenance,
  timingKeys: Object.keys(evidence.timing),
  checkStatuses: Object.fromEntries(
    Object.entries(evidence.checks).map(([k, v]) => [k, v.status]),
  ),
  fatal: evidence.fatal ?? null,
}, null, 2));
