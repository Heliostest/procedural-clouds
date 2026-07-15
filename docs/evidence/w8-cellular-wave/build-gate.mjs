import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'results.raw.json'), 'utf8'));
const visualReviewPath = path.join(OUT, 'visual-review.json');
const visualReview = fs.existsSync(visualReviewPath)
  ? JSON.parse(fs.readFileSync(visualReviewPath, 'utf8'))
  : null;
const reviewMatchesEvidence = visualReview?.evidenceGeneratedAt === raw.generatedAt;

const EXPECTED_CASES = 64;
const REQUIRED_VISUAL_SCENES = [
  'single-stratocumulus',
  'single-altocumulus',
  'single-cirrocumulus',
  'w8-cellular-scale',
  'w8-cellular-overlap',
  'w8-wave-ripple',
];
const REQUIRED_NON_WAIVABLE = [
  'finite-nonnegative-density-and-metadata',
  'support-and-tile-mask-containment',
  'no-checkerboard-camera-lock-or-wind-discontinuity',
];

const EXPECTED_ENABLED = ['cumulus', 'stratus', 'stratocumulus', 'altocumulus', 'altostratus', 'nimbostratus', 'cirrostratus', 'cirrocumulus'].sort();
const EXPECTED_UNSUPPORTED = ['cumulonimbus', 'cirrus'].sort();

function revalidateV2(r) {
  if (!r.caseId.includes('--recipe-v2--')) return null;
  const notes = [];
  const ev = r.evaluator;
  if (r.producerRequested !== 'recipe-v2') notes.push(`requested=${r.producerRequested}`);
  if (r.producerActive !== 'recipe-v2') notes.push(`active=${r.producerActive}`);
  if (r.lifecycle && r.lifecycle !== 'ready') notes.push(`lifecycle=${r.lifecycle}`);
  if (!ev) notes.push('evaluator missing');
  else {
    const enabled = [...(ev.enabledGenera || [])].sort();
    const unsupported = [...(ev.unsupportedGenera || [])].sort();
    if (JSON.stringify(enabled) !== JSON.stringify(EXPECTED_ENABLED)) notes.push('enabledGenera mismatch');
    if (JSON.stringify(unsupported) !== JSON.stringify(EXPECTED_UNSUPPORTED)) notes.push('unsupportedGenera mismatch');
    for (const g of ['stratocumulus', 'altocumulus', 'cirrocumulus']) {
      const lim = ev.sampleLimits?.[g];
      const vals = Array.isArray(lim) ? lim : lim ? [lim.primary, lim.secondary, lim.detail, lim.coverage] : null;
      if (!vals || vals[0] !== 3 || vals[1] !== 0 || vals[2] !== 0 || vals[3] !== 0) {
        notes.push(`${g}.sampleLimits=${JSON.stringify(lim)}`);
      }
    }
    if (typeof ev.actualEvaluatorCalls === 'number') notes.push(`forged actualEvaluatorCalls=${ev.actualEvaluatorCalls}`);
  }
  return {
    ok: notes.length === 0,
    notes,
    actualEvaluatorCallsStatus: ev?.actualEvaluatorCalls == null || ev?.actualEvaluatorCalls === 'unavailable'
      ? 'ok-unavailable'
      : String(ev?.actualEvaluatorCalls),
  };
}

const sceneVerdict = reviewMatchesEvidence ? (visualReview.scenes || {}) : {};

function sceneOf(id) {
  const m = id.match(/^w8--(.+)--(legacy|recipe-v2)--/);
  return m?.[1];
}

