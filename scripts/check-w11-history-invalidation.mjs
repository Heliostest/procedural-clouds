import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const resourceSource = read('src/rendering/cloudFrameOutput.ts');
const renderer = read('src/renderer.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`W11 history invalidation failed: ${message}`);
}

function assertIncludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(source.includes(token), `${scope} is missing ${JSON.stringify(token)}`);
  }
}

function countOccurrences(source, token) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = source.indexOf(token, cursor);
    if (index < 0) return count;
    count++;
    cursor = index + token.length;
  }
}

assertIncludes(resourceSource, [
  'get resourceGeneration()',
  'get contentRevision()',
  'get discontinuityGeneration()',
  'this.currentResourceGeneration++',
  'this.currentContentRevision++',
  'this.currentDiscontinuityGeneration++',
  'markContent()',
  'markDiscontinuity()',
], 'cloudFrameOutput independent generations');

assert(countOccurrences(resourceSource, 'currentResourceGeneration++') >= 1, 'resourceGeneration has increment sites');
assert(countOccurrences(resourceSource, 'currentContentRevision++') === 1, 'contentRevision increments only in markContent');
assert(countOccurrences(resourceSource, 'currentDiscontinuityGeneration++') >= 2, 'discontinuityGeneration has independent increments');

const markContentBody = (() => {
  const start = resourceSource.indexOf('markContent(): number');
  assert(start >= 0, 'markContent missing');
  const open = resourceSource.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < resourceSource.length; i++) {
    if (resourceSource[i] === '{') depth++;
    if (resourceSource[i] === '}') {
      depth--;
      if (depth === 0) return resourceSource.slice(start, i + 1);
    }
  }
  throw new Error('W11 history invalidation failed: markContent has no closing brace');
})();
assert(markContentBody.includes('currentContentRevision++'), 'markContent bumps contentRevision');
assert(!markContentBody.includes('currentResourceGeneration'), 'markContent must not bump resourceGeneration');
assert(!markContentBody.includes('currentDiscontinuityGeneration'), 'markContent must not bump discontinuityGeneration');

globalThis.GPUTextureUsage = Object.freeze({
  COPY_SRC: 0x01,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
});
class MockTexture {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.destroyCalls = 0;
  }
  createView() { return { texture: this }; }
  destroy() { this.destroyCalls++; }
}
class MockDevice {
  createTexture(descriptor) { return new MockTexture(descriptor); }
}
const js = transpileModule(resourceSource, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const resources = new mod.CloudFrameOutputResources({ device: new MockDevice(), width: 16, height: 16 });
const g0 = resources.resourceGeneration;
const c0 = resources.contentRevision;
const d0 = resources.discontinuityGeneration;
resources.markContent();
assert(resources.contentRevision === c0 + 1, 'markContent increments contentRevision');
assert(resources.resourceGeneration === g0, 'markContent leaves resourceGeneration');
assert(resources.discontinuityGeneration === d0, 'markContent leaves discontinuityGeneration');
resources.markDiscontinuity();
assert(resources.discontinuityGeneration === d0 + 1, 'markDiscontinuity increments discontinuity');
assert(resources.resourceGeneration === g0, 'markDiscontinuity leaves resourceGeneration');
assert(resources.contentRevision === c0 + 1, 'markDiscontinuity leaves contentRevision');
resources.resize(32, 32);
assert(resources.resourceGeneration === g0 + 1, 'resize increments resourceGeneration');
assert(resources.discontinuityGeneration > d0 + 1, 'resize increments discontinuityGeneration');

const structuralSites = [
  ['resize', 'historyValid = false', 'ensureSceneTexture'],
  ['device loss', 'historyValid = false', 'device.lost'],
  ['camera cut', 'cameraDiscontinuityGeneration', 'historyValid = false'],
  ['producer/quality/storage', 'qualityChanged || producerChanged || densityGenerationChanged', 'historyValid = false'],
  ['density gen post-encode', 'postEncodeDensityResourcesChanged', 'historyValid = false'],
  ['world-march signature', 'previousWorldMarchSignature !== worldMarchSignature', 'historyValid = false'],
  ['time jump', 'shadowTimeDiscontinuity && historyValid', 'historyValid = false'],
  ['temporal mode switch', 'activeTemporalModeNum !== prevActiveTemporalMode', 'historyValid = false'],
  ['cloud-frame path switch', 'previousCloudFramePath !== cloudFramePath', 'historyValid = false'],
  ['taa enabled switch', 'taaOn !== prevTaaEnabled', 'historyValid = false'],
  ['sun discontinuity', 'sunDot < SUN_DIRECTION_DISCONTINUITY_DOT', 'historyValid = false'],
  ['brick reallocation', 'brickAllocationGeneration !== previousBrickAllocationGeneration', 'historyValid = false'],
];
for (const [label, a, b] of structuralSites) {
  const ia = renderer.indexOf(a);
  const ib = renderer.indexOf(b);
  assert(ia >= 0 && ib >= 0, `${label}: missing ${JSON.stringify(a)} or ${JSON.stringify(b)}`);
}
assert(
  !renderer.includes('isTaauDebugView(previousDebugView)')
  && !renderer.includes('previousDebugView'),
  'TAAU debug view switch must not trigger whole-frame invalidation',
);
assertIncludes(renderer, [
  'SUN_DIRECTION_DISCONTINUITY_DOT',
  'sunDirectionFromAngles',
  'allocationGeneration',
  'DEBUG_VIEW_TAAU_PHASE',
  'DEBUG_VIEW_TAAU_REJECTION',
  'isTaauDebugView',
], 'sun/brick/taau-debug signals');
assert(
  renderer.includes('hierarchical.allocationGeneration')
  || renderer.includes('hierarchical?.allocationGeneration'),
  'brick reallocation must use public hierarchical.allocationGeneration',
);

assert(renderer.includes('cloudFrameOutput?.markDiscontinuity()') || renderer.includes('cloudFrameOutput!.markDiscontinuity()'),
  'structural paths must call markDiscontinuity');

const markContentCalls = [...renderer.matchAll(/markContent\(\)/g)];
assert(markContentCalls.length >= 2, 'markContent must be called on successful writes');
for (const match of markContentCalls) {
  const window = renderer.slice(Math.max(0, match.index - 120), match.index + 80);
  assert(!window.includes('historyValid = false'), 'markContent path must not set historyValid=false');
}
assert(!/contentRevision[\s\S]{0,80}historyValid\s*=\s*false/.test(renderer),
  'contentRevision updates must not force historyValid=false');

assertIncludes(renderer, [
  'if (bayer == phase || u.flags.x < 0.5)',
  'out.outColor = cur',
  'out.outDepthEnc = curDepthEnc',
], 'historyValid=0 outputs current for all texels');
const taauClassify = (() => {
  const start = renderer.indexOf('fn taauClassify(');
  assert(start >= 0, 'taauClassify missing');
  const open = renderer.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < renderer.length; i++) {
    if (renderer[i] === '{') depth++;
    if (renderer[i] === '}') {
      depth--;
      if (depth === 0) return renderer.slice(start, i + 1);
    }
  }
  throw new Error('W11 history invalidation failed: taauClassify has no closing brace');
})();
const early = taauClassify.indexOf('u.flags.x < 0.5');
const histSample = taauClassify.indexOf('textureSampleLevel(historyCloud');
assert(early >= 0 && histSample > early, 'history sample must be after historyValid early-out');
assert(!taauClassify.slice(0, early + 40).includes('historyCloud'), 'invalid history must not read historyCloud before early-out');

console.log('W11 history invalidation contracts passed');
