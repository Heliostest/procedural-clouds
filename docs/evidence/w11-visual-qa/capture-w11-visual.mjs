import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(OUT, 'screenshots');
const DIAG = path.join(OUT, 'diagnostics');
const BASE = process.env.W11_BASE_URL || 'http://127.0.0.1:5174/procedural-clouds/?benchmark=1';

const SCENE_SPEC = [
  {
    sceneId: 'single-cirrostratus',
    short: 'cirrostratus',
    role: 'sparse-cs',
    category83: 'sparse Ci/Cs',
    note: 'sparse Cs proxy; has cloud signal (light samples > 0)',
    discriminativePower: 'usable-cs',
  },
  {
    sceneId: 'single-cirrus',
    short: 'cirrus',
    role: 'sparse-ci',
    category83: 'sparse Ci/Cs',
    note: 'NO DISCRIMINATIVE POWER: empty sky under current camera/body (raymarchLightSamplesPerPixel=0; T1≡T2). Manifest has no alternate sparse-Ci case with visible cloud; Cs uses cirrostratus.',
    discriminativePower: 'none-empty-sky',
  },
  {
    sceneId: 'single-cirrocumulus',
    short: 'cirrocumulus',
    role: 'cc-ripple',
    category83: 'Cc ripple',
    note: 'single-Cc as Cc ripple proxy (no dedicated ripple gate case with hierarchical normal)',
    discriminativePower: 'usable',
  },
  {
    sceneId: 'w9-thin-ridge-proxy',
    short: 'thin-ridge',
    role: 'cloud-sky-edge',
    category83: 'cloud/sky edge',
    note: 'thin-ridge proxy for cloud/sky edge',
    discriminativePower: 'usable',
  },
  {
    sceneId: 'single-stratocumulus',
    short: 'stratocumulus',
    role: 'cloud-ground-overlap',
    category83: 'cloud/ground overlap',
    note: 'Sc as cloud/ground overlap proxy',
    discriminativePower: 'usable',
  },
];

const DEBUG_VIEWS = [
  { id: 0, name: 'normal' },
  { id: 10, name: 'raw-density', note: 'gui density-integral / VIEW_MODE density-debug (=raw density path)' },
  { id: 1, name: 'transmittance' },
  { id: 6, name: 'depth' },
  { id: 11, name: 'velocity' },
  { id: 16, name: 'phase' },
  { id: 17, name: 'rejection' },
];

const TEMPORAL_BASE = {
  cloudFrameEnabled: true,
  worldStepEnabled: false,
  stochasticSampling: false,
  taaEnabled: true,
  debugView: 0,
};

const TEMPORAL_MODES = {
  T0: { ...TEMPORAL_BASE, temporalQuality: 0, expectedMode: 'off' },
  T1: { ...TEMPORAL_BASE, temporalQuality: 1, expectedMode: 'full-res-taa' },
  T2: { ...TEMPORAL_BASE, temporalQuality: 2, expectedMode: 'taau-4x4' },
};

const MOTION_DRAG = {
  method: 'playwright-canvas-pointer-drag',
  note: 'Orbit yaw via canvas pointer drag; setCamera is overwritten by followInteractiveCamera under active benchmark case',
  stepsPx: [56, 56, 56, 56, 56, 56, 56, 56],
  dyPx: 0,
};

