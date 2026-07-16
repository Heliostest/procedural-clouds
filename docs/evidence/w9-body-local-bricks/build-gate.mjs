import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const RAW_PATH = path.join(OUT, 'results.raw.json');
const REVIEW_PATH = path.join(OUT, 'visual-review.json');
const EXPECTED_CASES = 108;
const SCENES = [
  'single-stratocumulus', 'single-altocumulus', 'single-cirrocumulus',
  'w8-cellular-scale', 'w8-cellular-overlap', 'w8-wave-ripple',
  'w9-brick-lod-sweep', 'w9-brick-overflow', 'w9-thin-ridge-proxy',
];
const VISUAL_FIELDS = ['hierarchicalVsGlobal', 'normal', 'densityDebug', 'seamAndPhase', 'metadataAndSupport'];

if (!existsSync(RAW_PATH)) throw new Error('Missing results.raw.json; run capture-w9.mjs first');
const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8'));
const review = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, 'utf8')) : null;
const reviewCurrent = review?.evidenceGeneratedAt === raw.generatedAt;

function caseId(scene, producer, storage, quality = 'cached', view = 'normal') {
  return `w9--${scene}--${producer}--${storage}--${quality}--${view}`;
}

function result(id) {
  return raw.results.find((item) => item.caseId === id);
}

function screenshotExists(relative) {
  return typeof relative === 'string' && existsSync(path.join(OUT, relative));
}

function statusFrom(items) {
  if (items.some((item) => item.status === 'fail')) return 'fail';
  if (items.some((item) => item.status !== 'pass')) return 'review';
  return 'pass';
}

const runtimeIssues = [];
const ids = new Set();
for (const item of raw.results || []) {
  if (ids.has(item.caseId)) runtimeIssues.push(`duplicate:${item.caseId}`);
  ids.add(item.caseId);
  if (item.status !== 'complete' && item.status !== 'ready-for-screenshot') {
    runtimeIssues.push(`${item.caseId}:status=${item.status}`);
  }
  if (!screenshotExists(item.screenshots?.hud) || !screenshotExists(item.screenshots?.clean)) {
    runtimeIssues.push(`${item.caseId}:screenshots-missing`);
  }
}
if ((raw.results || []).length !== EXPECTED_CASES) runtimeIssues.push(`case-count=${raw.results?.length || 0}/${EXPECTED_CASES}`);
for (const error of raw.consoleErrors || []) if (!error.benign) runtimeIssues.push(`console:${error.text}@${error.url}`);
for (const error of raw.pageErrors || []) runtimeIssues.push(`page:${error}`);
if (!raw.sourceEvidence?.revision || !raw.sourceEvidence?.diffSha256
  || typeof raw.sourceEvidence?.dirty !== 'boolean') runtimeIssues.push('source-evidence-incomplete');
const runtimeStatus = runtimeIssues.length === 0 ? 'pass' : 'fail';

