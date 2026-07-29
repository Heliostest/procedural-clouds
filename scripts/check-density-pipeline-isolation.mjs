import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const noise = readFileSync(resolve(root, 'shaders/noise.wgsl'), 'utf8');
const manifestSource = readFileSync(resolve(root, 'src/rendering/densityShaderSources.ts'), 'utf8');
const rendererSource = readFileSync(resolve(root, 'src/renderer.ts'), 'utf8');
const managerSource = readFileSync(resolve(root, 'src/rendering/densityQualityPipelines.ts'), 'utf8');
const paramsSource = readFileSync(resolve(root, 'src/params.ts'), 'utf8');
const recipeV2CommonSource = readFileSync(resolve(root, 'shaders/density-v2-common.wgsl'), 'utf8');
const recipeV2StratusSource = readFileSync(resolve(root, 'shaders/density-v2-stratus.wgsl'), 'utf8');
const recipeV2CumulusSource = readFileSync(resolve(root, 'shaders/density-v2-cumulus.wgsl'), 'utf8');
const recipeV2CellularSource = readFileSync(resolve(root, 'shaders/density-v2-cellular.wgsl'), 'utf8');
const recipeV2Source = readFileSync(resolve(root, 'shaders/density-v2-spike.wgsl'), 'utf8');
const recipeV2PipelineSource = readFileSync(resolve(root, 'src/density/recipeV2Pipeline.ts'), 'utf8');
const recipeV2AdapterSource = readFileSync(resolve(root, 'src/density/recipeDensityV2Adapter.ts'), 'utf8');
const producerSelectorSource = readFileSync(resolve(root, 'src/density/densityProducerSelector.ts'), 'utf8');
const recipeV2TileMaskSource = readFileSync(resolve(root, 'src/density/recipeV2TileMask.ts'), 'utf8');
const sharedOwnerSource = readFileSync(resolve(root, 'src/density/densitySharedFields.ts'), 'utf8');
const sharedAtlasSource = readFileSync(resolve(root, 'shaders/density-shared-atlas.wgsl'), 'utf8');
const sharedMacroSource = readFileSync(resolve(root, 'shaders/density-shared-macro.wgsl'), 'utf8');
const sharedBindingsSource = readFileSync(resolve(root, 'shaders/density-shared-fields-bindings.wgsl'), 'utf8');
const sharedSamplingSource = readFileSync(resolve(root, 'shaders/density-shared-sampling.wgsl'), 'utf8');
const genusNames = [
  'common', 'cumulus', 'stratus', 'stratocumulus', 'cumulonimbus',
  'altocumulus', 'altostratus', 'nimbostratus', 'cirrus', 'cirrostratus',
  'cirrocumulus', 'dispatch',
];
const genusSources = genusNames.map((name) => readFileSync(resolve(root, `shaders/genus/${name}.wgsl`), 'utf8'));

function markerIndex(source, marker) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`missing source marker: ${marker}`);
  return index;
}

function before(source, marker) {
  return source.slice(0, markerIndex(source, marker));
}

function between(source, startMarker, endMarker) {
  const start = markerIndex(source, startMarker);
  const end = markerIndex(source, endMarker);
  if (end <= start) throw new Error(`source markers out of order: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

function blockStartingAt(source, token) {
  const start = markerIndex(source, token);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed source block: ${token}`);
}

