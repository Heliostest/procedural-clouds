import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const resourceSource = read('src/rendering/cloudFrameOutput.ts');
const cloudShader = read('shaders/cloud.wgsl');
const renderer = read('src/renderer.ts');
const quality = read('src/rendering/densityQualityPipelines.ts');
const qualityContracts = read('src/rendering/densityQualityContracts.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`W10A cloud-frame contract failed: ${message}`);
}

function assertIncludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(source.includes(token), `${scope} is missing ${JSON.stringify(token)}`);
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
  throw new Error(`W10A cloud-frame contract failed: ${scope} has no closing brace`);
}

function assertOrdered(source, tokens, scope) {
  let cursor = 0;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor);
    assert(index >= 0, `${scope} is missing ordered token ${JSON.stringify(token)}`);
    cursor = index + token.length;
  }
}

// Exercise the resource owner with a mock GPU device. This guards behavior, not
// just spelling: allocation is three renderable/sampleable/readback textures,
// resize is atomic, generations are monotonic, and destruction is idempotent.
globalThis.GPUTextureUsage = Object.freeze({
  COPY_SRC: 0x01,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
});

class MockTexture {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.destroyCalls = 0;
    this.view = Object.freeze({ texture: this });
  }

  createView() {
    return this.view;
  }

  destroy() {
    this.destroyCalls++;
  }
}

class MockDevice {
  constructor() {
    this.createAttempts = 0;
    this.failOnAttempt = -1;
    this.textures = [];
  }

  createTexture(descriptor) {
    const attempt = this.createAttempts++;
    if (attempt === this.failOnAttempt) throw new Error('injected texture allocation failure');
    const texture = new MockTexture(descriptor);
    this.textures.push(texture);
    return texture;
  }
}

