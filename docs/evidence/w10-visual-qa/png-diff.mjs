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

export function maxAbsChannelDiff(aPath, bPath) {
  const a = decodePngRgba(readFileSync(aPath));
  const b = decodePngRgba(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  let maxAbs = 0;
  let changed = 0;
  const n = a.rgba.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.rgba[i] - b.rgba[i]);
    if (d > 0) changed++;
    if (d > maxAbs) maxAbs = d;
  }
  return {
    width: a.width,
    height: a.height,
    maxAbs,
    changedChannels: changed,
    totalChannels: n,
    shaA: createHash('sha256').update(readFileSync(aPath)).digest('hex'),
    shaB: createHash('sha256').update(readFileSync(bPath)).digest('hex'),
  };
}

const pairs = [
  ['stratus', 'stratus__mode-A__clean.png', 'stratus__mode-B__clean.png'],
  ['cirrostratus', 'cirrostratus__mode-A__clean.png', 'cirrostratus__mode-B__clean.png'],
  ['stratocumulus', 'stratocumulus__mode-A__clean.png', 'stratocumulus__mode-B__clean.png'],
  ['cirrocumulus', 'cirrocumulus__mode-A__clean.png', 'cirrocumulus__mode-B__clean.png'],
];

const THRESHOLD = Number(process.env.W10_AB_MAXABS_THRESHOLD || 24);
const results = {};
const errors = [];
for (const [scene, aName, bName] of pairs) {
  const aPath = path.join(SHOTS, aName);
  const bPath = path.join(SHOTS, bName);
  if (!existsSync(aPath) || !existsSync(bPath)) {
    results[scene] = { status: 'UNABLE', reason: 'missing clean pair' };
    continue;
  }
  try {
    const diff = maxAbsChannelDiff(aPath, bPath);
    results[scene] = {
      status: diff.maxAbs <= THRESHOLD ? 'PASS' : 'FAIL',
      algorithm: 'png-zlib-idat-filter01234-rgba8-maxAbsPerChannel',
      threshold: THRESHOLD,
      ...diff,
      evidence: [`screenshots/${aName}`, `screenshots/${bName}`],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ scene, message });
    results[scene] = { status: 'UNABLE', reason: message };
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  algorithm: 'png-zlib-idat-filter01234-rgba8-maxAbsPerChannel',
  threshold: THRESHOLD,
  note: 'Compares mode-A vs mode-B clean PNGs. TAA/grain may produce small nonzero maxAbs.',
  results,
  errors,
};
writeFileSync(path.join(OUT, 'pixel-diff-ab.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  threshold: THRESHOLD,
  summary: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
    status: v.status,
    maxAbs: v.maxAbs ?? null,
    reason: v.reason ?? null,
  }])),
}, null, 2));
