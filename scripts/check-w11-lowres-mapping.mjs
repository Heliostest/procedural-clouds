import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');

function assert(condition, message) {
  if (!condition) throw new Error(`W11 lowres mapping failed: ${message}`);
}

function lowSize(W, H) {
  return { lowW: Math.max(1, Math.ceil(W / 4)), lowH: Math.max(1, Math.ceil(H / 4)) };
}

const sizes = [
  [1920, 1080],
  [1921, 1081],
  [1, 1],
  [7, 5],
  [4096, 2160],
  [4, 4],
  [5, 8],
];
for (const [W, H] of sizes) {
  const { lowW, lowH } = lowSize(W, H);
  assert(lowW === Math.ceil(W / 4) || (W === 0), `lowW for ${W}x${H}`);
  assert(lowH === Math.ceil(H / 4) || (H === 0), `lowH for ${W}x${H}`);
  assert(lowW >= 1 && lowH >= 1, `low size must be at least 1 for ${W}x${H}`);
}

function mapFullPixel(lx, ly, sx, sy, W, H) {
  const fullPixX = lx * 4 + (sx + 0.5);
  const fullPixY = ly * 4 + (sy + 0.5);
  const ndcX = fullPixX / W * 2 - 1;
  const ndcY = 1 - fullPixY / H * 2;
  const pixelX = Math.floor((ndcX * 0.5 + 0.5) * W);
  const pixelY = Math.floor((0.5 - ndcY * 0.5) * H);
  return {
    fullPixX,
    fullPixY,
    ndcX,
    ndcY,
    pixelX: Math.floor(fullPixX),
    pixelY: Math.floor(fullPixY),
    roundTripX: pixelX,
    roundTripY: pixelY,
  };
}

for (const [W, H] of sizes) {
  const { lowW, lowH } = lowSize(W, H);
  const covered = new Set();
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      for (let ly = 0; ly < lowH; ly++) {
        for (let lx = 0; lx < lowW; lx++) {
          const mapped = mapFullPixel(lx, ly, sx, sy, W, H);
          assert(
            mapped.pixelX === 4 * lx + sx && mapped.pixelY === 4 * ly + sy,
            `phase (${sx},${sy}) low (${lx},${ly}) @${W}x${H} mapped to (${mapped.pixelX},${mapped.pixelY})`,
          );
          if (mapped.pixelX >= 0 && mapped.pixelX < W && mapped.pixelY >= 0 && mapped.pixelY < H) {
            covered.add(`${mapped.pixelX},${mapped.pixelY}`);
          }
        }
      }
    }
  }
  assert(covered.size === W * H, `${W}x${H} in-viewport coverage ${covered.size} != ${W * H}`);
}

for (const [W, H] of [[1921, 1081], [7, 5], [5, 8]]) {
  assert(W % 4 !== 0 || H % 4 !== 0, 'fixture expects non-multiple size');
  const { lowW, lowH } = lowSize(W, H);
  let outOfViewport = 0;
  for (let ly = 0; ly < lowH; ly++) {
    for (let lx = 0; lx < lowW; lx++) {
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const fx = 4 * lx + sx;
          const fy = 4 * ly + sy;
          if (fx >= W || fy >= H) outOfViewport++;
        }
      }
    }
  }
  assert(outOfViewport > 0, `${W}x${H} must produce out-of-viewport full pixels from trailing low-res texels`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lowCoordX = (x / 4) | 0;
      const lowCoordY = (y / 4) | 0;
      assert(lowCoordX < lowW && lowCoordY < lowH, `resolve texel (${x},${y}) lowCoord out of low-res`);
      assert(lowCoordX === Math.floor(x / 4) && lowCoordY === Math.floor(y / 4), 'integer lowCoord = coord / 4');
    }
  }
  const lastCol = lowW - 1;
  const lastRow = lowH - 1;
  assert(lastCol * 4 < W || lastCol * 4 + 3 >= W, 'trailing column exists when W%4!=0');
  if (W % 4 !== 0) {
    assert(lastCol * 4 + 3 >= W, 'last low-res column spans past W');
  }
  if (H % 4 !== 0) {
    assert(lastRow * 4 + 3 >= H, 'last low-res row spans past H');
  }
}

assert(renderer.includes('Math.ceil(w / 4)'), 'renderer must allocate ceil(W/4)');
assert(renderer.includes('Math.ceil(h / 4)'), 'renderer must allocate ceil(H/4)');
assert(cloud.includes('let fullPix = lowCoord * 4.0 + camera.taauMode.yz'), 'shader fullPix mapping missing');
assert(cloud.includes('fullPix.x * camera.taauTargetSize.z * 2.0 - 1.0'), 'shader ndc.x mapping missing');
assert(cloud.includes('1.0 - fullPix.y * camera.taauTargetSize.w * 2.0'), 'shader ndc.y mapping missing');
assert(renderer.includes('let lowCoord = coord / 4'), 'resolve lowCoord = coord / 4 missing');

const forbidden = [
  'lowW * 4 / W',
  'lowH * 4 / H',
  '(lowW*4)/W',
  '(lowH*4)/H',
  'lowW * 4.0 /',
  'float(lowW) * 4.0 /',
];
for (const token of forbidden) {
  assert(!renderer.includes(token) && !cloud.includes(token), `must not use linear low→full scale factor ${token}`);
}
assert(!/lowW\s*\*\s*4\s*\/\s*W/.test(renderer + cloud), 'must not scale by lowW*4/W');
assert(!/lowSize\.x\s*\*\s*4\.0\s*\/\s*/.test(cloud), 'must not scale by lowSize*4/full');

console.log('W11 lowres mapping contracts passed');
