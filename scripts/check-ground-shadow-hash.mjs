import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shader = await readFile(new URL('../shaders/cloud.wgsl', import.meta.url), 'utf8');

assert.match(shader, /fn groundShadowHash\(cell : vec2u, sampleIndex : u32, phase : u32\)/);
assert.doesNotMatch(shader, /floor\(xz \* 64\.0\)/);
assert.match(shader, /integrateGroundShadow\(p, gid\.xy, groundShadowPhase\(\)\)/);

function mixBits(value) {
  let state = value >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  state = Math.imul(state, 0x7feb352d) >>> 0;
  state = (state ^ (state >>> 15)) >>> 0;
  state = Math.imul(state, 0x846ca68b) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  return state;
}

function groundShadowHash(x, y, sampleIndex, phase = 0) {
  const seed = (
    Math.imul(x, 0x9e3779b9)
    ^ Math.imul(y, 0x85ebca6b)
    ^ Math.imul(sampleIndex, 0xc2b2ae35)
  ) >>> 0;
  const spatial = (mixBits(seed) >>> 8) / 16777216;
  return (spatial + phase * 0.61803398875) % 1;
}

function autocorrelation(values, lag) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i++) {
    const centered = values[i] - mean;
    denominator += centered * centered;
    if (i + lag < values.length) {
      numerator += centered * (values[i + lag] - mean);
    }
  }
  return numerator / denominator;
}

// The previous IGN input advanced by exactly four lattice cells per 512-map
// texel in the default 32-world-unit shadow extent, producing |r(4)| ~= 0.5.
const axes = {
  row: Array.from({ length: 512 }, (_, x) => groundShadowHash(x, 0, 0)),
  column: Array.from({ length: 512 }, (_, y) => groundShadowHash(0, y, 0)),
};
for (const [axis, values] of Object.entries(axes)) {
  for (let lag = 1; lag <= 8; lag++) {
    assert.ok(
      Math.abs(autocorrelation(values, lag)) < 0.12,
      `shadow hash has excessive ${axis} correlation at lag ${lag}`,
    );
  }
}

for (let x = 0; x < 512; x++) {
  const temporalMean = Array.from(
    { length: 8 },
    (_, phase) => groundShadowHash(x, 0, 0, phase),
  ).reduce((sum, value) => sum + value, 0) / 8;
  assert.ok(
    Math.abs(temporalMean - 0.5) < 0.09,
    `shadow phase cycle is biased at texel ${x}`,
  );
}

console.log('ground-shadow hash correlation check passed');