const protocolChecks = [];
for (const item of raw.results || []) {
  const diagnostics = item.producerDiagnostics;
  const legacy = item.caseId.includes('--legacy--');
  const hierarchical = item.caseId.includes('--recipe-v2--hierarchical--');
  const globalOnly = item.caseId.includes('--recipe-v2--global-only--');
  const notes = [];
  if (legacy) {
    if (diagnostics?.requested !== 'legacy' || diagnostics?.active !== 'legacy') notes.push('legacy producer mismatch');
    if (diagnostics?.storageActive !== 'global-only') notes.push('legacy storage is not global-only');
  }
  if (globalOnly) {
    if (diagnostics?.requested !== 'recipe-v2' || diagnostics?.active !== 'recipe-v2') notes.push('Recipe V2 producer mismatch');
    if (diagnostics?.storageRequested !== 'global-only' || diagnostics?.storageActive !== 'global-only') notes.push('global-only storage mismatch');
    const bricks = diagnostics?.bricks;
    if (!bricks || bricks.lifecycle !== 'idle' || bricks.profile !== ''
      || bricks.dimensions?.some((value) => value !== 0)
      || bricks.residentBytes !== 0 || bricks.rebuildPeakBytes !== 0
      || bricks.recordBytes !== 0 || bricks.candidateBytes !== 0
      || bricks.residentBodyCount !== 0 || bricks.nonresidentBodyCount !== 0
      || bricks.dispatchCount !== 0 || bricks.voxelCount !== 0 || bricks.candidate !== null) {
      notes.push('global-only retained current brick resources or work');
    }
  }
  if (hierarchical) {
    const bricks = diagnostics?.bricks;
    if (diagnostics?.storageRequested !== 'hierarchical' || diagnostics?.storageActive !== 'hierarchical'
      || diagnostics?.storageLifecycle !== 'ready') notes.push('hierarchical storage is not ready/active');
    if (!bricks || bricks.residentBytes > 16 * 1024 * 1024 || bricks.rebuildPeakBytes > 32 * 1024 * 1024
      || bricks.recordBytes !== 1_920 || bricks.candidate?.bytes !== 27_648
      || bricks.residentBodyCount < 1 || bricks.dispatchCount !== bricks.residentBodyCount
      || bricks.sampleId < 1) notes.push('brick budget/ABI/residency/update contract failed');
    if (item.caseId.includes('--w9-brick-overflow--') && (bricks?.candidate?.overflowTiles || 0) < 1) {
      notes.push('five-body overflow scene did not produce overflow tiles');
    }
  }
  protocolChecks.push({ caseId: item.caseId, status: notes.length ? 'fail' : 'pass', notes });
}
const protocolStatus = protocolChecks.length === EXPECTED_CASES ? statusFrom(protocolChecks) : 'fail';

const visualChecks = SCENES.map((scene) => {
  const sceneReview = reviewCurrent ? review?.scenes?.[scene] : null;
  if (!sceneReview) return { scene, status: 'review', notes: ['visual review missing or stale'] };
  const failed = VISUAL_FIELDS.filter((field) => sceneReview[field] === 'fail');
  const unresolved = VISUAL_FIELDS.filter((field) => sceneReview[field] !== 'pass' && sceneReview[field] !== 'fail');
  return {
    scene,
    status: failed.length ? 'fail' : unresolved.length ? 'review' : 'pass',
    notes: [...failed.map((field) => `${field}=fail`), ...unresolved.map((field) => `${field}=unresolved`)],
  };
});
const visualStatus = statusFrom(visualChecks);

function validStats(candidate, pass) {
  const stats = candidate?.gpuTiming?.[pass];
  return stats && stats.count >= 60 ? stats : null;
}

const performanceChecks = SCENES.map((scene) => {
  const global = result(caseId(scene, 'recipe-v2', 'global-only'));
  const hierarchical = result(caseId(scene, 'recipe-v2', 'hierarchical'));
  const gCloud = validStats(global, 'cloud');
  const hCloud = validStats(hierarchical, 'cloud');
  const gShadow = validStats(global, 'shadow');
  const hShadow = validStats(hierarchical, 'shadow');
  const gCache = validStats(global, 'combinedCache');
  const hCache = validStats(hierarchical, 'combinedCache');
  if (!gCloud || !hCloud || !gShadow || !hShadow || !gCache || !hCache) {
    return { scene, status: 'review', reason: 'one or more GPU timestamp ranges have fewer than 60 valid samples' };
  }
  const cloudMedianRatio = hCloud.median / gCloud.median;
  const cloudP90Ratio = hCloud.p90 / gCloud.p90;
  const shadowMedianRatio = hShadow.median / gShadow.median;
  const shadowP90Ratio = hShadow.p90 / gShadow.p90;
  const cacheMedianLimit = Math.max(gCache.median * 1.75, gCache.median + 0.50);
  const cacheP90Limit = Math.max(gCache.p90 * 2.00, gCache.p90 + 0.75);
  const pass = cloudMedianRatio <= 1.25 && cloudP90Ratio <= 1.35
    && shadowMedianRatio <= 1.35 && shadowP90Ratio <= 1.50
    && hCache.median <= cacheMedianLimit && hCache.p90 <= cacheP90Limit;
  return {
    scene,
    status: pass ? 'pass' : 'fail',
    cloudMedianRatio, cloudP90Ratio, shadowMedianRatio, shadowP90Ratio,
    combinedCache: {
      globalMedian: gCache.median, hierarchicalMedian: hCache.median, medianLimit: cacheMedianLimit,
      globalP90: gCache.p90, hierarchicalP90: hCache.p90, p90Limit: cacheP90Limit,
    },
  };
});
const performanceStatus = statusFrom(performanceChecks);
const ownerApproval = reviewCurrent ? review?.ownerApproval || 'pending' : 'pending';
const hardFailure = [runtimeStatus, protocolStatus, visualStatus, performanceStatus].includes('fail')
  || ownerApproval === 'rejected';
