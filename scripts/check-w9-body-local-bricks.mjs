import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const contracts = read('src/density/contracts.ts');
const bricks = read('src/density/bodyLocalBricks.ts');
const cache = read('src/density/bodyLocalBrickCache.ts');
const adapter = read('src/density/recipeDensityV2Adapter.ts');
const pipeline = read('src/density/recipeV2Pipeline.ts');
const brickShader = read('shaders/density-v2-brick.wgsl');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const quality = read('src/rendering/densityQualityPipelines.ts');
const params = read('src/params.ts');
const cloud = read('shaders/cloud.wgsl');
const fixtures = read('src/density/bodyLocalBrickFixtures.ts');
const manifest = read('src/densityBenchmarkManifest.ts');
const benchmark = read('src/densityBenchmark.ts');
const gate = read('docs/evidence/w9-body-local-bricks/build-gate.mjs');

for (const token of [
  'DENSITY_BRICK_RECORD_STRIDE = 160',
  'DENSITY_BRICK_RECORD_BYTES = DENSITY_BRICK_RECORD_STRIDE * MAX_BODIES',
  'DENSITY_BRICK_CANDIDATE_LIMIT = 4',
  'DENSITY_BRICK_CANDIDATE_ENTRY_BYTES = 8',
  "id: 'r16float-160'",
  "id: 'rgba16float-96'",
  "id: 'rgba8unorm-128-diagnostic'",
  '160 ** 3 * 2 * 2',
  '96 ** 3 * 8 * 2',
  '128 ** 3 * 4 * 2',
]) {
  if (!bricks.includes(token)) throw new Error(`W9 brick contract missing: ${token}`);
}

if (!bricks.includes('const occupancy = new Uint8Array(pagesPerAxis ** 3)')
  || !bricks.includes('firstFit(occupancy')
  || !bricks.includes('tryPackTargetEdges')
  || !bricks.includes('trialTargets.set')
  || !bricks.includes('origin % 8') && !fixtures.includes('origin % 8')) {
  throw new Error('W9 deterministic page allocator or downgrade fixture is incomplete');
}

if (!fixtures.includes("candidates.stats.grid.join('x') !== '12x12x24'")
  || !fixtures.includes('candidates.stats.entryCount !== 3_456')
  || !fixtures.includes('candidates.stats.bytes !== 27_648')
  || !fixtures.includes('candidates.stats.maxCandidates !== 5')) {
  throw new Error('W9 default candidate grid or five-body overflow fixture is incomplete');
}

