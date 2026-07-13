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
const manifest = readFileSync(resolve(root, 'src/densityBenchmarkManifest.ts'), 'utf8');

const sampleCalls = (source) => [...source.matchAll(/densitySharedSample(Macro|Base|Detail)\(/g)].map((match) => match[1]);
if (sampleCalls(stratus).join(',') !== 'Macro,Base') {
  throw new Error(`Stratiform must contain exactly Macro+Base samples, got ${sampleCalls(stratus).join(',')}`);
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
]) {
  if (!common.includes(contract)) throw new Error(`W6 common evaluator contract missing: ${contract}`);
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