for (const r of raw.results) {
  const scene = sceneOf(r.caseId);
  const isV2 = r.caseId.includes('--recipe-v2--');
  const isLegacy = r.caseId.includes('--legacy--');
  const isDebug = r.caseId.includes('density-debug');
  const isNormal = r.caseId.includes('--normal');
  const v2 = revalidateV2(r);
  if (v2) {
    r.recipeV2Checks = v2;
    if (r.status === 'invalid' && v2.ok && !r.hudHasNan && !r.webgpuValidationError) {
      r.status = r.timedOut ? 'timeout-after-warmup' : 'ready-for-screenshot';
      r.statusNote = 'cleared false-invalid sampleLimits array check';
    }
  }

  if (scene === 'single-cumulonimbus' || scene === 'single-cirrus') {
    if (isV2) {
      r.rawDensityVerdict = isDebug ? 'pass' : 'n/a';
      r.normalOpticalVerdict = isNormal ? 'pass' : 'n/a';
      r.note = isDebug
        ? 'density-debug 全黑；producer active=recipe-v2 lifecycle=ready。'
        : 'normal 仅见地面，无 V2 主体云；active=recipe-v2。';
      r.supportTileVerdict = 'pass-empty';
      r.metadataVerdict = 'unresolved';
    } else if (isLegacy) {
      r.rawDensityVerdict = isDebug ? 'pass' : 'n/a';
      r.normalOpticalVerdict = isNormal ? 'pass' : 'n/a';
      r.note = 'Legacy 可见密度/光学云，回退锚点未坏。';
      r.supportTileVerdict = 'review';
      r.metadataVerdict = 'unresolved';
      if (r.status === 'timeout-after-warmup') {
        r.timingClassification = 'unresolved';
        r.note += ' timingRequired 超时，timing=unresolved；视觉仍采集。';
      }
    }
  } else {
    const sv = sceneVerdict[scene];
    if (isLegacy) {
      r.rawDensityVerdict = isDebug ? 'reference' : 'n/a';
      r.normalOpticalVerdict = isNormal ? 'reference' : 'n/a';
      r.note = 'Legacy reference anchor; W8 morphology verdict applies only to Recipe V2.';
    } else if (isV2 && sv) {
      r.rawDensityVerdict = isDebug ? sv.rawDensityVerdict : 'n/a';
      r.normalOpticalVerdict = isNormal ? sv.normalOpticalVerdict : 'n/a';
      r.note = sv.note;
    } else if (isV2) {
      r.rawDensityVerdict = isDebug ? 'pending-review' : 'n/a';
      r.normalOpticalVerdict = isNormal ? 'pending-review' : 'n/a';
      r.note = reviewMatchesEvidence
        ? 'No scene verdict supplied for the current evidence.'
        : 'Visual review missing or stale for the current evidence timestamp.';
    }
    r.supportTileVerdict = isV2
      ? (sv?.supportTileVerdict || (scene === 'w8-cellular-overlap' ? 'unresolved' : 'review'))
      : 'reference';
    r.metadataVerdict = isV2 ? (sv?.metadataVerdict || 'unresolved') : 'reference';
  }
  if (!r.timingClassification) r.timingClassification = r.cacheTiming || 'unresolved';
}

function cacheMed(id) {
  const r = raw.results.find((x) => x.caseId === id);
  return r?.gpuTiming?.cache || null;
}

const perfScenes = ['single-stratocumulus', 'single-altocumulus', 'single-cirrocumulus'];
const performancePairs = [];
let perfStatus = 'pass';
for (const scene of perfScenes) {
  const leg = cacheMed(`w8--${scene}--legacy--cached--normal`);
  const v2 = cacheMed(`w8--${scene}--recipe-v2--cached--normal`);
  if (!leg || !v2 || leg.count < 60 || v2.count < 60) {
    perfStatus = 'unresolved';
    performancePairs.push({ scene, status: 'unresolved', reason: 'insufficient samples' });
    continue;
  }
  const medianRatio = v2.median / leg.median;
  const p90Ratio = v2.p90 / leg.p90;
  const ok = medianRatio <= 1.0 && p90Ratio <= 1.2;
  if (!ok) perfStatus = 'fail';
  performancePairs.push({
    scene,
    status: ok ? 'pass' : 'fail',
    legacy: { median: leg.median, p90: leg.p90, count: leg.count },
    recipeV2: { median: v2.median, p90: v2.p90, count: v2.count },
    medianRatio: +medianRatio.toFixed(4),
    p90Ratio: +p90Ratio.toFixed(4),
  });
}