const CONV_SHORT = 'cirrocumulus';
const MOTION_SHORT = 'stratocumulus';
const DEBUG_SHORTS = ['cirrocumulus', 'stratocumulus', 'thin-ridge'];
const EDGE_DEBUG_ONLY = new Set(['thin-ridge']);
const CONV_SCENE_CLOCK_POLICY = {
  frozen: true,
  mechanism: 'densityBenchmark.getFrameOverride().sceneClock fixed at scene.sceneTimeSeconds; bodies windSpeedMps=0 morphRate=0 via freezeBody',
  note: 'Convergence adjacent-frame diffs are under frozen scene time; wind advection is not advancing',
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

async function applyTemporal(page, options, expectedMode) {
  const before = await page.evaluate(() => {
    const d = window.densityBenchmark.getRuntimeDiagnostics();
    return {
      taau: d.temporal.taauResolveCounterSampleId,
      raymarch: d.raymarch.raymarchCounterSampleId,
    };
  });
  const { expectedMode: _ignored, ...setOpts } = options;
  await page.evaluate((next) => window.densityBenchmark.setW10Options(next), setOpts);
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

async function captureCleanOnly(page, stem, results, meta) {
  const diagnostics = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  const cleanPath = path.join(SHOTS, `${stem}.png`);
  await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
  await page.screenshot({ path: cleanPath });
  await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
  const diagPath = path.join(DIAG, `${stem}.json`);
  writeFileSync(diagPath, JSON.stringify({ ...meta, diagnostics }, null, 2));
  results.push({
    ...meta,
    stem: meta.stem ?? stem,
    cleanPath: path.relative(OUT, cleanPath).replaceAll('\\', '/'),
    diagPath: path.relative(OUT, diagPath).replaceAll('\\', '/'),
    diagnostics,
  });
  return diagnostics;
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

async function yawDragStep(page, dx, dy) {
  const box = await page.locator('#canvas').boundingBox();
  if (!box) throw new Error('#canvas bounding box missing');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

function summarize(diagnostics) {
  const t = diagnostics.temporal;
  const cf = diagnostics.cloudFrame;
  const r = diagnostics.raymarch;
  return {
    activePath: cf.cloudFrameActivePath,
    requestedTemporalMode: t.requestedTemporalMode,
    activeTemporalMode: t.activeTemporalMode,
    temporalFallbackReason: t.temporalFallbackReason,
    temporalBayerPhase: t.temporalBayerPhase,
    taauCurrentWidth: t.taauCurrentWidth,
    taauCurrentHeight: t.taauCurrentHeight,
    taauResolveCounterSampleId: t.taauResolveCounterSampleId,
    taauHistoryRejectionRatio: t.taauHistoryRejectionRatio,
    taauRejectNoVelocityRatio: t.taauRejectNoVelocityRatio,
    taauRejectViewportRatio: t.taauRejectViewportRatio,
    taauRejectDepthRatio: t.taauRejectDepthRatio,
    taauRejectOpacityRatio: t.taauRejectOpacityRatio,
    taauCloudCoveredRejectionRatio: t.taauCloudCoveredRejectionRatio,
    taauCloudCoveredSampleCount: t.taauCloudCoveredSampleCount,
    taauCloudOpacityThreshold: t.taauCloudOpacityThreshold,
    taauCurrentPhaseSampleCount: t.taauCurrentPhaseSampleCount,
    taauNonCurrentPhaseSampleCount: t.taauNonCurrentPhaseSampleCount,
    raymarchLightSamplesPerPixel: r?.raymarchLightSamplesPerPixel,
    raymarchDensitySamplesPerPixel: r?.raymarchDensitySamplesPerPixel,
    gpuValidationErrors: cf.gpuValidationErrors,
  };
}

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

const results = [];
const errors = [];
const motionEvidence = {
  drag: MOTION_DRAG,
  status: 'PENDING',
  reason: '',
  frames: [],
};

if (!browser) {
  errors.push({ fatal: 'browser-launch-failed', launchErrors });
  writeFileSync(path.join(OUT, 'capture-launch-errors.json'), JSON.stringify({ launchErrors }, null, 2));
  console.error(JSON.stringify({ fatal: 'browser-launch-failed', launchErrors }, null, 2));
  process.exitCode = 1;
} else {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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

    const selected = await page.evaluate((specs) => {
      const cases = window.densityBenchmark.manifest.cases;
      const poolFor = (sceneId) => cases.filter((c) => c.sceneId === sceneId
        && c.producer === 'recipe-v2'
        && c.quality === 'cached'
        && c.view === 'normal');
      return specs.map((spec) => {
        const pool = poolFor(spec.sceneId);
        const hit = pool.find((c) => c.storage === 'hierarchical')
          || pool.find((c) => c.storage === 'global-only')
          || pool.find((c) => c.storage == null)
          || pool[0]
          || null;
        return {
          ...spec,
          caseId: hit?.id ?? null,
          producer: hit?.producer ?? null,
          quality: hit?.quality ?? null,
          view: hit?.view ?? null,
          storage: hit?.storage ?? null,
          approximate: true,
        };
      });
    }, SCENE_SPEC);

    writeFileSync(path.join(OUT, 'selected-cases.json'), JSON.stringify(selected, null, 2));

    const byShort = new Map(selected.map((e) => [e.short, e]));

    for (const entry of selected) {
      if (!entry.caseId) {
        errors.push(`missing case for ${entry.sceneId}`);
        continue;
      }
      const short = entry.short;
      try {
        await startCase(page, entry.caseId);

        for (const modeName of ['T0', 'T1', 'T2']) {
          const mode = TEMPORAL_MODES[modeName];
          await applyTemporal(page, mode, mode.expectedMode);
          const diagnostics = await capturePair(page, `${short}__temporal-${modeName}`, results, {
            sceneId: entry.sceneId,
            caseId: entry.caseId,
            temporal: modeName,
            label: `temporal-${modeName}`,
            stem: `${short}__temporal-${modeName}`,
            expectedMode: mode.expectedMode,
          });
          console.log(JSON.stringify({
            sceneId: entry.sceneId,
            temporal: modeName,
            summary: summarize(diagnostics),
          }));
        }

        if (DEBUG_SHORTS.includes(short)) {
          const views = EDGE_DEBUG_ONLY.has(short)
            ? DEBUG_VIEWS.filter((v) => v.id === 16 || v.id === 17)
            : DEBUG_VIEWS;
          for (const view of views) {
            const keepsTaau = view.id === 0 || view.id === 16 || view.id === 17;
            const expectedDebugMode = keepsTaau ? 'taau-4x4' : 'off';
            await applyTemporal(page, {
              ...TEMPORAL_MODES.T2,
              debugView: view.id,
            }, expectedDebugMode);
            const stem = `${short}__debug-${view.id}`;
            const diagnostics = await capturePair(page, stem, results, {
              sceneId: entry.sceneId,
              caseId: entry.caseId,
              temporal: 'T2',
              label: `debug-${view.id}-${view.name}`,
              debugView: view.id,
              debugName: view.name,
              debugNote: view.note ?? null,
              expectedMode: expectedDebugMode,
              stem,
            });
            console.log(JSON.stringify({
              sceneId: entry.sceneId,
              debugView: view.id,
              summary: summarize(diagnostics),
            }));
          }
        }

        if (short === 'cirrus') {
          await applyTemporal(page, {
            ...TEMPORAL_MODES.T2,
            debugView: 1,
          }, 'off');
          await capturePair(page, `${short}__debug-1`, results, {
            sceneId: entry.sceneId,
            caseId: entry.caseId,
            temporal: 'T2',
            label: 'debug-1-transmittance-empty-sky-check',
            debugView: 1,
            debugName: 'transmittance',
            expectedMode: 'off',
            stem: `${short}__debug-1`,
            discriminativePower: entry.discriminativePower,
          });
        }

        if (short === CONV_SHORT) {
          await applyTemporal(page, TEMPORAL_MODES.T1, 'full-res-taa');
          await waitFrames(page, 20);
          await capturePair(page, `${short}__temporal-T1-steady`, results, {
            sceneId: entry.sceneId,
            caseId: entry.caseId,
            temporal: 'T1',
            label: 'temporal-T1-steady',
            stem: `${short}__temporal-T1-steady`,
            sceneClockPolicy: CONV_SCENE_CLOCK_POLICY,
          });

          for (let i = 0; i < 18; i += 1) {
            await waitFrames(page, 1);
            const stem = `${short}__conv-T1-f${String(i).padStart(2, '0')}`;
            await captureCleanOnly(page, stem, results, {
              sceneId: entry.sceneId,
              caseId: entry.caseId,
              temporal: 'T1',
              label: `conv-T1-frame-${i}`,
              stem,
              frameIndex: i,
              sceneClockPolicy: CONV_SCENE_CLOCK_POLICY,
            });
          }

          await applyTemporal(page, TEMPORAL_MODES.T2, 'taau-4x4');
          for (let i = 0; i < 18; i += 1) {
            await waitFrames(page, 1);
            const stem = `${short}__conv-f${String(i).padStart(2, '0')}`;
            await captureCleanOnly(page, stem, results, {
              sceneId: entry.sceneId,
              caseId: entry.caseId,
              temporal: 'T2',
              label: `conv-frame-${i}`,
              stem,
              frameIndex: i,
              sceneClockPolicy: CONV_SCENE_CLOCK_POLICY,
            });
          }
        }

        if (short === MOTION_SHORT) {
          const motionMeta = { ...MOTION_DRAG, paths: {} };
          for (const modeName of ['T0', 'T1', 'T2']) {
            await page.evaluate((sceneId) => window.densityBenchmark.resetCamera(sceneId), entry.sceneId);
            await waitFrames(page, 8);
            await applyTemporal(page, TEMPORAL_MODES[modeName], TEMPORAL_MODES[modeName].expectedMode);
            const camBefore = await page.evaluate(() => window.densityBenchmark.getCamera());
            const frames = [];
            let moved = false;
            for (let i = 0; i < MOTION_DRAG.stepsPx.length; i += 1) {
              const dx = MOTION_DRAG.stepsPx[i];
              try {
                await yawDragStep(page, dx, MOTION_DRAG.dyPx);
              } catch (error) {
                errors.push(`motion drag failed: ${error instanceof Error ? error.message : String(error)}`);
                break;
              }
              await waitFrames(page, 2);
              const cam = await page.evaluate(() => window.densityBenchmark.getCamera());
              const eyeDelta = Math.hypot(
                cam.eye[0] - camBefore.eye[0],
                cam.eye[1] - camBefore.eye[1],
                cam.eye[2] - camBefore.eye[2],
              );
              if (eyeDelta > 1e-3) moved = true;
              const stem = `${short}__motion-${modeName}__f${String(i).padStart(2, '0')}`;
              await captureCleanOnly(page, stem, results, {
                sceneId: entry.sceneId,
                caseId: entry.caseId,
                temporal: modeName,
                label: `motion-${modeName}-frame-${i}`,
                stem,
                frameIndex: i,
                dragDx: dx,
                eyeDeltaFromStart: eyeDelta,
                camera: cam,
              });
              frames.push({ stem, eyeDeltaFromStart: eyeDelta, camera: cam });
            }
            motionMeta.paths[modeName] = {
              moved,
              camBefore,
              frames,
            };
            if (!moved) {
              motionEvidence.status = 'UNABLE';
              motionEvidence.reason = 'canvas pointer drag did not change benchmark getCamera() eye; motion sequence not proven reproducible';
            }
          }
          if (motionEvidence.status !== 'UNABLE') {
            motionEvidence.status = 'OBSERVATION';
            motionEvidence.reason = 'Orbit yaw driven by fixed canvas pointer-drag sequence; owner visual judgment PENDING';
          }
          motionEvidence.frames = motionMeta;
          writeFileSync(path.join(OUT, 'motion-drive.json'), JSON.stringify(motionEvidence, null, 2));
          await page.evaluate((sceneId) => window.densityBenchmark.resetCamera(sceneId), entry.sceneId);
        }
      } catch (error) {
        errors.push(`${short}: ${error instanceof Error ? error.stack : String(error)}`);
        console.error(error);
      }
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
      launchUsed,
      launchErrors,
      scenes: SCENE_SPEC,
      debugViews: DEBUG_VIEWS,
      motionEvidence,
      policy: {
        temporalModes: 'T0=off / T1=full-res-taa / T2=taau-4x4 on all selected scenes',
        debugViews: `${DEBUG_SHORTS.join('+')}; thin-ridge limited to phase/rejection; values from gui.ts`,
        convergence: `${CONV_SHORT} T2 f00..f17 + T1 f00..f17 control + T1 steady; sceneClock frozen via benchmark frame override`,
        convergenceSceneClock: CONV_SCENE_CLOCK_POLICY,
        motion: `${MOTION_SHORT} T0/T1/T2 × 8 frames via canvas drag`,
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
      launchUsed,
      policy: {
        ...runPayload.policy,
        owner: 'capture-w11-visual.mjs',
        note: 'Merges by stem; never wipes prior stems. build-visual-review must only write capture-disk-inventory.json.',
      },
      resultCount: byStem.size,
      results: [...byStem.values()].sort((a, b) => String(a.stem).localeCompare(String(b.stem))),
      lastRunErrors: errors,
    };
    writeFileSync(indexPath, JSON.stringify(merged, null, 2));
    await browser.close();
  }
}

console.log(JSON.stringify({
  captured: results.length,
  launchUsed,
  errors,
  out: OUT,
}, null, 2));
