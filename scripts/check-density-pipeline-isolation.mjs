import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const noise = readFileSync(resolve(root, 'shaders/noise.wgsl'), 'utf8');
const manifestSource = readFileSync(resolve(root, 'src/rendering/densityShaderSources.ts'), 'utf8');
const rendererSource = readFileSync(resolve(root, 'src/renderer.ts'), 'utf8');
const managerSource = readFileSync(resolve(root, 'src/rendering/densityQualityPipelines.ts'), 'utf8');
const paramsSource = readFileSync(resolve(root, 'src/params.ts'), 'utf8');
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

const noiseCommon = before(noise, '// VORONOI (Blender exact path for F1)');
const noiseLegacyVoronoi = noise.slice(markerIndex(noise, '// VORONOI (Blender exact path for F1)'));
const abi = before(cloud, 'struct VSOut {');
const vertex = between(cloud, 'struct VSOut {', 'fn mapRange(');
const helpers = between(cloud, 'fn mapRange(', 'fn sampleDensityTyped(');
const cacheSampling = between(cloud, 'fn sampleDensityTyped(', 'struct DensityType {');
const legacyEvaluator = between(cloud, 'struct DensityType {', 'fn boxMin()');
const spatial = between(cloud, 'fn boxMin()', 'struct HitInfo {');
const renderPrefix = between(cloud, 'fn boxMin()', 'fn detailNoise(');
const hybridDetail = between(cloud, 'fn detailNoise(', 'fn applyEdgeShaping(');
const edge = between(cloud, 'fn applyEdgeShaping(', 'fn dbgSphere(');
const debug = between(cloud, 'fn dbgSphere(', 'fn densityAtTyped(');
const renderTail = between(
  cloud,
  '// Accumulated optical depth toward the sun (raw, not yet attenuated).',
  '// Density Cache Compute',
);
const groundShadow = cloud.slice(markerIndex(cloud, '@compute @workgroup_size(8, 8, 1)'));
const cacheEntry = between(cloud, '// Density Cache Compute', '@compute @workgroup_size(8, 8, 1)');

const cachedAdapter = between(manifestSource, 'const cachedQualityAdapter', 'const hybridQualityAdapter');
const hybridAdapter = between(manifestSource, 'const hybridQualityAdapter', 'const realtimeQualityAdapter');
const realtimeAdapter = between(manifestSource, 'const realtimeQualityAdapter', "fragments.set('quality-cached'");

const cached = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, edge, debug, cachedAdapter, renderTail, groundShadow].join('\n');
const hybrid = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, hybridDetail, edge, debug, hybridAdapter, renderTail, groundShadow].join('\n');
const realtime = [noiseCommon, noiseLegacyVoronoi, abi, vertex, helpers, legacyEvaluator, ...genusSources, renderPrefix, edge, debug, realtimeAdapter, renderTail, groundShadow].join('\n');
const legacyCache = [noiseCommon, noiseLegacyVoronoi, abi, helpers, spatial, legacyEvaluator, ...genusSources, debug, cacheEntry].join('\n');

const forbidden = ['fn cloudDensityTyped(', 'fn evalBody(', 'fn evalGenusDensity(', 'fn node_tex_voronoi_f1_4d_distance(', 'fn cs('];
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid]]) {
  for (const symbol of forbidden) {
    if (source.includes(symbol)) throw new Error(`${kind} source contains forbidden symbol: ${symbol}`);
  }
}

if (cached.includes('fn detailNoise(')) throw new Error('cached source contains Hybrid detail');
if (!hybrid.includes('fn detailNoise(')) throw new Error('hybrid source is missing bounded detail');
if (!realtime.includes('fn cloudDensityTyped(') || realtime.includes('fn sampleDensityTyped(')) {
  throw new Error('realtime source closure is not direct-density-only');
}
if (!legacyCache.includes('fn cs(') || legacyCache.includes('@fragment') || legacyCache.includes('fn csGroundShadow(')) {
  throw new Error('Legacy cache source closure contains a render/ground-shadow entry or lacks cache compute');
}
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid], ['realtime', realtime], ['legacy-cache', legacyCache]]) {
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
if (realtime.includes('textureDimensions(densityTex0')) {
  throw new Error('Ground-shadow source derives step size from a density-cache texture');
}
if (!realtime.includes('params.g.densityResolution') || !paramsSource.includes('densityResolution: 59')) {
  throw new Error('Ground-shadow density resolution uniform contract is incomplete');
}

console.log('density pipeline source closures are isolated');
