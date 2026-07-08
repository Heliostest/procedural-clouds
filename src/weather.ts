import { MAX_BODIES } from './params';
import type { CloudBody } from './body';

export const DEFAULT_WEATHER_SIZE = 256;
export const DEFAULT_BOX_HALF_EXTENT = 16000;

export function shapeLayerBytes(weatherSize: number): number {
  return weatherSize * weatherSize;
}

export function createShapeData(weatherSize: number): Uint8Array {
  return new Uint8Array(shapeLayerBytes(weatherSize) * MAX_BODIES);
}

// Normalized SDF brush: 0.5 = boundary, 1 = inside >= feather, 0 = outside >= feather.
function bodySDF(b: CloudBody, wx: number, wz: number, cornerRadius: number): number {
  const cx = (b.bounds[0] + b.bounds[2]) / 2;
  const cz = (b.bounds[1] + b.bounds[3]) / 2;
  const hx = (b.bounds[2] - b.bounds[0]) / 2;
  const hz = (b.bounds[3] - b.bounds[1]) / 2;
  const r = Math.max(0, Math.min(cornerRadius, Math.min(hx, hz)));
  const qx = Math.abs(wx - cx) - (hx - r);
  const qz = Math.abs(wz - cz) - (hz - r);
  const mx = Math.max(qx, 0);
  const mz = Math.max(qz, 0);
  const dOut = Math.sqrt(mx * mx + mz * mz) + Math.min(Math.max(qx, qz), 0) - r;
  const d = -dOut;
  const feather = Math.max(1e-4, b.feather);
  return Math.max(0, Math.min(1, 0.5 + 0.5 * d / feather));
}

export function paintBodyShapes(
  data: Uint8Array,
  bodies: CloudBody[],
  weatherSize: number,
  boxHalfExtent: number,
  cornerRadius: number,
): void {
  data.fill(0);
  const boxMinXZ = -boxHalfExtent;
  const boxSpanXZ = boxHalfExtent * 2;
  const layerBytes = shapeLayerBytes(weatherSize);
  const n = Math.min(bodies.length, MAX_BODIES);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const layerOff = i * layerBytes;
    for (let py = 0; py < weatherSize; py++) {
      const wz = boxMinXZ + ((py + 0.5) / weatherSize) * boxSpanXZ;
      for (let px = 0; px < weatherSize; px++) {
        const wx = boxMinXZ + ((px + 0.5) / weatherSize) * boxSpanXZ;
        const s = bodySDF(b, wx, wz, cornerRadius);
        data[layerOff + py * weatherSize + px] = Math.round(s * 255);
      }
    }
  }
}
