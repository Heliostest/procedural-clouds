import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');

function assert(condition, message) {
  if (!condition) throw new Error(`W11 bayer phase failed: ${message}`);
}

function assertIncludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(source.includes(token), `${scope} is missing ${JSON.stringify(token)}`);
  }
}

function parseBayerIndices(source) {
  const match = source.match(/const W11_BAYER_INDICES = \[([\s\S]*?)\] as const;/);
  assert(match, 'W11_BAYER_INDICES definition is missing');
  const values = match[1].match(/\d+/g)?.map(Number) ?? [];
  assert(values.length === 16, `W11_BAYER_INDICES must have 16 values, got ${values.length}`);
  return values;
}

function w11BayerSubpixel(indices, phase) {
  const p = ((phase % 16) + 16) % 16;
  for (let k = 0; k < 16; k++) {
    if (indices[k] === p) return { sx: k % 4, sy: (k / 4) | 0 };
  }
  throw new Error(`phase ${phase} missing from Bayer indices`);
}

const indices = parseBayerIndices(renderer);
const unique = new Set(indices);
assert(unique.size === 16, 'W11_BAYER_INDICES is not a bijection (duplicates)');
for (let i = 0; i < 16; i++) {
  assert(unique.has(i), `W11_BAYER_INDICES missing value ${i}`);
}

const seen = new Set();
for (let phase = 0; phase < 16; phase++) {
  const { sx, sy } = w11BayerSubpixel(indices, phase);
  assert(sx >= 0 && sx < 4 && sy >= 0 && sy < 4, `phase ${phase} maps outside 4x4`);
  assert(indices[sy * 4 + sx] === phase, `phase ${phase} reverse lookup disagrees with sy*4+sx indexing`);
  const key = `${sx},${sy}`;
  assert(!seen.has(key), `duplicate subpixel ${key}`);
  seen.add(key);
}
assert(seen.size === 16, '16 phases do not cover all 4x4 subpixels');

assertIncludes(renderer, [
  'function w11BayerSubpixel(phase: number)',
  'W11_BAYER_INDICES[k] === p',
  'sx: k % 4, sy: (k / 4) | 0',
  'const BAYER : array<i32, 16> = array<i32, 16>(${W11_BAYER_INDICES.join(', ')});',
  'BAYER[sub.y * 4 + sub.x]',
], 'Bayer single-source + WGSL index convention');

const literalArrays = renderer.match(/array<i32, 16>\(\s*[\d,\s]+\)/g) ?? [];
assert(literalArrays.length === 0, 'resolve WGSL must not embed a second Bayer literal array');
const bayerConstDefs = renderer.match(/const W11_BAYER_INDICES = \[/g) ?? [];
assert(bayerConstDefs.length === 1, 'W11_BAYER_INDICES must be defined exactly once');

const passModeBlock = (() => {
  const start = cloud.indexOf('if (passMode == 1)');
  assert(start >= 0, 'cloud.wgsl passMode == 1 branch missing');
  const open = cloud.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < cloud.length; i++) {
    if (cloud[i] === '{') depth++;
    if (cloud[i] === '}') {
      depth--;
      if (depth === 0) return cloud.slice(start, i + 1);
    }
  }
  throw new Error('W11 bayer phase failed: passMode == 1 branch has no closing brace');
})();
assert(!passModeBlock.includes('jitterX'), 'TAAU passMode==1 must not use params.g.jitterX');
assert(!passModeBlock.includes('jitterY'), 'TAAU passMode==1 must not use params.g.jitterY');

assertIncludes(renderer, [
  'writeCameraUniform(cameraData, cameraBuffer, 2, 0, 0, 0, 0)',
  'writeCameraUniform(cameraDataTaauCurrent, cameraBufferTaauCurrent, 1, 0, 0, 0, 0)',
  'if (taaOn && activeTemporalModeNum === 1)',
  'jitterX = halton(hi, 2) - 0.5',
  'jitterY = halton(hi, 3) - 0.5',
], 'TAAU zeros jitterPixels; Halton only on full-res TAA');

const bayerFn = (() => {
  const start = renderer.indexOf('function w11BayerSubpixel');
  assert(start >= 0, 'w11BayerSubpixel missing');
  const open = renderer.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < renderer.length; i++) {
    if (renderer[i] === '{') depth++;
    if (renderer[i] === '}') {
      depth--;
      if (depth === 0) return renderer.slice(start, i + 1);
    }
  }
  throw new Error('W11 bayer phase failed: w11BayerSubpixel has no closing brace');
})();
assert(!/stbn|STBN|ign|halton|interleavedGradient/i.test(bayerFn),
  'Bayer phase lookup must not involve STBN/IGN/Halton');

const phaseAssign = renderer.includes('const temporalBayerPhase = frameIndex % 16');
assert(phaseAssign, 'phase must be frameIndex % 16');
assert(!/temporalBayerPhase\s*=\s*[^\n]*stbn/i.test(renderer), 'STBN must not drive temporalBayerPhase');
assert(!/bayerSub\s*=\s*[^\n]*stbn/i.test(renderer), 'STBN must not drive bayerSub');

console.log('W11 bayer phase contracts passed');