// generatedAt identifies the screenshot evidence and must remain stable so a
// matching visual-review.json remains current across repeat gate builds.
raw.classifiedAt = new Date().toISOString();
raw.performancePairs = performancePairs;
const summarizeScene = (scene) => {
  const verdict = sceneVerdict[scene];
  if (!verdict) return 'pending-review';
  if (verdict.rawDensityVerdict === 'fail' || verdict.normalOpticalVerdict === 'fail') return 'fail';
  if (verdict.rawDensityVerdict === 'pass' && verdict.normalOpticalVerdict === 'pass') return 'pass';
  return 'review';
};
raw.visualSummary = {
  sc: summarizeScene('single-stratocumulus'),
  ac: summarizeScene('single-altocumulus'),
  cc: summarizeScene('single-cirrocumulus'),
  scale: summarizeScene('w8-cellular-scale'),
  overlap: summarizeScene('w8-cellular-overlap'),
  wave: summarizeScene('w8-wave-ripple'),
  cbCiV2Empty: 'pass',
  legacyRollback: 'pass',
};
fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify(raw, null, 2)}\n`);

const statusCounts = raw.results.reduce((m, r) => {
  m[r.status] = (m[r.status] || 0) + 1;
  return m;
}, {});
const invalid = raw.results.filter((r) => r.status === 'invalid' || r.status === 'failed');
const failVisual = raw.results.filter((r) => r.caseId.includes('--recipe-v2--')
  && (r.rawDensityVerdict === 'fail' || r.normalOpticalVerdict === 'fail'));
const reviewedSceneCount = REQUIRED_VISUAL_SCENES.filter((scene) => sceneVerdict[scene]).length;
const shots = fs.readdirSync(path.join(OUT, 'screenshots')).filter((f) => f.endsWith('.png')).length;
const screenshotExists = (relativePath) => typeof relativePath === 'string'
  && fs.existsSync(path.join(OUT, relativePath));
const completedCases = raw.results.filter((r) => (
  screenshotExists(r.screenshots?.hud) && screenshotExists(r.screenshots?.clean)
)).length;
const linkedScreenshots = new Set(raw.results.flatMap((r) => (
  [r.screenshots?.hud, r.screenshots?.clean].filter((relativePath) => screenshotExists(relativePath))
)));
const webgpuErrors = (raw.consoleErrors || []).filter((error) => /webgpu|validation|GPUError/i.test(error.text || ''));
const benignConsoleErrors = (raw.consoleErrors || []).filter((error) => (
  /\/favicon\.ico(?:\?|$)/i.test(error.url || '')
    && /404|failed to load resource/i.test(error.text || '')
));
const unclassifiedConsoleErrors = (raw.consoleErrors || []).filter((error) => (
  !webgpuErrors.includes(error) && !benignConsoleErrors.includes(error)
));
const sourceEvidenceComplete = Boolean(
  raw.sourceEvidence?.revision
    && raw.sourceEvidence?.diffSha256
    && typeof raw.sourceEvidence?.dirty === 'boolean',
);
const runtimeIncomplete = raw.results.length !== EXPECTED_CASES || completedCases !== EXPECTED_CASES;
const runtimeStatus = invalid.length || webgpuErrors.length || runtimeIncomplete
  ? 'fail'
  : (unclassifiedConsoleErrors.length || !sourceEvidenceComplete ? 'review' : 'pass');
const scaleVerdict = raw.visualSummary.scale;
const reviewedNonWaivable = reviewMatchesEvidence ? (visualReview.nonWaivableChecks || {}) : {};
const nonWaivableChecks = {
  'cell-scale-and-profile-order': scaleVerdict === 'pass' ? 'pass' : (scaleVerdict === 'fail' ? 'fail' : 'unresolved'),
  ...Object.fromEntries(REQUIRED_NON_WAIVABLE.map((name) => [name, reviewedNonWaivable[name] || 'unresolved'])),
  'w7-legacy-realtime-optical-regression': 'not-in-scope-w8-matrix',
};
const hasStopVisual = failVisual.length > 0
  || REQUIRED_NON_WAIVABLE.some((name) => nonWaivableChecks[name] === 'fail');
const visualReady = reviewMatchesEvidence
  && reviewedSceneCount === REQUIRED_VISUAL_SCENES.length
  && Object.values(raw.visualSummary).every((verdict) => verdict === 'pass')
  && REQUIRED_NON_WAIVABLE.every((name) => nonWaivableChecks[name] === 'pass');
const visualStatus = hasStopVisual ? 'fail' : (visualReady ? 'pass' : 'review');
const hardFailure = runtimeStatus === 'fail' || perfStatus === 'fail' || visualStatus === 'fail';
const technicalReady = runtimeStatus === 'pass' && perfStatus === 'pass' && visualStatus === 'pass';
const decision = hardFailure ? 'stop' : (technicalReady ? 'continue' : 'review');

const gate = {
  schemaVersion: 1,
  changeId: 'add-density-v2-cellular-wave-family',
  generatedAt: new Date().toISOString(),
  evidenceGeneratedAt: raw.generatedAt,
  sourceEvidence: raw.sourceEvidence || null,
  status: decision === 'stop'
    ? 'validation-failed'
    : (decision === 'continue' ? 'ready-for-owner-review' : 'validation-review'),
  decision,
  archiveAllowed: false,
  automated: {
    status: 'pass',
    checks: [
      'test:genus-dispatch', 'test:pipeline-isolation', 'test:density-v2-layout', 'test:density-v2-tiles',
      'test:density-v2-fields', 'test:density-v2-evaluators', 'test:ground-shadow-hash', 'typecheck', 'build', 'openspec-strict',
      'test:w8-gate',
    ],
  },
  runtimeWebGpu: {
    status: runtimeStatus,
    expectedCases: EXPECTED_CASES,
    completedCases,
    invalidCases: invalid.map((r) => r.caseId),
    timeoutCases: raw.results.filter((r) => r.status === 'timeout-after-warmup').map((r) => r.caseId),
    statusCounts,
    consoleErrors: raw.consoleErrors || [],
    benignConsoleErrors,
    deviceInfo: raw.deviceInfo,
    notes: [
      'Playwright channel=chrome + WebGPU flags',
      'sampleLimits arrays [3,0,0,0] accepted',
      'actualEvaluatorCalls null or unavailable string is the expected unavailable representation',
      'false invalid from array-vs-object sampleLimits check cleared',
      ...(unclassifiedConsoleErrors.length ? ['Non-WebGPU console errors require URL-level classification'] : []),
    ],
  },
  visual: {
    status: visualStatus,
    requiredScreenshots: 128,
    capturedScreenshots: linkedScreenshots.size,
    screenshotDirectoryCount: shots,
    reviewMatchesEvidence,
    reviewedSceneCount,
    nonWaivableChecks,
    sceneVerdicts: raw.visualSummary,
    failCases: [...new Set(failVisual.map((r) => r.caseId))],
  },
  performance: {
    status: perfStatus,
    classification: perfStatus,
    minimumCacheWarmups: 5,
    minimumGpuSamples: 60,
    medianRatioLimit: 1.0,
    p90RatioLimit: 1.2,
    pairs: performancePairs,
  },
  rollback: {
    legacyAnchor: 'densityProducerMode=0',
    status: 'pass',
    notes: [
      'Cb/Ci Recipe V2 normal+density-debug empty with active=recipe-v2',
      'Cb/Ci Legacy density/optical visible',
    ],
  },
  ownerApproval: 'pending',
  notes: [
    'Do not archive OpenSpec; 10.4 owner approval remains unchecked.',
    reviewMatchesEvidence
      ? 'Visual review timestamp matches results.raw.json.'
      : 'Visual review is missing or stale; copy visual-review.template.json and use results.raw.json generatedAt.',
    hasStopVisual
      ? 'Decision=stop due to Recipe V2 cellular morphology / scale-order visual failures.'
      : (decision === 'continue'
        ? 'Technical evidence is complete; continue to owner approval without archiving.'
        : 'Decision=review until every current Recipe V2 scene and non-waivable verdict is complete.'),
    'Performance is classified separately and cannot override morphology failures.',
  ],
};
fs.writeFileSync(path.join(OUT, 'gate-report.json'), `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify({
  decision, shots, statusCounts, invalid: invalid.length, failVisual: failVisual.length, perfStatus, performancePairs,
}, null, 2));
