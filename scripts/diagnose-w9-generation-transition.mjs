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
const output = process.env.W9_GENERATION_DIAG_OUT
  || path.resolve(root, '..', '.codex-w9-visual-diagnosis', 'generation-transition');
const initialCase = 'w9--w9-brick-lod-sweep--recipe-v2--hierarchical--cached--density-debug';
const changedCase = 'w9--w9-thin-ridge-proxy--recipe-v2--hierarchical--cached--density-debug';

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
  await page.evaluate((caseId) => {
    window.densityBenchmark.manifest.warmupFrames = 8;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 2;
    window.densityBenchmark.start(caseId);
  }, initialCase);
  await page.waitForFunction(() => {
    const state = window.densityBenchmark.getStatus().state;
    return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
  }, null, { timeout: 180_000, polling: 100 });
  const initialStatus = await page.evaluate(() => window.densityBenchmark.getStatus());
  if (initialStatus.state === 'invalid') throw new Error(initialStatus.message);
  const initial = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
  const initialBricks = initial.producer.bricks;
  if (initial.producer.storageActive !== 'hierarchical'
    || !initialBricks
    || initialBricks.activeGeneration <= 0
    || initialBricks.stagingGeneration !== 0
    || initialBricks.livePairCount !== 1) {
    throw new Error(`Initial hierarchical generation was not stable: ${JSON.stringify(initial)}`);
  }
  await page.screenshot({ path: path.join(output, 'before-layout-change.png') });
  await page.evaluate((caseId) => window.densityBenchmark.start(caseId), changedCase);

  const samples = [];
  let stagingScreenshot = '';
  let afterScreenshot = '';
  for (let frame = 0; frame < 360; frame++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const diagnostics = await page.evaluate(() => window.densityBenchmark.getRuntimeDiagnostics());
    const bricks = diagnostics.producer.bricks;
    samples.push({ frame, ...diagnostics });
    if (diagnostics.producer.storageLifecycle === 'failed') {
      throw new Error(`Hierarchical generation failed: ${diagnostics.producer.storageReason}`);
    }
    if (bricks?.livePairCount > 2) {
      throw new Error(`Generation rebuild exceeded two live atlas pairs: ${bricks.livePairCount}`);
    }
    if (!stagingScreenshot && bricks?.stagingGeneration > 0) {
      stagingScreenshot = path.join(output, 'staging-layout-change.png');
      await page.screenshot({ path: stagingScreenshot });
    }
    if (bricks && bricks.activeGeneration !== initialBricks.activeGeneration
      && bricks.stagingGeneration === 0 && bricks.livePairCount === 1) {
      afterScreenshot = path.join(output, 'after-layout-change.png');
      await page.screenshot({ path: afterScreenshot });
      break;
    }
  }

  const stagingSamples = samples.filter((sample) => (
    (sample.producer.bricks?.stagingGeneration ?? 0) > 0
  ));
  const activeGenerations = samples.map((sample) => sample.producer.bricks?.activeGeneration ?? 0);
  const generationTransitions = activeGenerations.filter((generation, index) => (
    index > 0 && generation !== activeGenerations[index - 1]
  ));
  const final = samples.at(-1);
  writeFileSync(path.join(output, 'samples.partial.json'), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    initialCase,
    changedCase,
    initial,
    samples,
    consoleErrors,
    pageErrors,
  }, null, 2)}\n`, 'utf8');
  if (stagingSamples.length === 0
    || !stagingSamples.some((sample) => sample.producer.bricks?.stagingWarmMask === 1
      || sample.producer.bricks?.stagingWarmMask === 2)) {
    throw new Error('No observable single-atlas staging interval was captured');
  }
  if (stagingSamples.some((sample) => sample.producer.storageActive !== 'hierarchical'
    || sample.producer.bricks?.activeGeneration !== initialBricks.activeGeneration)) {
    throw new Error('Staging replaced or hid the old active hierarchical generation');
  }
  if (generationTransitions.length !== 1
    || !final?.producer.bricks
    || final.producer.bricks.activeGeneration === initialBricks.activeGeneration
    || final.producer.bricks.stagingGeneration !== 0) {
    throw new Error(`Layout generation did not publish exactly once: ${JSON.stringify(activeGenerations)}`);
  }
  const transitionIndex = activeGenerations.findIndex((generation) => (
    generation !== initialBricks.activeGeneration
  ));
  if (transitionIndex < 0
    || samples[transitionIndex]?.shadowHistoryResetReason !== 'density-generation') {
    throw new Error('Published layout generation did not reset density-dependent history');
  }
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    initialCase,
    changedCase,
    initial,
    samples,
    screenshots: {
      before: path.join(output, 'before-layout-change.png'),
      staging: stagingScreenshot,
      after: afterScreenshot,
    },
    consoleErrors,
    pageErrors,
  };
  writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    initialGeneration: initialBricks.activeGeneration,
    finalGeneration: final.producer.bricks.activeGeneration,
    stagingFrames: stagingSamples.length,
    stagingMasks: [...new Set(stagingSamples.map((sample) => sample.producer.bricks.stagingWarmMask))],
    generationTransitions,
    resetReason: samples[transitionIndex].shadowHistoryResetReason,
    maxLivePairCount: Math.max(...samples.map((sample) => sample.producer.bricks?.livePairCount ?? 0)),
    screenshots: report.screenshots,
  }, null, 2));
} finally {
  await browser.close();
}
