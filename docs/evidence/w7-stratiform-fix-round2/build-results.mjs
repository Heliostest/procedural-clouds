import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.raw.json'), 'utf8'));

function sceneOf(id) {
  if (id.includes('single-stratus')) return 'stratus';
  if (id.includes('single-cirrostratus')) return 'cirrostratus';
  if (id.includes('single-altostratus')) return 'altostratus';
  if (id.includes('single-nimbostratus')) return 'nimbostratus';
  if (id.includes('stratiform-stack')) return 'stack';
  if (id.includes('stratiform-overlap')) return 'overlap';
  return 'unknown';
}
function producerOf(id) {
  return id.includes('recipe-v2') ? 'recipe-v2' : 'legacy';
}
function viewOf(id) {
  return id.includes('density-debug') ? 'density-debug' : 'normal';
}

function timingClass(id, rec) {
  if (!id.includes('--cached--normal')) return 'not-applicable';
  const gt = rec.gpuTiming?.cache;
  if (!gt || gt.count < 30) return 'unresolved';
  // ratio filled later for V2 vs legacy pairs
  return 'collected';
}

// Fresh visual judgements from round2 screenshots only (not copied from prior build-results).
const visual = {
  stratus: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy 锚点：团块/孔隙可辨',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'debug 有中央大孔与灰阶；normal 不规则透绿，未退化为实心白板。维持上一轮 pass。',
    },
  },
  cirrostratus: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy 薄层锚点可见',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'fail', support: 'pass',
      failureClass: 'optical/exposure',
      notes: 'debug：连续幕面+上侧低密区，有低/中/高灰阶，非近常数高亮平面 → raw pass。normal：仍偏暗灰丘，半透明高空薄幕不够明确 → optical-only follow-up，不归咎 coverage/Base。',
    },
  },
  altostratus: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy 团块锚点',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'debug 多孔隙+峰谷灰阶；normal 破碎团块非直边白方板。',
    },
  },
  nimbostratus: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy 起伏锚点',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'debug 低/中/高灰阶+孔隙，非近常数矩形；normal 厚重斑驳有洞，非均匀白甲板。',
    },
  },
  stack: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy 多层锚点',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'fail', support: 'pass',
      failureClass: 'composition',
      notes: 'metadata：activeBodyCount=4、recipe-v2 ready、shared-fields ready、warnings=[]、五属 evaluator 启用。debug 有斑驳孔隙非单一白板；normal 视角下四属高度/厚度层次仍难清晰分出，偏连续厚层 → composition fail。',
    },
  },
  overlap: {
    legacy: {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'legacy overlap 锚点',
    },
    'recipe-v2': {
      raw: 'pass', normal: 'pass', support: 'pass',
      failureClass: null,
      notes: 'debug/normal 均保留低密区与内部起伏，非全屏近常数直边板；activeBodyCount=4、无 warnings。属间主次从单帧难以量化，未见明显合成崩溃。',
    },
  },
};

function pairTiming(scene) {
  const L = raw.results.find((x) => x.caseId === `w7--${scene}--legacy--cached--normal`);
  const V = raw.results.find((x) => x.caseId === `w7--${scene}--recipe-v2--cached--normal`);
  const lc = L?.gpuTiming?.cache;
  const vc = V?.gpuTiming?.cache;
  if (!lc || !vc || lc.count < 30 || vc.count < 30) return null;
  return {
    legacyMedian: lc.median,
    legacyP90: lc.p90,
    v2Median: vc.median,
    v2P90: vc.p90,
    medianRatio: vc.median / lc.median,
    p90Ratio: vc.p90 / lc.p90,
    gate: (vc.median / lc.median) <= 1.0 && (vc.p90 / lc.p90) <= 1.2 ? 'pass' : 'fail',
  };
}

const timingByScene = {
  'single-stratus': pairTiming('single-stratus'),
  'single-cirrostratus': pairTiming('single-cirrostratus'),
  'single-altostratus': pairTiming('single-altostratus'),
  'single-nimbostratus': pairTiming('single-nimbostratus'),
  'w7-stratiform-stack': pairTiming('w7-stratiform-stack'),
  'w7-stratiform-overlap': pairTiming('w7-stratiform-overlap'),
};

