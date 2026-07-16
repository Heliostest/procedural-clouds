import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '..', '..', '..');
const SCREENSHOTS = path.join(OUT, 'screenshots');
const BASE_URL = process.env.W9_BASE_URL || 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1';
const EXPECTED_CASES = 108;
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'docs/evidence/w8-cellular-wave/_pw/node_modules/playwright'));

mkdirSync(SCREENSHOTS, { recursive: true });

function git(args) {
  return execFileSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\r\n/g, '\n');
}

function gitSourceEvidence() {
  const revision = git(['rev-parse', 'HEAD']).trim();
  const ignoredOutputs = [
    'docs/evidence/w9-body-local-bricks/screenshots/',
    'docs/evidence/w9-body-local-bricks/results.raw.json',
    'docs/evidence/w9-body-local-bricks/gate-report.json',
    'docs/evidence/w9-body-local-bricks/report.md',
    'docs/evidence/w9-body-local-bricks/visual-review.json',
  ];
  const statusLines = git(['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n')
    .filter(Boolean)
    .filter((line) => !ignoredOutputs.some((item) => line.slice(3).replaceAll('\\', '/').startsWith(item)));
  const trackedDiff = git([
    'diff', '--binary', '--', '.',
    ':(exclude)docs/evidence/w9-body-local-bricks/screenshots/**',
    ':(exclude)docs/evidence/w9-body-local-bricks/results.raw.json',
    ':(exclude)docs/evidence/w9-body-local-bricks/gate-report.json',
    ':(exclude)docs/evidence/w9-body-local-bricks/report.md',
    ':(exclude)docs/evidence/w9-body-local-bricks/visual-review.json',
  ]);
  const untracked = [];
  for (const line of statusLines.filter((item) => item.startsWith('?? '))) {
    const relative = line.slice(3).replaceAll('\\', '/');
    const absolute = path.join(ROOT, relative);
    try {
      untracked.push(`${relative}\n${readFileSync(absolute).toString('base64')}`);
    } catch {
      untracked.push(`${relative}\n<unreadable>`);
    }
  }
  const diffSha256 = createHash('sha256')
    .update([statusLines.join('\n'), trackedDiff, ...untracked].join('\n--W9-SOURCE--\n'))
    .digest('hex');
  return { revision, dirty: statusLines.length > 0, status: statusLines, diffSha256 };
}

function headRevision() {
  try {
    const head = readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    try {
      return readFileSync(path.join(ROOT, '.git', ...ref.split('/')), 'utf8').trim();
    } catch {
      const packed = readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
      return packed.split(/\r?\n/).find((line) => line.endsWith(` ${ref}`))?.split(' ')[0] || `unresolved:${ref}`;
    }
  } catch {
    return 'unavailable';
  }
}

function filesystemSourceEvidence(gitError) {
  const hash = createHash('sha256');
  const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'screenshots']);
  const excludedFiles = new Set(['results.raw.json', 'gate-report.json', 'report.md', 'visual-review.json']);
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      if (entry.isFile() && excludedFiles.has(entry.name)
        && directory.replaceAll('\\', '/').endsWith('/docs/evidence/w9-body-local-bricks')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        hash.update(path.relative(ROOT, absolute).replaceAll('\\', '/'));
        hash.update('\0');
        hash.update(readFileSync(absolute));
        hash.update('\0');
      }
    }
  };
  walk(ROOT);
  return {
    revision: headRevision(),
    dirty: true,
    status: [`git-unavailable:${gitError instanceof Error ? gitError.message : String(gitError)}`],
    diffSha256: hash.digest('hex'),
    fingerprintKind: 'filesystem-tree-sha256',
  };
}

function sourceEvidence() {
  try {
    return { ...gitSourceEvidence(), fingerprintKind: 'git-diff-and-untracked-sha256' };
  } catch (error) {
    return filesystemSourceEvidence(error);
  }
}

