import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const detailSource = read('src/rendering/densityDetailResources.ts');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const qualityPipelines = read('src/rendering/densityQualityPipelines.ts');
const selector = read('src/density/densityProducerSelector.ts');
const assert = (value, message) => { if (!value) throw new Error(message); };
function blockStartingAt(source, token) {
  const start = source.indexOf(token);
  assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${token}`);
}

assert(detailSource.includes('export interface DensityDetailResources'), 'missing consumer contract');
assert(detailSource.includes('layoutVersion: 1'), 'missing layout version');
assert(!detailSource.includes('storageView'), 'storage view leaked');
assert(!detailSource.includes('Pipeline'), 'pipeline leaked');
assert(renderer.includes('previousDetailGeneration'), 'missing generation tracking');
assert(renderer.includes('cloudFrameOutput?.markDiscontinuity()'), 'missing TAAU invalidation');
assert(!renderer.includes('getSharedFieldDiagnostics'), 'renderer directly consumes producer diagnostics');
assert(renderer.includes('densityProducerSelector.getActiveDetailResources()'), 'renderer does not consume the narrow selector provider');
assert(selector.includes("import type { DensityDetailResources } from '../rendering/densityDetailResources';"), 'selector narrow contract dependency is not type-only');
assert(!selector.includes("import { createDensityDetailResources"), 'selector creates a runtime density/rendering dependency');
const selectorProvider = blockStartingAt(selector, 'getActiveDetailResources(): DensityDetailResources');
assert(selectorProvider.includes('this.active.getSharedFieldDiagnostics()'), 'selector boundary does not own diagnostics access');
assert(selectorProvider.includes('this.createDetailResources('), 'selector boundary does not use the injected narrowing adapter');
assert(detailSource.includes("import type { DensitySharedFieldDiagnostics }"), 'detail narrowing input dependency is not type-only');
const detailStart = cloud.indexOf('fn applyBoundedDetailStage(');
const detailEnd = cloud.indexOf('fn applyEdgeShaping(');
const sharedAbi = cloud.slice(0, cloud.indexOf('struct VSOut {'));
const hybridDetail = cloud.slice(detailStart, detailEnd);
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
const sample = blockStartingAt(cloud, 'fn sampleDetailField(');
assert(detailStart >= 0 && detailEnd > detailStart, 'Hybrid detail slice missing');
assert(hybridDetail.startsWith('fn applyBoundedDetailStage('), 'stage is not the Hybrid detail slice start');
for (const token of [
  'struct DetailResourceControlsGPU', '@group(3) @binding(4) var detailSampler : sampler',
  '@group(3) @binding(5) var detailBaseTex : texture_3d<f32>',
  '@group(3) @binding(6) var detailFieldTex : texture_3d<f32>',
  '@group(3) @binding(7) var<uniform> detailResourceControls',
]) {
  assert(hybridDetail.includes(token), `detail ABI is outside Hybrid detail: ${token}`);
  assert(!sharedAbi.includes(token), `detail ABI leaked into shared ABI: ${token}`);
}
assert(stage.includes('sampleDetailField(pos, evaluation)'), 'stage does not reach detail sampling');
assert(sample.includes('textureSampleLevel(detailBaseTex, detailSampler'), 'detail helper misses Base reachability');
assert(sample.includes('textureSampleLevel(detailFieldTex, detailSampler'), 'detail helper misses Detail reachability');
assert(!cloud.includes('fn detailAbiReachabilityGuard('), 'temporary ABI guard remains');
assert(!cloud.includes('fn detailNoise('), 'legacy detail noise remains');
assert(shaderSources.includes("['hybrid-detail', between(cloudSource, CLOUD_DETAIL_START, CLOUD_EDGE_START)]"), 'Hybrid detail source slice missing');
assert(shaderSources.includes("'cloud-render-prefix', 'edge-shaping', 'debug-shapes', 'quality-cached'"), 'Cached source includes Hybrid detail');
assert(shaderSources.includes("'legacy-evaluator', ...genusFragmentNames, 'cloud-render-prefix', 'edge-shaping', 'debug-shapes'"), 'Realtime source includes Hybrid detail');
assert(shaderSources.includes("'cloud-render-prefix', 'hybrid-detail', 'edge-shaping', 'debug-shapes',\n          'hierarchical-cache-sampling'"), 'Hierarchical Hybrid source omits Hybrid detail');
assert(renderer.includes("const dummyDetailBaseTexture = device.createTexture({\n    size: [1, 1, 1],\n    dimension: '3d',"), 'dummy Base texture is not 3d');
assert(renderer.includes("const dummyDetailFieldTexture = device.createTexture({\n    size: [1, 1, 1],\n    dimension: '3d',"), 'dummy Detail texture is not 3d');

const groundShadowSceneEntriesStart = qualityPipelines.indexOf('const groundShadowSceneEntries');
const groundShadowSceneStart = qualityPipelines.indexOf('const groundShadowScene =');
assert(groundShadowSceneEntriesStart >= 0 && groundShadowSceneStart > groundShadowSceneEntriesStart, 'ground-shadow scene entries are not explicit');
const groundShadowSceneEntries = qualityPipelines.slice(groundShadowSceneEntriesStart, groundShadowSceneStart);
assert(groundShadowSceneEntries.includes("bundle.kind === 'cached'"), 'Cached ground-shadow scene branch missing');
assert(groundShadowSceneEntries.includes("bundle.kind === 'hybrid'"), 'Hybrid ground-shadow scene branch missing');
assert(groundShadowSceneEntries.includes('{ binding: 0, resource: { buffer: resources.cameraBuffer } }'), 'Hybrid ground-shadow scene misses camera binding 0');
assert(groundShadowSceneEntries.includes('...sharedSceneEntries'), 'ground-shadow scene misses params/presets bindings 1/4');
assert(groundShadowSceneEntries.includes('...weatherEntries'), 'Hybrid ground-shadow scene misses weather bindings 2/3');
const groundShadowScene = blockStartingAt(qualityPipelines, 'const groundShadowScene =');
assert(groundShadowScene.includes('bundle.groundShadowPipeline.getBindGroupLayout(0)'), 'ground-shadow scene is not group 0');
assert(groundShadowScene.includes('entries: groundShadowSceneEntries'), 'ground-shadow scene does not use explicit entries');
const groundShadowDensity = blockStartingAt(qualityPipelines, 'groundShadowDensity = device.createBindGroup(');
assert(groundShadowDensity.includes('bundle.groundShadowPipeline.getBindGroupLayout(1)'), 'ground-shadow density is not group 1');
assert(groundShadowDensity.includes('entries: densityEntries'), 'ground-shadow density entries drifted');
const groundShadowStore = blockStartingAt(qualityPipelines, 'const groundShadowStore =');
assert(groundShadowStore.includes('bundle.groundShadowPipeline.getBindGroupLayout(2)'), 'ground-shadow store is not group 2');
assert(groundShadowStore.includes('entries: [{ binding: 1, resource: resources.groundShadowStoreView }]'), 'ground-shadow store binding drifted');
const groundShadowDetail = blockStartingAt(qualityPipelines, 'const groundShadowDetail =');
assert(groundShadowDetail.includes("bundle.kind === 'hybrid'"), 'ground-shadow detail leaked outside Hybrid');
assert(groundShadowDetail.includes('bundle.groundShadowPipeline.getBindGroupLayout(3)'), 'ground-shadow detail is not group 3');
assert(groundShadowDetail.includes('entries: detailEntries'), 'ground-shadow detail entries drifted');
for (const token of [
  '{ binding: 4, resource: resources.detail.sampler }',
  '{ binding: 5, resource: resources.detail.baseView }',
  '{ binding: 6, resource: resources.detail.detailView }',
  '{ binding: 7, resource: { buffer: resources.detail.controlsBuffer } }',
]) {
  assert(qualityPipelines.includes(token), `ground-shadow detail misses ${token}`);
}
for (const group of [0, 1, 2, 3]) {
  assert(renderer.includes(`integrationPass.setBindGroup(${group},`), `ground-shadow integration misses group ${group}`);
}
