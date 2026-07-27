import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(OUT, 'screenshots');
const DIAG = path.join(OUT, 'diagnostics');
const BASE = process.env.W10_BASE_URL || 'http://127.0.0.1:5174/procedural-clouds/?benchmark=1';
const SCENE_IDS = (process.env.W10_SCENES || 'single-stratus,single-cirrostratus,single-stratocumulus,single-cirrocumulus')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MODES = {
  A: {
    cloudFrameEnabled: false,
    worldStepEnabled: false,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  },
  B: {
    cloudFrameEnabled: true,
    worldStepEnabled: false,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  },
  C: {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: false,
    taaEnabled: true,
    debugView: 0,
  },
  D: {
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: true,
    stbnFrozenSlice: 7,
    taaEnabled: true,
    debugView: 0,
  },
};

mkdirSync(SHOTS, { recursive: true });
mkdirSync(DIAG, { recursive: true });

async function waitFrames(page, count = 16) {
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

async function capturePair(page, stem, results, meta) {
  const diagnostics = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  const cleanPath = path.join(SHOTS, `${stem}__clean.png`);
  const hudPath = path.join(SHOTS, `${stem}__hud.png`);
  await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
  await page.screenshot({ path: cleanPath });
  await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
  await page.screenshot({ path: hudPath });
  const diagPath = path.join(DIAG, `${stem}.json`);
  writeFileSync(diagPath, JSON.stringify({ ...meta, diagnostics }, null, 2));
  results.push({
    ...meta,
    stem: meta.stem ?? stem,
    cleanPath: path.relative(OUT, cleanPath).replaceAll('\\', '/'),
    hudPath: path.relative(OUT, hudPath).replaceAll('\\', '/'),
    diagPath: path.relative(OUT, diagPath).replaceAll('\\', '/'),
    diagnostics,
  });
  return diagnostics;
}

function summarize(diagnostics) {
  const cf = diagnostics.cloudFrame;
  const rm = diagnostics.raymarch;
  return {
    activePath: cf.cloudFrameActivePath,
    gpuValidationErrors: cf.gpuValidationErrors,
    worldStepActive: rm.worldStepActive,
    supportSkip: rm.worldStepSupportSkipping,
    candidateSkip: rm.worldStepCandidateSkipping,
    stochastic: rm.stochasticSamplingActive,
    stbnFrozenSlice: rm.stbnFrozenSlice,
    maxStep: rm.raymarchMaxStepMeters,
    cfgMaxStep: rm.worldStepMaxMeters,
    sampleId: rm.raymarchCounterSampleId,
    counterGen: rm.raymarchCounterConfigGeneration,
    configGen: rm.raymarchConfigGeneration,
  };
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const results = [];
const errors = [];

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 6;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 3;
  });

  // Prefer hierarchical, then global-only, then cases with no storage field
  // (W6/W7 stratiform fixtures). Do not require a storage key.
  const selected = await page.evaluate((sceneIds) => {
    const cases = window.densityBenchmark.manifest.cases;
    const poolFor = (sceneId) => cases.filter((c) => c.sceneId === sceneId
      && c.producer === 'recipe-v2'
      && c.quality === 'cached'
      && c.view === 'normal');
    return sceneIds.map((sceneId) => {
      const pool = poolFor(sceneId);
      const hit = pool.find((c) => c.storage === 'hierarchical')
        || pool.find((c) => c.storage === 'global-only')
        || pool.find((c) => c.storage == null)
        || pool[0]
        || null;
      return hit ? {
        sceneId,
        caseId: hit.id,
        producer: hit.producer,
        quality: hit.quality,
        view: hit.view,
        storage: hit.storage ?? null,
      } : { sceneId, caseId: null };
    });
  }, SCENE_IDS);

  writeFileSync(path.join(OUT, 'selected-cases.json'), JSON.stringify(selected, null, 2));

  for (const entry of selected) {
    if (!entry.caseId) {
      errors.push(`missing case for ${entry.sceneId}`);
      continue;
    }
    const short = entry.sceneId.replace('single-', '');
    const startFrame = await page.evaluate((id) => {
      const start = window.densityBenchmark.getRuntimeDiagnostics().raymarch.raymarchCurrentFrameIndex;
      window.densityBenchmark.start(id);
      return start;
    }, entry.caseId);

    await page.waitForFunction(() => {
      const state = window.densityBenchmark.getStatus().state;
      return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
    }, null, { timeout: 180_000, polling: 250 });

    const status = await page.evaluate(() => window.densityBenchmark.getStatus());
    if (status.state === 'invalid') {
      errors.push(`invalid case ${entry.caseId}: ${status.message}`);
      continue;
    }

    await page.waitForFunction((frame) => {
      const raymarch = window.densityBenchmark.getRuntimeDiagnostics().raymarch;
      const cloudFrame = window.densityBenchmark.getRuntimeDiagnostics().cloudFrame;
      return raymarch.raymarchCounterFrameIndex > frame
        && raymarch.raymarchCounterConfigGeneration === raymarch.raymarchConfigGeneration
        && Array.isArray(cloudFrame.gpuValidationErrors)
        && cloudFrame.gpuValidationErrors.length === 0;
    }, startFrame, { timeout: 60_000, polling: 100 });

    for (const modeName of ['A', 'B', 'C', 'D']) {
      await applyMode(page, MODES[modeName]);
      const diagnostics = await capturePair(page, `${short}__mode-${modeName}`, results, {
        sceneId: entry.sceneId,
        caseId: entry.caseId,
        mode: modeName,
        label: `mode-${modeName}`,
        stem: `${short}__mode-${modeName}`,
      });
      console.log(JSON.stringify({
        sceneId: entry.sceneId,
        mode: modeName,
        summary: summarize(diagnostics),
      }));
    }

    // skip/motion for every selected scene; debug views only for Sc/Cc.
    const needsDebug = entry.sceneId === 'single-stratocumulus'
      || entry.sceneId === 'single-cirrocumulus';
    if (needsDebug) {
      await applyMode(page, MODES.D);
      for (const debugView of [11, 12, 13, 14, 15]) {
        await applyMode(page, { ...MODES.D, debugView });
        await capturePair(page, `${short}__debug-${debugView}`, results, {
          sceneId: entry.sceneId,
          caseId: entry.caseId,
          mode: 'D',
          label: `debug-${debugView}`,
          debugView,
          stem: `${short}__debug-${debugView}`,
        });
      }
    }

    await applyMode(page, {
      ...MODES.D,
      debugView: 0,
      worldStepSupportSkipping: false,
      worldStepCandidateSkipping: true,
    });
    await capturePair(page, `${short}__skip-support-off`, results, {
      sceneId: entry.sceneId,
      caseId: entry.caseId,
      mode: 'D',
      label: 'skip-support-off',
      stem: `${short}__skip-support-off`,
    });

    await applyMode(page, {
      ...MODES.D,
      debugView: 0,
      worldStepSupportSkipping: true,
      worldStepCandidateSkipping: false,
    });
    await capturePair(page, `${short}__skip-candidate-off`, results, {
      sceneId: entry.sceneId,
      caseId: entry.caseId,
      mode: 'D',
      label: 'skip-candidate-off',
      stem: `${short}__skip-candidate-off`,
    });

    await applyMode(page, {
      ...MODES.D,
      debugView: 0,
      worldStepEnabled: false,
    });
    await capturePair(page, `${short}__world-step-off`, results, {
      sceneId: entry.sceneId,
      caseId: entry.caseId,
      mode: 'B-like',
      label: 'world-step-off',
      stem: `${short}__world-step-off`,
    });

    await applyMode(page, MODES.D);
    const cam = await page.evaluate(() => window.densityBenchmark.getCamera());
    await page.evaluate((next) => {
      window.densityBenchmark.setCamera({
        eye: [next.eye[0] + 1.8, next.eye[1] + 0.35, next.eye[2] - 1.2],
        target: [next.target[0] + 0.4, next.target[1], next.target[2]],
      });
    }, cam);
    for (let i = 0; i < 8; i += 1) {
      await waitFrames(page, 2);
      const stem = `${short}__motion-D__f${String(i).padStart(2, '0')}`;
      const framePath = path.join(SHOTS, `${stem}.png`);
      await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
      await page.screenshot({ path: framePath });
      await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
      results.push({
        sceneId: entry.sceneId,
        caseId: entry.caseId,
        mode: 'D',
        label: `motion-frame-${i}`,
        stem,
        cleanPath: path.relative(OUT, framePath).replaceAll('\\', '/'),
      });
    }
    await page.evaluate((sceneId) => window.densityBenchmark.resetCamera(sceneId), entry.sceneId);
  }
} catch (error) {
  errors.push(error instanceof Error ? error.stack : String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  const runsDir = path.join(OUT, 'capture-runs');
  mkdirSync(runsDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runPath = path.join(runsDir, `${runId}.json`);
  const runPayload = {
    runId,
    base: BASE,
    scenes: SCENE_IDS,
    policy: {
      modesABCD: 'all selected scenes',
      skipAndMotion: 'all selected scenes',
      debugViews: 'stratocumulus + cirrocumulus only',
      indexMerge: 'merge by stem into capture-index.json; never silent wipe',
    },
    results,
    errors,
  };
  writeFileSync(runPath, JSON.stringify(runPayload, null, 2));

  const indexPath = path.join(OUT, 'capture-index.json');
  let prior = { results: [] };
  if (existsSync(indexPath)) {
    try {
      prior = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch {
      prior = { results: [] };
    }
  }
  const byStem = new Map();
  for (const item of prior.results ?? []) {
    const stem = item.stem
      ?? item.diagPath?.replace(/^diagnostics\//, '').replace(/\.json$/, '')
      ?? item.cleanPath?.replace(/^screenshots\//, '').replace(/\.png$/, '');
    if (stem) byStem.set(stem, { ...item, stem });
  }
  for (const item of results) {
    const stem = item.stem
      ?? item.diagPath?.replace(/^diagnostics\//, '').replace(/\.json$/, '')
      ?? item.cleanPath?.replace(/^screenshots\//, '').replace(/\.png$/, '');
    if (!stem) continue;
    byStem.set(stem, {
      ...item,
      stem,
      runId,
      source: 'capture-run',
    });
  }
  const merged = {
    updatedAt: new Date().toISOString(),
    role: 'capture-provenance-index',
    lastRunId: runId,
    lastRunPath: path.relative(OUT, runPath).replaceAll('\\', '/'),
    base: BASE,
    policy: {
      ...runPayload.policy,
      owner: 'capture-w10-visual.mjs',
      note: 'Merges by stem; never wipes prior stems. build-visual-review must only write capture-disk-inventory.json.',
    },
    resultCount: byStem.size,
    results: [...byStem.values()].sort((a, b) => String(a.stem).localeCompare(String(b.stem))),
    lastRunErrors: errors,
  };
  writeFileSync(indexPath, JSON.stringify(merged, null, 2));
  await browser.close();
}

console.log(JSON.stringify({
  captured: results.length,
  errors,
  out: OUT,
}, null, 2));