function expectedRuntime(candidate, result) {
  const diagnostics = result?.producerDiagnostics;
  const expectedProducer = candidate.producer || 'legacy';
  const expectedStorage = candidate.storage || 'global-only';
  if (diagnostics?.requested !== expectedProducer || diagnostics?.active !== expectedProducer) {
    return `producer mismatch requested=${diagnostics?.requested} active=${diagnostics?.active}`;
  }
  if (diagnostics?.storageRequested !== expectedStorage || diagnostics?.storageActive !== expectedStorage) {
    return `storage mismatch requested=${diagnostics?.storageRequested} active=${diagnostics?.storageActive}`;
  }
  if (expectedStorage === 'hierarchical' && diagnostics?.storageLifecycle !== 'ready') {
    return `hierarchical lifecycle=${diagnostics?.storageLifecycle} reason=${diagnostics?.storageReason}`;
  }
  return '';
}

if (process.argv.includes('--source-evidence-only')) {
  console.log(JSON.stringify(sourceEvidence(), null, 2));
  process.exit(0);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const location = message.location();
  const benign = location.url.endsWith('/favicon.ico') && /404|failed to load resource/i.test(message.text());
  consoleErrors.push({ text: message.text(), url: location.url, benign });
});
page.on('pageerror', (error) => pageErrors.push(error.message));

const generatedAt = new Date().toISOString();
const captured = [];
try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.densityBenchmark) && Boolean(navigator.gpu), null, { timeout: 60_000 });
  const manifest = await page.evaluate(() => window.densityBenchmark.manifest);
  const cases = manifest.cases.filter((candidate) => candidate.id.startsWith('w9--'));
  if (cases.length !== EXPECTED_CASES) {
    throw new Error(`W9 manifest expected ${EXPECTED_CASES} cases, found ${cases.length}`);
  }

  for (const candidate of cases) {
    await page.evaluate((id) => window.densityBenchmark.start(id), candidate.id);
    let timedOut = false;
    try {
      await page.waitForFunction(() => {
        const state = window.densityBenchmark.getStatus().state;
        return state === 'ready-for-screenshot' || state === 'complete' || state === 'invalid';
      }, null, { timeout: 300_000, polling: 250 });
    } catch {
      timedOut = true;
    }
    const snapshot = await page.evaluate((id) => ({
      status: window.densityBenchmark.getStatus(),
      result: window.densityBenchmark.getResults().find((entry) => entry.caseId === id) || null,
    }), candidate.id);
    const runtimeError = expectedRuntime(candidate, snapshot.result);
    const hudName = `${candidate.id}--hud.png`;
    const cleanName = `${candidate.id}--clean.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS, hudName) });
    await page.evaluate(() => document.body.classList.add('density-benchmark-clean-capture'));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SCREENSHOTS, cleanName) });
    await page.evaluate(() => document.body.classList.remove('density-benchmark-clean-capture'));
    if (snapshot.result) await page.evaluate((id) => window.densityBenchmark.markScreenshot(id), candidate.id);
    captured.push({
      ...(snapshot.result || {}),
      caseId: candidate.id,
      status: runtimeError ? 'invalid' : timedOut ? 'timeout' : snapshot.result?.status || snapshot.status.state,
      statusMessage: runtimeError || snapshot.status.message,
      timedOut,
      screenshots: { hud: `screenshots/${hudName}`, clean: `screenshots/${cleanName}` },
    });
  }
} finally {
  await browser.close();
}

const evidence = {
  schemaVersion: 1,
  changeId: 'add-hierarchical-body-local-density-bricks',
  generatedAt,
  sourceEvidence: sourceEvidence(),
  baseUrl: BASE_URL,
  expectedCases: EXPECTED_CASES,
  consoleErrors,
  pageErrors,
  results: captured,
};
writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Captured ${captured.length}/${EXPECTED_CASES} W9 cases into ${OUT}`);