const noiseCommon = before(noise, '// VORONOI (Blender exact path for F1)');
const noiseLegacyVoronoi = noise.slice(markerIndex(noise, '// VORONOI (Blender exact path for F1)'));
const abi = before(cloud, 'struct VSOut {');
const vertex = between(cloud, 'struct VSOut {', 'fn mapRange(');
const helpers = between(cloud, 'fn mapRange(', 'fn sampleDensityTyped(');
const cacheSampling = between(cloud, 'fn sampleDensityTyped(', 'struct DensityType {');
const legacyEvaluator = between(cloud, 'struct DensityType {', 'fn boxMin()');
const spatial = between(cloud, 'fn boxMin()', 'struct HitInfo {');
const renderPrefix = between(cloud, 'fn boxMin()', 'fn applyBoundedDetailStage(');
const hybridDetail = between(cloud, 'fn applyBoundedDetailStage(', 'fn applyEdgeShaping(');
const edge = between(cloud, 'fn applyEdgeShaping(', 'fn dbgSphere(');
const debug = between(cloud, 'fn dbgSphere(', 'fn densityAtTyped(');
const renderTail = between(
  cloud,
  '// Accumulated optical depth toward the sun (raw, not yet attenuated).',
  '// Density Cache Compute',
);
const groundShadow = cloud.slice(markerIndex(cloud, '@compute @workgroup_size(8, 8, 1)'));
const cacheEntry = between(cloud, '// Density Cache Compute', '@compute @workgroup_size(8, 8, 1)');

const hierarchicalSampling = between(manifestSource, 'const hierarchicalSampling =', 'const hierarchicalCachedQualityAdapter');
const cachedAdapter = between(manifestSource, 'const cachedQualityAdapter', 'const hybridQualityAdapter');
const hybridAdapter = between(manifestSource, 'const hybridQualityAdapter', 'const realtimeQualityAdapter');
const realtimeAdapter = between(manifestSource, 'const realtimeQualityAdapter', "fragments.set('quality-cached'");
const hierarchicalCachedAdapter = between(manifestSource, 'const hierarchicalCachedQualityAdapter', 'const hierarchicalHybridQualityAdapter');
const hierarchicalHybridAdapter = between(manifestSource, 'const hierarchicalHybridQualityAdapter', "fragments.set('hierarchical-cache-sampling'");

const cached = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, edge, debug, cachedAdapter, renderTail, groundShadow].join('\n');
const hybrid = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, hybridDetail, edge, debug, hybridAdapter, renderTail, groundShadow].join('\n');
const realtime = [noiseCommon, noiseLegacyVoronoi, abi, vertex, helpers, legacyEvaluator, ...genusSources, renderPrefix, edge, debug, realtimeAdapter, renderTail, groundShadow].join('\n');
const hierarchicalCached = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, edge, debug, hierarchicalSampling, hierarchicalCachedAdapter, renderTail, groundShadow].join('\n');
const hierarchicalHybrid = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, hybridDetail, edge, debug, hierarchicalSampling, hierarchicalHybridAdapter, renderTail, groundShadow].join('\n');
const legacyCache = [noiseCommon, noiseLegacyVoronoi, abi, helpers, spatial, legacyEvaluator, ...genusSources, debug, cacheEntry].join('\n');

const forbidden = ['fn cloudDensityTyped(', 'fn evalBody(', 'fn evalGenusDensity(', 'fn node_tex_voronoi_f1_4d_distance(', 'fn cs('];
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid], ['hierarchical-cached', hierarchicalCached], ['hierarchical-hybrid', hierarchicalHybrid]]) {
  for (const symbol of forbidden) {
    if (source.includes(symbol)) throw new Error(`${kind} source contains forbidden symbol: ${symbol}`);
  }
}

