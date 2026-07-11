import noiseSource from '../../shaders/noise.wgsl?raw';
import cloudSource from '../../shaders/cloud.wgsl?raw';
import genusCommonSource from '../../shaders/genus/common.wgsl?raw';
import cumulusSource from '../../shaders/genus/cumulus.wgsl?raw';
import stratusSource from '../../shaders/genus/stratus.wgsl?raw';
import stratocumulusSource from '../../shaders/genus/stratocumulus.wgsl?raw';
import cumulonimbusSource from '../../shaders/genus/cumulonimbus.wgsl?raw';
import altocumulusSource from '../../shaders/genus/altocumulus.wgsl?raw';
import altostratusSource from '../../shaders/genus/altostratus.wgsl?raw';
import nimbostratusSource from '../../shaders/genus/nimbostratus.wgsl?raw';
import cirrusSource from '../../shaders/genus/cirrus.wgsl?raw';
import cirrostratusSource from '../../shaders/genus/cirrostratus.wgsl?raw';
import cirrocumulusSource from '../../shaders/genus/cirrocumulus.wgsl?raw';
import genusDispatchSource from '../../shaders/genus/dispatch.wgsl?raw';
import type { DensityQualityKind } from './densityQualityContracts';

interface DensityShaderFragment {
  readonly name: string;
  readonly source: string;
}

export interface DensityShaderSourceManifestEntry {
  readonly kind: DensityQualityKind | 'legacy-cache' | 'recipe-v2';
  readonly fragments: readonly string[];
  readonly forbiddenFragments: readonly string[];
}

function markerIndex(source: string, marker: string): number {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Density shader source marker not found: ${marker}`);
  return index;
}

function before(source: string, marker: string): string {
  return source.slice(0, markerIndex(source, marker));
}

function between(source: string, startMarker: string, endMarker: string): string {
  const start = markerIndex(source, startMarker);
  const end = markerIndex(source, endMarker);
  if (end <= start) throw new Error(`Density shader source markers out of order: ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
}

function from(source: string, marker: string): string {
  return source.slice(markerIndex(source, marker));
}

const NOISE_VORONOI_MARKER = '// VORONOI (Blender exact path for F1)';
const CLOUD_VERTEX_START = 'struct VSOut {';
const CLOUD_HELPERS_START = 'fn mapRange(';
const CLOUD_CACHE_SAMPLE_START = 'fn sampleDensityTyped(';
const CLOUD_LEGACY_EVALUATOR_START = 'struct DensityType {';
const CLOUD_SPATIAL_START = 'fn boxMin()';
const CLOUD_HIT_START = 'struct HitInfo {';
const CLOUD_DETAIL_START = 'fn detailNoise(';
const CLOUD_EDGE_START = 'fn applyEdgeShaping(';
const CLOUD_DEBUG_START = 'fn dbgSphere(';
const CLOUD_QUALITY_ADAPTER_START = 'fn densityAtTyped(';
const CLOUD_RENDER_TAIL_START = '// Accumulated optical depth toward the sun (raw, not yet attenuated).';
const CLOUD_CACHE_ENTRY_START = '// Density Cache Compute';
const CLOUD_GROUND_SHADOW_ENTRY_START = '@compute @workgroup_size(8, 8, 1)';

const genusFragments: readonly DensityShaderFragment[] = [
  { name: 'genus-common', source: genusCommonSource },
  { name: 'genus-cumulus', source: cumulusSource },
  { name: 'genus-stratus', source: stratusSource },
  { name: 'genus-stratocumulus', source: stratocumulusSource },
  { name: 'genus-cumulonimbus', source: cumulonimbusSource },
  { name: 'genus-altocumulus', source: altocumulusSource },
  { name: 'genus-altostratus', source: altostratusSource },
  { name: 'genus-nimbostratus', source: nimbostratusSource },
  { name: 'genus-cirrus', source: cirrusSource },
  { name: 'genus-cirrostratus', source: cirrostratusSource },
  { name: 'genus-cirrocumulus', source: cirrocumulusSource },
  { name: 'genus-dispatch', source: genusDispatchSource },
];

