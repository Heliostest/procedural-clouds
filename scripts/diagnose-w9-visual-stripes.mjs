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
const output = process.env.W9_VISUAL_DIAG_OUT
  || path.resolve(root, '..', '.codex-w9-visual-diagnosis', 'baseline');
const scenes = (process.env.W9_VISUAL_SCENES
  || 'single-altocumulus,single-cirrocumulus,w8-cellular-scale')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const view = process.env.W9_VISUAL_VIEW || 'density-debug';
const variants = [
  {
    id: 'global-default',
    storage: 'global-only',
    cacheResolution: 96,
    boxHalfExtent: 32_000,
  },
  {
    // Diagnostic only: shrink the world cache domain and raise its resolution
    // so the global cache can reveal whether the Recipe V2 evaluator itself
    // contains the same bands that body-local bricks expose.
    id: 'global-compact-volume',
    storage: 'global-only',
    cacheResolution: 160,
    boxHalfExtent: 8_000,
  },
  {
    id: 'hierarchical-default',
    storage: 'hierarchical',
    cacheResolution: 96,
    boxHalfExtent: 32_000,
  },
];

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
  await page.evaluate(() => {
    window.densityBenchmark.manifest.warmupFrames = 12;
    window.densityBenchmark.manifest.minimumCacheWarmups = 2;
    window.densityBenchmark.manifest.minimumGpuSamples = 4;
  });

  const results = [];
  for (const scene of scenes) {
    for (const variant of variants) {
      const caseId = `w9--${scene}--recipe-v2--${variant.storage}--cached--${view}`;
      await page.evaluate(({ caseId: id, cacheResolution, boxHalfExtent }) => {
        const benchmark = window.densityBenchmark;
        benchmark.manifest.params.cacheResolution = cacheResolution;
        benchmark.manifest.params.boxHalfExtent = boxHalfExtent;
        benchmark.start(id);
      }, { caseId, cacheResolution: variant.cacheResolution, boxHalfExtent: variant.boxHalfExtent });
      await page.waitForFunction(() => {
        const state = window.densityBenchmark.getStatus().state;
        return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
      }, null, { timeout: 180_000, polling: 250 });
      const snapshot = await page.evaluate((id) => ({
        status: window.densityBenchmark.getStatus(),
        result: window.densityBenchmark.getResults().find((entry) => entry.caseId === id) || null,
      }), caseId);
      if (snapshot.status.state === 'invalid') {
        throw new Error(`${caseId}/${variant.id}: ${snapshot.status.message}`);
      }
      const diagnostics = snapshot.result?.producerDiagnostics;
      if (diagnostics?.storageActive !== variant.storage) {
        throw new Error(`${caseId}/${variant.id}: active storage=${diagnostics?.storageActive}`);
      }
      await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
      await page.waitForTimeout(150);
      const screenshot = path.join(output, `${scene}--${variant.id}.png`);
      await page.screenshot({ path: screenshot });
      await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
      results.push({
        scene,
        variant,
        caseId,
        screenshot,
        status: snapshot.status,
        configFingerprint: snapshot.result?.configFingerprint ?? '',
        diagnostics,
      });
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    view,
    variants,
    results,
    consoleErrors,
    pageErrors,
  };
  writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }
  console.log(JSON.stringify(results.map((result) => ({
    scene: result.scene,
    variant: result.variant.id,
    screenshot: result.screenshot,
    storage: result.diagnostics?.storageActive,
    profile: result.diagnostics?.bricks?.profile ?? '',
  })), null, 2));
} finally {
  await browser.close();
}
