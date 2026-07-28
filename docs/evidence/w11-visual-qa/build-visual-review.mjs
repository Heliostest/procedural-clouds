import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../../..');
const SHOTS = path.join(OUT, 'screenshots');
const DIAG = path.join(OUT, 'diagnostics');

function loadJson(name) {
  const p = path.join(OUT, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function shot(name) {
  const rel = `screenshots/${name}`;
  return existsSync(path.join(OUT, rel)) ? rel : null;
}

function loadDiag(stem) {
  const p = path.join(DIAG, `${stem}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function row(id, category, status, evidence, reason, details = {}) {
  return { id, category, status, evidence, reason, ...details };
}

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function runTest(script) {
  try {
    const text = execSync(`npm run ${script}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { script, status: 'PASS', text };
  } catch (error) {
    const text = [
      error?.stdout?.toString?.() ?? '',
      error?.stderr?.toString?.() ?? '',
      error instanceof Error ? error.message : String(error),
    ].join('\n');
    return { script, status: 'FAIL', text };
  }
}

const selected = loadJson('selected-cases.json') || [];
const runtimeEvidence = loadJson('runtime-evidence.json');
const pixelDiff = loadJson('pixel-diff.json');
const motionDrive = loadJson('motion-drive.json');
const captureIndex = loadJson('capture-index.json');

const rows = [];

const testScripts = [
  { script: 'test:w11-bayer', file: 'scripts/check-w11-bayer-phase.mjs' },
  { script: 'test:w11-lowres', file: 'scripts/check-w11-lowres-mapping.mjs' },
  { script: 'test:w11-invalidation', file: 'scripts/check-w11-history-invalidation.mjs' },
  { script: 'test:w11-resolve', file: 'scripts/check-w11-taau-resolve.mjs' },
];
const testResults = {};
for (const { script, file } of testScripts) {
  const result = runTest(script);
  testResults[script] = { status: result.status };
  const logName = `${script.replaceAll(':', '-')}.log`;
  writeFileSync(path.join(OUT, logName), result.text);
  rows.push(row(
    script,
    'auto-contract',
    result.status === 'PASS' ? 'PASS' : 'FAIL',
    [logName, file],
    result.status === 'PASS' ? `${script} passed` : `${script} failed`,
  ));
}

for (const entry of selected) {
  const short = entry.short;
  if (!short) continue;
  for (const mode of ['T0', 'T1', 'T2']) {
    const stem = `${short}__temporal-${mode}`;
    const diag = loadDiag(stem);
    const clean = shot(`${stem}__clean.png`);
    const hud = shot(`${stem}__hud.png`);
    const evidence = [clean, hud, diag ? `diagnostics/${stem}.json` : null].filter(Boolean);
    if (!diag || !clean) {
      rows.push(row(`${stem}__capture`, 'capture', 'UNABLE', evidence, 'Missing diagnostics or clean screenshot'));
      continue;
    }
    const t = diag.diagnostics.temporal;
    const cf = diag.diagnostics.cloudFrame;
    const expected = mode === 'T0' ? 'off' : mode === 'T1' ? 'full-res-taa' : 'taau-4x4';
    rows.push(row(
      `${stem}__gpu-validation`,
      'gpu-validation',
      (cf.gpuValidationErrors?.length ?? 1) === 0 ? 'PASS' : 'FAIL',
      evidence,
      (cf.gpuValidationErrors?.length ?? 1) === 0
        ? 'gpuValidationErrors empty'
        : `gpuValidationErrors=${JSON.stringify(cf.gpuValidationErrors)}`,
    ));
    rows.push(row(
      `${stem}__active-mode`,
      'temporal-mode',
      t.activeTemporalMode === expected ? 'PASS' : 'FAIL',
      evidence,
      `expected=${expected}; active=${t.activeTemporalMode}; reason=${t.temporalFallbackReason}`,
      { activeTemporalMode: t.activeTemporalMode, requestedTemporalMode: t.requestedTemporalMode },
    ));
  }
}

for (const short of ['cirrocumulus', 'stratocumulus']) {
  for (const view of [0, 10, 1, 6, 11, 16, 17]) {
    const stem = `${short}__debug-${view}`;
    const clean = shot(`${stem}__clean.png`);
    const diag = loadDiag(stem);
    const evidence = [clean, diag ? `diagnostics/${stem}.json` : null].filter(Boolean);
    rows.push(row(
      `${stem}__files`,
      'artifact-completeness',
      clean && diag ? 'PASS' : 'UNABLE',
      evidence,
      clean && diag
        ? 'Debug capture files present (not a visual PASS)'
        : 'Missing debug capture files',
    ));
  }
}

for (const view of [16, 17]) {
  const stem = `thin-ridge__debug-${view}`;
  const clean = shot(`${stem}__clean.png`);
  const diag = loadDiag(stem);
  const evidence = [clean, diag ? `diagnostics/${stem}.json` : null].filter(Boolean);
  rows.push(row(
    `${stem}__files`,
    'artifact-completeness',
    clean && diag ? 'PASS' : 'UNABLE',
    evidence,
    clean && diag
      ? 'thin-ridge phase/rejection debug files present (not a visual PASS)'
      : 'Missing thin-ridge phase/rejection debug files',
  ));
}

const cirrusEntry = selected.find((e) => e.short === 'cirrus' || e.sceneId === 'single-cirrus');
const cirrusT2 = loadDiag('cirrus__temporal-T2');
const cirrusLight = cirrusT2?.diagnostics?.raymarch?.raymarchLightSamplesPerPixel;
rows.push(row(
  'cirrus__discriminative-power',
  'case-selection',
  cirrusEntry?.discriminativePower === 'none-empty-sky' || cirrusLight === 0 ? 'OBSERVATION' : 'UNABLE',
  [
    'selected-cases.json',
    shot('cirrus__temporal-T1__clean.png'),
    shot('cirrus__temporal-T2__clean.png'),
    shot('cirrus__debug-1__clean.png'),
    'diagnostics/cirrus__temporal-T2.json',
  ].filter(Boolean),
  `sparse Ci case has no discriminative power under current camera/body; lightSamples/px=${cirrusLight}; discriminativePower=${cirrusEntry?.discriminativePower ?? 'unset'}; sparse Ci only has approximate/empty substitute`,
  {
    raymarchLightSamplesPerPixel: cirrusLight ?? null,
    discriminativePower: cirrusEntry?.discriminativePower ?? null,
  },
));

const t2DiagForReject = loadDiag('stratocumulus__temporal-T2')
  || loadDiag('cirrocumulus__temporal-T2');
const rejT = t2DiagForReject?.diagnostics?.temporal;
rows.push(row(
  'taau-rejection-reason-split',
  'temporal-diagnostics',
  rejT
    && typeof rejT.taauRejectNoVelocityRatio === 'number'
    && typeof rejT.taauCloudCoveredRejectionRatio === 'number'
    ? 'OBSERVATION'
    : 'UNABLE',
  [
    t2DiagForReject ? `diagnostics/${t2DiagForReject.stem || 'stratocumulus__temporal-T2'}.json` : null,
    'runtime-evidence.json',
  ].filter(Boolean),
  rejT
    ? `aggregate=${rejT.taauHistoryRejectionRatio}; nv=${rejT.taauRejectNoVelocityRatio}; vp=${rejT.taauRejectViewportRatio}; d=${rejT.taauRejectDepthRatio}; o=${rejT.taauRejectOpacityRatio}; cloud=${rejT.taauCloudCoveredRejectionRatio} (n=${rejT.taauCloudCoveredSampleCount}, thr=${rejT.taauCloudOpacityThreshold}); phaseN=${rejT.taauCurrentPhaseSampleCount}/${rejT.taauNonCurrentPhaseSampleCount}`
    : 'Missing T2 diagnostics with reason-split rejection fields',
  {
    taauHistoryRejectionRatio: rejT?.taauHistoryRejectionRatio ?? null,
    taauRejectNoVelocityRatio: rejT?.taauRejectNoVelocityRatio ?? null,
    taauRejectViewportRatio: rejT?.taauRejectViewportRatio ?? null,
    taauRejectDepthRatio: rejT?.taauRejectDepthRatio ?? null,
    taauRejectOpacityRatio: rejT?.taauRejectOpacityRatio ?? null,
    taauCloudCoveredRejectionRatio: rejT?.taauCloudCoveredRejectionRatio ?? null,
    taauCloudCoveredSampleCount: rejT?.taauCloudCoveredSampleCount ?? null,
    taauCloudOpacityThreshold: rejT?.taauCloudOpacityThreshold ?? null,
  },
));

const thinT2 = loadDiag('thin-ridge__temporal-T2');
const thinRej = thinT2?.diagnostics?.temporal;
const thinDiff = pixelDiff?.results?.['thin-ridge__T1-vs-T2'];
rows.push(row(
  'thin-ridge__edge-degradation-signals',
  'visual-gate',
  thinDiff?.status === 'OBSERVATION' && thinRej ? 'OBSERVATION' : 'UNABLE',
  [
    'pixel-diff.json',
    'diagnostics/thin-ridge__temporal-T2.json',
    shot('thin-ridge__debug-16__clean.png'),
    shot('thin-ridge__debug-17__clean.png'),
  ].filter(Boolean),
  thinDiff && thinRej
    ? `T1vsT2 maxAbs=${thinDiff.maxAbs}; aboveThrPixelRatio=${thinDiff.aboveThresholdPixelRatio}; cloudReject=${thinRej.taauCloudCoveredRejectionRatio}; aggregateReject=${thinRej.taauHistoryRejectionRatio}`
    : 'Missing thin-ridge T1/T2 diff or T2 rejection diagnostics',
  {
    maxAbs: thinDiff?.maxAbs ?? null,
    aboveThresholdPixelRatio: thinDiff?.aboveThresholdPixelRatio ?? null,
    changedPixelRatio: thinDiff?.changedPixelRatio ?? null,
    taauCloudCoveredRejectionRatio: thinRej?.taauCloudCoveredRejectionRatio ?? null,
    taauHistoryRejectionRatio: thinRej?.taauHistoryRejectionRatio ?? null,
  },
));

const convT2Adj = pixelDiff?.results?.['cirrocumulus__conv-f16-vs-f17'];
const convT1Adj = pixelDiff?.results?.['cirrocumulus__conv-T1-f16-vs-f17'];
rows.push(row(
  'convergence-adjacent-T1-vs-T2-control',
  'png-diff-observation',
  convT2Adj?.status === 'OBSERVATION' && convT1Adj?.status === 'OBSERVATION'
    ? 'OBSERVATION'
    : 'UNABLE',
  ['pixel-diff.json'],
  `sceneClock frozen via benchmark frame override; T2 adj maxAbs=${convT2Adj?.maxAbs ?? 'n/a'}; T1 adj maxAbs=${convT1Adj?.maxAbs ?? 'n/a'}; if T1≈T2 magnitude then scene motion not the driver`,
  {
    t2: convT2Adj ? { maxAbs: convT2Adj.maxAbs, aboveThresholdPixelRatio: convT2Adj.aboveThresholdPixelRatio } : null,
    t1: convT1Adj ? { maxAbs: convT1Adj.maxAbs, aboveThresholdPixelRatio: convT1Adj.aboveThresholdPixelRatio } : null,
    sceneClockFrozen: true,
  },
));

const convOk = Array.from({ length: 18 }, (_, i) => (
  shot(`cirrocumulus__conv-f${String(i).padStart(2, '0')}.png`)
)).every(Boolean);
rows.push(row(
  'cirrocumulus__convergence-suite-files',
  'artifact-completeness',
  convOk ? 'PASS' : 'UNABLE',
  Array.from({ length: 18 }, (_, i) => `screenshots/cirrocumulus__conv-f${String(i).padStart(2, '0')}.png`),
  convOk
    ? 'Evidence files complete: 18 TAAU convergence frames (not a visual PASS)'
    : 'Incomplete convergence file suite',
));

for (const mode of ['T0', 'T1', 'T2']) {
  const motionOk = Array.from({ length: 8 }, (_, i) => (
    shot(`stratocumulus__motion-${mode}__f${String(i).padStart(2, '0')}.png`)
  )).every(Boolean);
  rows.push(row(
    `stratocumulus__motion-${mode}-suite-files`,
    'artifact-completeness',
    motionOk ? 'PASS' : 'UNABLE',
    Array.from({ length: 8 }, (_, i) => `screenshots/stratocumulus__motion-${mode}__f${String(i).padStart(2, '0')}.png`),
    motionOk
      ? `Evidence files complete: 8 motion-${mode} frames (not a visual PASS)`
      : `Incomplete motion-${mode} file suite`,
  ));
}

rows.push(row(
  'motion-drive-reproducibility',
  'motion-drive',
  motionDrive?.status === 'UNABLE' ? 'UNABLE' : motionDrive ? 'OBSERVATION' : 'UNABLE',
  ['motion-drive.json'].filter(() => Boolean(motionDrive)),
  motionDrive?.reason || 'motion-drive.json missing',
  { motionDrive },
));

if (runtimeEvidence?.checks) {
  for (const [id, check] of Object.entries(runtimeEvidence.checks)) {
    rows.push(row(
      `runtime__${id}`,
      'runtime-api',
      check.status,
      ['runtime-evidence.json'],
      check.reason || '',
      { check },
    ));
  }
}

if (pixelDiff?.results) {
  for (const [id, diff] of Object.entries(pixelDiff.results)) {
    rows.push(row(
      `pngdiff__${id}`,
      'png-diff-observation',
      diff.status === 'OBSERVATION' || diff.status === 'UNABLE' ? diff.status : 'OBSERVATION',
      ['pixel-diff.json', ...(diff.evidence || [])],
      diff.reason
        || `OBSERVATION maxAbs=${diff.maxAbs}; referenceThreshold=${diff.referenceThreshold} (non-normative)`,
      { maxAbs: diff.maxAbs, kind: diff.kind },
    ));
  }
}

rows.push(row(
  'taau-vs-fullres-visual-equivalence',
  'visual-gate',
  'UNABLE',
  ['pixel-diff.json'],
  'PNG diff OBSERVATION only; owner must judge TAAU vs full-res TAA visual equivalence',
));
rows.push(row(
  'ghosting-breathing-owner-visual',
  'visual-gate',
  'UNABLE',
  ['screenshot-manifest.json'],
  'Trailing / double-image / Bayer residue / 16-frame brightness breathing require owner visual review',
));
rows.push(row(
  'owner-visual-signoff',
  'owner',
  'UNABLE',
  ['screenshot-manifest.json'],
  'Owner visual approval PENDING; screenshot SHA256 manifest is inventory only, not visual PASS',
));
rows.push(row(
  'steady-median-p90-evidence',
  'performance-evidence-completeness',
  (
    runtimeEvidence?.provenance?.runtimeSourceMatchesHead
    && runtimeEvidence?.timing?.temporal_T2_taau_4x4?.available
    && (runtimeEvidence?.timing?.temporal_T2_taau_4x4?.cloudCurrentMs?.count ?? 0) >= 30
  ) ? 'PASS' : 'UNABLE',
  ['runtime-evidence.json'],
  'Evidence completeness only (≠ performance Gate PASS)',
  { timing: runtimeEvidence?.timing ?? null, provenance: runtimeEvidence?.provenance ?? null },
));
rows.push(row(
  'steady-median-p90-performance-gate',
  'performance-gate',
  'UNABLE',
  ['runtime-evidence.json'],
  'Data available ≠ performance Gate pass: no frozen Gate threshold / owner judgment',
));
rows.push(row(
  'local-screenshots-not-repo-evidence',
  'artifact-policy',
  'OBSERVATION',
  ['../.gitignore', 'screenshot-manifest.json'],
  'docs/evidence/.gitignore ignores screenshots/; local PNGs are not check-in evidence. Manifest records name/size/sha256 for local files.',
));

const passCount = rows.filter((r) => r.status === 'PASS').length;
const failCount = rows.filter((r) => r.status === 'FAIL').length;
const unableCount = rows.filter((r) => r.status === 'UNABLE').length;
const observationCount = rows.filter((r) => r.status === 'OBSERVATION').length;

const screenshotNames = existsSync(SHOTS)
  ? readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort()
  : [];
const screenshotManifest = {
  generatedAt: new Date().toISOString(),
  gitignore: 'docs/evidence/.gitignore → screenshots/',
  policy: 'Local PNGs are not repository-committable evidence. SHA256 inventory only; not visual PASS.',
  count: screenshotNames.length,
  files: screenshotNames.map((name) => {
    const abs = path.join(SHOTS, name);
    const st = statSync(abs);
    return { name, bytes: st.size, sha256: sha256File(abs) };
  }),
};
writeFileSync(path.join(OUT, 'screenshot-manifest.json'), JSON.stringify(screenshotManifest, null, 2));
writeFileSync(path.join(OUT, 'screenshot-list.json'), JSON.stringify(screenshotNames, null, 2));

const diagFiles = existsSync(DIAG)
  ? readdirSync(DIAG).filter((f) => f.endsWith('.json')).sort()
  : [];
const diskInventory = {
  generatedAt: new Date().toISOString(),
  role: 'disk-inventory-only',
  policy: 'Produced by build-visual-review.mjs from on-disk diagnostics/screenshots. Not the capture provenance index.',
  resultCount: diagFiles.length,
  results: diagFiles.map((file) => {
    const stem = file.replace(/\.json$/, '');
    return {
      stem,
      cleanPath: shot(`${stem}__clean.png`) || shot(`${stem}.png`),
      hudPath: shot(`${stem}__hud.png`),
      diagPath: `diagnostics/${file}`,
    };
  }),
};
writeFileSync(path.join(OUT, 'capture-disk-inventory.json'), JSON.stringify(diskInventory, null, 2));

const review = {
  gate: 'W11 independent visual QA',
  rebuiltAt: new Date().toISOString(),
  gateVerdict: failCount > 0 ? 'FAIL' : 'REVIEW/PENDING',
  formalContinue: false,
  screenshotPolicy: screenshotManifest.policy,
  screenshotManifest: {
    path: 'screenshot-manifest.json',
    count: screenshotManifest.count,
  },
  caseSelection: selected,
  captureIndexSummary: captureIndex ? {
    path: 'capture-index.json',
    role: captureIndex.role,
    resultCount: captureIndex.resultCount,
  } : null,
  captureDiskInventorySummary: {
    path: 'capture-disk-inventory.json',
    role: diskInventory.role,
    resultCount: diskInventory.resultCount,
  },
  pixelDiffSummary: pixelDiff
    ? {
      status: 'OBSERVATION',
      note: 'PNG maxAbs recorded; referenceThreshold not normative; visual equivalence remains UNABLE/owner PENDING',
      algorithm: pixelDiff.algorithm,
      referenceThreshold: pixelDiff.referenceThreshold,
      results: pixelDiff.results,
      evidence: 'pixel-diff.json',
    }
    : { status: 'UNABLE', note: 'pixel-diff.json missing' },
  runtimeEvidenceSummary: runtimeEvidence
    ? {
      path: 'runtime-evidence.json',
      revision: runtimeEvidence.revision,
      provenance: runtimeEvidence.provenance,
      warmupFrames: runtimeEvidence.warmupFrames,
      sampleCount: runtimeEvidence.sampleCount,
      meta: runtimeEvidence.meta,
      checks: Object.fromEntries(
        Object.entries(runtimeEvidence.checks || {}).map(([k, v]) => [k, v.status]),
      ),
      timingKeys: Object.keys(runtimeEvidence.timing || {}),
      note: 'Data available ≠ performance Gate pass',
    }
    : null,
  autoContracts: testResults,
  counts: {
    PASS: passCount,
    FAIL: failCount,
    UNABLE: unableCount,
    OBSERVATION: observationCount,
    total: rows.length,
  },
  passCount,
  failCount,
  unableCount,
  observationCount,
  visualGate: 'UNABLE',
  performanceGate: 'UNABLE',
  rows,
};

writeFileSync(path.join(OUT, 'visual-review.json'), JSON.stringify(review, null, 2));

console.log(JSON.stringify({
  passCount,
  failCount,
  unableCount,
  observationCount,
  totalRows: rows.length,
  screenshots: screenshotNames.length,
  visualGate: review.visualGate,
  performanceGate: review.performanceGate,
  gateVerdict: review.gateVerdict,
  autoContracts: testResults,
}, null, 2));
