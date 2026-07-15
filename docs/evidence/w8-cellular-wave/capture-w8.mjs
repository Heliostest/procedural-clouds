import { createRequire } from 'module';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(__dirname, '_pw/node_modules/playwright'));
const OUT = __dirname;
const SHOTS = path.join(OUT, 'screenshots');
const BASE = 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';
const MIN_GPU_SAMPLES = 60;
const FORCE_CAPTURE = process.env.W8_FORCE_CAPTURE === '1';

function sourceEvidence() {
  const root = path.resolve(OUT, '../../..');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const pathspecs = [
    '.',
    ':(exclude)docs/evidence/w8-cellular-wave/results.raw.json',
    ':(exclude)docs/evidence/w8-cellular-wave/gate-report.json',
    ':(exclude)docs/evidence/w8-cellular-wave/report.md',
    ':(exclude)docs/evidence/w8-cellular-wave/visual-review.json',
    ':(exclude)docs/evidence/w8-cellular-wave/screenshots/**',
  ];
  const revision = git('rev-parse', 'HEAD');
  const status = git('status', '--porcelain=v1', '--untracked-files=all', '--', ...pathspecs);
  const diff = execFileSync('git', ['diff', '--no-ext-diff', '--binary', 'HEAD', '--', ...pathspecs], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
    { cwd: root, encoding: 'utf8' },
  ).split('\0').filter(Boolean).sort();
  const sourceHash = createHash('sha256').update(diff);
  for (const relativePath of untracked) {
    sourceHash.update(`\0untracked:${relativePath}\0`);
    sourceHash.update(fs.readFileSync(path.join(root, relativePath)));
  }
  return {
    revision,
    dirty: status.length > 0,
    diffSha256: sourceHash.digest('hex'),
    status: status.split('\n').filter(Boolean),
    untracked,
  };
}

const SCENES = [
  'single-stratocumulus',
  'single-altocumulus',
  'single-cirrocumulus',
  'w8-cellular-scale',
  'w8-cellular-overlap',
  'w8-wave-ripple',
  'single-cumulonimbus',
  'single-cirrus',
];
const PRODUCERS = ['legacy', 'recipe-v2'];
const QUALITIES = ['cached', 'hybrid'];
const VIEWS = ['normal', 'density-debug'];

const EXPECTED_ENABLED = [
  'cumulus', 'stratus', 'stratocumulus', 'altocumulus',
  'altostratus', 'nimbostratus', 'cirrostratus', 'cirrocumulus',
];
const EXPECTED_UNSUPPORTED = ['cumulonimbus', 'cirrus'];

