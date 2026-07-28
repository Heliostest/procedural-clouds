import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { execSync } from 'node:child_process';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(OUT, '../../..');
const WARMUP = Number(process.env.W11_TIMING_WARMUP || 30);
const SAMPLES = Number(process.env.W11_TIMING_SAMPLES || 60);

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

async function applyTemporal(page, options, expectedMode) {
  const before = await page.evaluate(() => {
    const d = window.densityBenchmark.getRuntimeDiagnostics();
    return {
      taau: d.temporal.taauResolveCounterSampleId,
      raymarch: d.raymarch.raymarchCounterSampleId,
    };
  });
  await page.evaluate((next) => window.densityBenchmark.setW10Options(next), options);
  await waitFrames(page, 16);
  await page.waitForFunction(({ sampleBefore, mode }) => {
    const d = window.densityBenchmark.getRuntimeDiagnostics();
    if (d.temporal.activeTemporalMode !== mode) return false;
    if (mode === 'taau-4x4') {
      return d.temporal.taauResolveCounterSampleId > sampleBefore.taau;
    }
    return d.raymarch.raymarchCounterSampleId > sampleBefore.raymarch
      && d.raymarch.raymarchCounterConfigGeneration === d.raymarch.raymarchConfigGeneration;
  }, { sampleBefore: before, mode: expectedMode }, { timeout: 90_000, polling: 100 });
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
        cloudCurrentMs: d.temporal.cloudCurrentMs,
        taauBackgroundMs: d.temporal.taauBackgroundMs,
        taauCurrentMs: d.temporal.taauCurrentMs,
        taauResolveMs: d.temporal.taauResolveMs,
        temporalResolveMs: d.temporal.temporalResolveMs,
        compositeMs: d.temporal.compositeMs,
        timedPassSumMs: d.temporal.timedPassSumMs,
        timedPassSumCovers: d.temporal.timedPassSumCovers,
        activeTemporalMode: d.temporal.activeTemporalMode,
        requestedTemporalMode: d.temporal.requestedTemporalMode,
        temporalFallbackReason: d.temporal.temporalFallbackReason,
        temporalBayerPhase: d.temporal.temporalBayerPhase,
        taauCurrentWidth: d.temporal.taauCurrentWidth,
        taauCurrentHeight: d.temporal.taauCurrentHeight,
        taauHistoryRejectionRatio: d.temporal.taauHistoryRejectionRatio,
        taauHistoryRejectionSampledEstimate: d.temporal.taauHistoryRejectionSampledEstimate,
        taauRejectNoVelocityRatio: d.temporal.taauRejectNoVelocityRatio,
        taauRejectViewportRatio: d.temporal.taauRejectViewportRatio,
        taauRejectDepthRatio: d.temporal.taauRejectDepthRatio,
        taauRejectOpacityRatio: d.temporal.taauRejectOpacityRatio,
        taauCurrentPhaseSampleCount: d.temporal.taauCurrentPhaseSampleCount,
        taauNonCurrentPhaseSampleCount: d.temporal.taauNonCurrentPhaseSampleCount,
        taauCloudCoveredSampleCount: d.temporal.taauCloudCoveredSampleCount,
        taauCloudCoveredRejectionRatio: d.temporal.taauCloudCoveredRejectionRatio,
        taauCloudOpacityThreshold: d.temporal.taauCloudOpacityThreshold,
        cloudFrameHistoryBytes: d.temporal.cloudFrameHistoryBytes,
        cloudFrameLowResAttachmentBytes: d.temporal.cloudFrameLowResAttachmentBytes,
        taauHistoryDepthBytes: d.temporal.taauHistoryDepthBytes,
        cloudFrameAttachmentBytes: d.cloudFrame.cloudFrameAttachmentBytes,
        path: d.cloudFrame.cloudFrameActivePath,
        gpuValidationErrors: d.cloudFrame.gpuValidationErrors,
        deviceInfo: ev.deviceInfo,
        revision: ev.sourceRevision,
        canvasWidth: document.querySelector('canvas')?.width ?? null,
        canvasHeight: document.querySelector('canvas')?.height ?? null,
      };
    }));
  }
  return samples;
}

