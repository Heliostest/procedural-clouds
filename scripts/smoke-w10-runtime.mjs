import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestedCaseId = process.env.W10_SMOKE_CASE || '';
let base = process.env.W10_BASE_URL || '';
const screenshotPath = process.env.W10_SMOKE_SCREENSHOT || '';

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? '' : `: ${JSON.stringify(details)}`;
  throw new Error(`W10 runtime smoke failed: ${message}${suffix}`);
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isIgnoredConsoleError(message) {
  const locationUrl = message.location().url || '';
  if (locationUrl.endsWith('/favicon.ico')) return true;
  if (/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//i.test(locationUrl)) return true;
  return /(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i.test(message.text())
    && /(?:failed to load|err_(?:blocked|failed|connection|name_not_resolved)|network)/i.test(message.text());
}

function assertCloudFrameActive(diagnostics, label) {
  const frame = diagnostics.cloudFrame;
  assert(Array.isArray(frame?.gpuValidationErrors) && frame.gpuValidationErrors.length === 0,
    `${label}: WebGPU emitted validation errors`, frame?.gpuValidationErrors);
  assert(frame?.cloudFrameRequested === true, `${label}: cloud-frame was not requested`, frame);
  assert(frame?.cloudFrameActivePath === 'cloud-frame', `${label}: cloud-frame MRT path is inactive`, frame);
  assert(!frame.cloudFrameFallbackReason, `${label}: cloud-frame unexpectedly reports a fallback`, frame);
  assert(Number.isFinite(frame.cloudFrameAttachmentBytes) && frame.cloudFrameAttachmentBytes > 0,
    `${label}: attachment byte count is invalid`, frame);
  assert(Number.isFinite(frame.cloudFrameHistoryBytes) && frame.cloudFrameHistoryBytes > 0,
    `${label}: history byte count is invalid`, frame);
  assert(Number.isInteger(frame.cloudFrameResourceGeneration) && frame.cloudFrameResourceGeneration >= 1,
    `${label}: resource generation is invalid`, frame);
  assert(Number.isInteger(frame.cloudFrameContentRevision) && frame.cloudFrameContentRevision >= 1,
    `${label}: content revision is invalid`, frame);
  assert(Number.isInteger(frame.cloudFrameDiscontinuityGeneration) && frame.cloudFrameDiscontinuityGeneration >= 0,
    `${label}: discontinuity generation is invalid`, frame);
  assert(isFiniteNonNegative(frame.cloudCurrentMs)
    && isFiniteNonNegative(frame.temporalResolveMs)
    && isFiniteNonNegative(frame.compositeMs), `${label}: pass timing is not finite`, frame);
  assert(frame.cloudCurrentMs + frame.temporalResolveMs + frame.compositeMs > 0,
    `${label}: all cloud-frame pass timings are zero`, frame);
}

function assertFixedStep(diagnostics, label) {
  const raymarch = diagnostics.raymarch;
  assert(raymarch?.worldStepRequested === false, `${label}: world-step remains requested`, raymarch);
  assert(raymarch?.worldStepActive === false, `${label}: raymarch did not return to fixed-step`, raymarch);
  assertCounterProvenance(raymarch, label);
}

function assertCounterProvenance(raymarch, label) {
  assert(Number.isInteger(raymarch?.raymarchConfigGeneration) && raymarch.raymarchConfigGeneration > 0,
    `${label}: raymarch config generation is invalid`, raymarch);
  assert(raymarch.raymarchCounterConfigGeneration === raymarch.raymarchConfigGeneration,
    `${label}: GPU counters belong to a stale raymarch configuration`, raymarch);
  assert(Number.isInteger(raymarch.raymarchCounterFrameIndex) && raymarch.raymarchCounterFrameIndex > 0,
    `${label}: GPU counters have no source frame`, raymarch);
  assert(Number.isInteger(raymarch.raymarchCurrentFrameIndex)
    && raymarch.raymarchCurrentFrameIndex >= raymarch.raymarchCounterFrameIndex,
  `${label}: GPU counter source frame is newer than the current renderer frame`, raymarch);
}

function assertWorldStep(diagnostics, label) {
  const raymarch = diagnostics.raymarch;
  assert(raymarch?.worldStepRequested === true && raymarch?.worldStepActive === true,
    `${label}: world-step did not become active`, raymarch);
  assert(Number.isFinite(raymarch.worldStepMinMeters) && raymarch.worldStepMinMeters > 0,
    `${label}: minimum physical step is invalid`, raymarch);
  assert(Number.isFinite(raymarch.worldStepMaxMeters)
    && raymarch.worldStepMaxMeters >= raymarch.worldStepMinMeters,
  `${label}: maximum physical step is invalid`, raymarch);
  assert(Number.isFinite(raymarch.worldStepMaxRayDistanceMeters)
    && raymarch.worldStepMaxRayDistanceMeters >= raymarch.worldStepMaxMeters,
  `${label}: maximum ray distance is invalid`, raymarch);
  assert(Number.isInteger(raymarch.worldStepMaxIterations) && raymarch.worldStepMaxIterations > 0,
    `${label}: iteration cap is invalid`, raymarch);
  assert(Number.isInteger(raymarch.worldStepSupportCount) && raymarch.worldStepSupportCount >= 1,
    `${label}: no public Body support was published`, raymarch);
  assert(raymarch.worldStepSupportSkipping === true,
    `${label}: public Support skipping is inactive`, raymarch);
  assert(raymarch.worldStepCandidateSkipping === true,
    `${label}: hierarchical candidate skipping is inactive`, raymarch);
  assert(raymarch.stochasticSamplingRequested === true,
    `${label}: stochastic sampling was not requested`, raymarch);
  assert(raymarch.stochasticSamplingActive === 'stbn',
    `${label}: STBN did not become the active stochastic source`, raymarch);
  assert(!raymarch.stochasticSamplingFallbackReason,
    `${label}: STBN unexpectedly reports a fallback`, raymarch);
  assert(raymarch.stbnFrozenSlice === 7,
    `${label}: frozen STBN slice was not preserved`, raymarch);
  assert(Number.isFinite(raymarch.stbnBytes) && raymarch.stbnBytes > 0,
    `${label}: STBN resource byte count is invalid`, raymarch);
  assert(Number.isInteger(raymarch.raymarchCounterSampleId) && raymarch.raymarchCounterSampleId > 0,
    `${label}: GPU raymarch counters have no completed sample`, raymarch);
  assertCounterProvenance(raymarch, label);
  assert(Number.isInteger(raymarch.raymarchCounterSamplePixels) && raymarch.raymarchCounterSamplePixels > 0,
    `${label}: GPU raymarch counters sampled no pixels`, raymarch);
  for (const key of [
    'raymarchPrimaryIterationsPerPixel',
    'raymarchSupportSkipsPerPixel',
    'raymarchCandidateSkipsPerPixel',
    'raymarchDensitySamplesPerPixel',
    'raymarchLightSamplesPerPixel',
    'raymarchAverageStepMeters',
    'raymarchMaxStepMeters',
    'raymarchRefinementsPerPixel',
    'raymarchCoarseHintsPerPixel',
  ]) {
    assert(isFiniteNonNegative(raymarch[key]), `${label}: invalid GPU counter ${key}`, raymarch);
  }
  assert(raymarch.raymarchPrimaryIterationsPerPixel > 0
    && raymarch.raymarchDensitySamplesPerPixel > 0,
  `${label}: primary/density GPU counters stayed at zero`, raymarch);
  assert(raymarch.raymarchMaxStepMeters <= raymarch.worldStepMaxMeters + 1,
    `${label}: measured step exceeded configured maximum`, raymarch);
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

let viteServer = null;
if (!base) {
  viteServer = await createServer({
    root,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  assert(address && typeof address === 'object', 'self-hosted Vite server has no TCP address');
  base = `http://127.0.0.1:${address.port}/procedural-clouds/?benchmark=1`;
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !isIgnoredConsoleError(message)) {
    const location = message.location();
    consoleErrors.push(`${message.text()} @ ${location.url}`);
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, {
    timeout: 60_000,
  });

  const caseId = await page.evaluate((preferredId) => {
    const cases = window.densityBenchmark.manifest.cases;
    if (preferredId) return cases.some((candidate) => candidate.id === preferredId) ? preferredId : '';
    return cases.find((candidate) => candidate.sceneId.startsWith('single-')
      && candidate.producer === 'recipe-v2'
      && candidate.storage === 'hierarchical'
      && candidate.quality === 'cached'
      && candidate.view === 'normal')?.id || '';
  }, requestedCaseId);
  assert(caseId, requestedCaseId
    ? `requested case is absent from the manifest (${requestedCaseId})`
    : 'manifest has no single-cloud Recipe V2 hierarchical cached normal case');

  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 6;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 3;
  });
  const frameBeforeCase = await page.evaluate((id) => {
    const currentFrame = window.densityBenchmark.getRuntimeDiagnostics().raymarch.raymarchCurrentFrameIndex;
    window.densityBenchmark.start(id);
    return currentFrame;
  }, caseId);
  await page.waitForFunction(() => {
    const state = window.densityBenchmark.getStatus().state;
    return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
  }, null, { timeout: 180_000, polling: 250 });

  const status = await page.evaluate(() => window.densityBenchmark.getStatus());
  assert(status.state !== 'invalid', 'benchmark case became invalid', status);
  await page.waitForFunction((startFrame) => {
    const raymarch = window.densityBenchmark.getRuntimeDiagnostics().raymarch;
    return raymarch.raymarchCounterFrameIndex > startFrame
      && raymarch.raymarchCounterConfigGeneration === raymarch.raymarchConfigGeneration;
  }, frameBeforeCase, { timeout: 30_000, polling: 100 });
  await waitFrames(page);
  const initial = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  assert(initial.producer?.requested === 'recipe-v2' && initial.producer?.active === 'recipe-v2',
    'Recipe V2 did not become active', initial.producer);
  assert(initial.producer?.storageRequested === 'hierarchical'
    && initial.producer?.storageActive === 'hierarchical',
  'hierarchical storage did not become active', initial.producer);
  assertCloudFrameActive(initial, 'initial');
  assertFixedStep(initial, 'initial');

  await page.evaluate(() => window.densityBenchmark.setW10Options({
    cloudFrameEnabled: true,
    worldStepEnabled: true,
    worldStepSupportSkipping: true,
    worldStepCandidateSkipping: true,
    stochasticSampling: true,
    stbnFrozenSlice: 7,
    taaEnabled: true,
    debugView: 0,
  }));
  await page.waitForFunction(() => {
    const diagnostics = window.densityBenchmark.getRuntimeDiagnostics();
    return diagnostics.raymarch.worldStepActive
      && diagnostics.raymarch.stochasticSamplingActive === 'stbn'
      && diagnostics.raymarch.stbnFrozenSlice === 7
      && diagnostics.raymarch.worldStepSupportCount >= 1
      && diagnostics.raymarch.worldStepCandidateSkipping
      && diagnostics.raymarch.raymarchCounterConfigGeneration
        === diagnostics.raymarch.raymarchConfigGeneration;
  }, null, { timeout: 30_000, polling: 100 });
  await waitFrames(page);
  const enabled = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  assertCloudFrameActive(enabled, 'W10 enabled');
  assertWorldStep(enabled, 'W10 enabled');

  await page.evaluate(() => window.densityBenchmark.setW10Options({
    worldStepEnabled: false,
    cloudFrameEnabled: false,
  }));
  await page.waitForFunction(() => {
    const diagnostics = window.densityBenchmark.getRuntimeDiagnostics();
    return diagnostics.cloudFrame.cloudFrameActivePath === 'combined-feature-off'
      && !diagnostics.raymarch.worldStepActive
      && diagnostics.raymarch.raymarchCounterConfigGeneration
        === diagnostics.raymarch.raymarchConfigGeneration;
  }, null, { timeout: 30_000, polling: 100 });
  await waitFrames(page, 6);
  const featureOff = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  assert(featureOff.cloudFrame.cloudFrameRequested === false,
    'feature-off: cloud-frame remains requested', featureOff.cloudFrame);
  assert(featureOff.cloudFrame.cloudFrameActivePath === 'combined-feature-off',
    'feature-off: renderer did not select the combined path', featureOff.cloudFrame);
  assert(Array.isArray(featureOff.cloudFrame.gpuValidationErrors)
    && featureOff.cloudFrame.gpuValidationErrors.length === 0,
  'feature-off: WebGPU emitted validation errors', featureOff.cloudFrame.gpuValidationErrors);
  assertFixedStep(featureOff, 'feature-off');

  await page.evaluate(() => window.densityBenchmark.setW10Options({
    cloudFrameEnabled: true,
    worldStepEnabled: true,
  }));
  await page.waitForFunction(() => {
    const diagnostics = window.densityBenchmark.getRuntimeDiagnostics();
    return diagnostics.cloudFrame.cloudFrameActivePath === 'cloud-frame'
      && diagnostics.raymarch.worldStepActive
      && diagnostics.raymarch.stochasticSamplingActive === 'stbn'
      && diagnostics.raymarch.raymarchCounterConfigGeneration
        === diagnostics.raymarch.raymarchConfigGeneration;
  }, null, { timeout: 30_000, polling: 100 });
  await waitFrames(page);
  const restored = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  assertCloudFrameActive(restored, 'restored');
  assertWorldStep(restored, 'restored');

  assert(consoleErrors.length === 0 && pageErrors.length === 0,
    'browser emitted unexpected errors', { consoleErrors, pageErrors });
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
  }

  console.log(JSON.stringify({
    caseId,
    status,
    diagnostics: { initial, enabled, featureOff, restored },
    screenshotPath: screenshotPath || null,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(JSON.stringify({ consoleErrors, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
  await viteServer?.close();
}
