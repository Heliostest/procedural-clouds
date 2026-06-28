import { MAX_BODIES } from './params';
import type { CloudBody } from './body';

export const DEFAULT_WEATHER_SIZE = 256;
export const DEFAULT_BOX_HALF_EXTENT = 4.5;

export function shapeLayerBytes(weatherSize: number): number {
  return weatherSize * weatherSize;
}

export function createShapeData(weatherSize: number): Uint8Array {
  return new Uint8Array(shapeLayerBytes(weatherSize) * MAX_BODIES);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bodyAlpha(b: CloudBody, wx: number, wz: number): number {
  let dist: number;
  if (b.shape === 'rect') {
    const dx = Math.max(b.bounds[0] - wx, wx - b.bounds[2], 0);
    const dz = Math.max(b.bounds[1] - wz, wz - b.bounds[3], 0);
    dist = Math.sqrt(dx * dx + dz * dz);
  } else {
    const dx = wx - b.bounds[0];
    const dz = wz - b.bounds[1];
    dist = Math.max(0, Math.sqrt(dx * dx + dz * dz) - b.bounds[2]);
  }
  const feather = Math.max(1e-4, b.feather);
  return 1.0 - smoothstep(0, feather, dist);
}

export function paintBodyShapes(
  data: Uint8Array,
  bodies: CloudBody[],
  weatherSize: number,
  boxHalfExtent: number,
): void {
  data.fill(0);
  const boxMinXZ = -boxHalfExtent;
  const boxSpanXZ = boxHalfExtent * 2;
  const layerBytes = shapeLayerBytes(weatherSize);
  const n = Math.min(bodies.length, MAX_BODIES);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.shape !== 'rect' && b.shape !== 'circle') continue;
    const layerOff = i * layerBytes;
    for (let py = 0; py < weatherSize; py++) {
      const wz = boxMinXZ + ((py + 0.5) / weatherSize) * boxSpanXZ;
      for (let px = 0; px < weatherSize; px++) {
        const wx = boxMinXZ + ((px + 0.5) / weatherSize) * boxSpanXZ;
        const a = bodyAlpha(b, wx, wz);
        data[layerOff + py * weatherSize + px] = Math.round(Math.min(1, a) * 255);
      }
    }
  }
}