const detailAbiTokens = [
  'DetailResourceControlsGPU', 'detailSampler', 'detailBaseTex', 'detailFieldTex', 'detailResourceControls',
  '@group(3) @binding(4)', '@group(3) @binding(5)', '@group(3) @binding(6)', '@group(3) @binding(7)',
];
const hybridOnlyDebugTokens = ['detailControlsForMetadata(', 'evaluateDetail(', 'sampleDetailField(', 'detailResourceControls'];
for (const [kind, source] of [['cached', cached], ['realtime', realtime], ['hierarchical-cached', hierarchicalCached]]) {
  if (source.includes('fn applyBoundedDetailStage(') || source.includes('textureSampleLevel(detail')) {
    throw new Error(`${kind} source contains Hybrid detail`);
  }
  for (const token of detailAbiTokens) {
    if (source.includes(token)) throw new Error(`${kind} source contains detail ABI: ${token}`);
  }
  for (const token of hybridOnlyDebugTokens) {
    if (source.includes(token)) throw new Error(`${kind} source contains Hybrid debug symbol: ${token}`);
  }
}
for (const [kind, source] of [['hybrid', hybrid], ['hierarchical-hybrid', hierarchicalHybrid]]) {
  if ((source.match(/fn applyBoundedDetailStage\s*\(/g) ?? []).length !== 1) {
    throw new Error(`${kind} source must contain one detail stage definition`);
  }
  for (const token of detailAbiTokens) {
    if (!source.includes(token)) throw new Error(`${kind} source is missing detail ABI: ${token}`);
  }
}
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid], ['realtime', realtime], ['hierarchical-cached', hierarchicalCached], ['hierarchical-hybrid', hierarchicalHybrid]]) {
  if ((source.match(/fn w12DebugErosionAt\s*\(/g) ?? []).length !== 1) {
    throw new Error(`${kind} source must define one W12 debug adapter`);
  }
}
for (const [kind, adapter] of [['cached', cachedAdapter], ['realtime', realtimeAdapter], ['hierarchical-cached', hierarchicalCachedAdapter]]) {
  const helper = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  if (!helper.includes('return 0.0;')) throw new Error(`${kind} W12 debug adapter must return zero`);
  for (const token of hybridOnlyDebugTokens) {
    if (helper.includes(token)) throw new Error(`${kind} W12 debug adapter contains ${token}`);
  }
}
for (const [kind, adapter] of [['hybrid', hybridAdapter], ['hierarchical-hybrid', hierarchicalHybridAdapter]]) {
  const helper = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  if ((helper.match(/sampleDetailField\s*\(/g) ?? []).length !== 1) {
    throw new Error(`${kind} W12 debug adapter must sample detail once`);
  }
  if (!helper.includes('evaluation.effectiveErosionAmount <= 0.0')) {
    throw new Error(`${kind} W12 debug adapter lost erosion guard`);
  }
}
for (const token of hybridOnlyDebugTokens) {
  if (renderTail.includes(token)) throw new Error(`shared render tail contains Hybrid-only symbol: ${token}`);
}
const w12DebugBranch = blockStartingAt(renderTail, 'if (debugView == 18 || debugView == 19)');
const erosionBranch = blockStartingAt(w12DebugBranch, 'if (debugView == 18)');
if (!erosionBranch.includes('w12DebugErosionAt(pos, dt)') || (renderTail.match(/w12DebugErosionAt\s*\(/g) ?? []).length !== 1) {
  throw new Error('shared render tail must call W12 debug adapter only in view 18');
}
if (!realtime.includes('fn cloudDensityTyped(') || realtime.includes('fn sampleDensityTyped(')) {
  throw new Error('realtime source closure is not direct-density-only');
}
if (!legacyCache.includes('fn cs(') || legacyCache.includes('@fragment') || legacyCache.includes('fn csGroundShadow(')) {
  throw new Error('Legacy cache source closure contains a render/ground-shadow entry or lacks cache compute');
}
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid], ['realtime', realtime], ['hierarchical-cached', hierarchicalCached], ['hierarchical-hybrid', hierarchicalHybrid], ['legacy-cache', legacyCache]]) {
  const opens = [...source].filter((character) => character === '{').length;
  const closes = [...source].filter((character) => character === '}').length;
  if (opens !== closes) throw new Error(`${kind} source has unbalanced braces: ${opens} != ${closes}`);
  const functionNames = [...source.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((match) => match[1]);
  const duplicates = [...new Set(functionNames.filter((name, index) => functionNames.indexOf(name) !== index))];
  if (duplicates.length > 0) throw new Error(`${kind} source has duplicate functions: ${duplicates.join(', ')}`);
}
if (!manifestSource.includes("'recipe-v2'")) throw new Error('Recipe V2 manifest guard is missing');
if (!manifestSource.includes("forbiddenFragments: ['noise-legacy-voronoi', 'legacy-evaluator'")) {
  throw new Error('Recipe V2/quality manifest does not explicitly forbid the Legacy evaluator');
}
const startupBundleStart = markerIndex(rendererSource, 'Promise.allSettled([');
const startupBundleEnd = rendererSource.indexOf(']);', startupBundleStart);
if (startupBundleEnd < 0) throw new Error('renderer startup bundle creation block is incomplete');
const startupBundleCreation = rendererSource.slice(startupBundleStart, startupBundleEnd);
if (startupBundleCreation.includes("kind: 'realtime'")) {
  throw new Error('Realtime quality pipeline is created during renderer startup');
}
if (!rendererSource.includes('createRealtime: () => createDensityQualityPipelineBundle')) {
  throw new Error('Renderer does not delegate Realtime creation to the lazy manager factory');
}
if (!managerSource.includes("kind === 'realtime' && state.lifecycle === 'idle'")) {
  throw new Error('Realtime manager does not guard first creation behind an idle request');
}
const cloudBindingSource = between(managerSource, 'const cloudScene =', 'const groundShadowScene =');
if (!cloudBindingSource.includes('...weatherEntries,')) {
  throw new Error('Cloud render bindings do not provide shared debug weather resources to every quality mode');
}
const groundShadowStage = blockStartingAt(hybridDetail, 'fn applyBoundedDetailStage(');
const groundShadowEvaluation = blockStartingAt(hybridDetail, 'fn evaluateDetail(');
const groundShadowSampling = blockStartingAt(hybridDetail, 'fn sampleDetailField(');
const groundShadowIntegration = blockStartingAt(renderTail, 'fn integrateGroundShadow(');
if (!groundShadowIntegration.includes('densityAt(sp, false)')
  || !hybridAdapter.includes('applyBoundedDetailStage(sampleDensityTyped(pos), pos, wantFinal)')
  || groundShadowStage.indexOf('evaluateDetail(') > groundShadowStage.indexOf('if (!wantFinal')) {
  throw new Error('Hybrid ground-shadow does not statically reach the detail evaluation before rough return');
}
if (!groundShadowEvaluation.includes('camera.position')
  || !groundShadowEvaluation.includes('params.')
  || !groundShadowSampling.includes('dominantWindPhase(pos)')
  || !hybridDetail.includes('blendedEdgeStyle(')) {
  throw new Error('Hybrid ground-shadow group 0 static resource closure drifted');
}
if (!groundShadowSampling.includes('detailSampler')
  || !groundShadowSampling.includes('detailBaseTex')
  || !groundShadowSampling.includes('detailFieldTex')
  || !groundShadowEvaluation.includes('detailResourceControls')) {
  throw new Error('Hybrid ground-shadow group 3 detail resource closure drifted');
}
const groundShadowBindingSource = between(managerSource, 'const groundShadowSceneEntries', 'let cloudDensity');
for (const token of [
  "bundle.kind === 'hybrid'",
  '{ binding: 0, resource: { buffer: resources.cameraBuffer } }',
  '...sharedSceneEntries',
  '...weatherEntries',
  'bundle.groundShadowPipeline.getBindGroupLayout(0)',
  'entries: groundShadowSceneEntries',
]) {
  if (!groundShadowBindingSource.includes(token)) throw new Error(`Hybrid ground-shadow group 0 binding closure misses ${token}`);
}
const groundShadowDetailBindingStart = markerIndex(managerSource, 'const detailEntries');
const groundShadowDetailBindingEnd = managerSource.indexOf('\n  return {', groundShadowDetailBindingStart);
if (groundShadowDetailBindingEnd < 0) throw new Error('ground-shadow detail binding return block is missing');
const groundShadowDetailBindingSource = managerSource.slice(groundShadowDetailBindingStart, groundShadowDetailBindingEnd);
for (const token of [
  '{ binding: 4, resource: resources.detail.sampler }',
  '{ binding: 5, resource: resources.detail.baseView }',
  '{ binding: 6, resource: resources.detail.detailView }',
  '{ binding: 7, resource: { buffer: resources.detail.controlsBuffer } }',
  "const groundShadowDetail = bundle.kind === 'hybrid'",
  'bundle.groundShadowPipeline.getBindGroupLayout(3)',
]) {
  if (!groundShadowDetailBindingSource.includes(token)) throw new Error(`Hybrid ground-shadow group 3 binding closure misses ${token}`);
}
if (cached.includes('detailResourceControls') || realtime.includes('detailResourceControls') || hierarchicalCached.includes('detailResourceControls')) {
  throw new Error('Non-Hybrid ground-shadow source gained detail ABI');
}
if (realtime.includes('textureDimensions(densityTex0')) {
  throw new Error('Ground-shadow source derives step size from a density-cache texture');
}
if (!realtime.includes('params.g.densityResolution') || !paramsSource.includes('densityResolution: 59')) {
  throw new Error('Ground-shadow density resolution uniform contract is incomplete');
}
const recipeV2Closure = [recipeV2CommonSource, recipeV2StratusSource, recipeV2CumulusSource, recipeV2CellularSource, recipeV2Source, sharedSamplingSource].join('\n');
const recipeV2Forbidden = [
  'cloudDensityTyped', 'evalBody', 'node_tex_voronoi', 'noise_fbm',
  'textureLoad', 'textureGather', 'atomic', 'var<workgroup>',
  'operatorCount', 'indirect', 'texture_4d', 'perBodyTexture',
];
for (const symbol of recipeV2Forbidden) {
  if (recipeV2Closure.includes(symbol)) throw new Error(`Recipe V2 W8 closure contains forbidden symbol: ${symbol}`);
}
if ((recipeV2Source.match(/textureStore\(/g) ?? []).length !== 1) {
  throw new Error('Recipe V2 W6 compute must contain exactly one textureStore');
}
if (!recipeV2Source.includes('csDensityV2Spike')
  || !recipeV2Source.includes('densityTileMasks[tileIndex]')
  || !recipeV2Source.includes('genusId != 0u && genusId != 1u')
  || !recipeV2Source.includes('restCap * (1.0 - exp(-rest / restCap))')) {
  throw new Error('Recipe V2 W6 compute entry is incomplete');
}
if ((recipeV2Source.match(/@compute\b/g) ?? []).length !== 1
  || !recipeV2Source.includes('bodyIndex < DENSITY_V2_MAX_BODIES')) {
  throw new Error('Recipe V2 W6 compute must have one fixed bounded entry');
}
const stratusSamples = (recipeV2StratusSource.match(/densitySharedSample(?:Macro|Base|Detail)\(/g) ?? []);
const cumulusSamples = (recipeV2CumulusSource.match(/densitySharedSample(?:Macro|Base|Detail)\(/g) ?? []);
const cellularSamples = (recipeV2CellularSource.match(/densitySharedSample(?:Macro|Base|Detail)\(/g) ?? []);
if (stratusSamples.join(',') !== 'densitySharedSampleMacro(,densitySharedSampleBase(') {
  throw new Error(`Stratus static sample budget changed: ${stratusSamples.join(',')}`);
}
if (cumulusSamples.join(',') !== 'densitySharedSampleMacro(,densitySharedSampleBase(,densitySharedSampleBase(,densitySharedSampleDetail(') {
  throw new Error(`Cumulus static sample budget changed: ${cumulusSamples.join(',')}`);
}
if (cellularSamples.join(',') !== 'densitySharedSampleMacro(,densitySharedSampleBase(,densitySharedSampleBase(') {
  throw new Error(`Cellular static sample budget changed: ${cellularSamples.join(',')}`);
}
const evaluatorFunctions = [...recipeV2Closure.matchAll(/fn\s+densityV2Evaluate([A-Za-z]+)\s*\(/g)].map((match) => match[1]).sort();
if (evaluatorFunctions.join(',') !== 'Cellular,Cumulus,Stratiform') {
  throw new Error(`Recipe V2 W8 evaluator set changed: ${evaluatorFunctions.join(',')}`);
}
if (!recipeV2PipelineSource.includes('createBindGroupLayout')
  || recipeV2PipelineSource.includes("layout: 'auto'")) {
  throw new Error('Recipe V2 pipeline does not use explicit layouts');
}
if (!recipeV2PipelineSource.includes('sharedFieldLayout')
  || !recipeV2PipelineSource.includes('bindGroupLayouts: [inputLayout, outputLayout, sharedFieldLayout]')
  || !recipeV2PipelineSource.includes('sharedFieldSamplingSource')
  || sharedBindingsSource.includes('textureSample')) {
  throw new Error('Recipe V2 W6 sampled bindings/source closure are not explicit');
}
for (const source of [sharedAtlasSource, sharedMacroSource]) {
  for (const forbiddenSymbol of ['cloudDensityTyped', 'evalBody', 'node_tex_voronoi', 'atomic', 'var<workgroup>']) {
    if (source.includes(forbiddenSymbol)) {
      throw new Error(`W5 generator contains forbidden Legacy/unbounded symbol: ${forbiddenSymbol}`);
    }
  }
}
if (sharedOwnerSource.includes('CloudBody') || sharedOwnerSource.includes('activeBodyCount')) {
  throw new Error('W5 shared atlas owner allocates or rebuilds from per-body state');
}
if (rendererSource.includes('new RecipeDensityV2Adapter(')
  || !rendererSource.includes('createRecipeV2: () => createRecipeDensityV2Adapter({')) {
  throw new Error('Renderer must expose Recipe V2 only through the lazy selector factory');
}
if (!producerSelectorSource.includes("if (kind === 'recipe-v2' && cacheRequired) this.ensureRecipeV2();")
  || !producerSelectorSource.includes('this.activeGeneration++;')
  || !producerSelectorSource.includes('prepareTransition(')
  || !producerSelectorSource.includes('encodeTransition(')
  || !producerSelectorSource.includes('commitTransition()')) {
  throw new Error('Recipe V2 lazy creation or atomic promotion protocol is incomplete');
}
if (!rendererSource.includes('densityConsumerProducerGeneration === producerSelection.activeGeneration')
  || !rendererSource.includes('densityProducerSelector.commitTransition();')) {
  throw new Error('Density consumers do not key bindings and promotion by Producer identity');
}
for (const resource of ['frameBuffer', 'bodyBuffer', 'recipeBuffer', 'textures', 'outputBindGroups']) {
  if (!recipeV2AdapterSource.includes(resource)) {
    throw new Error(`Recipe V2 Adapter is missing owned resource: ${resource}`);
  }
}
for (const contract of [
  'DENSITY_V2_MAX_TILE_MASK_TILES = 262_144',
  'DENSITY_V2_MAX_TILE_MASK_BYTES = 1_048_576',
  "return 'disabled-budget-tiles'",
  'verifyDensityV2TileMaskNoFalseNegatives',
]) {
  if (!recipeV2TileMaskSource.includes(contract)) {
    throw new Error(`Recipe V2 tile-mask contract is missing: ${contract}`);
  }
}
if (!recipeV2AdapterSource.includes('createMaskBuffer(4)')
  || !recipeV2AdapterSource.includes('forceDenseTileMask')
  || !recipeV2AdapterSource.includes('tileMask: this.tileMaskStats()')) {
  throw new Error('Recipe V2 Adapter does not own the lazy mask resource and diagnostics');
}

console.log('density pipeline source closures are isolated');
