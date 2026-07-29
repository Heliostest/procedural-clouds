import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const GATE_PATH = path.join(OUT, 'gate-w12.md');
const TASK9_START = '<!-- W12-TASK9-START -->';
const TASK9_END = '<!-- W12-TASK9-END -->';
const load = (name) => { const file = path.join(OUT, name); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; };
function preservedTask9Block() {
  if (!existsSync(GATE_PATH)) return `${TASK9_START}\n${TASK9_END}`;
  const existing = readFileSync(GATE_PATH, 'utf8');
  const starts = [...existing.matchAll(/<!-- W12-TASK9-START -->/g)].map((match) => match.index);
  const ends = [...existing.matchAll(/<!-- W12-TASK9-END -->/g)].map((match) => match.index);
  if (starts.length > 1 || ends.length > 1 || starts.length !== ends.length) throw new Error(`invalid Task9 marker count: start=${starts.length} end=${ends.length}`);
  if (!starts.length) return `${TASK9_START}\n${TASK9_END}`;
  if (starts[0] >= ends[0]) throw new Error('invalid Task9 marker order');
  return existing.slice(starts[0], ends[0] + TASK9_END.length);
}
const capture = load('capture-index.json');
const runtime = load('runtime-evidence.json');
const zeroTolerance = ['support-leak', 'negative-density', 'nan', 'brick-seam', 'lod-phase-jump', 'camera-lock', 'genus-hard-cut', 'thin-layer-break'];
const required = ['raw-density', 'normal', 'edge-only', 'detail-frequency', 'wind-motion', 'taau-convergence', 'debug-18', 'debug-19'];
const hasDebug = (n) => Boolean(capture?.results?.find((item) => item.matrix === `debug-${n}`));
const requiredCapture = (id) => capture?.results?.filter((item) => item.requiredEvidence === id) ?? [];
const status = (id) => ({ id, status: 'UNABLE', reason: 'capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required' });
const zeroRows = zeroTolerance.map(status);
const requiredRows = required.map((id) => {
  if (id === 'debug-18' || id === 'debug-19') return { id, status: hasDebug(Number(id.slice(-2))) ? 'OBSERVATION' : 'UNABLE', reason: hasDebug(Number(id.slice(-2))) ? 'screenshot captured; not an automated visual pass' : 'debug screenshot missing' };
  const captures = requiredCapture(id);
  if (captures.length) return { id, status: 'OBSERVATION', reason: `${captures.length} screenshot capture(s) present; owner visual verdict required`, evidence: captures.map((item) => item.screenshot) };
  const unavailable = id === 'edge-only' ? capture?.requiredEvidenceAvailability?.edgeOnly : id === 'wind-motion' ? capture?.requiredEvidenceAvailability?.windMotion : null;
  return unavailable ? { id, status: 'UNABLE', reason: unavailable.reason } : status(id);
});
const fallback = runtime?.fallbackSlots ?? { detailStrengthZeroAt120x512: { status: 'UNABLE', reason: 'runtime evidence missing' }, atlasUnavailable: { status: 'UNABLE', reason: 'runtime evidence missing' }, legacyCoarseFallback: { status: 'UNABLE', reason: 'runtime evidence missing' } };
const failures = [...zeroRows, ...requiredRows].filter((row) => row.status === 'FAIL');
const runtimeIntegrity = runtime?.integrity ?? { status: 'FAIL', issues: ['runtime evidence missing integrity result'] };
const ownerVisualVerdict = 'PENDING';
const decision = failures.length ? 'STOP' : 'REVIEW';
const gate = { schemaVersion: 1, generatedAt: new Date().toISOString(), decision, formalContinue: false, ownerVisualVerdict, runtimeSourceMatchesHead: capture?.runtimeSourceMatchesHead ?? runtime?.runtimeSourceMatchesHead ?? false, capture: capture ? { captures: capture.results?.length ?? 0, errors: capture.errors ?? [], console: capture.console ?? [], environment: capture.environment ?? {} } : { status: 'UNAVAILABLE', reason: 'capture-index.json missing' }, runtime: runtime ? { path: 'runtime-evidence.json', pairs: runtime.pairs?.length ?? 0, bsm: runtime.bsm, integrity: runtimeIntegrity } : { status: 'UNAVAILABLE', integrity: runtimeIntegrity }, fallback, cbKnownLinearRemapDeviation: { status: 'OBSERVATION', text: 'Cb smoothstep-to-linear remap deviation is recorded only; W16 calibration is out of scope.' }, farFlicker64km: { status: 'UNABLE', reason: 'screenshots/counters captured; visual far-flicker verdict requires owner review' }, zeroTolerance: zeroRows, requiredEvidence: requiredRows, owner: { verdict: ownerVisualVerdict, note: 'Owner visual verdict cannot be replaced by automation.' } };
writeFileSync(path.join(OUT, 'gate-report.json'), `${JSON.stringify(gate, null, 2)}\n`);
const table = (rows) => rows.map((row) => `| ${row.id} | ${row.status} | ${row.reason} |`).join('\n');
const task9Block = preservedTask9Block();
const report = `# W12 Gate Report\n\n- Decision: **${gate.decision}**\n- Formal Continue: **NO**\n- runtimeSourceMatchesHead: **${gate.runtimeSourceMatchesHead}**\n- BSM: **not-applicable**\n- Owner visual verdict: **PENDING**\n\n## Capture\n\n- Captures: ${gate.capture.captures ?? 'unavailable'}\n- Capture errors: ${(gate.capture.errors ?? []).length}\n- Fixed post: Bloom/exposure/tonemap fixed by capture script.\n- Matrix: global-only W9 Stop, hierarchical, equal-overlap, 64 km/far-flicker, Cu/Sc/Ac, Cc, W9 thin-ridge, Cb known linear-remap deviation.\n\n## Cost\n\n- currentMs uses TAAU current only for active \`taau-4x4\`; otherwise cloud current.\n- Main and local-light double difference use on/off × skipLight=false/true.\n- Ground shadow: unavailable unless a fresh \`shadowRan=true\` sample with updated \`shadowSampleId\` is exposed; current controller does not expose it.\n- Full-res/TAAU current, primary iterations, cap hits, and maximum step are in \`runtime-evidence.json\`.\n\n## Fallback\n\n| Slot | Status | Reason |\n| --- | --- | --- |\n| detailStrength=0 @ 120/512 | ${fallback.detailStrengthZeroAt120x512.status} | ${fallback.detailStrengthZeroAt120x512.reason ?? fallback.detailStrengthZeroAt120x512.evidence} |\n| atlas unavailable | ${fallback.atlasUnavailable.status} | ${fallback.atlasUnavailable.reason} |\n| Legacy coarse fallback | ${fallback.legacyCoarseFallback.status} | ${fallback.legacyCoarseFallback.reason} |\n\n## Zero tolerance\n\n| Item | Status | Reason |\n| --- | --- | --- |\n${table(zeroRows)}\n\n## Required evidence\n\n| Item | Status | Reason |\n| --- | --- | --- |\n${table(requiredRows)}\n\n## Owner decision\n\n- Date: pending\n- Disposition: pending Continue / Review / Stop\n- Note: automated evidence does not substitute for owner visual verdict.\n\n${task9Block}\n`;
writeFileSync(GATE_PATH, report);
console.log(JSON.stringify({ decision, zeroFailures: failures.length, ownerVisualVerdict }, null, 2));
