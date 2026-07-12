import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const layout = readFileSync(resolve(root, 'src/density/recipeV2Layout.ts'), 'utf8');
const recipes = readFileSync(resolve(root, 'src/density/recipeV2Recipes.ts'), 'utf8');
const packing = readFileSync(resolve(root, 'src/density/recipeV2Packing.ts'), 'utf8');
const fixtures = readFileSync(resolve(root, 'src/density/recipeV2PackingFixtures.ts'), 'utf8');
const params = readFileSync(resolve(root, 'src/params.ts'), 'utf8');
const genusProfile = readFileSync(resolve(root, 'src/genusProfile.ts'), 'utf8');

for (const contract of [
  'DENSITY_V2_LAYOUT_VERSION = 1',
  'DENSITY_FRAME_GPU_SIZE = 64',
  'DENSITY_BODY_GPU_SIZE = 128',
  'DENSITY_RECIPE_GPU_SIZE = 256',
  "record('DensityFrameGPU'",
  "record('DensityBodyGPU'",
  "record('DensityRecipeGPU'",
  'buildDensityV2WgslAbi',
  'verifyDensityV2Layouts',
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
  if (layout.includes(forbidden) || recipes.includes(forbidden) || packing.includes(forbidden)) {
    throw new Error(`Density V2 data path contains forbidden interpreter/Legacy symbol: ${forbidden}`);
  }
}
if (!recipes.includes("'identityAndModes', [\n      recipe.genusId,\n      0,")) {
  throw new Error('W3 recipes are not statically disabled');
}
if (!recipes.includes("'sampleLimits', [0, 0, 0, 0]")) {
  throw new Error('W3 recipe sample limits are not zero');
}
if (!packing.includes('validGenus ? 0 : 1')) {
  throw new Error('invalid genus packing guard is missing');
}
for (const fixtureId of ['no-cloud', 'single-body', 'multi-body', 'invalid-genus']) {
  if (!fixtures.includes(`'${fixtureId}'`)) throw new Error(`Density V2 packing fixture missing: ${fixtureId}`);
}
if (!fixtures.includes('verifyDensityV2PackingFixtures')) {
  throw new Error('Density V2 executable packing fixture verifier is missing');
}

console.log('Density V2 layouts and disabled ten-genus recipes are consistent');