const TEMPORAL_BASE = {
  cloudFrameEnabled: true,
  worldStepEnabled: false,
  stochasticSampling: false,
  taaEnabled: true,
  debugView: 0,
};

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

const launchAttempts = [
  {
    name: 'chrome-headless-webgpu',
    options: {
      channel: 'chrome',
      headless: true,
      args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
    },
  },
  {
    name: 'chrome-headless-angle-d3d11',
    options: {
      channel: 'chrome',
      headless: true,
      args: [
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
        '--use-angle=d3d11',
      ],
    },
  },
  {
    name: 'chrome-headed-webgpu',
    options: {
      channel: 'chrome',
      headless: false,
      args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
    },
  },
];

let browser = null;
let launchUsed = null;
const launchErrors = [];
for (const attempt of launchAttempts) {
  try {
    browser = await chromium.launch(attempt.options);
    launchUsed = attempt.name;
    break;
  } catch (error) {
    launchErrors.push({
      name: attempt.name,
      error: error instanceof Error ? error.stack : String(error),
    });
  }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  base,
  revision: provenance.headCommit,
  viewport: { width: 1280, height: 720 },
  warmupFrames: WARMUP,
  sampleCount: SAMPLES,
  launchUsed,
  launchErrors,
  apiPolicy: 'HEAD benchmark APIs only (setW10Options/start/getRuntimeDiagnostics/getEvidence). Wait on taauResolveCounterSampleId for TAAU mode switches.',
  provenance,
  checks: {},
  timing: {},
  memoryBandwidth: {},
  meta: {},
};