const fragments = new Map<string, string>([
  ['noise-common-edge', before(noiseSource, NOISE_VORONOI_MARKER)],
  ['noise-legacy-voronoi', from(noiseSource, NOISE_VORONOI_MARKER)],
  ['shared-abi', before(cloudSource, CLOUD_VERTEX_START)],
  ['cloud-vertex', between(cloudSource, CLOUD_VERTEX_START, CLOUD_HELPERS_START)],
  ['shared-helpers', between(cloudSource, CLOUD_HELPERS_START, CLOUD_CACHE_SAMPLE_START)],
  ['cache-sampling', between(cloudSource, CLOUD_CACHE_SAMPLE_START, CLOUD_LEGACY_EVALUATOR_START)],
  ['legacy-evaluator', between(cloudSource, CLOUD_LEGACY_EVALUATOR_START, CLOUD_SPATIAL_START)],
  ['shared-spatial', between(cloudSource, CLOUD_SPATIAL_START, CLOUD_HIT_START)],
  ['cloud-render-prefix', between(cloudSource, CLOUD_SPATIAL_START, CLOUD_DETAIL_START)],
  ['hybrid-detail', between(cloudSource, CLOUD_DETAIL_START, CLOUD_EDGE_START)],
  ['edge-shaping', between(cloudSource, CLOUD_EDGE_START, CLOUD_DEBUG_START)],
  ['debug-shapes', between(cloudSource, CLOUD_DEBUG_START, CLOUD_QUALITY_ADAPTER_START)],
  ['cloud-render-tail', between(cloudSource, CLOUD_RENDER_TAIL_START, CLOUD_CACHE_ENTRY_START)],
  ['legacy-cache-entry', between(cloudSource, CLOUD_CACHE_ENTRY_START, CLOUD_GROUND_SHADOW_ENTRY_START)],
  ['ground-shadow-entry', from(cloudSource, CLOUD_GROUND_SHADOW_ENTRY_START)],
  ...genusFragments.map(({ name, source }) => [name, source] as const),
]);

const cachedQualityAdapter = /* wgsl */ `
fn densityAtTyped(pos : vec3f) -> vec4f {
  let s = sampleDensityTyped(pos);
  return vec4f(applyEdgeShaping(max(s.x, 0.0), s.y, s.z, s.w, pos), s.y, s.z, s.w);
}

fn densityAt(pos : vec3f) -> f32 {
  return densityAtTyped(pos).x;
}
`;

const hybridQualityAdapter = /* wgsl */ `
fn densityAtTyped(pos : vec3f) -> vec4f {
  let s = sampleDensityTyped(pos);
  var base = s.x;
  if (base > 0.01 && params.g.detailStrength > 0.0001) {
    base = base * (1.0 + params.g.detailStrength * detailNoise(pos));
  }
  return vec4f(applyEdgeShaping(max(base, 0.0), s.y, s.z, s.w, pos), s.y, s.z, s.w);
}

fn densityAt(pos : vec3f) -> f32 {
  return densityAtTyped(pos).x;
}
`;

const realtimeQualityAdapter = /* wgsl */ `
fn densityAtTyped(pos : vec3f) -> vec4f {
  let dt = cloudDensityTyped(pos);
  return vec4f(applyEdgeShaping(dt.d, dt.idx, dt.idx2, dt.w2, pos), dt.idx, dt.idx2, dt.w2);
}

fn densityAt(pos : vec3f) -> f32 {
  return densityAtTyped(pos).x;
}
`;

fragments.set('quality-cached', cachedQualityAdapter);
fragments.set('quality-hybrid', hybridQualityAdapter);
fragments.set('quality-realtime', realtimeQualityAdapter);

const genusFragmentNames = genusFragments.map((fragment) => fragment.name);

