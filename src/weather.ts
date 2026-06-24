import { MAX_BODIES } from './params';
import type { CloudBody } from './body';

export const WEATHER_SIZE = 256;
export const BOX_MIN_XZ = -4.5;
export const BOX_SPAN_XZ = 9.0;

export const SHAPE_LAYER_BYTES = WEATHER_SIZE * WEATHER_SIZE;

export function createShapeData(): Uint8Array {
  return new Uint8Array(SHAPE_LAYER_BYTES * MAX_BODIES);
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

export function paintBodyShapes(data: Uint8Array, bodies: CloudBody[]): void {
  data.fill(0);
  const n = Math.min(bodies.length, MAX_BODIES);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const layerOff = i * SHAPE_LAYER_BYTES;
    for (let py = 0; py < WEATHER_SIZE; py++) {
      const wz = BOX_MIN_XZ + ((py + 0.5) / WEATHER_SIZE) * BOX_SPAN_XZ;
      for (let px = 0; px < WEATHER_SIZE; px++) {
        const wx = BOX_MIN_XZ + ((px + 0.5) / WEATHER_SIZE) * BOX_SPAN_XZ;
        const a = bodyAlpha(b, wx, wz);
        data[layerOff + py * WEATHER_SIZE + px] = Math.round(Math.min(1, a) * 255);
      }
    }
  }
}