if (!browser) {
  evidence.fatal = 'browser-launch-failed';
  evidence.checks.browserLaunch = {
    status: 'UNABLE',
    reason: 'Playwright/Chrome launch failed after 3 attempts',
    launchErrors,
  };
  writeFileSync(path.join(OUT, 'runtime-evidence.json'), JSON.stringify(evidence, null, 2));
  await viteServer.close();
  console.error(JSON.stringify({ fatal: evidence.fatal, launchErrors }, null, 2));
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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
  evidence.meta = {
    dpr,
    userAgent: ua,
    revision: provenance.headCommit,
    runtimeSourceMatchesHead: provenance.runtimeSourceMatchesHead,
    gitDirty: provenance.gitDirty,
    launchUsed,
  };

  const caseSc = 'w9--single-stratocumulus--recipe-v2--hierarchical--cached--normal';
  await startCase(page, caseSc);

  const modeDefs = [
    { key: 'temporal_T0_off', quality: 0, expected: 'off', description: 'full-res no-TAA (temporalQuality=0)' },
    { key: 'temporal_T1_fullres_taa', quality: 1, expected: 'full-res-taa', description: 'full-res TAA (temporalQuality=1)' },
    { key: 'temporal_T2_taau_4x4', quality: 2, expected: 'taau-4x4', description: 'TAAU 4×4 (temporalQuality=2)' },
  ];

  for (const mode of modeDefs) {
    await applyTemporal(page, {
      ...TEMPORAL_BASE,
      temporalQuality: mode.quality,
    }, mode.expected);
    await waitFrames(page, WARMUP);
    const samples = await sampleTimings(page, SAMPLES);
    const available = samples.every((s) => (
      Number.isFinite(s.cloudCurrentMs)
      && Number.isFinite(s.temporalResolveMs)
      && Number.isFinite(s.compositeMs)
      && s.activeTemporalMode === mode.expected
    ));
    evidence.timing[mode.key] = {
      temporalQuality: mode.quality,
      expectedMode: mode.expected,
      description: mode.description,
      available,
      reason: available ? '' : 'timings non-finite or activeTemporalMode mismatch',
      cloudCurrentMs: statsOf(samples.map((s) => s.cloudCurrentMs)),
      taauBackgroundMs: statsOf(samples.map((s) => s.taauBackgroundMs)),
      taauCurrentMs: statsOf(samples.map((s) => s.taauCurrentMs)),
      taauResolveMs: statsOf(samples.map((s) => s.taauResolveMs)),
      temporalResolveMs: statsOf(samples.map((s) => s.temporalResolveMs)),
      compositeMs: statsOf(samples.map((s) => s.compositeMs)),
      timedPassSumMs: statsOf(samples.map((s) => s.timedPassSumMs)),
      deviceInfo: samples[0]?.deviceInfo ?? null,
      lastSample: samples[samples.length - 1] ?? null,
    };
  }

  const t2 = evidence.timing.temporal_T2_taau_4x4?.lastSample;
  const fullW = t2?.canvasWidth ?? null;
  const fullH = t2?.canvasHeight ?? null;
  const expectLowW = fullW != null ? Math.ceil(fullW / 4) : null;
  const expectLowH = fullH != null ? Math.ceil(fullH / 4) : null;
  const raymarchTexelRatio = (fullW && fullH && t2?.taauCurrentWidth && t2?.taauCurrentHeight)
    ? (t2.taauCurrentWidth * t2.taauCurrentHeight) / (fullW * fullH)
    : null;

  evidence.memoryBandwidth = {
    status: 'OBSERVATION',
    note: 'Bandwidth figures are theoretical estimates from attachment/history byte sizes and resolution ratios — not measured GPU bus traffic.',
    cloudFrameHistoryBytes: t2?.cloudFrameHistoryBytes ?? null,
    cloudFrameLowResAttachmentBytes: t2?.cloudFrameLowResAttachmentBytes ?? null,
    taauHistoryDepthBytes: t2?.taauHistoryDepthBytes ?? null,
    cloudFrameAttachmentBytes: t2?.cloudFrameAttachmentBytes ?? null,
    fullRes: { width: fullW, height: fullH },
    taauCurrent: { width: t2?.taauCurrentWidth ?? null, height: t2?.taauCurrentHeight ?? null },
    raymarchTexelRatio,
    theoreticalExtraBandwidthNote: 'OBSERVATION: low-res current + history/depth extras inferred from diagnostic byte counters; not a profiler measurement',
  };

  evidence.checks.activeTemporalModeTaau = {
    status: t2?.activeTemporalMode === 'taau-4x4' && t2?.path === 'cloud-frame' ? 'PASS' : 'FAIL',
    reason: `activeTemporalMode=${t2?.activeTemporalMode}; path=${t2?.path}`,
    activeTemporalMode: t2?.activeTemporalMode ?? null,
    path: t2?.path ?? null,
  };

  evidence.checks.taauCurrentResolutionCeil = {
    status: (
      fullW != null && fullH != null
      && t2?.taauCurrentWidth === expectLowW
      && t2?.taauCurrentHeight === expectLowH
    ) ? 'PASS' : 'FAIL',
    reason: `canvas=${fullW}x${fullH}; taau=${t2?.taauCurrentWidth}x${t2?.taauCurrentHeight}; expect ceil/4=${expectLowW}x${expectLowH}`,
    canvasWidth: fullW,
    canvasHeight: fullH,
    taauCurrentWidth: t2?.taauCurrentWidth ?? null,
    taauCurrentHeight: t2?.taauCurrentHeight ?? null,
    expectedWidth: expectLowW,
    expectedHeight: expectLowH,
  };

  await applyTemporal(page, { ...TEMPORAL_BASE, temporalQuality: 2 }, 'taau-4x4');
  const phaseSamples = [];
  for (let i = 0; i < 32; i++) {
    await waitFrames(page, 1);
    phaseSamples.push(await page.evaluate(() => (
      window.densityBenchmark.getRuntimeDiagnostics().temporal.temporalBayerPhase
    )));
  }
  const phaseInRange = phaseSamples.every((p) => Number.isInteger(p) && p >= 0 && p <= 15);
  let covers16 = false;
  let advancesMod16 = false;
  for (let start = 0; start + 16 <= phaseSamples.length; start++) {
    const window16 = phaseSamples.slice(start, start + 16);
    const set = new Set(window16);
    if (set.size === 16) covers16 = true;
  }
  if (phaseSamples.length >= 2) {
    advancesMod16 = phaseSamples.slice(0, -1).every((p, i) => (
      phaseSamples[i + 1] === ((p + 1) % 16)
    ));
  }
  evidence.checks.bayerPhaseRotation = {
    status: phaseInRange && covers16 && advancesMod16 ? 'PASS' : 'FAIL',
    reason: `inRange=${phaseInRange}; covers16=${covers16}; advancesMod16=${advancesMod16}; samples=${JSON.stringify(phaseSamples)}`,
    samples: phaseSamples,
    phaseInRange,
    covers16,
    advancesMod16,
  };

  await applyTemporal(page, {
    ...TEMPORAL_BASE,
    cloudFrameEnabled: false,
    temporalQuality: 2,
  }, 'full-res-taa');
  const combinedFallback = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().temporal);
  evidence.checks.combinedPathFallback = {
    status: (
      combinedFallback.activeTemporalMode === 'full-res-taa'
      && typeof combinedFallback.temporalFallbackReason === 'string'
      && combinedFallback.temporalFallbackReason.length > 0
    ) ? 'PASS' : 'FAIL',
    reason: `active=${combinedFallback.activeTemporalMode}; reason=${combinedFallback.temporalFallbackReason}`,
    activeTemporalMode: combinedFallback.activeTemporalMode,
    temporalFallbackReason: combinedFallback.temporalFallbackReason,
  };

  await applyTemporal(page, {
    ...TEMPORAL_BASE,
    taaEnabled: false,
    temporalQuality: 2,
  }, 'off');
  const taaOff = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().temporal);
  evidence.checks.taaDisabledFallback = {
    status: taaOff.activeTemporalMode === 'off' && taaOff.temporalFallbackReason === 'taa-disabled' ? 'PASS' : 'FAIL',
    reason: `active=${taaOff.activeTemporalMode}; reason=${taaOff.temporalFallbackReason}`,
    activeTemporalMode: taaOff.activeTemporalMode,
    temporalFallbackReason: taaOff.temporalFallbackReason,
  };

  await applyTemporal(page, {
    ...TEMPORAL_BASE,
    temporalQuality: 2,
    debugView: 3,
  }, 'off');
  const debugOff = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().temporal);
  evidence.checks.nonTaauDebugForcesOff = {
    status: debugOff.activeTemporalMode === 'off' && debugOff.temporalFallbackReason === 'debug-view' ? 'PASS' : 'FAIL',
    reason: `debugView=3 active=${debugOff.activeTemporalMode}; reason=${debugOff.temporalFallbackReason}`,
    activeTemporalMode: debugOff.activeTemporalMode,
    temporalFallbackReason: debugOff.temporalFallbackReason,
  };

  await applyTemporal(page, {
    ...TEMPORAL_BASE,
    temporalQuality: 2,
    debugView: 16,
  }, 'taau-4x4');
  const debug16 = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().temporal);
  await applyTemporal(page, {
    ...TEMPORAL_BASE,
    temporalQuality: 2,
    debugView: 17,
  }, 'taau-4x4');
  const debug17 = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics().temporal);
  evidence.checks.taauDebugViewsKeepTaau = {
    status: debug16.activeTemporalMode === 'taau-4x4' && debug17.activeTemporalMode === 'taau-4x4' ? 'PASS' : 'FAIL',
    reason: `debug16=${debug16.activeTemporalMode}; debug17=${debug17.activeTemporalMode}`,
    debug16: debug16.activeTemporalMode,
    debug17: debug17.activeTemporalMode,
  };

  const gpuOk = modeDefs.every((mode) => {
    const last = evidence.timing[mode.key]?.lastSample;
    return Array.isArray(last?.gpuValidationErrors) && last.gpuValidationErrors.length === 0;
  });
  evidence.checks.gpuValidationErrorsEmpty = {
    status: gpuOk ? 'PASS' : 'FAIL',
    reason: gpuOk
      ? 'gpuValidationErrors empty on T0/T1/T2 timing samples'
      : 'non-empty gpuValidationErrors on one or more temporal paths',
    perMode: Object.fromEntries(modeDefs.map((mode) => [
      mode.key,
      evidence.timing[mode.key]?.lastSample?.gpuValidationErrors ?? null,
    ])),
  };

  const rej = t2?.taauHistoryRejectionRatio;
  const rejEstimate = t2?.taauHistoryRejectionSampledEstimate === true;
  const rejInRange = typeof rej === 'number' && rej >= 0 && rej <= 1;
  evidence.checks.historyRejectionRatioRange = {
    status: rejInRange && rejEstimate ? 'PASS' : 'FAIL',
    reason: `ratio=${rej}; sampledEstimate=${t2?.taauHistoryRejectionSampledEstimate}; rangeOk=${rejInRange}`,
    taauHistoryRejectionRatio: rej ?? null,
    taauHistoryRejectionSampledEstimate: t2?.taauHistoryRejectionSampledEstimate ?? null,
  };
  evidence.checks.historyRejectionRatioValue = {
    status: 'OBSERVATION',
    reason: 'Ratio is a 1/16 sparse sampled estimate with no frozen Gate threshold; value recorded only',
    taauHistoryRejectionRatio: rej ?? null,
  };

  const reasonFields = {
    taauRejectNoVelocityRatio: t2?.taauRejectNoVelocityRatio,
    taauRejectViewportRatio: t2?.taauRejectViewportRatio,
    taauRejectDepthRatio: t2?.taauRejectDepthRatio,
    taauRejectOpacityRatio: t2?.taauRejectOpacityRatio,
  };
  const reasonsOk = Object.values(reasonFields).every((v) => typeof v === 'number' && v >= 0 && v <= 1);
  const reasonSum = Object.values(reasonFields).reduce((a, b) => a + (typeof b === 'number' ? b : NaN), 0);
  evidence.checks.historyRejectionReasonSplit = {
    status: reasonsOk ? 'PASS' : 'FAIL',
    reason: `nv/vp/d/o in [0,1]=${reasonsOk}; sum=${reasonSum}; aggregate=${rej}`,
    ...reasonFields,
    sum: reasonSum,
    taauHistoryRejectionRatio: rej ?? null,
    taauCurrentPhaseSampleCount: t2?.taauCurrentPhaseSampleCount ?? null,
    taauNonCurrentPhaseSampleCount: t2?.taauNonCurrentPhaseSampleCount ?? null,
  };
  const cloudRej = t2?.taauCloudCoveredRejectionRatio;
  const cloudCount = t2?.taauCloudCoveredSampleCount;
  evidence.checks.cloudCoveredRejectionRatio = {
    status: 'OBSERVATION',
    reason: 'Cloud-covered rejection (opacity>thr on current low-res sample); Gate-relevant; no frozen threshold',
    taauCloudCoveredRejectionRatio: cloudRej ?? null,
    taauCloudCoveredSampleCount: cloudCount ?? null,
    taauCloudOpacityThreshold: t2?.taauCloudOpacityThreshold ?? null,
  };

  evidence.checks.resizeDiscontinuityApi = {
    status: 'UNABLE',
    reason: 'HEAD has no setFixedCanvasSize evidence API; playwright viewport resize ignored under benchmark fixed canvas',
  };
  evidence.checks.deviceLossApi = {
    status: 'UNABLE',
    reason: 'No safe automated WebGPU device-loss injection in this harness',
  };
  evidence.checks.cameraCutPixelProof = {
    status: 'UNABLE',
    reason: 'HEAD has no reliable camera-cut evidence API; setCamera overwritten by interactive orbit follow; no pixel-level whole-frame invalidation proof',
  };
  evidence.checks.steadyTimingAsPerformanceGate = {
    status: 'UNABLE',
    reason: 'Steady median/p90 data available ≠ performance Gate pass: no frozen Gate threshold / owner judgment',
  };
  evidence.checks.taauVsFullresTaaVisualEquivalence = {
    status: 'UNABLE',
    reason: 'PNG diff is OBSERVATION only; TAAU vs full-res TAA visual equivalence requires owner judgment',
  };
  evidence.checks.ghostingBreathingVisual = {
    status: 'UNABLE',
    reason: 'Trailing / double-image / Bayer residue / 16-frame brightness breathing require owner visual review of screenshot sequences',
  };
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
  launchUsed: evidence.launchUsed,
  timingKeys: Object.keys(evidence.timing),
  checkStatuses: Object.fromEntries(
    Object.entries(evidence.checks).map(([k, v]) => [k, v.status]),
  ),
  fatal: evidence.fatal ?? null,
}, null, 2));
