import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const layout = readFileSync(resolve(root, 'src/density/recipeV2Layout.ts'), 'utf8');
const recipes = readFileSync(resolve(root, 'src/density/recipeV2Recipes.ts'), 'utf8');
const semantics = readFileSync(resolve(root, 'src/density/recipeV2RecipeSemantics.ts'), 'utf8');
const evaluatorMath = readFileSync(resolve(root, 'src/density/recipeV2EvaluatorMath.ts'), 'utf8');
const packing = readFileSync(resolve(root, 'src/density/recipeV2Packing.ts'), 'utf8');
const fixtures = readFileSync(resolve(root, 'src/density/recipeV2PackingFixtures.ts'), 'utf8');
const params = readFileSync(resolve(root, 'src/params.ts'), 'utf8');
const genusProfile = readFileSync(resolve(root, 'src/genusProfile.ts'), 'utf8');

for (const contract of [
  'DENSITY_V2_LAYOUT_VERSION = 2',
  'DENSITY_FRAME_GPU_SIZE = 64',
  'DENSITY_BODY_GPU_SIZE = 128',
  'DENSITY_RECIPE_GPU_SIZE = 256',
  "record('DensityFrameGPU'",
  "record('DensityBodyGPU'",
  "record('DensityRecipeGPU'",
  'buildDensityV2WgslAbi',
  'verifyDensityV2Layouts',
  'tileMaskEnabled: 1 << 1',
  'tileMask: 3',
]) {
  if (!layout.includes(contract)) throw new Error(`missing Density V2 layout contract: ${contract}`);
}

if (!params.includes('export const MAX_BODIES = 12;') || !params.includes('export const BODY_BASE = 60;')) {
  throw new Error('Legacy body layout changed while establishing Density V2');
}
if (!layout.includes('DENSITY_RECIPE_GPU_LAYOUT.count !== 10')) {
  throw new Error('Density V2 recipe count check is missing');
}

const genusBlock = genusProfile.slice(
  genusProfile.indexOf('export const CLOUD_GENERA = ['),
  genusProfile.indexOf('] as const;'),
);
const genusNames = [...genusBlock.matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
if (genusNames.length !== 10 || new Set(genusNames).size !== 10) {
  throw new Error(`expected ten unique cloud genera, received ${genusNames.length}`);
}
for (const genus of genusNames) {
  if (!recipes.includes(`${genus}: [`)) throw new Error(`Density V2 recipe mode missing: ${genus}`);
}

for (const forbidden of ['operatorCount', 'bytecode', 'interpreter', 'cloudDensityTyped', 'evalBody']) {
  if (layout.includes(forbidden) || recipes.includes(forbidden) || semantics.includes(forbidden) || packing.includes(forbidden)) {
    throw new Error(`Density V2 data path contains forbidden interpreter/Legacy symbol: ${forbidden}`);
  }
}
if (!recipes.includes('recipe.enabled ? 1 : 0')) {
  throw new Error('W6 recipes do not pack the static enabled flag');
}
for (const contract of [
  'DENSITY_V2_ENABLED_GENERA = Object.freeze([',
  "'cumulus', 'stratus', 'altostratus', 'nimbostratus', 'cirrostratus'",
  'sampleLimits: lane(2, 0, 0, 0)',
  'sampleLimits: lane(3, 1, 0, 0)',
  'verifyDensityV2RecipeSemantics',
]) {
  if (!semantics.includes(contract)) throw new Error(`W7 recipe semantics missing: ${contract}`);
}
for (const contract of [
  'densityV2InverseQuaternionRotate',
  'densityV2FlatBaseDomeProfile',
  'densityV2SoftCompose',
  'verifyDensityV2EvaluatorMathFixtures',
]) {
  if (!evaluatorMath.includes(contract)) throw new Error(`W6 evaluator math fixture missing: ${contract}`);
}
if (!recipes.includes("'support0', [") || !recipes.includes('maxHorizontalScale')) {
  throw new Error('W4 support envelope packing is missing');
}
if (!packing.includes('compactIndex = activeBodies.length')
  || !packing.includes('sourceIndices.push(sourceIndex)')) {
  throw new Error('Density V2 active-prefix packing guard is missing');
}
if (!packing.includes('const density = source.densityScale;')
  || !packing.includes('const lifecycleDensity = mod.densityScale;')
  || !packing.includes('coverage, lifecycleDensity, mod.morph, 1,')) {
  throw new Error('Density V2 source and lifecycle density scales must be packed separately');
}
for (const fixtureId of ['no-cloud', 'single-body', 'multi-body', 'invalid-genus', 'invalid-before-valid', 'zero-coverage-before-valid']) {
  if (!fixtures.includes(`'${fixtureId}'`)) throw new Error(`Density V2 packing fixture missing: ${fixtureId}`);
}
if (!fixtures.includes('verifyDensityV2PackingFixtures')) {
  throw new Error('Density V2 executable packing fixture verifier is missing');
}
if (!fixtures.includes('Density V2 lifecycle density must be packed exactly once')) {
  throw new Error('Density V2 lifecycle density packing fixture is missing');
}

console.log('Density V2 layouts, W7 five-genus recipes, and math fixtures are consistent');
