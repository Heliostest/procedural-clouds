import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(OUT, 'screenshots');

/** Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced, zlib IDAT. */
export function decodePngRgba(buf) {
  if (buf.length < 8 || buf.toString('ascii', 0, 8) !== '\u0089PNG\r\n\u001a\n'
    && !(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    throw new Error('not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(`unsupported PNG compression/filter/interlace: ${data[10]}/${data[11]}/${data[12]}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!width || !height) throw new Error('missing IHDR');
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const expected = height * (1 + stride);
  if (inflated.length < expected) throw new Error(`IDAT too short: ${inflated.length}<${expected}`);
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let dst = 0;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    inflated.copy(row, 0, src, src + stride);
    src += stride;
    if (filter === 0) {
      // none
    } else if (filter === 1) {
      for (let i = channels; i < stride; i++) row[i] = (row[i] + row[i - channels]) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) row[i] = (row[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? row[i - channels] : 0;
        row[i] = (row[i] + ((left + prev[i]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[i] = (row[i] + pr) & 255;
      }
    } else {
      throw new Error(`unsupported PNG filter ${filter}`);
    }
    if (channels === 4) {
      row.copy(rgba, dst, 0, stride);
      dst += stride;
    } else {
      for (let i = 0; i < width; i++) {
        rgba[dst++] = row[i * 3];
        rgba[dst++] = row[i * 3 + 1];
        rgba[dst++] = row[i * 3 + 2];
        rgba[dst++] = 255;
      }
    }
    row.copy(prev);
  }
  return { width, height, rgba };
}

export function maxAbsChannelDiff(aPath, bPath, pixelThreshold = 0) {
  const a = decodePngRgba(readFileSync(aPath));
  const b = decodePngRgba(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  let maxAbs = 0;
  let changed = 0;
  let changedPixels = 0;
  let aboveThresholdPixels = 0;
  const n = a.rgba.length;
  const pixelCount = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const base = (y * a.width + x) * 4;
      let pixelMax = 0;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(a.rgba[base + c] - b.rgba[base + c]);
        if (d > 0) changed++;
        if (d > maxAbs) maxAbs = d;
        if (d > pixelMax) pixelMax = d;
      }
      if (pixelMax > 0) changedPixels++;
      if (pixelMax > pixelThreshold) aboveThresholdPixels++;
    }
  }
  return {
    width: a.width,
    height: a.height,
    maxAbs,
    changedChannels: changed,
    totalChannels: n,
    changedPixels,
    aboveThresholdPixels,
    pixelCount,
    changedPixelRatio: pixelCount > 0 ? changedPixels / pixelCount : 0,
    aboveThresholdPixelRatio: pixelCount > 0 ? aboveThresholdPixels / pixelCount : 0,
    pixelDiffThreshold: pixelThreshold,
    shaA: createHash('sha256').update(readFileSync(aPath)).digest('hex'),
    shaB: createHash('sha256').update(readFileSync(bPath)).digest('hex'),
  };
}

const REF_THRESHOLD = Number(process.env.W11_MAXABS_REF_THRESHOLD || 24);
const selected = existsSync(path.join(OUT, 'selected-cases.json'))
  ? JSON.parse(readFileSync(path.join(OUT, 'selected-cases.json'), 'utf8'))
  : [];

const pairs = [];
for (const entry of selected) {
  const short = entry.short
    ?? String(entry.sceneId || '').replace(/^single-/, '').replace(/^w9-/, '').replace(/-proxy$/, '');
  if (!short) continue;
  pairs.push({
    id: `${short}__T1-vs-T2`,
    a: `${short}__temporal-T1__clean.png`,
    b: `${short}__temporal-T2__clean.png`,
    kind: 'temporal-T1-vs-T2',
    scene: short,
  });
}

const convShort = process.env.W11_CONV_SCENE
  || selected.find((e) => e.role === 'cc-ripple')?.short
  || selected.find((e) => e.sceneId === 'single-cirrocumulus')?.short
  || 'cirrocumulus';
pairs.push({
  id: `${convShort}__conv-f16-vs-f17`,
  a: `${convShort}__conv-f16.png`,
  b: `${convShort}__conv-f17.png`,
  kind: 'convergence-adjacent-T2',
  scene: convShort,
  note: 'TAAU adjacent frames under frozen sceneClock',
});
pairs.push({
  id: `${convShort}__conv-T1-f16-vs-f17`,
  a: `${convShort}__conv-T1-f16.png`,
  b: `${convShort}__conv-T1-f17.png`,
  kind: 'convergence-adjacent-T1-control',
  scene: convShort,
  note: 'full-res TAA adjacent-frame control under same frozen sceneClock',
});
pairs.push({
  id: `${convShort}__conv-f17-vs-T1-steady`,
  a: `${convShort}__conv-f17.png`,
  b: `${convShort}__temporal-T1-steady__clean.png`,
  kind: 'convergence-vs-fullres-taa',
  scene: convShort,
});

const results = {};
const errors = [];
for (const pair of pairs) {
  const aPath = path.join(SHOTS, pair.a);
  const bPath = path.join(SHOTS, pair.b);
  if (!existsSync(aPath) || !existsSync(bPath)) {
    results[pair.id] = {
      status: 'UNABLE',
      kind: pair.kind,
      scene: pair.scene,
      reason: 'missing clean pair',
      evidence: [`screenshots/${pair.a}`, `screenshots/${pair.b}`],
    };
    continue;
  }
  try {
    const diff = maxAbsChannelDiff(aPath, bPath, REF_THRESHOLD);
    results[pair.id] = {
      status: 'OBSERVATION',
      kind: pair.kind,
      scene: pair.scene,
      algorithm: 'png-zlib-idat-filter01234-rgba8-maxAbsPerChannel',
      referenceThreshold: REF_THRESHOLD,
      note: pair.note
        || 'OBSERVATION only; referenceThreshold is non-normative and must not be promoted to visual PASS',
      ...diff,
      evidence: [`screenshots/${pair.a}`, `screenshots/${pair.b}`],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ id: pair.id, message });
    results[pair.id] = {
      status: 'UNABLE',
      kind: pair.kind,
      scene: pair.scene,
      reason: message,
    };
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  algorithm: 'png-zlib-idat-filter01234-rgba8-maxAbsPerChannel',
  referenceThreshold: REF_THRESHOLD,
  note: 'All diffs are OBSERVATION. referenceThreshold is informal only; never visual Gate PASS. aboveThresholdPixelRatio uses the same non-normative threshold.',
  results,
  errors,
};
writeFileSync(path.join(OUT, 'pixel-diff.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  referenceThreshold: REF_THRESHOLD,
  summary: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
    status: v.status,
    maxAbs: v.maxAbs ?? null,
    aboveThresholdPixelRatio: v.aboveThresholdPixelRatio ?? null,
    changedPixelRatio: v.changedPixelRatio ?? null,
    reason: v.reason ?? null,
  }])),
}, null, 2));