const resourceJavaScript = transpileModule(resourceSource, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const resourceModule = await import(
  `data:text/javascript;base64,${Buffer.from(resourceJavaScript).toString('base64')}`
);
const {
  CLOUD_FRAME_OUTPUT_CLEAR_VALUES,
  CLOUD_FRAME_OUTPUT_FORMAT,
  CloudFrameOutputResources,
} = resourceModule;

assert(CLOUD_FRAME_OUTPUT_FORMAT === 'rgba16float', 'all cloud-frame attachments must be rgba16float');
assert(
  JSON.stringify(CLOUD_FRAME_OUTPUT_CLEAR_VALUES) === JSON.stringify({
    radianceTransmittance: { r: 0, g: 0, b: 0, a: 1 },
    depthVelocity: { r: 0, g: 0, b: 0, a: 0 },
    backgroundRadiance: { r: 0, g: 0, b: 0, a: 0 },
  }),
  'attachment clear values must preserve T=1 and invalid depth/velocity/background defaults',
);
assert(Object.isFrozen(CLOUD_FRAME_OUTPUT_CLEAR_VALUES), 'clear-value table must be immutable');

const device = new MockDevice();
const output = new CloudFrameOutputResources({ device, width: 4.9, height: 3.8, label: 'fixture' });
const requiredUsage = GPUTextureUsage.RENDER_ATTACHMENT
  | GPUTextureUsage.TEXTURE_BINDING
  | GPUTextureUsage.COPY_SRC;
assert(device.textures.length === 3, 'initial allocation must create exactly three textures');
for (const [index, name] of ['radianceTransmittance', 'depthVelocity', 'backgroundRadiance'].entries()) {
  const descriptor = device.textures[index].descriptor;
  assert(descriptor.label === `fixture-${name}`, `${name} texture label changed`);
  assert(descriptor.format === 'rgba16float', `${name} texture format changed`);
  assert(descriptor.dimension === '2d', `${name} must remain a 2D texture`);
  assert(JSON.stringify(descriptor.size) === JSON.stringify([4, 3, 1]), `${name} extent must be normalized`);
  assert(descriptor.usage === requiredUsage, `${name} usage must include render, sample, and copy-source access`);
}
assert(output.width === 4 && output.height === 3, 'normalized extent is not exposed');
assert(output.attachmentBytes === 4 * 3 * 8 * 3, 'three rgba16float attachment bytes are incorrect');
assert(output.resourceGeneration === 1, 'initial allocation must publish resource generation 1');
assert(output.contentRevision === 0, 'allocation must not claim rendered content');
assert(output.discontinuityGeneration === 1, 'initial allocation must invalidate temporal history');

const attachments = output.createClearAttachments();
assert(attachments.length === 3, 'render pass must expose exactly three MRT attachments');
for (const [index, name] of ['radianceTransmittance', 'depthVelocity', 'backgroundRadiance'].entries()) {
  const attachment = attachments[index];
  assert(attachment.view === device.textures[index].view, `${name} MRT location/view order changed`);
  assert(attachment.clearValue === CLOUD_FRAME_OUTPUT_CLEAR_VALUES[name], `${name} clear value changed`);
  assert(attachment.loadOp === 'clear' && attachment.storeOp === 'store', `${name} must clear then store`);
}

assert(output.markContent() === 1, 'content revision must increment after a successful cloud write');
assert(output.markDiscontinuity() === 2, 'explicit discontinuity must have an independent generation');
assert(output.resize(4, 3) === false, 'same-size resize must be allocation-free');
assert(device.textures.length === 3, 'same-size resize allocated textures');
assert(device.textures.every((texture) => texture.destroyCalls === 0), 'same-size resize destroyed textures');

const firstAllocation = [...device.textures];
assert(output.resize(8, 6) === true, 'changed extent must allocate a new resource generation');
assert(device.textures.length === 6, 'resize must create exactly three replacement textures');
assert(firstAllocation.every((texture) => texture.destroyCalls === 1), 'resize must destroy every retired attachment once');
assert(output.resourceGeneration === 2, 'resize did not increment resource generation');
assert(output.contentRevision === 1, 'resize must not forge a content write');
assert(output.discontinuityGeneration === 3, 'resize must invalidate temporal history');
assert(output.attachmentBytes === 8 * 6 * 8 * 3, 'resized attachment bytes are incorrect');

const currentAllocation = device.textures.slice(3, 6);
const generationBeforeFailure = output.resourceGeneration;
const discontinuityBeforeFailure = output.discontinuityGeneration;
device.failOnAttempt = device.createAttempts + 1;
let allocationFailed = false;
try {
  output.resize(9, 7);
} catch (error) {
  allocationFailed = String(error).includes('injected texture allocation failure');
}
assert(allocationFailed, 'resize failure fixture did not execute');
assert(output.width === 8 && output.height === 6, 'failed resize replaced the published extent');
assert(output.resourceGeneration === generationBeforeFailure, 'failed resize advanced resource generation');
assert(output.discontinuityGeneration === discontinuityBeforeFailure, 'failed resize invalidated valid history');
assert(currentAllocation.every((texture) => texture.destroyCalls === 0), 'failed resize destroyed the active allocation');
assert(device.textures.at(-1).destroyCalls === 1, 'failed resize leaked its partial allocation');

output.destroy();
assert(currentAllocation.every((texture) => texture.destroyCalls === 1), 'destroy must release all live attachments');
assert(output.isDestroyed, 'destroyed state is not observable');
assert(output.width === 0 && output.height === 0 && output.attachmentBytes === 0, 'destroy must clear extent accounting');
assert(output.resourceGeneration === generationBeforeFailure + 1, 'destroy must advance resource generation once');
assert(output.discontinuityGeneration === discontinuityBeforeFailure + 1, 'destroy must advance discontinuity once');
output.destroy();
assert(currentAllocation.every((texture) => texture.destroyCalls === 1), 'destroy must be idempotent');
assert(output.resourceGeneration === generationBeforeFailure + 1, 'idempotent destroy advanced generation');
for (const operation of [
  () => output.createClearAttachments(),
  () => output.resize(1, 1),
  () => output.markContent(),
  () => output.markDiscontinuity(),
]) {
  let rejected = false;
  try {
    operation();
  } catch (error) {
    rejected = String(error).includes('destroyed');
  }
  assert(rejected, 'operation on destroyed cloud-frame resources was accepted');
}

const cloudTargets = blockStartingAt(cloudShader, 'struct CloudFrameTargets', 'CloudFrameTargets');
assert((cloudTargets.match(/@location\(/g) ?? []).length === 3, 'fsCloudFrame target struct must contain three MRT locations');
assertIncludes(cloudTargets, [
  '@location(0) radianceTransmittance : vec4f',
  '@location(1) depthVelocity : vec4f',
  '@location(2) backgroundRadiance : vec4f',
], 'CloudFrameTargets');

const renderCloudFrame = blockStartingAt(cloudShader, 'fn renderCloudFrame(', 'renderCloudFrame');
assertIncludes(renderCloudFrame, [
  'let valid = depthW > 1e-4',
  'let outputDepth = select(0.0, cloudDepth, valid)',
  'vec4f(color, clamp(transmittance, 0.0, 1.0))',
  'vec4f(outputDepth, velocity, select(0.0, 1.0, reprojectionValid))',
  'vec4f(background, 1.0)',
  'select(0.0, 1.0, valid)',
], 'cloud-frame sample output');
assertIncludes(renderCloudFrame, [
  'if (valid && camera.historyValid > 0.5)',
  'camera.prevViewProj * vec4f(previousPoint, 1.0)',
  '- camera.jitterPixels.zw * pixelUvSize',
  'all(prevUv >= vec2f(0.0)) && all(prevUv <= vec2f(1.0))',
  'velocity = currentUv - prevUv',
  'reprojectionValid = true',
], 'cloud-frame velocity');
assertIncludes(renderCloudFrame, [
  'let backgroundRd = select(rd, unjitteredRd, params.march.reserved.x > 0.5)',
  'clamp(backgroundRd.y * 0.5 + 0.5',
  'let backgroundSunTheta = dot(backgroundRd, SUN_DIR)',
  'let gp = ro + backgroundRd * tGround',
], 'cloud-frame unjittered background');

const cloudFrameFragment = blockStartingAt(cloudShader, 'fn fsCloudFrame(', 'fsCloudFrame');
assertIncludes(cloudFrameFragment, [
  'return CloudFrameTargets(',
  'frame.radianceTransmittance',
  'frame.depthVelocity',
  'frame.backgroundRadiance',
], 'fsCloudFrame');

const emergencyFragment = blockStartingAt(cloudShader, 'fn fs(@builtin(position)', 'legacy emergency fragment');
assertIncludes(emergencyFragment, [
  'let combined = frame.radianceTransmittance.rgb',
  '+ frame.radianceTransmittance.a * frame.backgroundRadiance.rgb',
  'let legacyDepth = select(1e4, frame.depthVelocity.x, frame.cloudValidity > 0.5)',
  'return vec4f(combined, legacyDepth)',
], 'legacy emergency composite');

const cloudTaaShader = renderer.slice(
  renderer.indexOf('const cloudTaaShaderSource'),
  renderer.indexOf('const cloudCompositeShaderSource'),
);
assertIncludes(cloudTaaShader, [
  '@group(0) @binding(0) var currentCloud : texture_2d<f32>',
  '@group(0) @binding(1) var historyCloud : texture_2d<f32>',
  '@group(0) @binding(4) var depthVelocity : texture_2d<f32>',
  'let motion = textureSampleLevel(depthVelocity, samp, uv, 0.0)',
  'if (u.flags.x < 0.5 || motion.w < 0.5) { return cur; }',
  'let prevUv = uv - motion.yz',
  'return mix(cur, hist, historyWeight)',
], 'cloud-only temporal resolve');

const compositeShader = renderer.slice(
  renderer.indexOf('const cloudCompositeShaderSource'),
  renderer.indexOf('const TOD_KNOTS'),
);
assertIncludes(compositeShader, [
  '@group(0) @binding(0) var cloudTex : texture_2d<f32>',
  '@group(0) @binding(1) var backgroundTex : texture_2d<f32>',
  'let cloud = textureSampleLevel(cloudTex, samp, uv, 0.0)',
  'return vec4f(cloud.rgb + clamp(cloud.a, 0.0, 1.0) * background, 1.0)',
], 'full-resolution cloud/background composite');

assertIncludes(renderer, [
  '{ binding: 0, resource: cloudFrameOutput!.radianceTransmittanceView }',
  '{ binding: 4, resource: cloudFrameOutput!.depthVelocityView }',
  '{ binding: 1, resource: cloudFrameOutput!.backgroundRadianceView }',
  "cloudFrameActivePath: 'cloud-frame' | 'combined-feature-off' | 'combined-emergency'",
  "activeQualityBundle.cloudFrameFailureReason || 'cloud-frame-pipeline-unavailable'",
  'cloudFrameOutput?.destroy()',
], 'renderer cloud-frame bindings/lifecycle');

const renderFrameStart = renderer.indexOf('function renderFrame(');
const renderFrameEnd = renderer.indexOf('function destroy()', renderFrameStart);
assert(renderFrameStart >= 0 && renderFrameEnd > renderFrameStart, 'renderFrame source range is unavailable');
const frame = renderer.slice(renderFrameStart, renderFrameEnd);
assertOrdered(frame, [
  'ensureSceneTexture(canvas.width, canvas.height)',
  'const activeQualityBundle = densityQualityPipelineManager.getActiveBundle()',
  'const renderPass = commandEncoder.beginRenderPass(',
  'renderPass.draw(3)',
  "if (cloudFramePath === 'cloud-frame') cloudFrameOutput!.markContent()",
  'const taaPass = commandEncoder.beginRenderPass(',
  'taaPass.draw(3)',
  "if (cloudFramePath === 'cloud-frame') {",
  'const compositePass = commandEncoder.beginRenderPass(',
  'compositePass.end()',
  'const linePass = commandEncoder.beginRenderPass(',
  'linePass.end()',
  'const resolvedSceneView =',
  'runBloomPasses(commandEncoder, resolvedSceneView, params)',
  'const postPass = commandEncoder.beginRenderPass(',
], 'cloud current -> resolve -> composite -> bounds/gizmo -> bloom -> post frame order');
assertIncludes(frame, [
  'colorAttachments: cloudFramePath === \'cloud-frame\'',
  '? [...cloudFrameOutput!.createClearAttachments()]',
  "renderPass.setPipeline(cloudFramePath === 'cloud-frame'",
  '? activeQualityBundle.cloudFramePipeline!',
  ': activeQualityBundle.cloudPipeline)',
  "if (cloudFramePath !== 'cloud-frame' && lineVertCount > 0)",
  "taaPass.setPipeline(cloudFramePath === 'cloud-frame' ? cloudTaaPipeline : legacyTaaPipeline)",
  "const resolvedSceneView = cloudFramePath === 'cloud-frame' ? sceneView! : historyViews[histIndex]",
], 'cloud-frame/emergency branch isolation');

const lineUpload = frame.indexOf('if (lineVertCount > 0) {');
const emergencyLineDraw = frame.indexOf("if (cloudFramePath !== 'cloud-frame' && lineVertCount > 0)");
assert(lineUpload >= 0 && lineUpload < emergencyLineDraw, 'bounds/gizmo camera upload must serve both output paths');
const cloudCompositeBranch = frame.slice(
  frame.indexOf("if (cloudFramePath === 'cloud-frame') {", frame.indexOf('taaPass.end()')),
  frame.indexOf('historyValid = true'),
);
assertOrdered(cloudCompositeBranch, [
  'compositePass.draw(3)',
  'compositePass.end()',
  'if (lineVertCount > 0)',
  'linePass.setPipeline(linePipeline)',
], 'cloud-frame bounds/gizmo must draw only after composite');

assertIncludes(renderer, [
  'cloudCurrentMs: number',
  'temporalResolveMs: number',
  'compositeMs: number',
  'const TS_COUNT = 22',
  'beginningOfPassWriteIndex: 8, endOfPassWriteIndex: 9',
  'beginningOfPassWriteIndex: 18, endOfPassWriteIndex: 19',
  'beginningOfPassWriteIndex: 20, endOfPassWriteIndex: 21',
  'stats.cloudCurrentMs = renderNs / 1e6',
  'stats.temporalResolveMs = temporalResolveNs / 1e6',
  'stats.compositeMs = compositeNs / 1e6',
], 'split cloud current/resolve/composite timings');

const bundleFactory = blockStartingAt(
  quality,
  'export async function createDensityQualityPipelineBundle(',
  'density quality bundle factory',
);
assertIncludes(bundleFactory, [
  "fragment: { module, entryPoint: 'fs', targets: [{ format: colorFormat }] }",
  'let cloudFramePipeline: GPURenderPipeline | null = null',
  "let cloudFrameFailureReason = ''",
  'device.limits.maxColorAttachments',
  'device.limits.maxColorAttachmentBytesPerSample',
  'if (maxAttachments < 3 || maxAttachmentBytes < 24)',
  'cloud-frame-mrt-unsupported:',
  "entryPoint: 'fsCloudFrame'",
  'targets: [{ format: colorFormat }, { format: colorFormat }, { format: colorFormat }]',
  'cloud-frame-pipeline-create-failed:',
  'cloudFramePipeline,',
  'cloudFrameFailureReason,',
], 'optional MRT quality bundle');
assert(
  bundleFactory.indexOf("entryPoint: 'fs'") < bundleFactory.indexOf('let cloudFramePipeline:'),
  'single-target emergency pipeline must be created independently before optional MRT',
);
assert(
  bundleFactory.indexOf('try {', bundleFactory.indexOf('let cloudFramePipeline:'))
    < bundleFactory.indexOf('createRenderPipelineAsync({', bundleFactory.indexOf('let cloudFramePipeline:')),
  'optional MRT pipeline creation must be caught so the emergency pipeline survives',
);
assertIncludes(qualityContracts, [
  'cloudFramePipelineCreateCpuMs: number',
  'readonly cloudPipeline: GPURenderPipeline',
  'readonly cloudFramePipeline: GPURenderPipeline | null',
  'readonly cloudFrameFailureReason: string',
], 'quality bundle public fallback contract');

console.log('W10A cloud-frame MRT resources, cloud-only temporal resolve, composite ordering, timings, and emergency fallback contracts passed');