if ((brickShader.match(/@compute\b/g) ?? []).length !== 1
  || (brickShader.match(/textureStore\(/g) ?? []).length !== 1
  || brickShader.includes('for (var bodyIndex')
  || brickShader.includes('DENSITY_V2_MAX_BODIES; bodyIndex')) {
  throw new Error('W9 brick shader must have one entry/store and no all-body evaluator loop');
}

const hierarchyStart = shaderSources.indexOf('const hierarchicalSampling');
const hierarchyEnd = shaderSources.indexOf('const hierarchicalCachedQualityAdapter');
const hierarchy = shaderSources.slice(hierarchyStart, hierarchyEnd);
if (hierarchyStart < 0 || hierarchyEnd < 0
  || !hierarchy.includes('for (var i = 0u; i < 4u; i++)')
  || !hierarchy.includes('fn densityBrickCoarseFallback(pos : vec3f) -> vec4f')
  || !hierarchy.includes('@binding(6) var<uniform> densityBrickRecords')
  || !hierarchy.includes('fn sampleDensityBrickRecord(recordIndex : u32, generation : u32, pos : vec3f) -> vec4f')
  || !hierarchy.includes('return densityBrickCoarseFallback(pos);')
  || hierarchy.includes('let coarse = sampleDensityTyped(pos);')
  || !hierarchy.includes('densityBrickCandidateIndex(uvw)')
  || !hierarchy.includes('if (count == 0u) { return vec4f(0.0); }')
  || !hierarchy.includes('if (count == 1u)')
  || !hierarchy.includes('fn sampleDensityBrickAtlas(atlasUv : vec3f) -> f32')
  || hierarchy.includes('MAX_BODIES')
  || hierarchy.includes('softDensity + coarse')
  || hierarchy.includes('coarse + softDensity')) {
  throw new Error('W9 hierarchical render closure is not fixed-K/deferred-coarse/replace-only');
}

if (!cache.includes("label: 'density-body-local-records'")
  || !cache.includes('usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST')) {
  throw new Error('W9 compact brick record table must use the uniform read path');
}

if (!pipeline.includes('async createBrickPipeline(nextWorkgroup)')
  || !adapter.includes('createPipelineResources: (workgroup) => this.pipelineResources.createBrickPipeline(workgroup)')
  || !cache.includes("this.reason = 'hierarchical-pipeline-compiling'")
  || !quality.includes('if (hierarchicalState.lifecycle === \'idle\') this.startHierarchicalCreation(kind)')) {
  throw new Error('W9 producer or render bundle creation is not lazy');
}

if (!cache.includes('brick-prepare-failed:')
  || !cache.includes("this.lifecycle = 'failed'")
  || !cache.includes('this.pendingEncode = false')) {
  throw new Error('W9 CPU builder failure does not preserve a safe global-only fallback');
}

const eagerStart = pipeline.indexOf('const pipelineCreateCpuMs = performance.now() - pipelineStarted;');
const eagerEnd = pipeline.indexOf('  return {', eagerStart);
const globalPipelineCreation = pipeline.slice(eagerStart, eagerEnd);
if (globalPipelineCreation.includes('createBrickPipelineResources(')) {
  throw new Error('Global-only Recipe V2 creation eagerly creates a brick pipeline');
}

if (!adapter.includes('pass.end();\n    const brickRan = this.bricks.encode(')) {
  throw new Error('W9 cache update order is not coarse then brick');
}

if (!manifest.includes('w9--${sceneId}--legacy--global-only--${quality}--${view}')
  || !manifest.includes('w9--${sceneId}--recipe-v2--${storage}--${quality}--${view}')
  || !manifest.includes("'w9-brick-lod-sweep', 'w9-brick-overflow', 'w9-thin-ridge-proxy'")) {
  throw new Error('W9 Legacy/global-only/hierarchical A/B manifest matrix is incomplete');
}

if (!manifest.includes('body.base = overflowSupportBase')
  || !manifest.includes('body.thickness = overflowSupportThickness')) {
  throw new Error('W9 browser overflow scene does not align all five bodies in 3D support space');
}

if (!manifest.includes('GROUND_SHADOW_MODE.transmittance')
  || !benchmark.includes('requiresGroundShadowTiming(active.definition)')
  || !benchmark.includes('active.samples.shadow.length >= manifest.minimumGpuSamples')
  || !benchmark.includes('(result.gpuTiming.shadow?.count ?? 0) >= manifest.minimumGpuSamples')) {
  throw new Error('W9 benchmark does not require the 60-sample ground-shadow timing range');
}

const globalGateStart = gate.indexOf('if (globalOnly)');
const globalGateEnd = gate.indexOf('if (hierarchical)', globalGateStart);
const globalGate = gate.slice(globalGateStart, globalGateEnd);
if (globalGateStart < 0 || globalGateEnd < 0
  || globalGate.includes('sampleId')
  || !globalGate.includes('bricks.residentBytes !== 0')
  || !globalGate.includes('bricks.dispatchCount !== 0')) {
  throw new Error('W9 global-only gate must inspect current resources/work, not historical counters');
}

if (!gate.includes('const failedMetrics = [')
  || !gate.includes('cloud median ${cloudMedianRatio.toFixed(3)}x > 1.250x')
  || !gate.includes('ground-shadow median ${shadowMedianRatio.toFixed(3)}x > 1.350x')) {
  throw new Error('W9 performance report must identify each breached metric and threshold');
}

if (!contracts.includes('contractVersion: 2')
  || !contracts.includes('hierarchical: DensityHierarchicalCacheOutput | null')
  || !contracts.includes('recordBuffer: GPUBuffer')
  || !contracts.includes('candidateBuffer: GPUBuffer')) {
  throw new Error('DensityCacheOutput v2 hierarchical read-only contract is incomplete');
}

const offsets = params.slice(params.indexOf('export const PARAM_OFFSETS'), params.indexOf('export const PARAMS_FLOAT_COUNT'));
if (!params.includes('densityStorageMode: number')
  || !params.includes('densityStorageMode: 0')
  || offsets.includes('densityStorageMode')
  || cloud.includes('densityStorageMode')) {
  throw new Error('densityStorageMode must remain CPU-only with a global-only default');
}

console.log('W9 body-local atlas budgets, ABI, allocator, fixed-K fallback, lazy lifecycle and source closures passed');
