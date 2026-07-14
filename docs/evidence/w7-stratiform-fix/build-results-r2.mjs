import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'r2');
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'results.raw.json'), 'utf8'));

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
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 多团块起伏' },
    'recipe-v2': { raw: 'pass', normal: 'pass', support: 'pass', notes: 'debug 非矩形+孔隙灰阶；normal 不规则含中央低值，非实心白板' },
  },
  cirrostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 薄层参照可见' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'pass', notes: 'debug 仍近满屏高亮雾面、横向灰阶弱；normal 暗灰丘，非明确高空薄幕。raw 非空，不归咎 absorption' },
  },
  altostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 团块+地面阴影' },
    'recipe-v2': { raw: 'pass', normal: 'pass', support: 'pass', notes: '相对 r1 明显改善：debug 有峰谷灰阶；normal 呈磨砂团块并有自阴影/地面阴影，非直边白板' },
  },
  nimbostratus: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy 起伏团块' },
    'recipe-v2': { raw: 'pass', normal: 'pass', support: 'pass', notes: '相对 r1 明显改善：debug 斑驳起伏；normal 厚重不规则且有低值穿透，非纯色平顶板' },
  },
  stack: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy debug 多层团块可辨' },
    'recipe-v2': { raw: 'fail', normal: 'fail', support: 'fail', notes: 'V2 normal 呈单一丘状体，四属高度/厚度仍不可分；support/metadata 可辨性不足' },
  },
  overlap: {
    legacy: { raw: 'pass', normal: 'pass', support: 'pass', notes: 'legacy overlap 参照' },
    'recipe-v2': { raw: 'borderline-pass', normal: 'fail', support: 'fail', notes: '表面有起伏纹理，但仍呈几何板角；属间主次光学不可辨' },
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
  round: 'r2',
  generatedAt: new Date().toISOString(),
  captureGeneratedAt: raw.generatedAt,
  baseUrl: raw.baseUrl,
  comparedTo: '../report.md (r1)',
  environment: {
    os: 'Windows 10',
    browser: 'Google Chrome (Playwright channel=chrome)',
    webgpuAdapter: raw.deviceInfo?.adapter || null,
    timestampQueryFeature: Array.isArray(raw.deviceInfo?.features) && raw.deviceInfo.features.includes('timestamp-query'),
  },
  automatedChecksNote: '本轮未重跑全套自动检查；沿用仓库已提交实现。截图矩阵与形态判定为新证据。',
  caseCount: results.length,
  screenshotCount: 96,
  gate: {
    automatedChecks: 'not-re-run',
    visualOverall: 'partial-fail',
    timingOverall: 'unresolved',
    recommendation: 'Stop/Review',
    rationale: [
      '相对 r1：As/Ns recipe-v2 由实心板改善为有灰阶/团块结构，可判 pass。',
      'St 继续 pass；Cs 仍 fail（近满屏雾面 + normal 非薄幕）。',
      'stack/overlap 仍无法稳定分辨四属层次/主次 → fail。',
      '全部 cached--normal timing 仍 unresolved（early exit，cacheSamples≪30）。',
    ],
  },
  results,
};

fs.writeFileSync(path.join(dir, 'results.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log('wrote r2/results.json', results.length);
