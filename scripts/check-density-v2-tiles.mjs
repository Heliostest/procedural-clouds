import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mask = readFileSync(resolve(root, 'src/density/recipeV2TileMask.ts'), 'utf8');
const fixtures = readFileSync(resolve(root, 'src/density/recipeV2TileMaskFixtures.ts'), 'utf8');
const packing = readFileSync(resolve(root, 'src/density/recipeV2Packing.ts'), 'utf8');
const shader = readFileSync(resolve(root, 'shaders/density-v2-empty.wgsl'), 'utf8');
const pipeline = readFileSync(resolve(root, 'src/density/recipeV2Pipeline.ts'), 'utf8');

const defaultGrid = [Math.ceil(96 / 8), Math.ceil(96 / 8), Math.ceil(96 / 4)];
const defaultTiles = defaultGrid[0] * defaultGrid[1] * defaultGrid[2];
if (defaultGrid.join('x') !== '12x12x24' || defaultTiles !== 3456 || defaultTiles * 4 !== 13_824) {
  throw new Error('Density V2 default tile-grid arithmetic changed');
}
if (256 ** 3 !== 16_777_216 || 262_144 * 4 !== 1_048_576) {
  throw new Error('Density V2 extreme-grid or mask budget arithmetic changed');
}

for (const contract of [
  'DENSITY_V2_MAX_TILE_MASK_TILES = 262_144',
  'DENSITY_V2_MAX_TILE_MASK_BYTES = 1_048_576',
  'DENSITY_V2_MAX_TILE_BODY_TESTS',
  'intersectsClosed',
  'tileValidVoxelCount',
  'densityV2TileMaskSignature',
  'verifyDensityV2TileMaskNoFalseNegatives',
  "return 'disabled-budget-tiles'",
]) {
  if (!mask.includes(contract)) throw new Error(`Density V2 tile-mask contract missing: ${contract}`);
}
for (const fixtureId of [
  'default-grid', 'no-body', 'rotated-wind-cb', 'non-divisible-grid',
  'invalid-before-valid', 'extreme-budget-fallback',
]) {
  if (!fixtures.includes(`'${fixtureId}'`)) throw new Error(`Density V2 tile fixture missing: ${fixtureId}`);
}
if (!packing.includes('supportAabbMin')
  || !packing.includes('supportAabbMax')
  || !packing.includes('densityV2EulerToQuaternion')) {
  throw new Error('Density V2 conservative rotated Support packing is incomplete');
}
if (!shader.includes('@builtin(workgroup_id) tileId')
  || !shader.includes('densityTileMasks[tileIndex]')
  || (shader.match(/textureStore\(/g) ?? []).length !== 1) {
  throw new Error('Density V2 W4 shader does not gate candidates with one final zero store');
}
if (!pipeline.includes('DENSITY_V2_INPUT_BINDINGS.tileMask')
  || !pipeline.includes("type: 'read-only-storage'")) {
  throw new Error('Density V2 explicit pipeline is missing the read-only mask binding');
}
for (const forbidden of ['textureSample', 'textureLoad', 'textureGather', 'atomic', 'var<workgroup>', 'dispatchWorkgroupsIndirect']) {
  if (shader.includes(forbidden)) throw new Error(`Density V2 W4 shader contains forbidden operation: ${forbidden}`);
}

console.log('Density V2 tile-mask budgets, fixtures, Support and shader gate are consistent');
