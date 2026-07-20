import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(
  root,
  'docs/evidence/w8-cellular-wave/_pw/node_modules/playwright',
));
const baseUrl = process.env.W9_BASE_URL
  || 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';
const output = process.env.W9_RESIZE_DIAG_OUT
  || path.resolve(root, '..', '.codex-w9-visual-diagnosis', 'resize-transition');
const caseId = 'w9--single-altocumulus--recipe-v2--hierarchical--cached--density-debug';

mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  const location = message.location();
  if (message.type() === 'error' && !location.url.endsWith('/favicon.ico')) {
    consoleErrors.push(`${message.text()} @ ${location.url}`);
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.densityBenchmark) && Boolean(navigator.gpu),
    null,
    { timeout: 60_000 },
  );
  await page.evaluate((id) => {
    const benchmark = window.densityBenchmark;
    benchmark.manifest.warmupFrames = 8;
    benchmark.manifest.minimumCacheWarmups = 2;
    benchmark.manifest.minimumGpuSamples = 2;
    benchmark.manifest.params.cacheResolution = 96;
    benchmark.manifest.params.cacheWorkgroupX = 8;
    benchmark.manifest.params.cacheWorkgroupY = 8;
    benchmark.manifest.params.cacheWorkgroupZ = 4;
    benchmark.start(id);
  }, caseId);
  await page.waitForFunction(() => {
    const state = window.densityBenchmark.getStatus().state;
    return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
  }, null, { timeout: 180_000, polling: 100 });
  const initialStatus = await page.evaluate(() => window.densityBenchmark.getStatus());
  if (initialStatus.state === 'invalid') throw new Error(initialStatus.message);
  const initial = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  const initialBricks = initial.producer.bricks;
  if (!initialBricks || initialBricks.candidate?.grid.join('x') !== '12x12x24') {
    throw new Error(`Initial candidate grid was unexpected: ${JSON.stringify(initial)}`);
  }
  await page.screenshot({ path: path.join(output, 'before-resize.png') });

  await page.evaluate((id) => {
    const benchmark = window.densityBenchmark;
    benchmark.manifest.params.cacheResolution = 128;
    benchmark.manifest.params.cacheWorkgroupX = 7;
    benchmark.manifest.params.cacheWorkgroupY = 5;
    benchmark.manifest.params.cacheWorkgroupZ = 3;
    benchmark.start(id);
  }, caseId);
  const samples = [];
  for (let frame = 0; frame < 360; frame++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const diagnostics = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
    samples.push({ frame, ...diagnostics });
    const bricks = diagnostics.producer.bricks;
    if (diagnostics.producer.storageLifecycle === 'failed') {
      throw new Error(`Resize transition failed: ${diagnostics.producer.storageReason}`);
    }
    if (diagnostics.producer.storageActive !== 'hierarchical' || (bricks?.livePairCount ?? 0) > 1) {
      throw new Error(`Resize hid hierarchical output or allocated a redundant atlas pair: ${JSON.stringify(diagnostics)}`);
    }
    if (bricks?.candidate?.grid.join('x') === '19x26x43'
      && bricks.activeBindingGeneration > initialBricks.activeBindingGeneration) {
      break;
    }
  }

  const grown = samples.at(-1);
  const grownBricks = grown?.producer.bricks;
  if (!grownBricks
    || grownBricks.candidate?.grid.join('x') !== '19x26x43'
    || grownBricks.activeGeneration !== initialBricks.activeGeneration
    || grownBricks.activeBindingGeneration <= initialBricks.activeBindingGeneration
    || grownBricks.stagingGeneration !== 0) {
    throw new Error(`Candidate resize did not publish a safe binding generation: ${JSON.stringify(grown)}`);
  }
  if (!samples.some((sample) => sample.shadowHistoryResetReason === 'density-generation')) {
    throw new Error('Candidate binding resize did not reset density-dependent history');
  }
  await page.screenshot({ path: path.join(output, 'after-grow.png') });

  // Shrinking exercises the metadata-only path: the existing candidate buffer is
  // large enough, but its grid dimensions and generation-safe render binding must
  // still publish atomically.
  await page.evaluate((id) => {
    const benchmark = window.densityBenchmark;
    benchmark.manifest.params.cacheResolution = 64;
    benchmark.manifest.params.cacheWorkgroupX = 8;
    benchmark.manifest.params.cacheWorkgroupY = 8;
    benchmark.manifest.params.cacheWorkgroupZ = 4;
    benchmark.start(id);
  }, caseId);
  const shrinkSamples = [];
  for (let frame = 0; frame < 360; frame++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const diagnostics = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
    shrinkSamples.push({ frame, ...diagnostics });
    const bricks = diagnostics.producer.bricks;
    if (diagnostics.producer.storageLifecycle === 'failed') {
      throw new Error(`Shrink transition failed: ${diagnostics.producer.storageReason}`);
    }
    if (diagnostics.producer.storageActive !== 'hierarchical' || (bricks?.livePairCount ?? 0) > 1) {
      throw new Error(`Shrink hid hierarchical output or allocated a redundant atlas pair: ${JSON.stringify(diagnostics)}`);
    }
    if (bricks?.candidate?.grid.join('x') === '8x8x16'
      && bricks.activeBindingGeneration > grownBricks.activeBindingGeneration) {
      break;
    }
  }

  const shrunk = shrinkSamples.at(-1);
  const shrunkBricks = shrunk?.producer.bricks;
  if (!shrunkBricks
    || shrunkBricks.candidate?.grid.join('x') !== '8x8x16'
    || shrunkBricks.activeGeneration !== initialBricks.activeGeneration
    || shrunkBricks.activeBindingGeneration <= grownBricks.activeBindingGeneration
    || shrunkBricks.stagingGeneration !== 0) {
    throw new Error(`Candidate shrink did not publish metadata-only binding generation: ${JSON.stringify(shrunk)}`);
  }
  if (!shrinkSamples.some((sample) => sample.shadowHistoryResetReason === 'density-generation')) {
    throw new Error('Candidate metadata-only shrink did not reset density-dependent history');
  }
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }
  const after = path.join(output, 'after-shrink.png');
  await page.screenshot({ path: after });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    caseId,
    initial,
    grow: { samples, final: grown },
    shrink: { samples: shrinkSamples, final: shrunk },
    screenshots: {
      before: path.join(output, 'before-resize.png'),
      grown: path.join(output, 'after-grow.png'),
      shrunk: after,
    },
    consoleErrors,
    pageErrors,
  };
  writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    allocationGeneration: `${initialBricks.activeGeneration}->${grownBricks.activeGeneration}->${shrunkBricks.activeGeneration}`,
    bindingGeneration: `${initialBricks.activeBindingGeneration}->${grownBricks.activeBindingGeneration}->${shrunkBricks.activeBindingGeneration}`,
    candidateGrid: `${initialBricks.candidate.grid.join('x')}->${grownBricks.candidate.grid.join('x')}->${shrunkBricks.candidate.grid.join('x')}`,
    storage: shrunk.producer.storageActive,
    livePairCount: shrunkBricks.livePairCount,
    resetReasons: [
      samples.find((sample) => sample.shadowHistoryResetReason === 'density-generation')?.shadowHistoryResetReason,
      shrinkSamples.find((sample) => sample.shadowHistoryResetReason === 'density-generation')?.shadowHistoryResetReason,
    ],
    screenshots: report.screenshots,
  }, null, 2));
} finally {
  await browser.close();
}
