import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const noise = readFileSync(resolve(root, 'shaders/noise.wgsl'), 'utf8');
const manifestSource = readFileSync(resolve(root, 'src/rendering/densityShaderSources.ts'), 'utf8');

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
const abi = before(cloud, 'struct VSOut {');
const vertex = between(cloud, 'struct VSOut {', 'fn mapRange(');
const helpers = between(cloud, 'fn mapRange(', 'fn sampleDensityTyped(');
const cacheSampling = between(cloud, 'fn sampleDensityTyped(', 'struct DensityType {');
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

const cachedAdapter = between(manifestSource, 'const cachedQualityAdapter', 'const hybridQualityAdapter');
const hybridAdapter = between(manifestSource, 'const hybridQualityAdapter', 'const realtimeQualityAdapter');

const cached = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, edge, debug, cachedAdapter, renderTail, groundShadow].join('\n');
const hybrid = [noiseCommon, abi, vertex, helpers, cacheSampling, renderPrefix, hybridDetail, edge, debug, hybridAdapter, renderTail, groundShadow].join('\n');

const forbidden = ['fn cloudDensityTyped(', 'fn evalBody(', 'fn evalGenusDensity(', 'fn node_tex_voronoi_f1_4d_distance(', 'fn cs('];
for (const [kind, source] of [['cached', cached], ['hybrid', hybrid]]) {
  for (const symbol of forbidden) {
    if (source.includes(symbol)) throw new Error(`${kind} source contains forbidden symbol: ${symbol}`);
  }
}

if (cached.includes('fn detailNoise(')) throw new Error('cached source contains Hybrid detail');
if (!hybrid.includes('fn detailNoise(')) throw new Error('hybrid source is missing bounded detail');
if (!manifestSource.includes("'recipe-v2'")) throw new Error('Recipe V2 manifest guard is missing');
if (!manifestSource.includes("forbiddenFragments: ['noise-legacy-voronoi', 'legacy-evaluator'")) {
  throw new Error('Recipe V2/quality manifest does not explicitly forbid the Legacy evaluator');
}

console.log('density pipeline source closures are isolated');
