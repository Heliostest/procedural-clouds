import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../../..');
const SHOTS = path.join(OUT, 'screenshots');
const DIAG = path.join(OUT, 'diagnostics');
const RUNS = path.join(OUT, 'capture-runs');
const RESUME = process.argv.includes('--resume');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(DIAG, { recursive: true });
mkdirSync(RUNS, { recursive: true });

const fixedPost = { bloomEnabled: false, bloomThreshold: 1, bloomAmount: 0.5, exposure: 0.1, tonemapMode: 1 };
const matrix = [
  { name: 'global-only-w9-stop', sceneId: 'single-stratocumulus', storage: 'global-only', casePrefix: 'w9', caseRule: 'W9 Recipe V2 global-only Hybrid; W9 Stop coverage' },
  { name: 'hierarchical', sceneId: 'single-stratocumulus', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 Recipe V2 hierarchical Hybrid' },
  { name: 'equal-overlap', sceneId: 'w8-cellular-overlap', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid equal-overlap scene' },
  { name: 'far-flicker-64km', sceneId: 'w9-brick-lod-sweep', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid far/LOD proxy; 64km ray distance fixed in runtime options' },
  { name: 'cu', sceneId: 'single-cumulus', storage: null, casePrefix: 'w6', caseRule: 'existing W6 Recipe V2 Hybrid Cu case; W6 has no storage selector' },
  { name: 'sc', sceneId: 'single-stratocumulus', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid Sc case' },
  { name: 'ac', sceneId: 'single-altocumulus', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid Ac case' },
  { name: 'cc', sceneId: 'single-cirrocumulus', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid Cc case' },
  { name: 'w9-thin-ridge', sceneId: 'w9-thin-ridge-proxy', storage: 'hierarchical', casePrefix: 'w9', caseRule: 'W9 hierarchical Hybrid thin-ridge proxy' },
  { name: 'cb-linear-remap-known-deviation', sceneId: 'single-cumulonimbus', storage: null, casePrefix: 'w8', caseRule: 'existing W8 Recipe V2 Hybrid Cb case; W8 has no storage selector; record only, do not calibrate' },
];
const temporalModes = [
  ['fullres', 1, 'full-res-taa'],
  ['taau', 2, 'taau-4x4'],
];
const matrixFingerprint = createHash('sha256').update(JSON.stringify(matrix)).digest('hex');

function provenance() {
  const git = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } };
  const dirtyPaths = git(['status', '--porcelain']).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
  const runtimeDirty = dirtyPaths.some((p) => p.startsWith('src/') || p.startsWith('shaders/') || p.endsWith('.wgsl'));
  return { revision: git(['rev-parse', 'HEAD']) || 'unknown', dirtyPaths, runtimeSourceMatchesHead: !runtimeDirty };
}
function safe(value) { return JSON.parse(JSON.stringify(value)); }
async function frames(page, count = 12) {
  await page.evaluate((n) => new Promise((resolve) => { let left = n; const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }), count);
}
async function startCase(page, caseId, readyTimeout = 180000) {
  const before = await page.evaluate((id) => { const d = window.densityBenchmark.getRuntimeDiagnostics(); window.densityBenchmark.start(id); return d.raymarch.raymarchCurrentFrameIndex; }, caseId);
  await page.waitForFunction(() => ['ready-for-screenshot', 'complete', 'invalid'].includes(window.densityBenchmark.getStatus().state), null, { timeout: readyTimeout, polling: 250 });
  const status = await page.evaluate(() => window.densityBenchmark.getStatus());
  if (status.state === 'invalid') throw new Error(`invalid benchmark case ${caseId}: ${status.message}`);
  await page.waitForFunction((frame) => { const d = window.densityBenchmark.getRuntimeDiagnostics(); return d.raymarch.raymarchCounterFrameIndex > frame && d.raymarch.raymarchCounterConfigGeneration === d.raymarch.raymarchConfigGeneration && d.cloudFrame.gpuValidationErrors.length === 0; }, before, { timeout: 60000, polling: 100 });
}
async function apply(page, options, expectedMode) {
  const before = await page.evaluate(() => { const d = window.densityBenchmark.getRuntimeDiagnostics(); return { ray: d.raymarch.raymarchCounterSampleId, taau: d.temporal.taauResolveCounterSampleId }; });
  await page.evaluate((next) => window.densityBenchmark.setW10Options(next), options);
  await frames(page, 16);
  await page.waitForFunction(({ sample, mode }) => { const d = window.densityBenchmark.getRuntimeDiagnostics(); const temporalReady = mode === 'taau-4x4' ? d.temporal.taauResolveCounterSampleId > sample.taau : d.raymarch.raymarchCounterSampleId > sample.ray; return d.temporal.activeTemporalMode === mode && temporalReady && d.raymarch.raymarchCounterConfigGeneration === d.raymarch.raymarchConfigGeneration && d.raymarch.worldStepActive === true && d.raymarch.worldStepMinMeters === 120 && d.raymarch.worldStepMaxIterations === 512; }, { sample: before, mode: expectedMode }, { timeout: 90000, polling: 100 });
  await frames(page, 4);
}
async function capture(page, entry, variant, source, attemptDir = OUT) {
  const stem = `${entry.name}__${variant.temporal}__detail-${variant.detailStrength ? 'on' : 'off'}__skip-light-${variant.skipLight ? 'true' : 'false'}`;
  const diagnostics = safe(await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics()));
  const attemptShots = path.join(attemptDir, 'screenshots');
  const attemptDiagnostics = path.join(attemptDir, 'diagnostics');
  mkdirSync(attemptShots, { recursive: true });
  mkdirSync(attemptDiagnostics, { recursive: true });
  const cleanPath = path.join(attemptShots, `${stem}.png`);
  await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
  await page.screenshot({ path: cleanPath });
  await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
  const record = { stem, matrix: entry.name, sceneId: entry.sceneId, caseId: entry.caseId, storage: entry.storage, quality: entry.quality, temporal: variant.temporal, expectedTemporalMode: variant.expectedMode, detailStrength: variant.detailStrength, detailFreq: variant.detailFreq ?? 1, skipLight: variant.skipLight, debugView: variant.debugView ?? 0, requiredEvidence: variant.requiredEvidence ?? null, fixedPost, worldStep: { enabled: true, minMeters: 120, maxIterations: 512, maxRayDistanceMeters: 64000 }, farFlickerPolicy: entry.name === 'far-flicker-64km' ? '64km requested; current controller exposes raymarch counters only, visual judgment required' : null, cbPolicy: entry.name.startsWith('cb-') ? 'known linear-remap deviation; recorded only, not calibrated' : null, diagnostics, shadow: { available: false, reason: 'getRuntimeDiagnostics does not expose RenderStats.shadowRan/shadowSampleId/shadowMs; no shadow timestamp was inferred' }, screenshot: path.relative(OUT, cleanPath).replaceAll('\\', '/'), runtimeSourceMatchesHead: source.runtimeSourceMatchesHead };
  writeFileSync(path.join(attemptDiagnostics, `${stem}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

const source = provenance();
const prior = RESUME && existsSync(path.join(OUT, 'capture-index.json')) ? JSON.parse(readFileSync(path.join(OUT, 'capture-index.json'), 'utf8')) : null;
const priorFingerprint = prior?.matrixFingerprint ?? (prior?.matrix ? createHash('sha256').update(JSON.stringify(prior.matrix)).digest('hex') : null);
const resumeValidation = RESUME ? {
  requested: true,
  priorRunId: prior?.runId ?? null,
  headMatches: prior?.source?.revision === source.revision,
  runtimeSourceMatchesHeadMatches: prior?.runtimeSourceMatchesHead === source.runtimeSourceMatchesHead,
  matrixFingerprintMatches: priorFingerprint === matrixFingerprint,
} : null;
if (RESUME && (!prior || !resumeValidation.headMatches || !resumeValidation.runtimeSourceMatchesHeadMatches || !resumeValidation.matrixFingerprintMatches)) {
  throw new Error(`resume validation failed: ${JSON.stringify(resumeValidation)}`);
}
const evidence = { schemaVersion: 1, generatedAt: new Date().toISOString(), source, runtimeSourceMatchesHead: source.runtimeSourceMatchesHead, fixedPost, matrix, matrixFingerprint, results: RESUME ? [...(prior.results ?? [])] : [], errors: [], console: [], caseAttempts: [], environment: { node: process.version, platform: process.platform }, resume: RESUME ? { ...resumeValidation, priorAttempts: prior?.resume?.attempts ?? [], attempts: [] } : null };
evidence.requiredEvidenceAvailability = {
  edgeOnly: { status: 'unavailable', reason: 'existing benchmark controller exposes no edge-only view; edgeSharpening normal output is not mislabeled as edge-only' },
  windMotion: { status: 'unavailable', reason: 'benchmark frame override freezes scene clock and controller exposes no deterministic wind-motion drive' },
};
let viteServer;
let browser;
let context;
try {
  console.log('[w12 capture] stage=vite-start');
  viteServer = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const base = `http://127.0.0.1:${address.port}/procedural-clouds/?benchmark=1`;
  evidence.base = base;
  console.log('[w12 capture] stage=browser-launch');
  const attempts = [
    { name: 'chrome-headless-webgpu', options: { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] } },
    { name: 'chromium-headless-webgpu', options: { headless: true, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] } },
  ];
  evidence.launchErrors = [];
  for (const attempt of attempts) { try { browser = await chromium.launch(attempt.options); evidence.launchUsed = attempt.name; break; } catch (error) { evidence.launchErrors.push({ name: attempt.name, error: error instanceof Error ? error.stack : String(error) }); } }
  if (!browser) throw new Error('browser-launch-failed');
  const createFreshPage = async () => {
    if (context) await context.close();
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const fresh = await context.newPage();
    let rejectStartup;
    const startupFailure = new Promise((resolve) => { rejectStartup = resolve; });
    fresh.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      evidence.console.push({ type: 'console', text });
      if (/pipeline creation failed|createRenderer/i.test(text)) rejectStartup({ fatal: text });
    });
    fresh.on('pageerror', (error) => evidence.console.push({ type: 'pageerror', text: error.stack || error.message }));
    console.log('[w12 capture] stage=page-ready');
    await fresh.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
    const startup = await Promise.race([
      fresh.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, { timeout: 60000, polling: 100 }).then(() => ({ ready: true })),
      startupFailure,
    ]);
    if (startup.fatal) throw new Error(startup.fatal);
    await fresh.evaluate(() => { window.densityBenchmark.manifest.warmupFrames = 6; window.densityBenchmark.manifest.minimumCacheWarmups = 2; window.densityBenchmark.manifest.minimumGpuSamples = 3; });
    return fresh;
  };
  let page = await createFreshPage();
  console.log('[w12 capture] stage=matrix-select');
  const selected = await page.evaluate((wanted) => wanted.map((spec) => {
    const cases = window.densityBenchmark.manifest.cases.filter((c) => c.sceneId === spec.sceneId
      && c.producer === 'recipe-v2'
      && c.quality === 'hybrid'
      && c.view === 'normal'
      && c.id.startsWith(`${spec.casePrefix}--`)
      && (spec.storage === null ? c.storage == null : c.storage === spec.storage));
    const hit = cases[0] ?? null;
    return { ...spec, caseId: hit?.id ?? null, quality: hit?.quality ?? null };
  }), matrix);
  evidence.selected = selected;
  const retryNames = RESUME ? [...new Set((prior?.errors ?? []).map((error) => String(error).match(/^([^:]+):/)?.[1]).filter(Boolean))] : [];
  if (RESUME && (retryNames.length !== 1 || retryNames[0] !== 'ac')) throw new Error(`resume requires only failed Ac case; found ${JSON.stringify(retryNames)}`);
  const entriesToCapture = RESUME ? selected.filter((entry) => retryNames.includes(entry.name)) : selected;
  for (const entry of entriesToCapture) {
    if (!entry.caseId) { evidence.errors.push(`missing hybrid case ${entry.name}/${entry.sceneId}/${entry.storage}`); continue; }
    const attemptsForEntry = RESUME && entry.name === 'ac' ? 2 : 1;
    let complete = false;
    for (let attempt = 1; attempt <= attemptsForEntry && !complete; attempt += 1) try {
      console.log(`[w12 capture] stage=matrix matrix=${entry.name} attempt=${attempt}/${attemptsForEntry}`);
      if (RESUME) page = await createFreshPage();
      await startCase(page, entry.caseId, RESUME ? 300000 : 180000);
      const attemptDir = path.join(OUT, 'attempts', entry.name, `attempt-${attempt}`);
      const attemptResults = [];
      const expectedStems = [];
      for (const [temporal, temporalQuality, expectedMode] of temporalModes) for (const detailStrength of [0, 1]) for (const skipLight of [false, true]) {
        const options = { ...fixedPost, cloudFrameEnabled: true, taaEnabled: true, temporalQuality, debugView: 0, worldStepEnabled: true, worldStepMinMeters: 120, worldStepMaxIterations: 512, worldStepMaxRayDistanceMeters: 64000, detailStrength, detailFreq: 1, skipLight };
        await apply(page, options, expectedMode);
        const result = await capture(page, entry, { temporal, expectedMode, detailStrength, skipLight }, source, attemptDir);
        attemptResults.push(result);
        expectedStems.push(result.stem);
      }
      if (attemptResults.length !== 8 || new Set(expectedStems).size !== 8) throw new Error(`incomplete or duplicate variants for ${entry.name}: count=${attemptResults.length} stems=${JSON.stringify(expectedStems)}`);
      evidence.results = evidence.results.filter((result) => result.matrix !== entry.name);
      evidence.results.push(...attemptResults);
      complete = true;
      const attemptRecord = { matrix: entry.name, attempt, status: 'complete', freshContext: RESUME, readyTimeoutMs: RESUME ? 300000 : 180000, expectedVariantCount: 8, capturedVariantCount: attemptResults.length, expectedStems, attemptDir: path.relative(OUT, attemptDir).replaceAll('\\', '/') };
      evidence.caseAttempts.push(attemptRecord);
      if (RESUME) evidence.resume.attempts.push(attemptRecord);
    } catch (error) {
      const detail = error instanceof Error ? error.stack : String(error);
      const attemptRecord = { matrix: entry.name, attempt, status: 'failed', freshContext: RESUME, readyTimeoutMs: RESUME ? 300000 : 180000, error: detail, exposedToResults: false };
      evidence.caseAttempts.push(attemptRecord);
      if (RESUME) evidence.resume.attempts.push(attemptRecord);
      if (attempt === attemptsForEntry) evidence.errors.push(`${entry.name}: ${detail}`);
    }
  }
  const control = selected.find((entry) => entry.name === 'hierarchical');
  if (!RESUME && control?.caseId) try {
    console.log('[w12 capture] stage=world-step-off-control');
    await startCase(page, control.caseId);
    await page.evaluate((options) => window.densityBenchmark.setW10Options(options), { ...fixedPost, cloudFrameEnabled: true, taaEnabled: true, temporalQuality: 1, debugView: 0, worldStepEnabled: false, detailStrength: 0, detailFreq: 1, skipLight: false });
    await frames(page, 20);
    const d = safe(await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics()));
    const stem = 'old-w11-world-step-off-control';
    const image = path.join(SHOTS, `${stem}.png`);
    await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture')); await page.screenshot({ path: image }); await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
    const record = { stem, matrix: 'old-w11-world-step-off-control', sceneId: control.sceneId, caseId: control.caseId, detailStrength: 0, skipLight: false, worldStep: { enabled: false }, diagnostics: d, screenshot: path.relative(OUT, image).replaceAll('\\', '/'), runtimeSourceMatchesHead: source.runtimeSourceMatchesHead, role: 'explanatory old-W11 comparison only; not W12 detail-off baseline' };
    evidence.results.push(record); writeFileSync(path.join(DIAG, `${stem}.json`), `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) { evidence.errors.push(`world-step-off-control: ${error instanceof Error ? error.stack : String(error)}`); }
  if (!RESUME && control?.caseId) try {
    console.log('[w12 capture] stage=debug-18-19');
    await startCase(page, control.caseId);
    for (const debugView of [18, 19]) {
      await apply(page, { ...fixedPost, cloudFrameEnabled: true, taaEnabled: true, temporalQuality: 2, debugView, worldStepEnabled: true, worldStepMinMeters: 120, worldStepMaxIterations: 512, worldStepMaxRayDistanceMeters: 64000, detailStrength: 1, detailFreq: 1, skipLight: false }, 'taau-4x4');
      evidence.results.push(await capture(page, { ...control, name: `debug-${debugView}` }, { temporal: 'taau', expectedMode: 'taau-4x4', detailStrength: 1, skipLight: false, debugView, requiredEvidence: `debug-${debugView}` }, source));
    }
  } catch (error) { evidence.errors.push(`debug-18-19: ${error instanceof Error ? error.stack : String(error)}`); }
  if (!RESUME && control?.caseId) try {
    console.log('[w12 capture] stage=required-evidence');
    await startCase(page, control.caseId);
    const baseOptions = { ...fixedPost, cloudFrameEnabled: true, taaEnabled: true, worldStepEnabled: true, worldStepMinMeters: 120, worldStepMaxIterations: 512, worldStepMaxRayDistanceMeters: 64000, detailStrength: 1, skipLight: false };
    await apply(page, { ...baseOptions, temporalQuality: 2, debugView: 0, detailFreq: 1 }, 'taau-4x4');
    evidence.results.push(await capture(page, { ...control, name: 'required-normal' }, { temporal: 'taau', expectedMode: 'taau-4x4', detailStrength: 1, detailFreq: 1, skipLight: false, debugView: 0, requiredEvidence: 'normal' }, source));
    await apply(page, { ...baseOptions, temporalQuality: 0, debugView: 10, detailFreq: 1 }, 'off');
    evidence.results.push(await capture(page, { ...control, name: 'required-raw-density' }, { temporal: 'fullres', expectedMode: 'off', detailStrength: 1, detailFreq: 1, skipLight: false, debugView: 10, requiredEvidence: 'raw-density' }, source));
    for (const [name, detailFreq] of [['low', 0.5], ['high', 2]]) {
      await apply(page, { ...baseOptions, temporalQuality: 2, debugView: 0, detailFreq }, 'taau-4x4');
      evidence.results.push(await capture(page, { ...control, name: `required-detail-frequency-${name}` }, { temporal: 'taau', expectedMode: 'taau-4x4', detailStrength: 1, detailFreq, skipLight: false, debugView: 0, requiredEvidence: 'detail-frequency' }, source));
    }
    await apply(page, { ...baseOptions, temporalQuality: 2, debugView: 0, detailFreq: 1 }, 'taau-4x4');
    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      await frames(page, 1);
      evidence.results.push(await capture(page, { ...control, name: `required-taau-convergence-f${String(frameIndex).padStart(2, '0')}` }, { temporal: 'taau', expectedMode: 'taau-4x4', detailStrength: 1, detailFreq: 1, skipLight: false, debugView: 0, requiredEvidence: 'taau-convergence' }, source));
    }
  } catch (error) { evidence.errors.push(`required-evidence: ${error instanceof Error ? error.stack : String(error)}`); }
} catch (error) {
  evidence.fatal = error instanceof Error ? error.stack : String(error);
  evidence.errors.push(evidence.fatal);
} finally {
  console.log('[w12 capture] stage=cleanup');
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  evidence.runId = runId;
  const byStem = new Map();
  for (const result of evidence.results) {
    if (!result?.stem) continue;
    if (byStem.has(result.stem)) {
      evidence.errors.push(`duplicate merged result stem ${result.stem}`);
      continue;
    }
    byStem.set(result.stem, result);
  }
  evidence.results = [...byStem.values()].sort((left, right) => String(left.stem).localeCompare(String(right.stem)));
  writeFileSync(path.join(RUNS, `${runId}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  const indexPath = path.join(OUT, 'capture-index.json');
  const indexTempPath = `${indexPath}.${process.pid}.tmp`;
  writeFileSync(indexTempPath, `${JSON.stringify(evidence, null, 2)}\n`);
  renameSync(indexTempPath, indexPath);
}
console.log(JSON.stringify({ runId: evidence.runId, captures: evidence.results.length, errors: evidence.errors.length, runtimeSourceMatchesHead: evidence.runtimeSourceMatchesHead }, null, 2));
if (evidence.fatal || evidence.errors.length) process.exitCode = 1;