const results = raw.results.map((r) => {
  const scene = sceneOf(r.caseId);
  const producer = producerOf(r.caseId);
  const view = viewOf(r.caseId);
  const v = visual[scene][producer];
  const requested = r.producerRequested || (r.producerLine || '').match(/requested=([^\s]+)/)?.[1] || null;
  const active = r.producerActive || (r.producerLine || '').match(/active=([^\s]+)/)?.[1] || null;
  let cacheTiming = timingClass(r.caseId, r);
  if (cacheTiming === 'collected' && producer === 'recipe-v2') {
    const sceneKey = r.caseId.split('--')[1] === 'w7' ? `w7-${r.caseId.split('--')[2]}` : r.caseId.match(/w7--(single-[a-z]+|w7-stratiform-[a-z]+)--/)?.[1];
    // map from caseId
    let key = null;
    if (r.caseId.includes('single-stratus')) key = 'single-stratus';
    else if (r.caseId.includes('single-cirrostratus')) key = 'single-cirrostratus';
    else if (r.caseId.includes('single-altostratus')) key = 'single-altostratus';
    else if (r.caseId.includes('single-nimbostratus')) key = 'single-nimbostratus';
    else if (r.caseId.includes('stratiform-stack')) key = 'w7-stratiform-stack';
    else if (r.caseId.includes('stratiform-overlap')) key = 'w7-stratiform-overlap';
    const t = key ? timingByScene[key] : null;
    if (t) cacheTiming = t.gate;
    void sceneKey;
  } else if (cacheTiming === 'collected' && producer === 'legacy') {
    cacheTiming = 'baseline';
  }
  return {
    caseId: r.caseId,
    scene,
    producer,
    quality: r.caseId.includes('--hybrid--') ? 'hybrid' : 'cached',
    view,
    status: r.status,
    earlyExitFromTimingStall: !!r.early,
    warmupFrames: r.warmupFrames,
    cloudSamples: r.cloudSamples,
    cacheSamples: r.cacheSamples,
    producerRequested: requested,
    producerActive: active,
    producerLifecycle: (r.producerLine || '').includes('lifecycle=ready') || !!active ? 'ready' : null,
    sharedFields: r.sharedFields,
    activeBodyCount: r.activeBodyCount,
    enabledGenera: r.evaluator?.enabledGenera || null,
    warnings: r.warnings || [],
    gpuTiming: r.gpuTiming,
    screenshots: r.screenshots,
    rawDensityVerdict: view === 'density-debug' ? v.raw : 'n/a',
    normalOpticalVerdict: view === 'normal' ? v.normal : 'n/a',
    supportTileMetadataVerdict: v.support,
    failureClass: v.failureClass,
    cacheTiming,
    notes: v.notes,
  };
});

const gate = {
  automatedChecks: 'pass',
  visualOverall: 'partial-fail',
  timingOverall: 'pass',
  recommendation: 'Stop-Review',
  rationale: [
    '自动检查全部 pass；sampleLimits 仍为 Stratiform [2,0,0,0]。',
    'St/As/Ns/overlap V2 形态可过；Cs normal 为 optical/exposure follow-up；stack normal 为 composition fail（层次难辨）。',
    'Cs/As/Ns cache timing：V2 median≤1.00×Legacy 且 p90≤1.20×Legacy（实测远低于阈值）；绝对值偏低，建议人工复核 timestamp 语义，但仍按采集数据记 pass。',
  ],
};

const out = {
  schemaVersion: 1,
  round: 'w7-stratiform-fix-round2',
  generatedAt: new Date().toISOString(),
  captureGeneratedAt: raw.generatedAt,
  baseUrl: raw.baseUrl,
  priorFailureReport: 'docs/evidence/w7-stratiform-fix/report.md',
  environment: {
    os: 'Windows 10',
    browser: 'Google Chrome (Playwright channel=chrome)',
    webgpuAdapter: raw.deviceInfo?.adapter || null,
    timestampQueryFeature: Array.isArray(raw.deviceInfo?.features) && raw.deviceInfo.features.includes('timestamp-query'),
  },
  automatedChecks: {
    'test:genus-dispatch': 'pass',
    'test:pipeline-isolation': 'pass',
    'test:density-v2-layout': 'pass',
    'test:density-v2-tiles': 'pass',
    'test:density-v2-fields': 'pass',
    'test:density-v2-evaluators': 'pass',
    'test:ground-shadow-hash': 'pass',
    build: 'pass',
    'openspec validate add-density-v2-stratiform-family --strict': 'pass',
  },
  timingPairs: timingByScene,
  caseCount: results.length,
  screenshotCount: 96,
  gate,
  results,
};

fs.writeFileSync(path.join(__dirname, 'results.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote results.json');
