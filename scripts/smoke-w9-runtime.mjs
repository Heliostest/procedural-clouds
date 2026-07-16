import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, 'docs/evidence/w8-cellular-wave/_pw/node_modules/playwright'));
const caseId = process.env.W9_SMOKE_CASE
  || 'w9--single-cirrocumulus--recipe-v2--hierarchical--cached--density-debug';
const base = process.env.W9_BASE_URL || 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';
const screenshotPath = process.env.W9_SMOKE_SCREENSHOT || '';
const expectedStorage = caseId.includes('--hierarchical--') ? 'hierarchical' : 'global-only';

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
  const location = message.location();
  if (message.type() === 'error' && !location.url.endsWith('/favicon.ico')) {
    consoleErrors.push(`${message.text()} @ ${location.url}`);
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, { timeout: 60_000 });
  const hasCase = await page.evaluate((id) => window.densityBenchmark.manifest.cases.some((candidate) => candidate.id === id), caseId);
  if (!hasCase) throw new Error(`W9 smoke case is absent from manifest: ${caseId}`);
  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 8;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 4;
  });
  await page.evaluate((id) => window.densityBenchmark.start(id), caseId);
  await page.waitForFunction(() => {
    const state = window.densityBenchmark.getStatus().state;
    return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
  }, null, { timeout: 180_000, polling: 250 });
  const result = await page.evaluate((id) => ({
    status: window.densityBenchmark.getStatus(),
    result: window.densityBenchmark.getResults().find((candidate) => candidate.caseId === id) || null,
  }), caseId);
  if (result.status.state === 'invalid') throw new Error(result.status.message);
  const diagnostics = result.result?.producerDiagnostics;
  if (diagnostics?.requested !== 'recipe-v2' || diagnostics?.active !== 'recipe-v2') {
    throw new Error(`Recipe V2 did not become active: ${JSON.stringify(diagnostics)}`);
  }
  if (diagnostics?.storageRequested !== expectedStorage || diagnostics?.storageActive !== expectedStorage) {
    throw new Error(`${expectedStorage} storage did not become active: ${JSON.stringify(diagnostics)}`);
  }
  if (expectedStorage === 'hierarchical' && (diagnostics?.bricks?.residentBodyCount < 1
    || diagnostics?.bricks?.recordBytes !== 1_920
    || diagnostics?.bricks?.dispatchCount !== diagnostics?.bricks?.residentBodyCount
    || diagnostics?.bricks?.sampleId < 1)) {
    throw new Error(`Hierarchical diagnostics violate W9 contracts: ${JSON.stringify(diagnostics?.bricks)}`);
  }
  if (expectedStorage === 'global-only' && diagnostics?.bricks
    && (diagnostics.bricks.residentBytes !== 0
      || diagnostics.bricks.recordBytes !== 0
      || diagnostics.bricks.candidateBytes !== 0
      || diagnostics.bricks.dispatchCount !== 0)) {
    throw new Error(`Global-only mode retained W9 GPU resources or dispatches: ${JSON.stringify(diagnostics.bricks)}`);
  }
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
  }
  console.log(JSON.stringify({ caseId, status: result.status, diagnostics }, null, 2));
} finally {
  await browser.close();
}
