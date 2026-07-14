import fs from 'fs';

const dir = 'docs/evidence/w7-stratiform-fix';
const raw = JSON.parse(fs.readFileSync(`${dir}/results.raw.json`, 'utf8'));

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

const visual = {
  stratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 多团块起伏，非直边方板' },
    'recipe-v2': { raw: 'pass', normal: 'pass', support: 'pass', notes: 'density-debug 有孔隙/灰阶/非矩形；normal 不规则含中央低值区，已脱离修复前实心白板' },
  },
  cirrostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 参照：薄层可见' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'pass', notes: 'density-debug 近常数高亮平面，横向灰阶不足；normal 暗灰丘/极淡，非明确高空薄幕。raw 非空，不归咎 absorption' },
  },
  altostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 参照有团块结构' },
    'recipe-v2': { raw: 'borderline-pass', normal: 'fail', support: 'pass', notes: 'density-debug 有软边与局部低值但仍偏板状；normal 直边白方板。debug 有结构而 normal 白板 → Optical/曝光嫌疑，raw 结构仍偏弱' },
  },
  nimbostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 有起伏团块' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'pass', notes: 'density-debug 与 normal 均为近常数实心矩形甲板/平顶板' },
  },
  stack: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 多层可辨参照' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'fail', notes: '四属高度/厚度不可辨，呈单一实心白甲板；未见明确 tile 缺块/NaN，但形态门失败' },
  },
  overlap: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy overlap 参照' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'fail', notes: '合成后仍为直边近常数板；属间光学主次不可辨' },
  },
};

const results = raw.results.map((r) => {
  const scene = sceneOf(r.caseId);
  const producer = producerOf(r.caseId);
  const view = viewOf(r.caseId);
  const v = visual[scene][producer];
  const requested = r.producerRequested || (r.producerLine || '').match(/requested=([^\s]+)/)?.[1] || null;
  const active = r.producerActive || (r.producerLine || '').match(/active=([^\s]+)/)?.[1] || null;
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
    activeBodyCount: r.activeBodyCount,
    warnings: r.warnings || [],
    gpuTiming: r.gpuTiming,
    screenshots: r.screenshots,
    rawDensityVerdict: view === 'density-debug' ? v.raw : 'n/a',
    normalOpticalVerdict: view === 'normal' ? v.normal : 'n/a',
    supportTileMetadataVerdict: v.support,
    cacheTiming: r.cacheTiming,
    notes: v.notes,
  };
});

const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  captureGeneratedAt: raw.generatedAt,
  baseUrl: raw.baseUrl,
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
    typecheck: 'pass',
    build: 'pass',
    'openspec validate add-density-v2-stratiform-family --strict': 'pass',
  },
  caseCount: results.length,
  screenshotCount: 96,
  gate: {
    automatedChecks: 'pass',
    visualOverall: 'fail',
    timingOverall: 'unresolved',
    recommendation: 'Stop/Review',
    rationale: [
      'Stratus recipe-v2 形态相对修复前明显改善，density-debug/normal 可通过。',
      'Cirrostratus / Altostratus(normal) / Nimbostratus / stack / overlap 的 recipe-v2 仍呈近常数板或灰阶不足，未达 W7 形态门。',
      '所有 gate timing case（cached+normal）因 cache timestamp 样本不足标记 unresolved，不得记为 pass。',
    ],
  },
  results,
};

fs.writeFileSync(`${dir}/results.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote results.json', results.length);
