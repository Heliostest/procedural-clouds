import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(OUT, 'screenshots');
const DIAG = path.join(OUT, 'diagnostics');

function loadDiag(stem) {
  const p = path.join(DIAG, `${stem}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function shot(name) {
  const rel = `screenshots/${name}`;
  return existsSync(path.join(OUT, rel)) ? rel : null;
}

function readLogText(fileName) {
  const p = path.join(OUT, fileName);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return Buffer.from(buf).swap16().toString('utf16le');
  }
  if (buf.includes(0) && buf.length > 8) return buf.toString('utf16le');
  return buf.toString('utf8');
}

function readPreferredLog(...names) {
  for (const name of names) {
    const text = readLogText(name);
    if (text) return { name, text };
  }
  return null;
}

function row(id, category, status, evidence, reason, details = {}) {
  return { id, category, status, evidence, reason, ...details };
}

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

const caseSelection = [
  {
    sceneId: 'single-stratus',
    caseId: 'w6--single-stratus--recipe-v2--cached--normal',
    storage: null,
    note: 'no hierarchical/global-only storage field; recipe-v2 cached normal',
  },
  {
    sceneId: 'single-cirrostratus',
    caseId: 'w7--single-cirrostratus--recipe-v2--cached--normal',
    storage: null,
    note: 'no hierarchical/global-only storage field; recipe-v2 cached normal',
  },
  {
    sceneId: 'single-stratocumulus',
    caseId: 'w9--single-stratocumulus--recipe-v2--hierarchical--cached--normal',
    storage: 'hierarchical',
  },
  {
    sceneId: 'single-cirrocumulus',
    caseId: 'w9--single-cirrocumulus--recipe-v2--hierarchical--cached--normal',
    storage: 'hierarchical',
  },
];

const captureHistory = {
  firstCaptureLog: 'capture.log',
  firstCaptureResult: {
    captured: 40,
    errors: ['missing case for single-stratus', 'missing case for single-cirrostratus'],
    note: 'Initial selector required storage===hierarchical|global-only; W6/W7 cases have no storage field.',
  },
  recaptureLog: 'capture-stratus.log',
  recaptureResult: {
    captured: 8,
    errors: [],
    note: 'Modes A–D only for stratus/cirrostratus; no skip/motion/debug for those scenes in that run.',
  },
  scriptPolicy: {
    modesABCD: 'all selected scenes',
    skipAndMotion: 'all selected scenes',
    debugViews: 'only single-stratocumulus and single-cirrocumulus',
    captureIndex:
      'Owned by capture-w10-visual.mjs: each run writes capture-runs/<iso>.json then merges by stem into capture-index.json (never wipe). build-visual-review writes capture-disk-inventory.json only and MUST NOT overwrite capture-index.json.',
  },
  full4CaptureLog: 'capture-full4.log',
  note: 'Local PNGs are gitignored (docs/evidence/.gitignore screenshots/). Inventory is screenshot-manifest.json (name/size/sha256). Hash ≠ visual PASS.',
};

function loadJson(name) {
  const p = path.join(OUT, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const pixelDiffAb = loadJson('pixel-diff-ab.json');
const runtimeEvidence = loadJson('runtime-evidence.json');

const rows = [];

function expectMode(short, mode, checks) {
  const stem = `${short}__mode-${mode}`;
  const diag = loadDiag(stem);
  const clean = shot(`${stem}__clean.png`);
  const hud = shot(`${stem}__hud.png`);
  const evidence = [clean, hud, diag ? `diagnostics/${stem}.json` : null].filter(Boolean);
  if (!diag || !clean) {
    rows.push(row(`${stem}__capture`, 'capture', 'UNABLE', evidence, 'Missing diagnostics or clean screenshot'));
    return null;
  }
  const cf = diag.diagnostics.cloudFrame;
  const rm = diag.diagnostics.raymarch;
  rows.push(row(
    `${stem}__gpu-validation`,
    'gpu-validation',
    (cf.gpuValidationErrors?.length ?? 1) === 0 ? 'PASS' : 'FAIL',
    evidence,
    (cf.gpuValidationErrors?.length ?? 1) === 0
      ? 'gpuValidationErrors empty'
      : `gpuValidationErrors=${JSON.stringify(cf.gpuValidationErrors)}`,
  ));
  for (const check of checks) {
    const ok = check.test({ cf, rm, diag });
    rows.push(row(
      `${stem}__${check.id}`,
      check.category,
      ok ? 'PASS' : 'FAIL',
      evidence,
      ok ? check.passReason : check.failReason({ cf, rm }),
      { observed: check.observe?.({ cf, rm }) },
    ));
  }
  return { cf, rm, evidence };
}

const scenes = [
  { short: 'stratus' },
  { short: 'cirrostratus' },
  { short: 'stratocumulus' },
  { short: 'cirrocumulus' },
];

for (const { short } of scenes) {
  expectMode(short, 'A', [
    {
      id: 'path',
      category: 'w10a-path',
      test: ({ cf }) => cf.cloudFrameActivePath === 'combined-feature-off',
      passReason: 'activePath=combined-feature-off',
      failReason: ({ cf }) => `activePath=${cf.cloudFrameActivePath}`,
      observe: ({ cf }) => ({ activePath: cf.cloudFrameActivePath }),
    },
    {
      id: 'fixed-step',
      category: 'w10b-baseline',
      test: ({ rm }) => rm.worldStepActive === false && rm.raymarchPrimaryIterationsPerPixel === 64,
      passReason: 'worldStep off; primary iterations=64',
      failReason: ({ rm }) => `world=${rm.worldStepActive} iter=${rm.raymarchPrimaryIterationsPerPixel}`,
      observe: ({ rm }) => ({
        worldStepActive: rm.worldStepActive,
        iter: rm.raymarchPrimaryIterationsPerPixel,
      }),
    },
  ]);

  expectMode(short, 'B', [
    {
      id: 'path',
      category: 'w10a-path',
      test: ({ cf }) => cf.cloudFrameActivePath === 'cloud-frame',
      passReason: 'activePath=cloud-frame',
      failReason: ({ cf }) => `activePath=${cf.cloudFrameActivePath}`,
      observe: ({ cf }) => ({ activePath: cf.cloudFrameActivePath }),
    },
    {
      id: 'fixed-step',
      category: 'w10b-baseline',
      test: ({ rm }) => rm.worldStepActive === false && rm.raymarchPrimaryIterationsPerPixel === 64,
      passReason: 'worldStep off; primary iterations=64',
      failReason: ({ rm }) => `world=${rm.worldStepActive} iter=${rm.raymarchPrimaryIterationsPerPixel}`,
      observe: ({ rm }) => ({
        worldStepActive: rm.worldStepActive,
        iter: rm.raymarchPrimaryIterationsPerPixel,
      }),
    },
  ]);

  const aClean = shot(`${short}__mode-A__clean.png`);
  const bClean = shot(`${short}__mode-B__clean.png`);
  const diff = pixelDiffAb?.results?.[short];
  const changedRatio = diff?.totalChannels
    ? diff.changedChannels / diff.totalChannels
    : null;
  rows.push(row(
    `${short}__A-vs-B-visual-equivalence`,
    'w10a-visual-equivalence',
    'UNABLE',
    [aClean, bClean, 'pixel-diff-ab.json'].filter(Boolean),
    diff
      ? `Owner visual PENDING. PNG maxAbs/changedChannels recorded as OBSERVATION only (threshold=${diff.threshold} has no Gate norm). maxAbs=${diff.maxAbs}; changed=${diff.changedChannels}/${diff.totalChannels} ratio=${changedRatio}`
      : 'No PNG diff result; owner visual PENDING',
    {
      policy: 'Pixel-diff ≠ visual equivalence PASS; threshold not normative',
      maxAbs: diff?.maxAbs,
      changedChannels: diff?.changedChannels,
      totalChannels: diff?.totalChannels,
      changedRatio,
      threshold: diff?.threshold,
      shaA: diff?.shaA,
      shaB: diff?.shaB,
    },
  ));
  if (diff && Number.isFinite(diff.maxAbs)) {
    rows.push(row(
      `${short}__A-vs-B-png-diff-observation`,
      'w10a-pixel-diff-observation',
      'OBSERVATION',
      [aClean, bClean, 'pixel-diff-ab.json'].filter(Boolean),
      `Reproducible zlib PNG maxAbs=${diff.maxAbs}; changedChannels=${diff.changedChannels}/${diff.totalChannels}; informal threshold=${diff.threshold} (not Gate PASS)`,
      { maxAbs: diff.maxAbs, changedRatio, algorithm: diff.algorithm || pixelDiffAb.algorithm },
    ));
  }

  expectMode(short, 'C', [
    {
      id: 'world-step',
      category: 'w10b-world-step',
      test: ({ rm }) => rm.worldStepActive === true && rm.raymarchAverageStepMeters > 0,
      passReason: 'worldStep active with positive average step meters',
      failReason: ({ rm }) => `world=${rm.worldStepActive} avgStep=${rm.raymarchAverageStepMeters}`,
      observe: ({ rm }) => ({
        worldStepActive: rm.worldStepActive,
        iter: rm.raymarchPrimaryIterationsPerPixel,
        avgStep: rm.raymarchAverageStepMeters,
        maxStep: rm.raymarchMaxStepMeters,
      }),
    },
    {
      id: 'support-skip-flag',
      category: 'w10b-skip',
      test: ({ rm }) => rm.worldStepSupportSkipping === true,
      passReason: 'support skipping requested/active',
      failReason: ({ rm }) => `supportSkipping=${rm.worldStepSupportSkipping}`,
      observe: ({ rm }) => ({
        support: rm.worldStepSupportSkipping,
        candidate: rm.worldStepCandidateSkipping,
      }),
    },
    {
      id: 'ign-halton',
      category: 'w10b-stbn',
      test: ({ rm }) => rm.stochasticSamplingActive === 'ign-halton',
      passReason: 'mode C keeps deterministic IGN/Halton',
      failReason: ({ rm }) => `stochastic=${rm.stochasticSamplingActive}`,
      observe: ({ rm }) => ({ stochastic: rm.stochasticSamplingActive }),
    },
  ]);

  expectMode(short, 'D', [
    {
      id: 'stbn',
      category: 'w10b-stbn',
      test: ({ rm }) => rm.stochasticSamplingActive === 'stbn' && rm.stbnFrozenSlice === 7,
      passReason: 'STBN active with frozen slice 7',
      failReason: ({ rm }) => `stochastic=${rm.stochasticSamplingActive} frozen=${rm.stbnFrozenSlice}`,
      observe: ({ rm }) => ({
        stochastic: rm.stochasticSamplingActive,
        frozen: rm.stbnFrozenSlice,
      }),
    },
    {
      id: 'world-step',
      category: 'w10b-world-step',
      test: ({ rm }) => rm.worldStepActive === true,
      passReason: 'worldStep remains active under STBN',
      failReason: ({ rm }) => `world=${rm.worldStepActive}`,
      observe: ({ rm }) => ({ worldStepActive: rm.worldStepActive }),
    },
  ]);
}

for (const short of ['stratocumulus', 'cirrocumulus', 'stratus', 'cirrostratus']) {
  for (const label of ['skip-support-off', 'skip-candidate-off', 'world-step-off']) {
    const stem = `${short}__${label}`;
    const diag = loadDiag(stem);
    const clean = shot(`${stem}__clean.png`);
    const evidence = [clean, diag ? `diagnostics/${stem}.json` : null].filter(Boolean);
    if (!diag || !clean) {
      rows.push(row(
        stem,
        'artifact-completeness',
        'UNABLE',
        evidence,
        'Toggle capture missing on disk',
      ));
      continue;
    }
    const rm = diag.diagnostics.raymarch;
    let ok = false;
    let reason = '';
    if (label === 'skip-support-off') {
      ok = rm.worldStepSupportSkipping === false && rm.worldStepActive === true;
      reason = ok
        ? `diagnostic flags consistent: support off; iter=${rm.raymarchPrimaryIterationsPerPixel}`
        : `support=${rm.worldStepSupportSkipping} world=${rm.worldStepActive}`;
    } else if (label === 'skip-candidate-off') {
      ok = rm.worldStepCandidateSkipping === false && rm.worldStepActive === true;
      reason = ok
        ? `diagnostic flags consistent: candidate off; iter=${rm.raymarchPrimaryIterationsPerPixel}`
        : `candidate=${rm.worldStepCandidateSkipping} world=${rm.worldStepActive}`;
    } else {
      ok = rm.worldStepActive === false && rm.raymarchPrimaryIterationsPerPixel === 64;
      reason = ok
        ? 'diagnostic flags consistent: world-step off → fixed 64 iterations'
        : `world=${rm.worldStepActive} iter=${rm.raymarchPrimaryIterationsPerPixel}`;
    }
    rows.push(row(stem, 'w10b-toggle-diagnostics', ok ? 'PASS' : 'FAIL', evidence, reason, {
      observe: {
        support: rm.worldStepSupportSkipping,
        candidate: rm.worldStepCandidateSkipping,
        world: rm.worldStepActive,
        iter: rm.raymarchPrimaryIterationsPerPixel,
      },
    }));
  }
}

for (const short of ['stratocumulus', 'cirrocumulus']) {
  const debugPaths = [11, 12, 13, 14, 15]
    .map((v) => shot(`${short}__debug-${v}__clean.png`))
    .filter(Boolean);
  const debugOk = debugPaths.length === 5;
  rows.push(row(
    `${short}__debug-suite-files`,
    'artifact-completeness',
    debugOk ? 'PASS' : 'UNABLE',
    debugPaths,
    debugOk
      ? 'Evidence files complete: debug views 11–15 clean PNGs present (not a visual PASS)'
      : 'Incomplete debug file suite',
  ));
}

for (const short of ['stratocumulus', 'cirrocumulus', 'stratus', 'cirrostratus']) {
  const motionPaths = Array.from({ length: 8 }, (_, i) => (
    shot(`${short}__motion-D__f${String(i).padStart(2, '0')}.png`)
  ));
  const motionOk = motionPaths.every(Boolean);
  rows.push(row(
    `${short}__motion-suite-files`,
    'artifact-completeness',
    motionOk ? 'PASS' : 'UNABLE',
    motionPaths.filter(Boolean),
    motionOk
      ? 'Evidence files complete: 8 motion-D frames present (not a visual PASS; screen-lock judgment PENDING)'
      : 'Incomplete motion file suite',
  ));
}

const scC = loadDiag('stratocumulus__mode-C');
const scA = loadDiag('stratocumulus__mode-A');
if (scC && scA) {
  rows.push(row(
    'stratocumulus__iter-sample',
    'w10b-performance-observation',
    'OBSERVATION',
    ['diagnostics/stratocumulus__mode-A.json', 'diagnostics/stratocumulus__mode-C.json'],
    `Single-shot sample only (not performance Gate): iter ${scA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel}→${scC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel}; cloudMs ${scA.diagnostics.cloudFrame.cloudCurrentMs}→${scC.diagnostics.cloudFrame.cloudCurrentMs}`,
    {
      iterA: scA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
      iterC: scC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
      cloudMsA: scA.diagnostics.cloudFrame.cloudCurrentMs,
      cloudMsC: scC.diagnostics.cloudFrame.cloudCurrentMs,
    },
  ));
}

const ccC = loadDiag('cirrocumulus__mode-C');
const ccA = loadDiag('cirrocumulus__mode-A');
if (ccC && ccA) {
  rows.push(row(
    'cirrocumulus__cloud-ms-sample',
    'w10b-performance-observation',
    'OBSERVATION',
    ['diagnostics/cirrocumulus__mode-A.json', 'diagnostics/cirrocumulus__mode-C.json'],
    `Single-shot cost sample (not a win, not Gate PASS): cloudMs ${ccA.diagnostics.cloudFrame.cloudCurrentMs}→${ccC.diagnostics.cloudFrame.cloudCurrentMs}; iter ${ccA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel}→${ccC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel}`,
    {
      iterA: ccA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
      iterC: ccC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
      cloudMsA: ccA.diagnostics.cloudFrame.cloudCurrentMs,
      cloudMsC: ccC.diagnostics.cloudFrame.cloudCurrentMs,
    },
  ));
}

const w10aLog = readPreferredLog('test-w10a-cloud-frame-rerun.log', 'test-w10a-cloud-frame.log');
const w10bContractLog = readPreferredLog('test-w10b-raymarch-rerun.log', 'test-w10b-raymarch.log');
const w10bWorldLog = readPreferredLog('test-w10b-world-raymarch-rerun.log', 'test-w10b-world-raymarch.log');
const w10aPass = Boolean(w10aLog?.text.includes(
  'W10A cloud-frame MRT resources, cloud-only temporal resolve, composite ordering, timings, and emergency fallback contracts passed',
));
const w10bContractPass = Boolean(w10bContractLog?.text.includes('W10B raymarch contracts passed:'));
const w10bWorldPass = Boolean(w10bWorldLog?.text.includes(
  'W10B conservative Body Support and anisotropic world-step fixtures passed',
));

rows.push(row(
  'w10a-contract-depth-velocity-semantics',
  'roadmap-hard-auto-contract',
  w10aPass ? 'PASS' : 'UNABLE',
  [w10aLog?.name, 'scripts/check-w10a-cloud-frame-output.mjs'].filter(Boolean),
  w10aPass
    ? 'Auto contract PASS: check-w10a asserts depth/velocity validity encoding, invalid clear, and TAA motion.w gate (static/source). Not runtime camera/wind visual proof.'
    : 'W10A contract success text missing',
));
rows.push(row(
  'w10a-contract-history-vs-gizmo-order',
  'roadmap-hard-auto-contract',
  w10aPass ? 'PASS' : 'UNABLE',
  [w10aLog?.name, 'scripts/check-w10a-cloud-frame-output.mjs'].filter(Boolean),
  w10aPass
    ? 'Auto contract PASS: check-w10a asserts cloud-only TAA bindings + composite before bounds/gizmo draw order. Not a rendered-frame visual proof that history is uncontaminated.'
    : 'W10A contract success text missing',
));
rows.push(row(
  'w10a-runtime-depth-velocity-static-pan-orbit-wind-empty',
  'roadmap-hard-visual',
  'UNABLE',
  ['runtime-evidence.json'],
  runtimeEvidence?.checks?.depthVelocityCameraMotionApi?.reason
    || 'No HEAD-safe depth/velocity pixel proof for static/pan/orbit/wind/empty-sky',
  {
    depth: runtimeEvidence?.checks?.depthVelocityCameraMotionApi ?? null,
    provenance: runtimeEvidence?.provenance ?? null,
  },
));
{
  const empty = runtimeEvidence?.checks?.emptySkyLookApi;
  if (empty) {
    rows.push(row(
      'w10a-empty-sky-weak-api-observation',
      'w10a-weak-api-observation',
      'OBSERVATION',
      ['runtime-evidence.json'],
      empty.reason || 'Weak empty-sky API observation',
      { empty },
    ));
  }
  const wind = runtimeEvidence?.checks?.windOrTimeContentRevisionApi;
  if (wind) {
    rows.push(row(
      'w10a-wind-time-weak-api-observation',
      'w10a-weak-api-observation',
      'OBSERVATION',
      ['runtime-evidence.json'],
      wind.reason || 'Weak wind/time contentRevision observation',
      { wind },
    ));
  }
}
{
  const hist = runtimeEvidence?.checks?.historyPathOwnershipApi;
  rows.push(row(
    'w10a-runtime-history-sky-ground-gizmo-contamination',
    'roadmap-hard-visual',
    'UNABLE',
    ['runtime-evidence.json'],
    hist?.reason
      || 'No owner/runtime visual proof that sky/ground/gizmo do not contaminate cloud history',
    { hist },
  ));
}

rows.push(row(
  'w10b-contract-support-fixtures',
  'roadmap-hard-auto-contract',
  w10bWorldPass ? 'PASS' : 'UNABLE',
  [w10bWorldLog?.name, 'scripts/check-w10b-world-raymarch.mjs'].filter(Boolean),
  w10bWorldPass
    ? 'Auto contract PASS: Support AABB/rotation/wind/merge/overflow anisotropic fixtures'
    : 'W10B world-raymarch success text missing',
));
rows.push(row(
  'w10b-contract-candidate-hard-reject-proof',
  'roadmap-hard-auto-contract',
  w10bContractPass ? 'PASS' : 'UNABLE',
  [w10bContractLog?.name, 'scripts/check-w10b-raymarch-contracts.mjs'].filter(Boolean),
  w10bContractPass
    ? 'Auto contract PASS: hierarchical candidate hard-reject requires complete/non-overflow/generation-matched/count-zero; excludes coarse density as emptiness proof'
    : 'W10B raymarch contracts success text missing',
));
rows.push(row(
  'w10b-contract-thin-interval-refinement',
  'roadmap-hard-auto-contract',
  w10bContractPass ? 'PASS' : 'UNABLE',
  [w10bContractLog?.name, 'scripts/check-w10b-raymarch-contracts.mjs'].filter(Boolean),
  w10bContractPass
    ? 'Auto contract PASS: first-hit refinement numeric fixtures keep known thin-interval hit at min-step spacing'
    : 'W10B raymarch contracts success text missing',
));
{
  const hard = runtimeEvidence?.checks?.hardRejectRuntimeSupportToggle;
  rows.push(row(
    'w10b-runtime-hard-reject-false-negative-zero',
    'roadmap-hard-visual',
    hard?.status === 'FAIL' ? 'FAIL' : 'UNABLE',
    ['runtime-evidence.json'],
    hard?.status === 'PASS'
      ? `Support-skip conservatism API PASS (${hard.reason}); not a runtime false-negative=0 pixel suite`
      : (hard?.reason || 'No runtime false-negative=0 suite beyond static Support/candidate contracts'),
    { hard },
  ));
}
{
  const thinCap = runtimeEvidence?.checks?.thinRidgeHierarchicalCapture;
  const thinVis = runtimeEvidence?.checks?.thinRidgeHierarchicalVisual;
  rows.push(row(
    'w10b-thin-ridge-hierarchical-visual',
    'roadmap-hard-visual',
    thinVis?.status === 'PASS' ? 'PASS' : thinVis?.status === 'FAIL' ? 'FAIL' : 'UNABLE',
    ['runtime-evidence.json', ...(thinCap?.shots || [])],
    thinVis?.reason
      || thinCap?.reason
      || 'No w9-thin-ridge-proxy hierarchical world-step vs fixed-step visual capture in this evidence set',
    { thinCap, thinVis },
  ));
}
{
  const coarse = runtimeEvidence?.checks?.coarseHintIndependentToggle;
  rows.push(row(
    'w10b-coarse-hint-independent-toggle',
    'roadmap-hard-feature',
    coarse?.status === 'PASS' ? 'PASS' : coarse?.status === 'FAIL' ? 'FAIL' : 'UNABLE',
    ['runtime-evidence.json', 'diagnostics/'],
    coarse?.reason
      || 'No independent coarse-hint on/off capture or dedicated contract row',
    { coarse },
  ));
}

{
  const tA = runtimeEvidence?.timing?.w10a_modeB_cloudFrame_fixed;
  const tAAvail = Boolean(
    runtimeEvidence?.provenance?.runtimeSourceMatchesHead
    && tA?.available
    && tA?.cloudCurrentMs?.count >= 30,
  );
  rows.push(row(
    'w10a-steady-median-p90-evidence',
    'performance-evidence-completeness',
    tAAvail ? 'PASS' : 'UNABLE',
    ['runtime-evidence.json'],
    tAAvail
      ? `Evidence completeness only (≠ performance Gate PASS). warmup=${runtimeEvidence.warmupFrames}; samples=${tA.cloudCurrentMs.count}; cloudCurrent median/p90=${tA.cloudCurrentMs.median}/${tA.cloudCurrentMs.p90}ms; temporal=${tA.temporalResolveMs.median}/${tA.temporalResolveMs.p90}; composite=${tA.compositeMs.median}/${tA.compositeMs.p90}; head=${runtimeEvidence.provenance.headCommit}; runtimeSourceMatchesHead=${runtimeEvidence.provenance.runtimeSourceMatchesHead}`
      : 'Steady-state median/p90 missing, timing unavailable, or runtimeSourceMatchesHead=false',
    { timing: tA, provenance: runtimeEvidence?.provenance, meta: runtimeEvidence?.meta },
  ));
  rows.push(row(
    'w10a-steady-median-p90',
    'performance-gate',
    'UNABLE',
    ['runtime-evidence.json'],
    'Data available ≠ performance Gate pass: no frozen Gate threshold / owner judgment',
    { timing: tA, policy: 'performanceGate remains UNABLE' },
  ));
}
{
  const tC = runtimeEvidence?.timing?.w10b_modeC_world_ign;
  const tD = runtimeEvidence?.timing?.w10b_modeD_world_stbn;
  const tBAvail = Boolean(
    runtimeEvidence?.provenance?.runtimeSourceMatchesHead
    && tC?.available
    && tD?.available
    && tC?.cloudCurrentMs?.count >= 30,
  );
  rows.push(row(
    'w10b-steady-median-p90-evidence',
    'performance-evidence-completeness',
    tBAvail ? 'PASS' : 'UNABLE',
    ['runtime-evidence.json'],
    tBAvail
      ? `Evidence completeness only (≠ performance Gate PASS). modeC cloud median/p90=${tC.cloudCurrentMs.median}/${tC.cloudCurrentMs.p90}ms; modeD=${tD.cloudCurrentMs.median}/${tD.cloudCurrentMs.p90}ms; samples=${tC.cloudCurrentMs.count}`
      : 'W10B steady-state median/p90 missing or runtimeSourceMatchesHead=false',
    { modeC: tC, modeD: tD, provenance: runtimeEvidence?.provenance },
  ));
  rows.push(row(
    'w10b-steady-median-p90',
    'performance-gate',
    'UNABLE',
    ['runtime-evidence.json'],
    'Data available ≠ performance Gate pass: no frozen Gate threshold / owner judgment',
    { modeC: tC, modeD: tD, policy: 'performanceGate remains UNABLE' },
  ));
}
rows.push(row(
  'owner-visual-signoff',
  'owner',
  'UNABLE',
  ['screenshot-manifest.json'],
  'Owner visual approval PENDING; screenshot SHA256 manifest is inventory only, not visual PASS',
));
{
  const resize = runtimeEvidence?.checks?.resizeDiscontinuityApi;
  const featureOff = runtimeEvidence?.checks?.featureOffFallbackApi;
  const deviceLoss = runtimeEvidence?.checks?.deviceLossApi;
  const pipeline = runtimeEvidence?.checks?.pipelineFailureEmergencyApi;
  const suiteStatus = featureOff?.status === 'FAIL' ? 'FAIL' : 'UNABLE';
  rows.push(row(
    'discontinuity-resize-device-loss-suite',
    'w10a-resilience',
    suiteStatus,
    ['runtime-evidence.json'],
    `resize=${resize?.status || 'UNABLE'}; featureOff=${featureOff?.status || 'UNABLE'}; deviceLoss=${deviceLoss?.status || 'UNABLE'}; pipelineFailure=${pipeline?.status || 'UNABLE'}. Suite cannot PASS without resize/camera-cut/device-loss/pipeline evidence on HEAD APIs.`,
    { resize, featureOff, deviceLoss, pipeline },
  ));
  if (featureOff) {
    rows.push(row(
      'w10a-feature-off-fallback-api',
      'w10a-fallback-api',
      featureOff.status === 'PASS' || featureOff.status === 'FAIL' ? featureOff.status : 'UNABLE',
      ['runtime-evidence.json'],
      featureOff.reason,
      { featureOff },
    ));
  }
}
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

function stemFromResult(item) {
  return item?.stem
    ?? item?.diagPath?.replace(/^diagnostics\//, '').replace(/\.json$/, '')
    ?? item?.cleanPath?.replace(/^screenshots\//, '').replace(/\.png$/, '')
    ?? null;
}

function buildDiskInventory() {
  const diagFiles = existsSync(DIAG)
    ? readdirSync(DIAG).filter((f) => f.endsWith('.json')).sort()
    : [];
  const byStem = {};
  for (const file of diagFiles) {
    const stem = file.replace(/\.json$/, '');
    const j = JSON.parse(readFileSync(path.join(DIAG, file), 'utf8'));
    byStem[stem] = {
      stem,
      sceneId: j.sceneId ?? null,
      caseId: j.caseId ?? null,
      mode: j.mode ?? null,
      label: j.label ?? stem,
      cleanPath: shot(`${stem}__clean.png`),
      hudPath: shot(`${stem}__hud.png`),
      diagPath: `diagnostics/${file}`,
      source: 'disk-inventory-diagnostics',
    };
  }
  for (const name of screenshotNames) {
    const m = name.match(/^(.*)__motion-D__f\d+\.png$/);
    if (!m) continue;
    const key = name.replace(/\.png$/, '');
    if (!byStem[key]) {
      byStem[key] = {
        stem: key,
        sceneId: `single-${m[1]}`,
        caseId: null,
        mode: 'D',
        label: key,
        cleanPath: `screenshots/${name}`,
        hudPath: null,
        diagPath: null,
        source: 'disk-inventory-screenshots',
      };
    }
  }
  const results = Object.keys(byStem).sort().map((stem) => byStem[stem]);
  const inventory = {
    generatedAt: new Date().toISOString(),
    role: 'disk-inventory-only',
    policy:
      'This file is produced by build-visual-review.mjs from on-disk diagnostics/screenshots. It is NOT the capture provenance index and MUST NOT replace capture-index.json.',
    resultCount: results.length,
    results,
  };
  writeFileSync(path.join(OUT, 'capture-disk-inventory.json'), JSON.stringify(inventory, null, 2));
  return inventory;
}

function loadJsonIfPresent(relPath) {
  const abs = path.join(OUT, relPath);
  if (!existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function loadCaptureRunsMerged(byStem) {
  const runsDir = path.join(OUT, 'capture-runs');
  if (!existsSync(runsDir)) return;
  for (const name of readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort()) {
    const abs = path.join(runsDir, name);
    let run;
    try {
      run = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    if (!run?.results) continue;
    const rel = path.relative(OUT, abs).replaceAll('\\', '/');
    for (const item of run.results) {
      const stem = stemFromResult(item);
      if (!stem) continue;
      const prev = byStem.get(stem);
      byStem.set(stem, {
        ...prev,
        ...item,
        stem,
        runId: item.runId ?? run.runId ?? name.replace(/\.json$/, ''),
        runPath: rel,
        source: item.source ?? 'capture-run',
        provenance: [
          ...(prev?.provenance ?? []),
          { at: run.runId ?? name, path: rel },
        ],
      });
    }
  }
}

/**
 * capture-index.json is owned by capture-w10-visual.mjs.
 * build-visual-review never silently replaces it with a disk inventory.
 * Only when the index is missing or was previously wiped by this builder
 * do we restore a provenance-bearing index (merge, not drop stems).
 */
function loadOrRestoreCaptureIndex(diskInventory) {
  const indexPath = path.join(OUT, 'capture-index.json');
  const prior = loadJsonIfPresent('capture-index.json');
  const priorPolicy = typeof prior?.policy === 'string' ? prior.policy : '';
  const wipedByBuilder = Boolean(
    priorPolicy.includes('Merged inventory from diagnostics')
    || (prior?.results ?? []).some((r) => String(r.source || '').startsWith('rebuilt-from')),
  );
  const captureOwned = Boolean(
    prior?.role === 'capture-provenance-index'
    || prior?.lastRunPath
    || (prior?.results ?? []).some((r) => r.source === 'capture-run' || r.runPath),
  );

  if (prior && captureOwned && !wipedByBuilder) {
    return { index: prior, wrote: false };
  }

  const byStem = new Map();
  // Keep only real capture-run provenance from a damaged index; drop builder wipe rows.
  for (const item of prior?.results ?? []) {
    const stem = stemFromResult(item);
    if (!stem) continue;
    const src = String(item.source || '');
    if (src.startsWith('rebuilt-from') || src.startsWith('disk-inventory')) continue;
    byStem.set(stem, { ...item, stem });
  }
  loadCaptureRunsMerged(byStem);

  const attributedRuns = [
    {
      runId: 'legacy-capture-log',
      log: 'capture.log',
      note: 'First capture: Sc/Cc suite; St/Cs missing (selector required storage field).',
    },
    {
      runId: 'legacy-capture-stratus-log',
      log: 'capture-stratus.log',
      note: 'Recapture: St/Cs modes A–D only.',
    },
  ];
  for (const item of diskInventory.results) {
    if (byStem.has(item.stem)) continue;
    const short = item.stem.split('__')[0];
    const fromStratusRecapture = short === 'stratus' || short === 'cirrostratus';
    const runId = fromStratusRecapture ? 'legacy-capture-stratus-log' : 'legacy-capture-log';
    byStem.set(item.stem, {
      ...item,
      runId,
      source: 'restored-from-disk+capture-logs',
      provenance: [{ at: runId, log: fromStratusRecapture ? 'capture-stratus.log' : 'capture.log' }],
    });
  }

  const restored = {
    updatedAt: new Date().toISOString(),
    role: 'capture-provenance-index',
    policy:
      'Owned by capture-w10-visual.mjs: each run appends capture-runs/<iso>.json and merges by stem here. build-visual-review writes capture-disk-inventory.json only; it does not routinely rewrite this file.',
    restorationNote: wipedByBuilder || !prior
      ? 'Restored after missing/wiped index. Stems attributed from capture.log / capture-stratus.log + on-disk diagnostics; future capture runs merge without wiping.'
      : null,
    knownLegacyRuns: attributedRuns,
    lastRunId: prior?.lastRunId ?? null,
    lastRunPath: prior?.lastRunPath ?? null,
    resultCount: byStem.size,
    results: [...byStem.values()].sort((a, b) => String(a.stem).localeCompare(String(b.stem))),
    lastRunErrors: prior?.lastRunErrors ?? prior?.errors ?? [],
  };
  writeFileSync(indexPath, JSON.stringify(restored, null, 2));
  return { index: restored, wrote: true };
}

const diskInventory = buildDiskInventory();
const { index: captureIndex, wrote: captureIndexRestored } = loadOrRestoreCaptureIndex(diskInventory);

const TYPECHECK_SENTINEL = 'W10_TYPECHECK_OK';

const preflight = {
  build: (() => {
    const hit = readPreferredLog('build-rerun.log', 'build.log');
    return hit && /✓ built in \d+ms|built in \d+ms/i.test(hit.text) ? 'PASS' : 'UNABLE';
  })(),
  typecheck: (() => {
    const hit = readPreferredLog('typecheck-rerun.log');
    if (!hit) return 'UNABLE';
    if (/error TS\d+/i.test(hit.text)) return 'UNABLE';
    return hit.text.includes(TYPECHECK_SENTINEL) ? 'PASS' : 'UNABLE';
  })(),
  'test:w10a-cloud-frame': w10aPass ? 'PASS' : 'UNABLE',
  'test:w10b-world-raymarch': w10bWorldPass ? 'PASS' : 'UNABLE',
  'test:w10b-raymarch': w10bContractPass ? 'PASS' : 'UNABLE',
  'smoke:w10': (() => {
    const hit = readPreferredLog('smoke-w10-rerun.log', 'smoke-w10.log');
    if (!hit) return 'UNABLE';
    return /"state": "ready-for-screenshot"/.test(hit.text) ? 'PASS' : 'UNABLE';
  })(),
};

const review = {
  gate: 'W10 independent visual QA',
  rebuiltAt: new Date().toISOString(),
  gateVerdict: 'REVIEW/PENDING',
  formalContinue: false,
  revisionNote: 'Hardcoded A/B pixel PASS removed. Debug/motion are artifact-completeness only. Screenshots gitignored; see screenshot-manifest.json. Roadmap hard rows split auto-contract vs UNABLE visual.',
  screenshotPolicy: screenshotManifest.policy,
  screenshotManifest: {
    path: 'screenshot-manifest.json',
    count: screenshotManifest.count,
  },
  baseUrl: 'http://127.0.0.1:5174/procedural-clouds/?benchmark=1',
  preflight,
  caseSelection,
  captureHistory,
  captureIndexSummary: {
    path: 'capture-index.json',
    role: captureIndex.role,
    resultCount: captureIndex.resultCount,
    policy: captureIndex.policy,
  },
  captureDiskInventorySummary: {
    path: 'capture-disk-inventory.json',
    role: diskInventory.role,
    resultCount: diskInventory.resultCount,
  },
  pixelDiffSummary: pixelDiffAb
    ? {
      status: 'OBSERVATION',
      note: 'PNG maxAbs/changedChannels recorded; threshold not normative; visual equivalence remains UNABLE/owner PENDING',
      algorithm: pixelDiffAb.algorithm,
      threshold: pixelDiffAb.threshold,
      results: pixelDiffAb.results,
      evidence: 'pixel-diff-ab.json',
    }
    : {
      status: 'UNABLE',
      note: 'pixel-diff-ab.json missing',
    },
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
      note: 'Data available ≠ performance Gate pass',
    }
    : null,
  performanceSamples: {
    status: runtimeEvidence?.timing?.w10a_modeB_cloudFrame_fixed?.available
      ? 'STEADY_STATE_SAMPLES_NOT_GATE'
      : 'MIXED_SINGLE_SHOT_NOT_GATE',
    note: 'Steady median/p90 evidence completeness ≠ performanceGate PASS',
    stratocumulus: scA && scC ? {
      modeA: {
        iter: scA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
        cloudCurrentMs: scA.diagnostics.cloudFrame.cloudCurrentMs,
      },
      modeC: {
        iter: scC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
        cloudCurrentMs: scC.diagnostics.cloudFrame.cloudCurrentMs,
        avgStepMeters: scC.diagnostics.raymarch.raymarchAverageStepMeters,
      },
    } : null,
    cirrocumulus: ccA && ccC ? {
      modeA: {
        iter: ccA.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
        cloudCurrentMs: ccA.diagnostics.cloudFrame.cloudCurrentMs,
      },
      modeC: {
        iter: ccC.diagnostics.raymarch.raymarchPrimaryIterationsPerPixel,
        cloudCurrentMs: ccC.diagnostics.cloudFrame.cloudCurrentMs,
        avgStepMeters: ccC.diagnostics.raymarch.raymarchAverageStepMeters,
      },
    } : null,
    steadystateMedianP90: runtimeEvidence?.timing ?? null,
  },
  visualGate: 'UNABLE',
  performanceGate: 'UNABLE',
  passCount,
  failCount,
  unableCount,
  observationCount,
  rows,
};

writeFileSync(path.join(OUT, 'visual-review.json'), JSON.stringify(review, null, 2));
writeFileSync(path.join(OUT, 'selected-cases.json'), JSON.stringify(caseSelection, null, 2));

console.log(JSON.stringify({
  passCount,
  failCount,
  unableCount,
  observationCount,
  totalRows: rows.length,
  screenshots: screenshotNames.length,
  captureIndexResults: captureIndex.resultCount,
  captureIndexRestored,
  diskInventoryResults: diskInventory.resultCount,
  visualGate: review.visualGate,
  performanceGate: review.performanceGate,
  gateVerdict: review.gateVerdict,
  typecheckPreflight: preflight.typecheck,
}, null, 2));
