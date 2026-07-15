import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const evidence = resolve(root, 'docs/evidence/w8-cellular-wave');
const builder = readFileSync(resolve(evidence, 'build-gate.mjs'), 'utf8');
const capture = readFileSync(resolve(evidence, 'capture-w8.mjs'), 'utf8');
const template = JSON.parse(readFileSync(resolve(evidence, 'visual-review.template.json'), 'utf8'));

for (const contract of [
  "r.caseId.includes('--recipe-v2--')",
  "r.rawDensityVerdict = isDebug ? 'reference' : 'n/a'",
  "ev?.actualEvaluatorCalls == null || ev?.actualEvaluatorCalls === 'unavailable'",
  'visualReview?.evidenceGeneratedAt === raw.generatedAt',
  'raw.classifiedAt = new Date().toISOString()',
  "const decision = hardFailure ? 'stop' : (technicalReady ? 'continue' : 'review')",
  'const benignConsoleErrors =',
  "'Performance is classified separately and cannot override morphology failures.'",
]) {
  if (!builder.includes(contract)) throw new Error(`W8 gate builder contract missing: ${contract}`);
}
if (builder.includes('raw.generatedAt = new Date().toISOString()')) {
  throw new Error('W8 gate builder must preserve the screenshot evidence timestamp');
}
for (const contract of [
  "process.env.W8_FORCE_CAPTURE === '1'",
  "const sourceHash = createHash('sha256').update(diff)",
  "diffSha256: sourceHash.digest('hex')",
  "['ls-files', '--others', '--exclude-standard', '-z'",
  "':(exclude)docs/evidence/w8-cellular-wave/screenshots/**'",
  'url: location.url || null',
]) {
  if (!capture.includes(contract)) throw new Error(`W8 capture provenance contract missing: ${contract}`);
}

const requiredScenes = [
  'single-stratocumulus',
  'single-altocumulus',
  'single-cirrocumulus',
  'w8-cellular-scale',
  'w8-cellular-overlap',
  'w8-wave-ripple',
];
if (template.schemaVersion !== 1 || template.evidenceGeneratedAt !== 'COPY_FROM_RESULTS_RAW_JSON') {
  throw new Error('W8 visual review template identity changed');
}
for (const scene of requiredScenes) {
  const verdict = template.scenes?.[scene];
  if (!verdict || verdict.rawDensityVerdict !== 'pending-review'
    || verdict.normalOpticalVerdict !== 'pending-review') {
    throw new Error(`W8 visual review template scene missing: ${scene}`);
  }
}
for (const check of [
  'finite-nonnegative-density-and-metadata',
  'support-and-tile-mask-containment',
  'no-checkerboard-camera-lock-or-wind-discontinuity',
]) {
  if (template.nonWaivableChecks?.[check] !== 'unresolved') {
    throw new Error(`W8 visual review non-waivable check missing: ${check}`);
  }
}

console.log('W8 capture provenance, producer-aware visual verdict, and review-template contracts passed');
