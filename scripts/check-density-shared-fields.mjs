import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = readFileSync(resolve(root, 'src/density/densitySharedFieldConfig.ts'), 'utf8');
const owner = readFileSync(resolve(root, 'src/density/densitySharedFields.ts'), 'utf8');
const contracts = readFileSync(resolve(root, 'src/density/contracts.ts'), 'utf8');
const pipeline = readFileSync(resolve(root, 'src/density/recipeV2Pipeline.ts'), 'utf8');
const adapter = readFileSync(resolve(root, 'src/density/recipeDensityV2Adapter.ts'), 'utf8');
const selector = readFileSync(resolve(root, 'src/density/densityProducerSelector.ts'), 'utf8');
const renderer = readFileSync(resolve(root, 'src/renderer.ts'), 'utf8');
const recipes = readFileSync(resolve(root, 'src/density/recipeV2Recipes.ts'), 'utf8');
const cacheShader = readFileSync(resolve(root, 'shaders/density-v2-empty.wgsl'), 'utf8');
const bindings = readFileSync(resolve(root, 'shaders/density-shared-fields-bindings.wgsl'), 'utf8');
const sampling = readFileSync(resolve(root, 'shaders/density-shared-sampling.wgsl'), 'utf8');
const atlas = readFileSync(resolve(root, 'shaders/density-shared-atlas.wgsl'), 'utf8');
const macro = readFileSync(resolve(root, 'shaders/density-shared-macro.wgsl'), 'utf8');
const debug = readFileSync(resolve(root, 'shaders/density-shared-debug.wgsl'), 'utf8');

const rgba8Bytes = 64 ** 3 * 4 * 2 + 256 ** 2 * 4;
const r16Bytes = 64 ** 3 * 2 * 2 + 256 ** 2 * 4;
const rgba16Bytes = 64 ** 3 * 8 * 2 + 256 ** 2 * 4;
if (rgba8Bytes !== 2_359_296 || r16Bytes !== 1_310_720 || rgba16Bytes !== 4_456_448) {
  throw new Error('W5 shared-field budget arithmetic changed');
}
if (rgba8Bytes / 1048576 !== 2.25 || rgba16Bytes / 1048576 !== 4.25) {
  throw new Error('W5 approved MiB budgets changed');
}

for (const token of [
  'DENSITY_SHARED_FIELD_CONFIG_VERSION = 1',
  'DENSITY_SHARED_FIELD_MAX_BYTES = 8 * 1024 * 1024',
  'atlasDimension: 64',
  'macroDimension: 256',
  "format: 'rgba8unorm'",
  'verifyDensitySharedFieldConfigFixtures',
]) {
  if (!config.includes(token)) throw new Error(`W5 shared config contract missing: ${token}`);
}

for (const source of [atlas, macro]) {
  for (const forbidden of ['atomic', 'var<workgroup>', 'node_tex_voronoi', 'noise_fbm', 'cloudDensityTyped']) {
    if (source.includes(forbidden)) throw new Error(`W5 generator contains forbidden symbol: ${forbidden}`);
  }
  if (!source.includes('@builtin(global_invocation_id)') || !source.includes('textureStore(')) {
    throw new Error('W5 generator lacks bounds-safe compute output');
  }
}
for (const loop of [
  'for (var z = -1; z <= 1; z += 1)',
  'for (var y = -1; y <= 1; y += 1)',
  'for (var x = -1; x <= 1; x += 1)',
]) {
  if (!atlas.includes(loop)) throw new Error(`W5 27-neighbor Worley bound missing: ${loop}`);
}
if (!atlas.includes('((value % period) + period) % period')
  || !macro.includes('((value % period) + period) % period')) {
  throw new Error('W5 generators do not explicitly wrap periodic cells');
}
if ((atlas.match(/@compute\b/g) ?? []).length !== 1 || (macro.match(/@compute\b/g) ?? []).length !== 1) {
  throw new Error('W5 generator entry count changed');
}

for (const token of [
  'densityBaseAtlas', 'densityDetailAtlas', 'densityMacroField',
  '@group(2) @binding(0)', '@group(2) @binding(3)',
]) {
  if (!bindings.includes(token)) throw new Error(`W5 sampling ABI missing: ${token}`);
}
if (bindings.includes('textureSample') || cacheShader.includes('textureSample')) {
  throw new Error('W5 cache source reaches a shared-field sample');
}
if ((sampling.match(/textureSampleLevel\(/g) ?? []).length !== 3
  || (sampling.match(/let warp =/g) ?? []).length !== 1) {
  throw new Error('W5 bounded sampling helper changed');
}
if ((debug.match(/textureSampleLevel\(/g) ?? []).length !== 3
  || !debug.includes('showSeams')) {
  throw new Error('W5 read-only slice debug shader is incomplete');
}

for (const token of [
  'baseTexture', 'detailTexture', 'macroTexture', 'samplingBindGroup',
  'encodePending(', 'atlasPending', 'macroPending', 'resourceCount: this.destroyed ? 0 : 3',
]) {
  if (!owner.includes(token)) throw new Error(`W5 shared owner contract missing: ${token}`);
}
if (owner.includes('CloudBody') || owner.includes('activeBodyCount')) {
  throw new Error('W5 shared owner depends on per-body state');
}
const atlasEncode = owner.indexOf("label: 'density-shared-atlas-generation-pass'");
const macroEncode = owner.indexOf("label: 'density-shared-macro-generation-pass'");
const sharedEncode = adapter.indexOf('this.sharedFields.encodePending(encoder');
const cacheEncode = adapter.indexOf('const pass = encoder.beginComputePass(descriptor)');
if (atlasEncode < 0 || macroEncode < 0 || cacheEncode < 0
  || sharedEncode < 0 || sharedEncode >= cacheEncode) {
  throw new Error('W5 warmup encode chain is incomplete');
}
if (!pipeline.includes('sharedFieldLayout')
  || !pipeline.includes('bindGroupLayouts: [inputLayout, outputLayout, sharedFieldLayout]')
  || !adapter.includes('pass.setBindGroup(2, this.sharedFields.getSamplingBindGroup())')) {
  throw new Error('W5 group 2 explicit binding ABI is incomplete');
}
if (!selector.includes('if (kind === \'recipe-v2\' && cacheRequired) this.ensureRecipeV2();')
  || !renderer.includes('createRecipeV2: () => createRecipeDensityV2Adapter({')) {
  throw new Error('W5 resources are not guarded by the lazy Cached/Hybrid V2 factory');
}
if (!contracts.includes('getSharedFieldDiagnostics(): DensitySharedFieldDiagnostics | null')
  || !contracts.includes('sharedFields: DensitySharedFieldStats | null')) {
  throw new Error('W5 read-only diagnostics contract is incomplete');
}
if (!renderer.includes('const TS_COUNT = 16')
  || !renderer.includes('beginningOfPassWriteIndex: 12')
  || !renderer.includes('beginningOfPassWriteIndex: 14')) {
  throw new Error('W5 timestamp ranges overlap or are missing');
}
if (!renderer.includes('ensureDensitySharedDebugPipeline()')
  || !renderer.includes('active-producer-has-no-ready-shared-fields')) {
  throw new Error('W5 lazy debug fallback is incomplete');
}
if (!recipes.includes("'sampleLimits', [0, 0, 0, 0]")
  || !recipes.includes("'identityAndModes', [\n      recipe.genusId,\n      0,")) {
  throw new Error('W5 accidentally enabled a genus Recipe or sample budget');
}

console.log('Density V2 shared-field budgets, bounded generators, lifecycle and diagnostics are isolated');
