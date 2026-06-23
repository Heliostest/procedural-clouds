import { PRESET_COUNT, presetIndex } from './params';

export const WEATHER_SIZE = 256;

export const BOX_MIN_XZ = -4.5;
export const BOX_SPAN_XZ = 9.0;

export type RegionShape = 'rect' | 'circle';

export interface Region {
  shape: RegionShape;
  bounds: [number, number, number, number];
  type: string;
  coverage: number;
  feather: number;
}

export interface WeatherConfig {
  aType: string;
  aCoverage: number;
  aCenterX: number;
  aCenterZ: number;
  aSizeX: number;
  aSizeZ: number;
  aFeather: number;
  bType: string;
  bCoverage: number;
  bCenterX: number;
  bCenterZ: number;
  bRadius: number;
  bFeather: number;
}

export function createDefaultWeather(): WeatherConfig {
  return {
    aType: 'cumulus',
    aCoverage: 0.7,
    aCenterX: -2.0,
    aCenterZ: 0.0,
    aSizeX: 2.0,
    aSizeZ: 2.0,
    aFeather: 1.5,
    bType: 'cirrus',
    bCoverage: 0.5,
    bCenterX: 2.0,
    bCenterZ: 0.0,
    bRadius: 1.8,
    bFeather: 1.5,
  };
}

export function buildRegions(c: WeatherConfig): Region[] {
  return [
    {
      shape: 'rect',
      bounds: [c.aCenterX - c.aSizeX, c.aCenterZ - c.aSizeZ, c.aCenterX + c.aSizeX, c.aCenterZ + c.aSizeZ],
      type: c.aType,
      coverage: c.aCoverage,
      feather: c.aFeather,
    },
    {
      shape: 'circle',
      bounds: [c.bCenterX, c.bCenterZ, c.bRadius, 0],
      type: c.bType,
      coverage: c.bCoverage,
      feather: c.bFeather,
    },
  ];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function regionAlpha(r: Region, wx: number, wz: number): number {
  let dist: number;
  if (r.shape === 'rect') {
    const dx = Math.max(r.bounds[0] - wx, wx - r.bounds[2], 0);
    const dz = Math.max(r.bounds[1] - wz, wz - r.bounds[3], 0);
    dist = Math.sqrt(dx * dx + dz * dz);
  } else {
    const dx = wx - r.bounds[0];
    const dz = wz - r.bounds[1];
    dist = Math.max(0, Math.sqrt(dx * dx + dz * dz) - r.bounds[2]);
  }
  const feather = Math.max(1e-4, r.feather);
  return 1.0 - smoothstep(0, feather, dist);
}

export function createWeatherData(): Uint8Array {
  return new Uint8Array(WEATHER_SIZE * WEATHER_SIZE * 4);
}

export function paintRegions(data: Uint8Array, regions: Region[]): void {
  const typeDenom = Math.max(1, PRESET_COUNT - 1);
  for (let py = 0; py < WEATHER_SIZE; py++) {
    const wz = BOX_MIN_XZ + ((py + 0.5) / WEATHER_SIZE) * BOX_SPAN_XZ;
    for (let px = 0; px < WEATHER_SIZE; px++) {
      const wx = BOX_MIN_XZ + ((px + 0.5) / WEATHER_SIZE) * BOX_SPAN_XZ;
      let bestCov = 0;
      let bestType = 0;
      for (let id = 0; id < regions.length; id++) {
        const r = regions[id];
        const cov = r.coverage * regionAlpha(r, wx, wz);
        if (cov > bestCov) {
          bestCov = cov;
          bestType = presetIndex(r.type);
        }
      }
      const o = (py * WEATHER_SIZE + px) * 4;
      data[o + 0] = Math.round(Math.min(1, bestCov) * 255);
      data[o + 1] = Math.round((bestType / typeDenom) * 255);
      data[o + 2] = 255;
      data[o + 3] = 0;
    }
  }
}
