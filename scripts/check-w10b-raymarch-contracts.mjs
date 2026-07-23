import { createHash, webcrypto } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assetPath = resolve(root, 'src/assets/stbn.bin');
const noticePath = resolve(root, 'src/assets/STBN-NOTICE.md');
const expectedStbnBytes = 128 * 128 * 64;
const expectedStbnSha256 = '51f52f21e5578384585050390821a0a486dcb81e11a716fa7b92fbb6515ba852';

const params = read('src/params.ts');
const cloud = read('shaders/cloud.wgsl');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const loader = read('src/rendering/stbnTexture.ts');
const importer = read('scripts/import-stbn-asset.mjs');
const quality = read('src/rendering/densityQualityPipelines.ts');
const qualityContracts = read('src/rendering/densityQualityContracts.ts');
const renderer = read('src/renderer.ts');
const gui = read('src/gui.ts');
const i18n = read('src/i18n.ts');
const benchmark = read('src/densityBenchmark.ts');
const main = read('src/main.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`W10B raymarch contract failed: ${message}`);
}

function assertIncludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(source.includes(token), `${scope} is missing ${JSON.stringify(token)}`);
  }
}

function assertExcludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(!source.includes(token), `${scope} must not contain ${JSON.stringify(token)}`);
  }
}

function blockStartingAt(source, token, scope) {
  const start = source.indexOf(token);
  assert(start >= 0, `${scope} start token is missing: ${JSON.stringify(token)}`);
  const open = source.indexOf('{', start + token.length);
  assert(open >= 0, `${scope} has no opening brace`);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`W10B raymarch contract failed: ${scope} has no closing brace`);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function integerConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} = (\\d+);`));
  assert(match, `integer constant ${name} is missing`);
  return Number(match[1]);
}

async function importTranspiled(source) {
  const javascript = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

// ---------------------------------------------------------------------------
// STBN provenance, immutable bytes, and real loader behavior.
// ---------------------------------------------------------------------------

assert(existsSync(assetPath), 'src/assets/stbn.bin is missing');
assert(statSync(assetPath).size === expectedStbnBytes, 'stbn.bin is not 128*128*64 bytes');
const stbnBytes = readFileSync(assetPath);
const stbnDigest = createHash('sha256').update(stbnBytes).digest('hex');
assert(stbnDigest === expectedStbnSha256, `stbn.bin SHA-256 changed to ${stbnDigest}`);

assert(existsSync(noticePath), 'src/assets/STBN-NOTICE.md is missing');
const notice = readFileSync(noticePath, 'utf8');
assertIncludes(notice, [
  '128 x 128 x 64',
  expectedStbnSha256,
  'three-geospatial',
  'b012ad06d858fc035d88aacfd73f092f93c994e4',
  'Copyright (c) 2024 Shota Matsuda',
  'MIT',
  'Permission is hereby granted',
  '1 x 1 x 1 dummy texture',
  'IGN fallback',
], 'STBN notice/provenance');
assert(existsSync(resolve(root, 'public/STBN-NOTICE.txt')), 'deployable STBN MIT notice is missing');
assertIncludes(importer, [
  "const upstreamRevision = 'b012ad06d858fc035d88aacfd73f092f93c994e4'",
  'raw.githubusercontent.com/takram-design-engineering/three-geospatial',
  'process.env.STBN_SOURCE',
  'createHash(\'sha256\')',
  'digest !== expectedSha256',
], 'reproducible pinned STBN importer');

assertIncludes(loader, [
  "import stbnUrl from '../assets/stbn.bin?url'",
  'export const STBN_WIDTH = 128',
  'export const STBN_HEIGHT = 128',
  'export const STBN_DEPTH = 64',
  'STBN_WIDTH * STBN_HEIGHT * STBN_DEPTH',
  `export const STBN_SHA256 = '${expectedStbnSha256}'`,
  "dimension: '3d'",
  "format: 'r8unorm'",
  'data.byteLength !== STBN_BYTE_LENGTH',
  "crypto.subtle.digest('SHA-256', data)",
  'digest !== STBN_SHA256',
  "createTexture(device, 1, 1, 1, 'w10b-stbn-dummy')",
  'new Uint8Array([0])',
  'fallbackReason = error instanceof Error ? error.message : String(error)',
], 'STBN loader and dummy fallback');

const originalFetch = globalThis.fetch;
const originalGpuTextureUsage = globalThis.GPUTextureUsage;
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.GPUTextureUsage = Object.freeze({ TEXTURE_BINDING: 0x04, COPY_DST: 0x08 });

class MockTexture {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.destroyCalls = 0;
    this.views = [];
  }

  createView(descriptor) {
    const view = Object.freeze({ descriptor, texture: this });
    this.views.push(view);
    return view;
  }

  destroy() {
    this.destroyCalls++;
  }
}

class MockDevice {
  constructor() {
    this.textures = [];
    this.writes = [];
    this.queue = { writeTexture: (...args) => this.writes.push(args) };
  }

  createTexture(descriptor) {
    const texture = new MockTexture(descriptor);
    this.textures.push(texture);
    return texture;
  }
}

try {
  const loaderFixture = loader.replace(
    /^import stbnUrl from .*;$/m,
    "const stbnUrl = 'fixture://stbn';",
  );
  const { createStbnTextureResources } = await importTranspiled(loaderFixture);

  const successDevice = new MockDevice();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => Uint8Array.from(stbnBytes).buffer,
  });
  const success = await createStbnTextureResources(successDevice);
  assert(success.available === true, 'valid STBN data did not activate the texture');
  assert(success.fallbackReason === '', 'valid STBN data reported a fallback');
  assert(success.byteLength === expectedStbnBytes, 'valid STBN byte accounting is wrong');
  assert(successDevice.textures.length === 1, 'valid STBN load allocated an unexpected texture count');
  assert(
    JSON.stringify(successDevice.textures[0].descriptor.size) === JSON.stringify([128, 128, 64]),
    'valid STBN load used the wrong dimensions',
  );
  assert(successDevice.textures[0].descriptor.format === 'r8unorm', 'valid STBN load used the wrong format');
  assert(successDevice.writes.length === 1, 'valid STBN data was not uploaded exactly once');
  assert(success.view.descriptor.dimension === '3d', 'STBN sampled view is not 3D');
  success.destroy();
  assert(successDevice.textures[0].destroyCalls === 1, 'STBN resource destruction is not owned');

  const fallbackDevice = new MockDevice();
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const fallback = await createStbnTextureResources(fallbackDevice);
  assert(fallback.available === false, 'failed STBN fetch did not select fallback');
  assert(fallback.fallbackReason === 'http-404', 'failed STBN fetch lost its fallback reason');
  assert(fallback.byteLength === 0, 'failed STBN fetch claimed asset bytes');
  assert(
    JSON.stringify(fallbackDevice.textures[0].descriptor.size) === JSON.stringify([1, 1, 1]),
    'STBN fallback is not a 1*1*1 dummy texture',
  );
  assert(fallbackDevice.writes[0][1][0] === 0, 'STBN dummy texture is not initialized deterministically');
  fallback.destroy();
  assert(fallbackDevice.textures[0].destroyCalls === 1, 'STBN dummy texture leaked');
} finally {
  globalThis.fetch = originalFetch;
  if (originalGpuTextureUsage === undefined) delete globalThis.GPUTextureUsage;
  else globalThis.GPUTextureUsage = originalGpuTextureUsage;
}

// ---------------------------------------------------------------------------
// Params ABI: the original Globals/Body ABI is frozen; W10B is tail-only.
// ---------------------------------------------------------------------------

const maxBodies = integerConstant(params, 'MAX_BODIES');
const bodyBase = integerConstant(params, 'BODY_BASE');
const bodyStride = integerConstant(params, 'BODY_STRIDE');
const marchFloatCount = integerConstant(params, 'WORLD_MARCH_FLOAT_COUNT');
const supportStride = integerConstant(params, 'BODY_SUPPORT_STRIDE');
assert(maxBodies === 12, 'MAX_BODIES changed');
assert(bodyBase === 60, 'BODY_BASE must remain 60');
assert(bodyStride === 20, 'BODY_STRIDE must remain 20');
assert(marchFloatCount === 20, 'WorldMarchGPU must remain five vec4 lanes');
assert(supportStride === 8, 'BodySupportGPU must remain two vec4 lanes');
assertIncludes(params, [
  'export const WORLD_MARCH_BASE = BODY_BASE + MAX_BODIES * BODY_STRIDE',
  'export const BODY_SUPPORT_BASE = WORLD_MARCH_BASE + WORLD_MARCH_FLOAT_COUNT',
  'export const MAX_BODY_SUPPORTS = MAX_BODIES * 2',
  'export const PARAMS_FLOAT_COUNT = BODY_SUPPORT_BASE + MAX_BODY_SUPPORTS * BODY_SUPPORT_STRIDE',
  'const o = BODY_BASE + i * BODY_STRIDE',
], 'tail-only Params ABI');
const marchBase = bodyBase + maxBodies * bodyStride;
const supportBase = marchBase + marchFloatCount;
const maxSupports = maxBodies * 2;
const paramsFloatCount = supportBase + maxSupports * supportStride;
assert(marchBase === 300 && supportBase === 320 && paramsFloatCount === 512, 'computed Params tail layout changed');

const packWorldMarchSource = blockStartingAt(params, 'export function packWorldMarch(', 'packWorldMarch');
assertIncludes(packWorldMarchSource, [
  'const o = WORLD_MARCH_BASE',
  'dst[o + 0] = params.worldStepEnabled ? 1 : 0',
  'Number.isFinite(params.worldStepMaxIterations)',
  'Math.min(512, maxIterations)',
  'dst[o + 2] = minStep',
  'dst[o + 3] = maxStep',
  'Number.isFinite(params.worldStepMaxRayDistanceMeters)',
  'dst[o + 4] = Math.max(minStep, maxRayDistance)',
  'Number.isFinite(params.worldStepPerspectiveScale)',
  'dst[o + 5] = Math.max(0, perspectiveScale)',
  'normalizedSceneScale(params).horizontalMetersPerWorldUnit',
  'normalizedSceneScale(params).verticalMetersPerWorldUnit',
  'dst[o + 10] = params.stochasticSampling ? 1 : 0',
  'dst[o + 11] = options.stbnAvailable ? 1 : 0',
  'const supportCount = Math.min(options.supports.length, MAX_BODY_SUPPORTS)',
  'const supportOffset = BODY_SUPPORT_BASE + i * BODY_SUPPORT_STRIDE',
  'dst[supportOffset + 3] = 1',
], 'world-march packing');

const packingFixtureSource = `
const WORLD_MARCH_BASE = ${marchBase};
const WORLD_MARCH_FLOAT_COUNT = ${marchFloatCount};
const BODY_SUPPORT_BASE = ${supportBase};
const BODY_SUPPORT_STRIDE = ${supportStride};
const MAX_BODY_SUPPORTS = ${maxSupports};
const normalizedSceneScale = (value) => ({
  horizontalMetersPerWorldUnit: value.horizontalMetersPerWorldUnit,
  verticalMetersPerWorldUnit: value.verticalMetersPerWorldUnit,
});
${packWorldMarchSource}
`;
const { packWorldMarch } = await importTranspiled(packingFixtureSource);
const packed = new Float32Array(paramsFloatCount);
packed.fill(-7);
packWorldMarch(packed, {
  worldStepEnabled: true,
  worldStepMaxIterations: 999,
  worldStepMinMeters: Number.NaN,
  worldStepMaxMeters: 20,
  worldStepMaxRayDistanceMeters: 10,
  worldStepPerspectiveScale: -2,
  worldStepSupportSkipping: true,
  worldStepCandidateSkipping: false,
  horizontalMetersPerWorldUnit: 1000,
  verticalMetersPerWorldUnit: 500,
  stochasticSampling: true,
  stbnFrozenSlice: 3.6,
}, {
  stbnAvailable: true,
  cloudFrameOutputActive: false,
  supports: [{ min: [1, 2, 3], max: [4, 5, 6] }],
});
assert(packed[marchBase - 1] === -7, 'tail packing overwrote the legacy Body ABI');
const expectedMarchLanes = new Float32Array([
  1, 512, 100, 100, 100, 0, 1, 0, 1000, 500, 1, 1, 4, 1, 0.002, 0.01,
]);
assert(
  JSON.stringify([...packed.slice(marchBase, marchBase + 16)])
    === JSON.stringify([...expectedMarchLanes]),
  'WorldMarchGPU controls/limits/metric/stochastic packing changed',
);
assert(
  JSON.stringify([...packed.slice(supportBase, supportBase + 8)])
    === JSON.stringify([1, 2, 3, 1, 4, 5, 6, 0]),
  'BodySupportGPU packing changed',
);
assert(
  packed.slice(supportBase + supportStride).every((value) => value === 0),
  'unused Body Support lanes are not cleared',
);

// ---------------------------------------------------------------------------
// WGSL physical stepping, conservative skipping, and stochastic sequence.
// ---------------------------------------------------------------------------

assertIncludes(cloud, [
  'struct WorldMarchGPU',
  'controls : vec4f',
  'limits : vec4f',
  'metric : vec4f',
  'stochastic : vec4f',
  'struct BodySupportGPU',
  'march  : WorldMarchGPU',
  'supports : array<BodySupportGPU, 24>',
  '@group(3) @binding(2) var stbnTex : texture_3d<f32>',
  '@group(3) @binding(3) var<storage, read_write> raymarchCounters : RaymarchCountersGPU',
], 'WGSL world-march ABI');

const metersPerRayT = blockStartingAt(cloud, 'fn metersPerRayT(', 'metersPerRayT');
assertIncludes(metersPerRayT, [
  'params.march.metric.x',
  'params.march.metric.y',
  'rd.x * horizontal',
  'rd.y * vertical',
  'rd.z * horizontal',
], 'anisotropic metres-per-ray-t conversion');

const worldStepMeters = blockStartingAt(cloud, 'fn worldStepMeters(', 'worldStepMeters');
assertIncludes(worldStepMeters, [
  'params.march.controls.z',
  'params.march.controls.w',
  'params.march.limits.y',
  'clamp(',
  'minStep',
  'maxStep',
], 'bounded perspective world step');

const supportAdvance = blockStartingAt(cloud, 'fn bodySupportAdvance(', 'bodySupportAdvance');
assertIncludes(supportAdvance, [
  'params.march.stochastic.y',
  'params.march.limits.z < 0.5 || count == 0u',
  'params.supports[i]',
  'intersectBounds(',
  'interval.tNear',
  'interval.tFar',
  'return SupportAdvance(false, hasNext, nextT)',
], 'renderer-owned conservative Support skip');

const cloudFrame = blockStartingAt(cloud, 'fn renderCloudFrame(', 'renderCloudFrame');
assertIncludes(cloudFrame, [
  'let worldMarch = params.march.controls.x > 0.5',
  'let rayMetric = metersPerRayT(rd)',
  'let maxRayT = max(params.march.limits.x, params.march.controls.z) / rayMetric',
  'let tExit = select(hit.tFar, min(hit.tFar, maxRayT), worldMarch)',
  'i32(clamp(params.march.controls.y, 1.0, f32(RAYMARCH_MAX_STEPS)))',
  'if (worldMarch) {',
  'let support = bodySupportAdvance(ro, rd, t)',
  'let candidateNextT = raymarchCandidateNextT(ro, rd, t)',
  'let requestedStepT = worldStepMeters(max(t, 0.0) * rayMetric) / rayMetric',
  'atomicAdd(&raymarchCounters.primaryIterations, 1u)',
  'atomicAdd(&raymarchCounters.densitySamples, 1u)',
  'let sampleSpacingMeters = max(arrivalStepT, 0.0) * rayMetric',
  'worldStepSumMeters += sampleSpacingMeters',
  'atomicMax(&raymarchCounters.maxWorldStepMeters',
], 'world-step branch, max distance, and max iterations');

// These are the fixed-count baseline tokens. Every W10B-only operation is
// selected or guarded by worldMarch, while the disabled path retains the old
// baseStep/dither/backtrack/adaptive multiplier sequence for exact A/B.
assertIncludes(cloudFrame, [
  'let baseStep = (hit.tFar - tEntry) / f32(max(numSteps, 1))',
  'iterBudget = select(numSteps,',
  'var stepT = select(baseStep, minWorldStepT, worldMarch)',
  'if (!worldMarch && mult > 1.0)',
  't = t - baseStep * (mult - 1.0)',
  'if (!worldMarch && adaptive && empties >= 4)',
  't = t + stepT * mult',
], 'fixed-step exact branch tokens');

assertIncludes(cloudFrame, [
  'arrivalStepT > minWorldStepT * 1.01',
  'refinementTargetT = t',
  'previousSampleT + minWorldStepT',
  'refinementCount++',
  'refinementActive = true',
  'if (refinedT < t)',
  'let remainingIterations = u32(iterBudget) - i - 1u',
  'let refinementDistanceMeters = max(t - refinedT, 0.0) * rayMetric',
  'refinementDistanceMeters / max(params.march.controls.z, 1.0)',
  'let refinementIntervalsNeeded = max(1.0, ceil(',
  'let refinementSamplesNeeded = refinementIntervalsNeeded + 1.0',
  'if (f32(remainingIterations) >= refinementSamplesNeeded)',
  'refinementIntervalCount = u32(refinementIntervalsNeeded)',
  'refinementSampleIndex++',
  't = refinementTargetT',
  't = mix(refinementStartT, refinementTargetT, refinementFraction)',
  'if (!refinementActive)',
  'stepT = select(outsideStepT, minWorldStepT, inCloud || refinementActive)',
  'stepT = min(stepT, max(tExit - t, 0.0))',
], 'world-step first-hit refinement');
assert(
  !cloudFrame.includes('t < refinementTargetT - 1e-5'),
  'first-hit refinement may terminate just before sampling its known target',
);
assert(
  !cloudFrame.includes('refinedT < t - 1e-5'),
  'first-hit refinement still uses a scene-scale-dependent world-unit epsilon',
);

function refinementPlan(previousSampleT, knownHitT, minStepMeters, rayMetric = 1) {
  const minStepT = minStepMeters / rayMetric;
  const refinedT = Math.min(knownHitT, Math.max(previousSampleT, Math.fround(previousSampleT + minStepT)));
  const refinementDistanceMeters = Math.max(knownHitT - refinedT, 0) * rayMetric;
  const intervalCount = Math.max(1, Math.ceil(refinementDistanceMeters / minStepMeters) + 1);
  const samples = [];
  for (let index = 0; index <= intervalCount; index++) {
    samples.push(index === intervalCount
      ? knownHitT
      : Math.fround(refinedT + (knownHitT - refinedT) * (index / intervalCount)));
  }
  return { samples, intervalCount, refinedT };
}
const thinIntervalSamples = refinementPlan(0, 119, 100).samples;
assert(
  thinIntervalSamples.some((sample) => sample >= 110 && sample <= 130),
  `first-hit refinement lost the known thin-layer hit: ${thinIntervalSamples.join(',')}`,
);
assert(
  thinIntervalSamples.at(-1) === 119
    && thinIntervalSamples.every((sample, index) => index === 0
      || sample - thinIntervalSamples[index - 1] <= 100),
  'first-hit refinement did not preserve the known-hit bracket at min-step spacing',
);

function refinementFitsBudget(
  currentIteration,
  iterationBudget,
  previousSampleT,
  knownHitT,
  minStepMeters,
  rayMetric = 1,
) {
  const minStepT = minStepMeters / rayMetric;
  const refinedT = Math.min(knownHitT, Math.max(previousSampleT, Math.fround(previousSampleT + minStepT)));
  const remainingIterations = iterationBudget - currentIteration - 1;
  const refinementDistanceMeters = Math.max(knownHitT - refinedT, 0) * rayMetric;
  const refinementIntervalsNeeded = Math.max(1, Math.ceil(refinementDistanceMeters / minStepMeters) + 1);
  const refinementSamplesNeeded = refinementIntervalsNeeded + 1;
  return remainingIterations >= refinementSamplesNeeded;
}
assert(
  !refinementFitsBudget(382, 384, 0, 250, 100),
  'finite-budget guard would start a bracket that cannot reach its known 250m hit',
);
assert(
  !refinementFitsBudget(380, 384, 0, 250, 100),
  'finite-budget guard omitted the f32 target-confirmation margin',
);
assert(
  refinementFitsBudget(379, 384, 0, 250, 100),
  'finite-budget guard rejected a bracket with its target-confirmation margin available',
);
const largeRayMetric = 1e8;
const scaledPreviousT = Math.fround(0.0004);
const scaledKnownHitT = Math.fround(scaledPreviousT + 2000 / largeRayMetric);
assert(
  !refinementFitsBudget(361, 384, scaledPreviousT, scaledKnownHitT, 10, largeRayMetric),
  'finite-budget guard undercounted refinement samples at a large legal scene scale',
);
const hugePreviousT = Math.fround(131073.234375);
const hugeKnownHitT = Math.fround(131083.265625);
const hugePlan = refinementPlan(hugePreviousT, hugeKnownHitT, 10, 100);
assert(
  hugePlan.samples.at(-1) === hugeKnownHitT,
  'indexed refinement did not force its final sample to the known target at large ray t',
);
assert(
  hugePlan.samples.length === hugePlan.intervalCount + 1,
  'indexed refinement budget does not include every scheduled sample plus the known target',
);

const lightMarch = blockStartingAt(cloud, 'fn lightMarchDepth(', 'lightMarchDepth');
assertIncludes(lightMarch, [
  'params.march.controls.x > 0.5 && params.march.metric.z > 0.5',
  'let phase = fract(rayJitter + f32(i) * 0.61803398875)',
  'let sampleT = select(segmentEnd, t + ss * phase, stochastic)',
], 'STBN/IGN local-light sampling sequence');

const candidateSkip = stripComments(blockStartingAt(
  shaderSources,
  'fn raymarchHierarchicalCandidateNextT(',
  'hierarchical candidate skip',
));
assertIncludes(candidateSkip, [
  'let count = entry.y & 7u',
  'let overflow = (entry.y & 8u) != 0u',
  'let complete = (entry.y & 16u) != 0u',
  'let generation = entry.y >> 8u',
  'if (!complete || overflow || count != 0u',
  'generation != densityBrickCandidateMeta.gridAndGeneration.w',
  'return currentT',
  'return interval.tFar +',
], 'complete/non-overflow/generation-matched/count-zero candidate proof');
assertExcludes(candidateSkip, [
  'sampleDensity',
  'densityAt(',
  'densityAtTyped(',
  'textureSample',
  'textureLoad',
  'densityBrickTex',
  'densityTex',
], 'candidate emptiness proof (coarse density is not a majorant)');

const stbnJitter = blockStartingAt(cloud, 'fn stbnJitter(', 'stbnJitter');
assertIncludes(stbnJitter, [
  'textureDimensions(stbnTex)',
  'params.march.stochastic.x',
  'params.g.frameIndex',
  'let slice = select(frameSlice, frozen, frozen >= 0)',
  'textureLoad(stbnTex, coord, 0).r',
], 'STBN animated/frozen slice');
assertIncludes(cloudFrame, [
  'var dither = interleavedGradientNoise(fragCoord.xy)',
  'params.march.metric.z > 0.5 && params.march.metric.w > 0.5',
  'dither = stbnJitter(fragCoord.xy)',
  'params.g.temporalDither > 0.5',
  'params.g.frameIndex * 0.61803398875',
  'i32(params.g.debugView) == 13',
], 'STBN selection, frozen diagnosis, and deterministic IGN/Halton fallback');

// ---------------------------------------------------------------------------
// Existing group-3 plumbing (maxBindGroups baseline), controls/default-off compatibility, and diagnostics.
// ---------------------------------------------------------------------------

assertIncludes(qualityContracts, [
  'stbnView: GPUTextureView',
  'raymarchCountersBuffer: GPUBuffer',
], 'density quality STBN binding contract');
assertIncludes(quality, [
  '{ binding: 2, resource: resources.stbnView }',
  '{ binding: 3, resource: { buffer: resources.raymarchCountersBuffer } }',
  'layout: bundle.cloudPipeline.getBindGroupLayout(3)',
], 'density quality group-3 STBN binding');
assertIncludes(renderer, [
  "import { createStbnTextureResources } from './rendering/stbnTexture'",
  'const stbnResources = await createStbnTextureResources(device)',
  'stbnView: stbnResources.view',
  'raymarchCountersBuffer,',
  'commandEncoder.clearBuffer(raymarchCountersBuffer)',
  'commandEncoder.copyBufferToBuffer(',
  'stats.raymarchPrimaryIterationsPerPixel',
  'stats.raymarchAverageStepMeters',
  'raymarchCounterConfigAtSubmit !== raymarchConfigGeneration',
  'stats.raymarchCounterConfigGeneration = raymarchCounterConfigAtSubmit',
  'stats.raymarchCounterFrameIndex = raymarchCounterFrameAtSubmit',
  'params.debugView,\n      taaOn,',
  "cloudFramePath === 'cloud-frame'",
  'qualityBindings.cloudFrameGroundShadow!',
  'qualityBindings.cloudGroundShadow',
  'stbnResources.destroy()',
], 'renderer group-3 STBN lifecycle');
const counterSignatureStart = renderer.indexOf('const nextRaymarchConfigSignature = [');
const counterSignatureEnd = renderer.indexOf("].join('|');", counterSignatureStart);
assert(counterSignatureStart >= 0 && counterSignatureEnd > counterSignatureStart,
  'raymarch counter config signature is missing');
const counterSignature = renderer.slice(counterSignatureStart, counterSignatureEnd);
assertIncludes(counterSignature, ['cloudFramePath', 'params.debugView', 'taaOn', 'WORLD_MARCH_BASE'],
  'raymarch counter discrete config signature');
assertExcludes(counterSignature, ['shapeSignature', 'JSON.stringify(currentMods)'],
  'raymarch counter config signature must not be invalidated by animated scene data');
assert(!cloud.includes('@group(4)'), 'STBN must not require a fifth bind group');

const defaults = blockStartingAt(params, 'export function createDefaultParams(', 'createDefaultParams');
assertIncludes(defaults, [
  'worldStepEnabled: false',
  'worldStepMaxIterations: 384',
  'worldStepMinMeters: 100',
  'worldStepMaxMeters: 250',
  'worldStepMaxRayDistanceMeters: 64000',
  'worldStepPerspectiveScale: 0.003',
  'worldStepSupportSkipping: true',
  'worldStepCandidateSkipping: true',
  'stochasticSampling: true',
  'stbnFrozenSlice: -1',
], 'W10B defaults and fixed-step feature-off baseline');

for (const control of [
  'worldStepEnabled',
  'worldStepMaxIterations',
  'worldStepMinMeters',
  'worldStepMaxMeters',
  'worldStepMaxRayDistanceMeters',
  'worldStepPerspectiveScale',
  'worldStepSupportSkipping',
  'worldStepCandidateSkipping',
  'stochasticSampling',
  'stbnFrozenSlice',
]) {
  assert(gui.includes(`marchFolder.add(params, '${control}'`), `GUI is missing ${control}`);
  assert(i18n.includes(`${control}: { en:`), `i18n is missing ${control}`);
}
assertIncludes(gui, [
  "debugOptions[t('debugStbnJitter')] = 13",
  "debugOptions[t('debugWorldSkipReason')] = 14",
  "debugOptions[t('debugWorldStepMeters')] = 15",
], 'W10B visual diagnostic controls');

const renderStats = blockStartingAt(renderer, 'export interface RenderStats', 'RenderStats');
assertIncludes(renderStats, [
  'worldStepRequested: boolean',
  'worldStepActive: boolean',
  'worldStepMinMeters: number',
  'worldStepMaxMeters: number',
  'worldStepMaxRayDistanceMeters: number',
  'worldStepMaxIterations: number',
  'worldStepSupportCount: number',
  'worldStepSupportSkipping: boolean',
  'worldStepCandidateSkipping: boolean',
  'stochasticSamplingRequested: boolean',
  "stochasticSamplingActive: 'stbn' | 'ign-halton'",
  'stochasticSamplingFallbackReason: string',
  'stbnFrozenSlice: number',
  'stbnBytes: number',
  'raymarchConfigGeneration: number',
  'raymarchCurrentFrameIndex: number',
  'raymarchCounterConfigGeneration: number',
  'raymarchCounterFrameIndex: number',
  'raymarchPrimaryIterationsPerPixel: number',
  'raymarchSupportSkipsPerPixel: number',
  'raymarchCandidateSkipsPerPixel: number',
  'raymarchDensitySamplesPerPixel: number',
  'raymarchLightSamplesPerPixel: number',
  'raymarchAverageStepMeters: number',
  'raymarchMaxStepMeters: number',
  'raymarchRefinementsPerPixel: number',
], 'RenderStats W10B diagnostics');
assertIncludes(renderer, [
  'cachedWorldSupportSnapshots: WorldRaymarchBodySupport[][]',
  'mergeBodySupportSnapshots(currentWorldSupports, cachedWorldSupportSnapshots.flat())',
  'if (cachedWorldSupportSnapshots.length > 2) cachedWorldSupportSnapshots.shift()',
  'stats.worldStepActive = paramsData[WORLD_MARCH_BASE] > 0.5',
  'stats.worldStepSupportCount = activeWorldSupports.length',
  'stats.stochasticSamplingActive = params.worldStepEnabled && params.stochasticSampling && stbnResources.available',
  "? 'stbn'",
  ": 'ign-halton'",
  "stbnResources.fallbackReason || 'stbn-unavailable'",
], 'runtime W10B diagnostic publication');
assertIncludes(benchmark, [
  'raymarch: Pick<RenderStats,',
  'worldStepRequested: stats.worldStepRequested',
  'worldStepSupportCount: stats.worldStepSupportCount',
  'stochasticSamplingActive: stats.stochasticSamplingActive',
  'stbnFrozenSlice: stats.stbnFrozenSlice',
  'stbnBytes: stats.stbnBytes',
  'raymarchConfigGeneration: stats.raymarchConfigGeneration',
  'raymarchCurrentFrameIndex: stats.raymarchCurrentFrameIndex',
  'raymarchCounterConfigGeneration: stats.raymarchCounterConfigGeneration',
  'raymarchCounterFrameIndex: stats.raymarchCounterFrameIndex',
  'raymarchPrimaryIterationsPerPixel: stats.raymarchPrimaryIterationsPerPixel',
  'raymarchAverageStepMeters: stats.raymarchAverageStepMeters',
], 'benchmark raymarch diagnostics');
assertIncludes(main, [
  'W10B raymarch:',
  'W10B measured',
  "s.worldStepActive ? 'world-step' : 'fixed-step'",
  's.stochasticSamplingFallbackReason',
], 'HUD raymarch diagnostics');

console.log(
  `W10B raymarch contracts passed: STBN ${expectedStbnBytes} bytes/${stbnDigest.slice(0, 12)}, Params ${paramsFloatCount} floats, world/fixed branches, conservative skips, bindings, controls, and diagnostics`,
);