export const DENSITY_SHADER_SOURCE_MANIFEST: Readonly<Record<DensityQualityKind | 'legacy-cache' | 'recipe-v2', DensityShaderSourceManifestEntry>> = Object.freeze({
  cached: {
    kind: 'cached',
    fragments: [
      'noise-common-edge', 'shared-abi', 'cloud-vertex', 'shared-helpers', 'cache-sampling',
      'cloud-render-prefix', 'edge-shaping', 'debug-shapes', 'quality-cached',
      'cloud-render-tail', 'ground-shadow-entry',
    ],
    forbiddenFragments: ['noise-legacy-voronoi', 'legacy-evaluator', ...genusFragmentNames, 'legacy-cache-entry'],
  },
  hybrid: {
    kind: 'hybrid',
    fragments: [
      'noise-common-edge', 'shared-abi', 'cloud-vertex', 'shared-helpers', 'cache-sampling',
      'cloud-render-prefix', 'hybrid-detail', 'edge-shaping', 'debug-shapes', 'quality-hybrid',
      'cloud-render-tail', 'ground-shadow-entry',
    ],
    forbiddenFragments: ['noise-legacy-voronoi', 'legacy-evaluator', ...genusFragmentNames, 'legacy-cache-entry'],
  },
  realtime: {
    kind: 'realtime',
    fragments: [
      'noise-common-edge', 'noise-legacy-voronoi', 'shared-abi', 'cloud-vertex', 'shared-helpers',
      'legacy-evaluator', ...genusFragmentNames, 'cloud-render-prefix', 'edge-shaping', 'debug-shapes',
      'quality-realtime', 'cloud-render-tail', 'ground-shadow-entry',
    ],
    forbiddenFragments: ['cache-sampling', 'hybrid-detail', 'legacy-cache-entry'],
  },
  'legacy-cache': {
    kind: 'legacy-cache',
    fragments: [
      'noise-common-edge', 'noise-legacy-voronoi', 'shared-abi', 'shared-helpers', 'shared-spatial',
      'legacy-evaluator', ...genusFragmentNames, 'debug-shapes', 'legacy-cache-entry',
    ],
    forbiddenFragments: [
      'cloud-vertex', 'cache-sampling', 'hybrid-detail', 'edge-shaping',
      'quality-cached', 'quality-hybrid', 'quality-realtime', 'cloud-render-tail', 'ground-shadow-entry',
    ],
  },
  'recipe-v2': {
    kind: 'recipe-v2',
    fragments: ['shared-abi', 'shared-helpers', 'shared-spatial'],
    forbiddenFragments: ['noise-legacy-voronoi', 'legacy-evaluator', ...genusFragmentNames, 'legacy-cache-entry'],
  },
});

function assemble(entry: DensityShaderSourceManifestEntry): string {
  for (const forbidden of entry.forbiddenFragments) {
    if (entry.fragments.includes(forbidden)) {
      throw new Error(`Density shader manifest ${entry.kind} includes forbidden fragment ${forbidden}`);
    }
  }
  return entry.fragments.map((name) => {
    const source = fragments.get(name);
    if (source === undefined) throw new Error(`Density shader fragment not found: ${name}`);
    return `// --- density-fragment:${name} ---\n${source}`;
  }).join('\n');
}

export function buildDensityQualityShaderSource(kind: DensityQualityKind): string {
  return assemble(DENSITY_SHADER_SOURCE_MANIFEST[kind]);
}

export function buildLegacyDensityCacheShaderSource(): string {
  return assemble(DENSITY_SHADER_SOURCE_MANIFEST['legacy-cache']);
}

export function densityShaderSourceLength(kind: DensityQualityKind | 'legacy-cache'): number {
  return DENSITY_SHADER_SOURCE_MANIFEST[kind].fragments.reduce((total, name) => {
    return total + (fragments.get(name)?.length ?? 0);
  }, 0);
}
