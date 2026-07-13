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
const common = readFileSync(resolve(root, 'shaders/density-v2-common.wgsl'), 'utf8');
const spike = readFileSync(resolve(root, 'shaders/density-v2-spike.wgsl'), 'utf8');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const renderer = readFileSync(resolve(root, 'src/renderer.ts'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
const manifest = readFileSync(resolve(root, 'src/densityBenchmarkManifest.ts'), 'utf8');

const stratiformCalibration = [
  { genus: 'stratus', coverage: 0.9, lowMacro: 0.12, highMacro: 0.55, lowGateMax: 0.25, highGateMin: 0.95, minBaseSpan: 0.35, minMacroCoordinateSpan: 1.2, minBaseCoordinateSpan: 2.0 },
  { genus: 'cirrostratus', coverage: 0.7, lowMacro: 0.14, highMacro: 0.54, lowGateMin: 0.55, highGateMin: 0.95, minBaseSpan: 0.08, minMacroCoordinateSpan: 0.6, minBaseCoordinateSpan: 1.2 },
  { genus: 'altostratus', coverage: 0.85, lowMacro: 0.12, highMacro: 0.54, lowGateMax: 0.45, highGateMin: 0.95, minBaseSpan: 0.30, minMacroCoordinateSpan: 1.0, minBaseCoordinateSpan: 2.2 },
  { genus: 'nimbostratus', coverage: 0.95, lowMacro: 0.13, highMacro: 0.53, lowGateMin: 0.75, highGateMin: 0.95, minBaseSpan: 0.25, minMacroCoordinateSpan: 0.8, minBaseCoordinateSpan: 1.7 },
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
  const lowGate = gate(target.lowMacro);
  const highGate = gate(target.highMacro);
  if (target.lowGateMax !== undefined && lowGate > target.lowGateMax) {
    throw new Error(`${target.genus} low Macro gate is saturated: ${lowGate}`);
  }
  if (target.lowGateMin !== undefined && lowGate < target.lowGateMin) {
    throw new Error(`${target.genus} low Macro continuity is too weak: ${lowGate}`);
  }
  if (highGate < target.highGateMin) throw new Error(`${target.genus} high Macro gate does not fill: ${highGate}`);
  const lowBase = math.densityV2StratiformLowAmplitude(0.25, lanes.topology2[0], lanes.topology1[3]);
  const highBase = math.densityV2StratiformLowAmplitude(0.75, lanes.topology2[0], lanes.topology1[3]);
  if (highBase - lowBase < target.minBaseSpan) {
    throw new Error(`${target.genus} Base modulation is too flat: ${highBase - lowBase}`);
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
  '(base.r - 0.5) * 2.0 * recipe.topology2.x',
]) {
  if (!stratus.includes(contract)) throw new Error(`Stratiform calibration formula missing: ${contract}`);
}
if (sampleCalls(cumulus).join(',') !== 'Macro,Base,Base,Detail') {
  throw new Error(`Cumulus must contain exactly Macro+Base+Base+Detail samples, got ${sampleCalls(cumulus).join(',')}`);
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
if (!manifest.includes('DENSITY_BENCHMARK_SCHEMA_VERSION = 3')
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
for (const contract of ['W7 V2 density:', 'W7 evaluators:', 'Cs=${evaluator.sampleLimits.cirrostratus', 'As=${evaluator.sampleLimits.altostratus', 'Ns=${evaluator.sampleLimits.nimbostratus']) {
  if (!main.includes(contract)) throw new Error(`W7 HUD contract missing: ${contract}`);
}
for (const contract of [
  'bodyIndex < DENSITY_V2_MAX_BODIES',
  'recipe.identityAndModes.y == 0u',
  'genusId != 0u && genusId != 1u && genusId != 5u && genusId != 6u && genusId != 8u',
  'densityV2EvaluateStratiform',
  'textureStore(densityOutput',
]) {
  if (!spike.includes(contract)) throw new Error(`W6 dispatcher contract missing: ${contract}`);
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
]) {
  if (!manifest.includes(`'${scene}'`)) throw new Error(`W6 benchmark scene missing: ${scene}`);
}
if (!manifest.includes("for (const producer of ['legacy', 'recipe-v2'] as const)")) {
  throw new Error('W6 benchmark cases do not use the global producer A/B seam');
}

console.log('Density V2 W7 recipe, family math, source-budget, dispatch, and A/B fixtures passed');
