import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '..', '.codex-w9-smoke');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, 'docs/evidence/w8-cellular-wave/_pw/node_modules/playwright'));
const base = process.env.W9_BASE_URL || 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';
const scenes = ['single-cirrocumulus', 'w8-cellular-scale', 'w8-wave-ripple'];
const cases = scenes.flatMap((scene) => ['global-only', 'hierarchical'].map((storage) => ({
  scene,
  storage,
  id: `w9--${scene}--recipe-v2--${storage}--cached--density-debug`,
})));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  const location = message.location();
  if (message.type() === 'error' && !location.url.endsWith('/favicon.ico')) {
    errors.push(`${message.text()} @ ${location.url}`);
  }
});
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, { timeout: 60_000 });
  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 8;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 4;
  });
  const results = [];
  for (const candidate of cases) {
    await page.evaluate((id) => window.densityBenchmark.start(id), candidate.id);
    await page.waitForFunction(() => {
      const state = window.densityBenchmark.getStatus().state;
      return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
    }, null, { timeout: 180_000, polling: 250 });
    const result = await page.evaluate((id) => ({
      status: window.densityBenchmark.getStatus(),
      result: window.densityBenchmark.getResults().find((entry) => entry.caseId === id) || null,
    }), candidate.id);
    if (result.status.state === 'invalid') throw new Error(`${candidate.id}: ${result.status.message}`);
    const diagnostics = result.result?.producerDiagnostics;
    if (diagnostics?.storageActive !== candidate.storage) {
      throw new Error(`${candidate.id}: active storage=${diagnostics?.storageActive}`);
    }
    await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
    await page.waitForTimeout(150);
    const screenshot = path.join(output, `${candidate.scene}--${candidate.storage}.png`);
    await page.screenshot({ path: screenshot });
    await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
    results.push({
      ...candidate,
      screenshot,
      profile: diagnostics?.bricks?.profile ?? '',
      resident: diagnostics?.bricks?.residentBodyCount ?? 0,
      candidates: diagnostics?.bricks?.candidate ?? null,
    });
  }
  if (errors.length > 0) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
