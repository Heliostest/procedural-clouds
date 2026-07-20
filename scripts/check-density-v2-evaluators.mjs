import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

async function importTypeScriptModule(path) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const semantics = await importTypeScriptModule('src/density/recipeV2RecipeSemantics.ts');
const math = await importTypeScriptModule('src/density/recipeV2EvaluatorMath.ts');
semantics.verifyDensityV2RecipeSemantics();
math.verifyDensityV2EvaluatorMathFixtures();

const stratus = readFileSync(resolve(root, 'shaders/density-v2-stratus.wgsl'), 'utf8');
const cumulus = readFileSync(resolve(root, 'shaders/density-v2-cumulus.wgsl'), 'utf8');
const cellular = readFileSync(resolve(root, 'shaders/density-v2-cellular.wgsl'), 'utf8');
const common = readFileSync(resolve(root, 'shaders/density-v2-common.wgsl'), 'utf8');
const spike = readFileSync(resolve(root, 'shaders/density-v2-spike.wgsl'), 'utf8');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const renderer = readFileSync(resolve(root, 'src/renderer.ts'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
const manifest = readFileSync(resolve(root, 'src/densityBenchmarkManifest.ts'), 'utf8');

const stratiformCalibration = [
  // p05/p50/p95 are measured from the fixed W5 fields at each single-body W7
  // benchmark coordinate patch (bodyIndex=0). A low percentile must stay low;
  // otherwise rounded-sheet footprints inevitably turn into solid decks.
  { genus: 'stratus', coverage: 0.9, macro: [0.180, 0.401, 0.521], base: [0.358, 0.493, 0.649], lowGateMax: 0.08, midGate: [0.35, 0.85], highGateMin: 0.90, lowAmplitude: [0.60, 0.85], midAmplitude: [0.80, 1.00], highAmplitudeMin: 1.0, minMacroCoordinateSpan: 1.2, minBaseCoordinateSpan: 2.0 },
  { genus: 'cirrostratus', coverage: 0.7, macro: [0.155, 0.400, 0.492], base: [0.373, 0.537, 0.744], lowGateMax: 0.08, midGate: [0.60, 0.90], highGateMin: 0.95, lowAmplitude: [0.55, 0.75], midAmplitude: [0.75, 0.95], highAmplitudeMin: 1.0, minMacroCoordinateSpan: 0.6, minBaseCoordinateSpan: 1.2 },
  { genus: 'altostratus', coverage: 0.85, macro: [0.176, 0.398, 0.522], base: [0.378, 0.516, 0.734], lowGateMax: 0.08, midGate: [0.55, 0.85], highGateMin: 0.95, lowAmplitude: [0.08, 0.20], midAmplitude: [0.35, 0.60], highAmplitudeMin: 0.95, minMacroCoordinateSpan: 1.0, minBaseCoordinateSpan: 2.2 },
  { genus: 'nimbostratus', coverage: 0.95, macro: [0.164, 0.390, 0.511], base: [0.374, 0.528, 0.769], lowGateMax: 0.08, midGate: [0.85, 0.98], highGateMin: 0.99, lowAmplitude: [0.02, 0.12], midAmplitude: [0.30, 0.50], highAmplitudeMin: 0.98, minMacroCoordinateSpan: 0.8, minBaseCoordinateSpan: 1.7 },
];
for (const target of stratiformCalibration) {
  const lanes = semantics.DENSITY_V2_RECIPE_BANKS[target.genus].lanes;
  const gate = (field) => math.densityV2CoverageGate(
    field,
    target.coverage,
    lanes.topology0[0],
    lanes.topology0[1],
    lanes.topology0[2],
    lanes.topology2[2],
  );
  const [lowGate, midGate, highGate] = target.macro.map(gate);
  if (lowGate > target.lowGateMax) {
    throw new Error(`${target.genus} low Macro gate is saturated: ${lowGate}`);
  }
  if (midGate < target.midGate[0] || midGate > target.midGate[1]) {
    throw new Error(`${target.genus} median Macro gate is outside target: ${midGate}`);
  }
  if (highGate < target.highGateMin) throw new Error(`${target.genus} high Macro gate does not fill: ${highGate}`);
  const amplitude = (field) => math.densityV2StratiformLowAmplitude(
    field,
    lanes.topology1[0],
    lanes.topology0[3],
    lanes.topology2[0],
    lanes.topology1[3],
  );
  const [lowBase, midBase, highBase] = target.base.map(amplitude);
  if (lowBase < target.lowAmplitude[0] || lowBase > target.lowAmplitude[1]
    || midBase < target.midAmplitude[0] || midBase > target.midAmplitude[1]
    || highBase < target.highAmplitudeMin) {
    throw new Error(`${target.genus} Base shaping is outside target: ${lowBase}/${midBase}/${highBase}`);
  }
  const macroCoordinateSpan = lanes.domain0[0];
  const baseCoordinateSpan = 2 * lanes.domain1[2] * lanes.domain0[1];
  if (macroCoordinateSpan < target.minMacroCoordinateSpan
    || baseCoordinateSpan < target.minBaseCoordinateSpan) {
    throw new Error(`${target.genus} samples too little of the shared fields: Macro=${macroCoordinateSpan}, Base=${baseCoordinateSpan}`);
  }
}

const profileTargets = {
  stratus: { thicknessM: 1200, macroThicknessLow: 0.33, minTopReliefM: 125, minSpan: 0.9 },
  cirrostratus: { thicknessM: 5000, macroThicknessLow: 0.47, minTopReliefM: 0, maxSpan: 0.4 },
  altostratus: { thicknessM: 3000, macroThicknessLow: 0.33, minTopReliefM: 125, minSpan: 0.9 },
  nimbostratus: { thicknessM: 3000, macroThicknessLow: 0.36, minTopReliefM: 125, minSpan: 0.9 },
};
for (const [genus, target] of Object.entries(profileTargets)) {
  const lanes = semantics.DENSITY_V2_RECIPE_BANKS[genus].lanes;
  const span = lanes.vertical1[1];
  if (target.minSpan !== undefined && span < target.minSpan) throw new Error(`${genus} profile span is not initialized: ${span}`);
  if (target.maxSpan !== undefined && span > target.maxSpan) throw new Error(`${genus} Thin Sheet occupies too much Body height: ${span}`);
  const top = math.densityV2StratiformTop(target.macroThicknessLow, lanes.vertical0[2]);
  const reliefM = (1 - top) * span * target.thicknessM;
  if (reliefM < target.minTopReliefM) throw new Error(`${genus} top relief is sub-voxel: ${reliefM}m`);
}

const sampleCalls = (source) => [...source.matchAll(/densitySharedSample(Macro|Base|Detail)\(/g)].map((match) => match[1]);
if (sampleCalls(stratus).join(',') !== 'Macro,Base') {
  throw new Error(`Stratiform must contain exactly Macro+Base samples, got ${sampleCalls(stratus).join(',')}`);
}
for (const contract of [
  'densityV2ProfileHeight(ctx.height01, recipe.vertical1.x, recipe.vertical1.y)',
  'densityV2StratiformTop(macroSample.g, recipe.vertical0.z)',
  'mix(1.0, baseShape, baseContrast)',
]) {
  if (!stratus.includes(contract)) throw new Error(`Stratiform calibration formula missing: ${contract}`);
}
if (sampleCalls(cumulus).join(',') !== 'Macro,Base,Base,Detail') {
  throw new Error(`Cumulus must contain exactly Macro+Base+Base+Detail samples, got ${sampleCalls(cumulus).join(',')}`);
}
if (sampleCalls(cellular).join(',') !== 'Macro,Base,Base') {
  throw new Error(`Cellular must contain exactly Macro+Base+Base samples, got ${sampleCalls(cellular).join(',')}`);
}
for (const contract of [
  'fn densityV2EvaluateCellular(',
  'fn densityV2CellularAnalyticHooks(',
  'fn densityV2CellularSignal(',
  'waveStrength <= 0.0',
  'rippleAmplitude <= 0.0',
  'lensStrength <= 0.0',
  'rollStrength <= 0.0',
  'return vec2f(0.0, 1.0)',
  'let phase0 = rippleFrequency * dot(ctx.normalized.xz, vec2f(0.84, 0.54))',
  'let phase1 = rippleFrequency * 0.7861513778 * dot(ctx.normalized.xz, vec2f(-0.37, 0.93))',
  'let phase2 = rippleFrequency * 0.6131471928 * dot(ctx.normalized.xz, vec2f(0.23, -0.97))',
  'let phase3 = rippleFrequency * 0.4370160244 * dot(ctx.normalized.xz, vec2f(-0.91, -0.41))',
  'let carrier3 = sin((phase3 + carrier0 * 0.07 - carrier2 * 0.05)',
  '/ 3.65',
  'let cellThreshold = clamp(recipe.topology2.y, 0.05, 0.95)',
  'max(weightedCell, bridge)',
]) {
  if (!cellular.includes(contract)) throw new Error(`Cellular source contract missing: ${contract}`);
}
if (cellular.includes('thresholdOffset')) {
  throw new Error('Cellular ripple must not shift the cell threshold');
}
if (cellular.includes('+ recipe.topology1.w')) {
  throw new Error('Cellular connectivity must not be an additive saturation bias');
}

const cellularGenera = ['stratocumulus', 'altocumulus', 'cirrocumulus'];
const fillRatios = [];
for (const genus of cellularGenera) {
  const lanes = semantics.DENSITY_V2_RECIPE_BANKS[genus].lanes;
  let filled = 0;
  let saturated = 0;
  const sampleCount = 48 * 48;
  for (let z = 0; z < 48; z++) {
    for (let x = 0; x < 48; x++) {
      const u = (x + 0.5) / 48 * Math.PI * 2;
      const v = (z + 0.5) / 48 * Math.PI * 2;
      const primaryInterior = 0.56 + 0.25 * Math.cos(u * 1.7) * Math.cos(v * 1.1);
      const primaryEdge = 0.31 + 0.18 * Math.sin(u * 1.3 + v * 0.7);
      const secondaryInterior = 0.54 + 0.23 * Math.cos(u * 0.8 - v * 1.9);
      const secondaryEdge = 0.29 + 0.16 * Math.sin(u * 1.6 - v * 1.2);
      const value = math.densityV2CellularSignal(
        primaryInterior,
        primaryEdge,
        secondaryInterior,
        secondaryEdge,
        lanes.topology1[0],
        lanes.topology1[1],
        lanes.topology1[2],
        lanes.topology1[3],
        lanes.topology2[0],
        lanes.topology2[1],
        lanes.topology0[3],
      );
      if (value >= 0.5) filled++;
      if (value >= 0.98) saturated++;
    }
  }
  const fillRatio = filled / sampleCount;
  const saturationRatio = saturated / sampleCount;
  if (fillRatio < 0.08 || fillRatio > 0.78 || saturationRatio > 0.55) {
    throw new Error(`${genus} Cellular probe is empty/solid: fill=${fillRatio} saturated=${saturationRatio}`);
  }
  fillRatios.push(fillRatio);
}
if (!(fillRatios[0] > fillRatios[1] && fillRatios[1] > fillRatios[2])) {
  throw new Error(`Cellular coverage/connectivity ordering changed: ${fillRatios.join('/')}`);
}
for (const contract of [
  'densityV2InverseQuaternionRotate',
  'densityV2RoundedSheetFade',
  'densityV2EllipseFade',
  'densityV2SoftLayerProfile',
  'densityV2Finalize',
  'densityV2ProfileHeight',
]) {
  if (!common.includes(contract)) throw new Error(`W6 common evaluator contract missing: ${contract}`);
}
if (!manifest.includes('DENSITY_BENCHMARK_SCHEMA_VERSION = 5')
  || !manifest.includes("'density-debug': 10") || !manifest.includes('eye: [10.5, 13.5, 10.5]')) {
  throw new Error('W7 benchmark must use raw-density debug and keep the camera outside Cirrostratus');
}
if (!manifest.includes("taaEnabled: benchmarkCase.view === 'normal' && manifest.params.taaEnabled")) {
  throw new Error('W7 raw-density debug must not contain TAA history from a prior normal case');
}
for (const contract of ['rawDensityIntegral += d * baseStep', 'dv == 10', 'rawDensityIntegral / (1.0 + rawDensityIntegral)']) {
  if (!cloud.includes(contract)) throw new Error(`W7 raw-density debug contract missing: ${contract}`);
}
if (!renderer.includes('params.taaEnabled && params.debugView < 0.5')) {
  throw new Error('Debug views must not consume TAA history');
}
for (const contract of ['W8 V2 density:', 'W8 evaluators:', 'Sc=${evaluator.sampleLimits.stratocumulus', 'Ac=${evaluator.sampleLimits.altocumulus', 'Cc=${evaluator.sampleLimits.cirrocumulus']) {
  if (!main.includes(contract)) throw new Error(`W8 HUD contract missing: ${contract}`);
}
for (const contract of [
  'bodyIndex < DENSITY_V2_MAX_BODIES',
  'recipe.identityAndModes.y == 0u',
  'genusId != 2u && genusId != 4u',
  'genusId != 5u && genusId != 6u && genusId != 8u && genusId != 9u',
  'densityV2EvaluateStratiform',
  'densityV2EvaluateCellular',
  'textureStore(densityOutput',
]) {
  if (!spike.includes(contract)) throw new Error(`W8 dispatcher contract missing: ${contract}`);
}
for (const scene of [
  'single-stratus',
  'w6-stratus-multi',
  'single-cumulus',
  'w6-cumulus-multi',
  'w6-stratus-cumulus-overlap',
  'single-cirrostratus',
  'single-altostratus',
  'single-nimbostratus',
  'w7-stratiform-stack',
  'w7-stratiform-overlap',
  'single-stratocumulus',
  'single-altocumulus',
  'single-cirrocumulus',
  'w8-cellular-scale',
  'w8-cellular-overlap',
  'w8-wave-ripple',
]) {
  if (!manifest.includes(`'${scene}'`)) throw new Error(`W8 benchmark scene missing: ${scene}`);
}
for (const contract of [
  'function benchmarkFootprintBody(',
  "benchmarkFootprintBody(stratocumulus, 'w8-scale-stratocumulus', -3200, 0, 1250, 0.6)",
  "benchmarkFootprintBody(altocumulus, 'w8-scale-altocumulus', 0, 0, 1250, 0.6)",
  "benchmarkFootprintBody(cirrocumulus, 'w8-scale-cirrocumulus', 3200, 0, 1250, 0.6)",
]) {
  if (!manifest.includes(contract)) throw new Error(`W8 normalized scale benchmark contract missing: ${contract}`);
}
if (!manifest.includes("for (const producer of ['legacy', 'recipe-v2'] as const)")) {
  throw new Error('W6 benchmark cases do not use the global producer A/B seam');
}

console.log('Density V2 W8 recipe, Cellular math, source-budget, dispatch, and A/B fixtures passed');