const technicalReady = [runtimeStatus, protocolStatus, visualStatus, performanceStatus].every((status) => status === 'pass');
const decision = hardFailure ? 'stop' : technicalReady && ownerApproval === 'approved' ? 'continue' : 'review';

const gate = {
  schemaVersion: 1,
  changeId: 'add-hierarchical-body-local-density-bricks',
  generatedAt: new Date().toISOString(),
  evidenceGeneratedAt: raw.generatedAt,
  sourceEvidence: raw.sourceEvidence,
  decision,
  archiveAllowed: decision === 'continue',
  runtime: { status: runtimeStatus, expectedCases: EXPECTED_CASES, completedCases: raw.results?.length || 0, issues: runtimeIssues },
  protocol: { status: protocolStatus, failedCases: protocolChecks.filter((item) => item.status === 'fail') },
  visual: { status: visualStatus, reviewCurrent, checks: visualChecks },
  performance: { status: performanceStatus, checks: performanceChecks },
  ownerApproval,
  automatedChecks: [
    'test:genus-dispatch', 'test:pipeline-isolation', 'test:density-v2-layout', 'test:density-v2-tiles',
    'test:density-v2-fields', 'test:density-v2-evaluators', 'test:w9-bricks', 'test:ground-shadow-hash',
    'typecheck', 'build', 'openspec-strict-w8', 'openspec-strict-w9',
  ],
};
writeFileSync(path.join(OUT, 'gate-report.json'), `${JSON.stringify(gate, null, 2)}\n`);

const report = `# W9 Body-local Bricks Gate Report

- Evidence: ${raw.generatedAt}
- Revision: ${raw.sourceEvidence?.revision || 'missing'}${raw.sourceEvidence?.dirty ? ' (dirty)' : ''}
- Decision: **${decision.toUpperCase()}**
- Runtime: ${runtimeStatus}; protocol: ${protocolStatus}; visual: ${visualStatus}; performance: ${performanceStatus}; owner: ${ownerApproval}

## Visual review

${visualChecks.map((item) => `- ${item.scene}: ${item.status}${item.notes.length ? ` — ${item.notes.join('; ')}` : ''}`).join('\n')}

## Performance

${performanceChecks.map((item) => `- ${item.scene}: ${item.status}${item.reason ? ` — ${item.reason}` : ''}`).join('\n')}

## Remaining blockers

${decision === 'continue' ? '- None. All technical checks passed and owner approval is recorded.' : [
  runtimeStatus !== 'pass' ? '- Runtime evidence is incomplete or invalid.' : '',
  protocolStatus !== 'pass' ? '- One or more W9 resource/fallback protocol checks failed.' : '',
  visualStatus !== 'pass' ? '- Visual review is missing, stale, unresolved, or failed.' : '',
  performanceStatus !== 'pass' ? '- GPU timestamp evidence is insufficient or exceeds thresholds.' : '',
  ownerApproval !== 'approved' ? '- Project owner approval is not recorded.' : '',
].filter(Boolean).join('\n')}
`;
writeFileSync(path.join(OUT, 'report.md'), report);
console.log(`W9 Gate decision: ${decision}`);