function caseId(scene, producer, quality, view) {
  return `w8--${scene}--${producer}--${quality}--${view}`;
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

function classifyTiming(result, timingRequired, timedOut) {
  if (!timingRequired) return 'not-applicable';
  if (timedOut) return 'unresolved';
  const gt = result?.gpuTiming;
  if (!gt || gt.availability !== 'available') return 'unresolved';
  if (!gt.cache || gt.cache.count < MIN_GPU_SAMPLES) return 'unresolved';
  return 'collected';
}

function validateRecipeV2(meta, id) {
  if (!id.includes('--recipe-v2--')) return { ok: true, notes: [] };
  const notes = [];
  const pd = meta.result?.producerDiagnostics;
  const ev = pd?.evaluator;
  if (pd?.requested !== 'recipe-v2') notes.push(`requested=${pd?.requested}`);
  if (pd?.active !== 'recipe-v2') notes.push(`active=${pd?.active}`);
  const lifecycle = meta.lifecycle || ev?.lifecycle || null;
  if (lifecycle && lifecycle !== 'ready') notes.push(`lifecycle=${lifecycle}`);
  if (ev) {
    const enabled = [...(ev.enabledGenera || [])].sort();
    const unsupported = [...(ev.unsupportedGenera || [])].sort();
    if (JSON.stringify(enabled) !== JSON.stringify([...EXPECTED_ENABLED].sort())) {
      notes.push(`enabledGenera=${JSON.stringify(enabled)}`);
    }
    if (JSON.stringify(unsupported) !== JSON.stringify([...EXPECTED_UNSUPPORTED].sort())) {
      notes.push(`unsupportedGenera=${JSON.stringify(unsupported)}`);
    }
    const limits = ev.sampleLimits || {};
    for (const g of ['stratocumulus', 'altocumulus', 'cirrocumulus']) {
      const lim = limits[g];
      const vals = Array.isArray(lim)
        ? lim
        : lim
          ? [lim.primary, lim.secondary, lim.detail, lim.coverage]
          : null;
      if (!vals || vals[0] !== 3 || vals[1] !== 0 || vals[2] !== 0 || vals[3] !== 0) {
        notes.push(`${g}.sampleLimits=${JSON.stringify(lim)}`);
      }
    }
    if (typeof ev.actualEvaluatorCalls === 'number') {
      notes.push(`actualEvaluatorCalls forged number=${ev.actualEvaluatorCalls}`);
    }
  } else {
    notes.push('evaluator missing');
  }
  return { ok: notes.length === 0, notes };
}

async function waitReady(page, id, timeoutMs) {
  return page.evaluate(async ({ id, timeoutMs, minSamples }) => {
    const t0 = performance.now();
    let timedOut = false;
    window.densityBenchmark.start(id);
    await new Promise((resolve, reject) => {
      const kick = () => {
        const s = window.densityBenchmark.getStatus();
        if (s.state === 'ready-for-screenshot' || s.state === 'complete' || s.state === 'invalid') {
          resolve();
          return;
        }
        if (performance.now() - t0 > timeoutMs) {
          if (s.warmupFrames >= 60) {
            timedOut = true;
            resolve();
          } else {
            reject(new Error(`timeout ${id}: ${s.state} warmup=${s.warmupFrames} ${s.message}`));
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
    const lifecycleMatch = hud.match(/lifecycle[:=]\s*([^\s\n]+)/i);
    const ev = result?.producerDiagnostics?.evaluator;
    return {
      status,
      timedOut,
      result,
      lifecycle: lifecycleMatch?.[1] || ev?.lifecycle || null,
      producerLine: (hud.match(/density producer:[^\n]*/i) || [null])[0],
      qualityLine: (hud.match(/质量:[^\n]*|quality:[^\n]*/i) || [null])[0],
      hudSnippet: hud.split('\n').filter((l) => /density|producer|质量|W0|warmup|V2|tile|NaN|Inf|fail|lifecycle|sample/i.test(l)).slice(0, 50),
      hudHasNan: /NaN|Infinity|\bInf\b/i.test(hud),
      deviceInfo: result?.deviceInfo || null,
      gpuTiming: result?.gpuTiming || null,
      minSamples,
    };
  }, { id, timeoutMs, minSamples: MIN_GPU_SAMPLES });
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

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const consoleErrors = [];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(360_000);
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const location = msg.location();
      consoleErrors.push({
        text: msg.text(),
        url: location.url || null,
        lineNumber: location.lineNumber ?? null,
        columnNumber: location.columnNumber ?? null,
        t: new Date().toISOString(),
      });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ text: `uncaught: ${err.message}`, t: new Date().toISOString() });
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.densityBenchmark && !!navigator.gpu, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const boot = await page.evaluate(() => ({
    hasGpu: !!navigator.gpu,
    hasBenchmark: !!window.densityBenchmark,
    initFail: /初始化失败|init failed|WebGPU/i.test(document.body?.innerText || ''),
  }));
  if (!boot.hasGpu || !boot.hasBenchmark) {
    throw new Error(`boot failed: ${JSON.stringify(boot)}`);
  }

  const cases = allCases();
  const capturedSource = sourceEvidence();
  const records = [];
  let deviceInfo = null;
  const existingRawPath = path.join(OUT, 'results.raw.json');
  const priorById = new Map();
  if (fs.existsSync(existingRawPath)) {
    try {
      const prior = JSON.parse(fs.readFileSync(existingRawPath, 'utf8'));
      for (const r of prior.results || []) priorById.set(r.caseId, r);
    } catch {}
  }

  for (let i = 0; i < cases.length; i++) {
    const id = cases[i];
    const timingRequired = id.includes('--cached--normal');
    if (!FORCE_CAPTURE && hasShots(id)) {
      console.log(`[skip ${i + 1}/${cases.length}] ${id}`);
      const prev = priorById.get(id);
      records.push(prev && prev.status !== 'failed' ? {
        ...prev,
        note: prev.note || 'reused existing screenshots',
      } : {
        caseId: id,
        status: 'screenshot-exists',
        screenshots: {
          hud: `screenshots/${id}--hud.png`,
          clean: `screenshots/${id}--clean.png`,
        },
        cacheTiming: timingRequired ? 'unresolved' : 'not-applicable',
        timingClassification: timingRequired ? 'unresolved' : 'not-applicable',
        rawDensityVerdict: id.includes('density-debug') ? 'pending-review' : 'n/a',
        normalOpticalVerdict: id.includes('--normal') ? 'pending-review' : 'n/a',
        supportTileVerdict: 'pending-review',
        metadataVerdict: 'unresolved',
        note: 'reused existing screenshots; metadata pending merge',
      });
      continue;
    }

    console.log(`[run ${i + 1}/${cases.length}] ${id}`);
    const beforeErr = consoleErrors.length;
    let meta;
    try {
      meta = await waitReady(page, id, timingRequired ? 300_000 : 120_000);
    } catch (err) {
      console.error(String(err));
      records.push({
        caseId: id,
        status: 'failed',
        error: String(err),
        consoleErrors: consoleErrors.slice(beforeErr),
        rawDensityVerdict: 'unresolved',
        normalOpticalVerdict: 'unresolved',
        supportTileVerdict: 'unresolved',
        metadataVerdict: 'unresolved',
        timingClassification: 'unresolved',
        cacheTiming: 'unresolved',
      });
      fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceEvidence: capturedSource,
        baseUrl: BASE,
        deviceInfo,
        caseCount: records.length,
        results: records,
        consoleErrors,
      }, null, 2)}\n`);
      continue;
    }

    if (!deviceInfo && meta.deviceInfo) deviceInfo = meta.deviceInfo;
    const shots = await capturePair(page, id);
    try {
      await page.evaluate((caseId) => {
        try { window.densityBenchmark.markScreenshot(caseId); } catch {}
      }, id);
    } catch {}

    const v2 = validateRecipeV2(meta, id);
    const caseConsole = consoleErrors.slice(beforeErr);
    const webgpuValidation = caseConsole.some((e) => /webgpu|validation|GPUError/i.test(e.text));
    const timingClassification = classifyTiming(meta.result, timingRequired, meta.timedOut);

    let status = meta.status.state;
    if (meta.timedOut && status !== 'invalid' && status !== 'complete' && status !== 'ready-for-screenshot') {
      status = 'timeout-after-warmup';
    }
    if (!v2.ok) status = 'invalid';
    if (meta.hudHasNan || webgpuValidation) status = 'invalid';

    const record = {
      caseId: id,
      status,
      configFingerprint: meta.result?.configFingerprint ?? null,
      early: false,
      timedOut: !!meta.timedOut,
      message: meta.status.message,
      warmupFrames: meta.status.warmupFrames,
      cloudSamples: meta.status.cloudSamples,
      cacheSamples: meta.status.cacheSamples,
      cacheSampleCount: meta.result?.gpuTiming?.cache?.count ?? meta.status.cacheSamples,
      lifecycle: meta.lifecycle,
      producerLine: meta.producerLine,
      qualityLine: meta.qualityLine,
      hudSnippet: meta.hudSnippet,
      producerRequested: meta.result?.producerDiagnostics?.requested ?? null,
      producerActive: meta.result?.producerDiagnostics?.active ?? null,
      evaluator: meta.result?.producerDiagnostics?.evaluator ?? null,
      sharedFields: meta.result?.producerDiagnostics?.sharedFields ?? null,
      activeBodyCount: meta.result?.activeBodyCount ?? null,
      warnings: meta.result?.warnings ?? [],
      errors: caseConsole,
      gpuTiming: meta.gpuTiming,
      screenshots: shots,
      cacheTiming: timingClassification,
      timingClassification,
      rawDensityVerdict: id.includes('density-debug') ? 'pending-review' : 'n/a',
      normalOpticalVerdict: id.includes('--normal') ? 'pending-review' : 'n/a',
      supportTileVerdict: 'pending-review',
      metadataVerdict: 'unresolved',
      recipeV2Checks: id.includes('--recipe-v2--') ? v2 : null,
      consoleErrorCount: caseConsole.length,
      webgpuValidationError: webgpuValidation,
      hudHasNan: !!meta.hudHasNan,
    };
    records.push(record);

    fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      deviceInfo,
      caseCount: records.length,
      results: records,
      consoleErrors,
    }, null, 2)}\n`);
  }

  let benchmarkExport = null;
  try {
    benchmarkExport = await page.evaluate(() => JSON.parse(window.densityBenchmark.exportJson()));
  } catch {}

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceEvidence: capturedSource,
    baseUrl: BASE,
    viewport: { width: 1400, height: 900 },
    deviceInfo,
    caseCount: records.length,
    results: records,
    benchmarkExport,
    consoleErrors,
  };
  fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`wrote ${records.length} cases; screenshots=${fs.readdirSync(SHOTS).length}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
