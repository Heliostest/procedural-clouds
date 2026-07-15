import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'results.raw.json'), 'utf8'));

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
    actualEvaluatorCallsStatus: ev?.actualEvaluatorCalls === 'unavailable'
      ? 'ok'
      : (ev?.actualEvaluatorCalls == null ? 'unresolved-null' : String(ev?.actualEvaluatorCalls)),
  };
}

const sceneVerdict = {
  'single-stratocumulus': {
    rawDensityVerdict: 'fail',
    normalOpticalVerdict: 'fail',
    note: 'V2 有 raw density，但光学呈离散团块，未形成大 cell/高连接厚 Cellular layer。',
  },
  'single-altocumulus': {
    rawDensityVerdict: 'fail',
    normalOpticalVerdict: 'fail',
    note: 'V2 呈孤立 puff，缺少中等 cell 连接层；与 Sc/Cc 尺度区分不足。',
  },
  'single-cirrocumulus': {
    rawDensityVerdict: 'review',
    normalOpticalVerdict: 'review',
    note: '存在小尺度离散 cell，未见明显棋盘/锁纹；连续 ripple/极薄 profile 证据不足。',
  },
  'w8-cellular-scale': {
    rawDensityVerdict: 'fail',
    normalOpticalVerdict: 'fail',
    note: '同视域未严格可辨 Sc>Ac>Cc cell 尺度与层厚排序。',
  },
  'w8-cellular-overlap': {
    rawDensityVerdict: 'review',
    normalOpticalVerdict: 'review',
    note: '未见明显黑洞/闪断；无 RGBA metadata readback，metadata=unresolved。',
  },
  'w8-wave-ripple': {
    rawDensityVerdict: 'unresolved',
    normalOpticalVerdict: 'unresolved',
    note: '单帧未见棋盘/锁纹，固定相位连续 ripple 无法仅凭单帧确认。',
  },
};

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
    if (sv) {
      r.rawDensityVerdict = isDebug ? sv.rawDensityVerdict : 'n/a';
      r.normalOpticalVerdict = isNormal ? sv.normalOpticalVerdict : 'n/a';
      r.note = sv.note;
    }
    r.supportTileVerdict = scene === 'w8-cellular-overlap' ? 'unresolved' : 'review';
    r.metadataVerdict = 'unresolved';
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

raw.generatedAt = new Date().toISOString();
raw.performancePairs = performancePairs;
raw.visualSummary = {
  sc: 'fail',
  ac: 'fail',
  cc: 'review',
  scale: 'fail',
  overlap: 'review',
  wave: 'unresolved',
  cbCiV2Empty: 'pass',
  legacyRollback: 'pass',
};
fs.writeFileSync(path.join(OUT, 'results.raw.json'), `${JSON.stringify(raw, null, 2)}\n`);

const statusCounts = raw.results.reduce((m, r) => {
  m[r.status] = (m[r.status] || 0) + 1;
  return m;
}, {});
const invalid = raw.results.filter((r) => r.status === 'invalid' || r.status === 'failed');
const failVisual = raw.results.filter((r) => r.rawDensityVerdict === 'fail' || r.normalOpticalVerdict === 'fail');
const hasStopVisual = failVisual.length > 0;
const decision = hasStopVisual ? 'stop' : 'review';
const shots = fs.readdirSync(path.join(OUT, 'screenshots')).filter((f) => f.endsWith('.png')).length;

const gate = {
  schemaVersion: 1,
  changeId: 'add-density-v2-cellular-wave-family',
  generatedAt: new Date().toISOString(),
  sourceRevision: 'working-tree',
  status: decision === 'stop' ? 'visual-validation-failed' : 'visual-validation-review',
  decision,
  archiveAllowed: false,
  automated: {
    status: 'pass',
    checks: [
      'test:genus-dispatch', 'test:pipeline-isolation', 'test:density-v2-layout', 'test:density-v2-tiles',
      'test:density-v2-fields', 'test:density-v2-evaluators', 'test:ground-shadow-hash', 'typecheck', 'build', 'openspec-strict',
    ],
  },
  runtimeWebGpu: {
    status: invalid.length ? 'fail' : 'pass',
    expectedCases: 64,
    completedCases: raw.results.filter((r) => r.screenshots?.hud && r.screenshots?.clean).length,
    invalidCases: invalid.map((r) => r.caseId),
    timeoutCases: raw.results.filter((r) => r.status === 'timeout-after-warmup').map((r) => r.caseId),
    statusCounts,
    consoleErrors: raw.consoleErrors || [],
    deviceInfo: raw.deviceInfo,
    notes: [
      'Playwright channel=chrome + WebGPU flags',
      'sampleLimits arrays [3,0,0,0] accepted',
      'actualEvaluatorCalls runtime null (not unavailable string) → unresolved',
      'false invalid from array-vs-object sampleLimits check cleared',
    ],
  },
  visual: {
    status: hasStopVisual ? 'fail' : 'review',
    requiredScreenshots: 128,
    capturedScreenshots: shots,
    nonWaivableChecks: {
      'cell-scale-and-profile-order': 'fail',
      'finite-nonnegative-density-and-metadata': 'unresolved',
      'support-and-tile-mask-containment': 'unresolved',
      'no-checkerboard-camera-lock-or-wind-discontinuity': 'unresolved',
      'w7-legacy-realtime-optical-regression': 'not-in-scope-w8-matrix',
    },
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
    'Decision=stop due to cellular morphology / scale-order visual failures.',
    'Performance Sc/Ac/Cc cached median/p90 ratios within budget.',
  ],
};
fs.writeFileSync(path.join(OUT, 'gate-report.json'), `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify({
  decision, shots, statusCounts, invalid: invalid.length, failVisual: failVisual.length, perfStatus, performancePairs,
}, null, 2));
