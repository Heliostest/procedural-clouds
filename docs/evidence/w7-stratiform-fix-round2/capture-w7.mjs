import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(__dirname, '../w7-stratiform-fix/_pw/node_modules/playwright'));
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screenshots');
const BASE = 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';

const SCENES = [
  'single-stratus',
  'single-cirrostratus',
  'single-altostratus',
  'single-nimbostratus',
  'w7-stratiform-stack',
  'w7-stratiform-overlap',
];
const PRODUCERS = ['legacy', 'recipe-v2'];
const QUALITIES = ['cached', 'hybrid'];
const VIEWS = ['normal', 'density-debug'];

function caseId(scene, producer, quality, view) {
  return `w7--${scene}--${producer}--${quality}--${view}`;
}

function allCases() {
  const out = [];
  for (const scene of SCENES) {
    for (const producer of PRODUCERS) {
      for (const quality of QUALITIES) {
        for (const view of VIEWS) out.push(caseId(scene, producer, quality, view));
      }
    }
  }
  return out;
}

function hasShots(id) {
  return fs.existsSync(path.join(SHOTS, `${id}--hud.png`))
    && fs.existsSync(path.join(SHOTS, `${id}--clean.png`));
}

async function waitReady(page, id, timeoutMs = 120_000) {
  return page.evaluate(async ({ id, timeoutMs }) => {
    const t0 = performance.now();
    let samplingSince = 0;
    let early = false;
    window.densityBenchmark.start(id);
    await new Promise((resolve, reject) => {
      const kick = () => {
        const s = window.densityBenchmark.getStatus();
        if (s.state === 'ready-for-screenshot' || s.state === 'complete' || s.state === 'invalid') {
          resolve();
          return;
        }
        if (s.state === 'sampling' && s.warmupFrames >= 60) {
          if (!samplingSince) samplingSince = performance.now();
          if (performance.now() - samplingSince > 20_000) {
            early = true;
            resolve();
            return;
          }
        }
        if (performance.now() - t0 > timeoutMs) {
          if (s.warmupFrames >= 60) {
            early = true;
            resolve();
          } else {
            reject(new Error(`timeout ${id}: ${s.state} ${s.message}`));
          }
          return;
        }
        let left = 24;
        const step = () => {
          if (--left > 0) requestAnimationFrame(step);
          else setTimeout(kick, 0);
        };
        requestAnimationFrame(step);
      };
      kick();
    });
    const status = window.densityBenchmark.getStatus();
    const result = window.densityBenchmark.getResults().find((r) => r.caseId === id) || null;
    const hud = [...document.querySelectorAll('pre')].map((p) => p.textContent || '').join('\n');
    return {
      status,
      early,
      result,
      producerLine: (hud.match(/density producer:[^\n]*/i) || [null])[0],
      qualityLine: (hud.match(/质量:[^\n]*|quality:[^\n]*/i) || [null])[0],
      hudSnippet: hud.split('\n').filter((l) => /density|producer|质量|W0|warmup|V2|tile|NaN|fail|lifecycle/i.test(l)).slice(0, 40),
      deviceInfo: result?.deviceInfo || null,
      gpuTiming: result?.gpuTiming || null,
    };
  }, { id, timeoutMs });
}

async function capturePair(page, id) {
  const hudPath = path.join(SHOTS, `${id}--hud.png`);
  const cleanPath = path.join(SHOTS, `${id}--clean.png`);
  await page.screenshot({ path: hudPath, fullPage: false });
  await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: cleanPath, fullPage: false });
  await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
  return {
    hud: path.relative(OUT, hudPath).replaceAll('\\', '/'),
    clean: path.relative(OUT, cleanPath).replaceAll('\\', '/'),
  };
}

function classifyTiming(result, timingRequired, early) {
  if (!timingRequired) return 'not-applicable';
  if (early) return 'unresolved';
  const gt = result?.gpuTiming;
  if (!gt || gt.availability !== 'available') return 'unresolved';
  if (!gt.cache || gt.cache.count < 30) return 'unresolved';
  return 'collected';
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(240_000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.densityBenchmark && !!navigator.gpu, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const cases = allCases();
  const records = [];
  let deviceInfo = null;

  for (const id of cases) {
    const timingRequired = id.includes('--cached--normal');
    if (hasShots(id)) {
      console.log(`[skip] ${id}`);
      records.push({
        caseId: id,
        status: 'screenshot-exists',
        screenshots: {
          hud: `screenshots/${id}--hud.png`,
          clean: `screenshots/${id}--clean.png`,
        },
        cacheTiming: timingRequired ? 'unresolved' : 'not-applicable',
        rawDensityVerdict: id.includes('density-debug') ? 'pending-review' : 'n/a',
        normalOpticalVerdict: id.includes('--normal') ? 'pending-review' : 'n/a',
        supportTileMetadataVerdict: 'pending-review',
        note: 'reused existing screenshots; metadata pending merge',
      });
      continue;
    }
    console.log(`[run] ${id}`);
    let meta;
    try {
      meta = await waitReady(page, id, timingRequired ? 150_000 : 90_000);
    } catch (err) {
      console.error(String(err));
      records.push({
        caseId: id,
        status: 'failed',
        error: String(err),
        rawDensityVerdict: 'unresolved',
        normalOpticalVerdict: 'unresolved',
        supportTileMetadataVerdict: 'unresolved',
        cacheTiming: 'unresolved',
      });
      continue;
    }
    if (!deviceInfo && meta.deviceInfo) deviceInfo = meta.deviceInfo;
    const shots = await capturePair(page, id);
    try {
      await page.evaluate((caseId) => {
        try { window.densityBenchmark.markScreenshot(caseId); } catch {}
      }, id);
    } catch {}
    records.push({
      caseId: id,
      status: meta.status.state,
      early: !!meta.early,
      message: meta.status.message,
      warmupFrames: meta.status.warmupFrames,
      cloudSamples: meta.status.cloudSamples,
      cacheSamples: meta.status.cacheSamples,
      producerLine: meta.producerLine,
      qualityLine: meta.qualityLine,
      hudSnippet: meta.hudSnippet,
      producerRequested: meta.result?.producerDiagnostics?.requested ?? null,
      producerActive: meta.result?.producerDiagnostics?.active ?? null,
      evaluator: meta.result?.producerDiagnostics?.evaluator ?? null,
      sharedFields: meta.result?.producerDiagnostics?.sharedFields?.status ?? null,
      activeBodyCount: meta.result?.activeBodyCount ?? null,
      warnings: meta.result?.warnings ?? [],
      gpuTiming: meta.gpuTiming,
      screenshots: shots,
      cacheTiming: classifyTiming(meta.result, timingRequired, meta.early),
      rawDensityVerdict: id.includes('density-debug') ? 'pending-review' : 'n/a',
      normalOpticalVerdict: id.includes('--normal') ? 'pending-review' : 'n/a',
      supportTileMetadataVerdict: 'pending-review',
    });
  }

  let benchmarkExport = null;
  try {
    benchmarkExport = await page.evaluate(() => JSON.parse(window.densityBenchmark.exportJson()));
  } catch {}

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    deviceInfo,
    caseCount: records.length,
    results: records,
    benchmarkExport,
  };
  fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`wrote ${records.length} cases`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
