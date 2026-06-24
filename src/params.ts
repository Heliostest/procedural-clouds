import type { CloudBody } from './body';
import type { RegionMod } from './lifecycle';

export const MAX_BODIES = 12;
export const BODY_BASE = 12;
export const BODY_STRIDE = 12;

export const PARAM_OFFSETS: Record<string, number> = {
  rayMarchSteps: 0,
  lightMarchSteps: 1,
  shadowDarkness: 2,
  sunIntensity: 3,
  skipLight: 4,
  cacheBlend: 5,
  activeBodyCount: 6,
  cloudHeight: 7,
  sceneTime: 8,
  deltaTime: 9,
  weatherMorph: 10,
};

export const PARAMS_FLOAT_COUNT = BODY_BASE + MAX_BODIES * BODY_STRIDE;
export const PARAMS_BYTE_SIZE = PARAMS_FLOAT_COUNT * 4;

export const SHAPE_PRESET_KEYS = [
  'density', 'coverage', 'altitude', 'scale', 'detail', 'cloudHeight',
  'coverageThreshold', 'edgeSharpness', 'baseRoundness', 'worleyBlend',
  'detailStrength', 'altBase', 'altTop',
] as const;

export type ShapeKey = (typeof SHAPE_PRESET_KEYS)[number];
export type ShapePreset = Record<ShapeKey, number>;

export const CLOUD_PRESETS: Record<string, ShapePreset> = {
  cumulus:       { density: 1.0, coverage: 0.55, altitude: 0.5, scale: 3.75, detail: 1.0, cloudHeight: 1.6, coverageThreshold: 0.0,  edgeSharpness: 0.6,  baseRoundness: 0.35, worleyBlend: 0.5,  detailStrength: 1.0, altBase: 0.0,  altTop: 0.7 },
  stratus:       { density: 1.2, coverage: 0.9,  altitude: 0.35, scale: 6.0,  detail: 0.5, cloudHeight: 1.0, coverageThreshold: 0.0,  edgeSharpness: 0.15, baseRoundness: 0.0,  worleyBlend: 0.1,  detailStrength: 0.4, altBase: 0.0,  altTop: 0.45 },
  stratocumulus: { density: 1.1, coverage: 0.7,  altitude: 0.45, scale: 4.5,  detail: 1.0, cloudHeight: 1.3, coverageThreshold: 0.0,  edgeSharpness: 0.4,  baseRoundness: 0.2,  worleyBlend: 0.4,  detailStrength: 0.8, altBase: 0.0,  altTop: 0.6 },
  cumulonimbus:  { density: 2.2, coverage: 0.5,  altitude: 0.7,  scale: 5.0,  detail: 2.0, cloudHeight: 3.5, coverageThreshold: 0.1,  edgeSharpness: 0.8,  baseRoundness: 0.5,  worleyBlend: 0.65, detailStrength: 1.1, altBase: 0.0,  altTop: 1.0 },
  altocumulus:   { density: 0.9, coverage: 0.55, altitude: 0.4, scale: 2.5,  detail: 1.0, cloudHeight: 1.5, coverageThreshold: 0.05, edgeSharpness: 0.5,  baseRoundness: 0.1,  worleyBlend: 0.7,  detailStrength: 0.7, altBase: 0.3,  altTop: 0.8 },
  altostratus:   { density: 1.0, coverage: 0.85, altitude: 0.35, scale: 6.0,  detail: 0.5, cloudHeight: 1.2, coverageThreshold: 0.0,  edgeSharpness: 0.15, baseRoundness: 0.0,  worleyBlend: 0.05, detailStrength: 0.3, altBase: 0.3,  altTop: 0.8 },
  nimbostratus:  { density: 1.8, coverage: 0.95, altitude: 0.5,  scale: 6.5,  detail: 0.5, cloudHeight: 1.6, coverageThreshold: 0.0,  edgeSharpness: 0.1,  baseRoundness: 0.0,  worleyBlend: 0.1,  detailStrength: 0.4, altBase: 0.1,  altTop: 0.75 },
  cirrus:        { density: 0.6, coverage: 0.35, altitude: 0.3, scale: 2.2,  detail: 2.5, cloudHeight: 1.2, coverageThreshold: 0.15, edgeSharpness: 0.7,  baseRoundness: 0.0,  worleyBlend: 0.15, detailStrength: 1.3, altBase: 0.65, altTop: 1.0 },
  cirrostratus:  { density: 0.5, coverage: 0.7,  altitude: 0.3, scale: 5.0,  detail: 0.5, cloudHeight: 1.1, coverageThreshold: 0.0,  edgeSharpness: 0.1,  baseRoundness: 0.0,  worleyBlend: 0.0,  detailStrength: 0.3, altBase: 0.65, altTop: 1.0 },
  cirrocumulus:  { density: 0.6, coverage: 0.4,  altitude: 0.3, scale: 1.5,  detail: 1.5, cloudHeight: 1.1, coverageThreshold: 0.1,  edgeSharpness: 0.6,  baseRoundness: 0.0,  worleyBlend: 0.8,  detailStrength: 0.9, altBase: 0.6,  altTop: 1.0 },
};

export type PresetKey = keyof typeof CLOUD_PRESETS;

export const PRESET_ORDER = Object.keys(CLOUD_PRESETS);
export const PRESET_COUNT = PRESET_ORDER.length;
export const PRESET_FLOAT_COUNT = PRESET_COUNT * 16;
export const PRESET_BYTE_SIZE = PRESET_FLOAT_COUNT * 4;

export function presetIndex(name: string): number {
  const i = PRESET_ORDER.indexOf(name);
  return i < 0 ? 0 : i;
}

export function packPresetArray(): Float32Array {
  const out = new Float32Array(PRESET_FLOAT_COUNT);
  PRESET_ORDER.forEach((key, i) => {
    const p = CLOUD_PRESETS[key];
    const o = i * 16;
    out[o + 0] = p.density;           out[o + 1] = p.coverage;
    out[o + 2] = p.altitude;          out[o + 3] = p.scale;
    out[o + 4] = p.detail;            out[o + 5] = p.cloudHeight;
    out[o + 6] = p.coverageThreshold; out[o + 7] = p.edgeSharpness;
    out[o + 8] = p.baseRoundness;     out[o + 9] = p.worleyBlend;
    out[o + 10] = p.detailStrength;   out[o + 11] = p.altBase;
    out[o + 12] = p.altTop;
  });
  return out;
}

export interface CloudParams {
  cloudHeight: number;
  morphStrength: number;
  showBodyBounds: boolean;
  selectedBody: string | null;
  skipLight: boolean;
  rayMarchSteps: number;
  lightMarchSteps: number;
  shadowDarkness: number;
  sunIntensity: number;
  cacheResolution: number;
  cacheUpdateRate: number;
  cacheSmooth: number;
}

export type PackValue = number | boolean | number[];

export function packParams(dst: Float32Array, values: Record<string, PackValue>): Float32Array {
  for (const key in values) {
    const v = values[key];
    const off = PARAM_OFFSETS[key];
    if (off === undefined) continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) dst[off + i] = v[i];
    } else {
      dst[off] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    }
  }
  return dst;
}

export function packBodies(dst: Float32Array, bodies: CloudBody[], mods?: RegionMod[]): void {
  const n = Math.min(bodies.length, MAX_BODIES);
  dst[PARAM_OFFSETS.activeBodyCount] = n;
  for (let i = 0; i < MAX_BODIES; i++) {
    const o = BODY_BASE + i * BODY_STRIDE;
    if (i < n) {
      const b = bodies[i];
      const m = mods?.[i];
      const rad = b.windDeg * Math.PI / 180.0;
      const altTop = Math.min(1.0, b.base + Math.max(0.02, b.thickness));
      dst[o + 0] = b.base;
      dst[o + 1] = altTop;
      dst[o + 2] = presetIndex(b.type);
      dst[o + 3] = 1.0;
      dst[o + 4] = Math.cos(rad);
      dst[o + 5] = Math.sin(rad);
      dst[o + 6] = b.windSpeed;
      dst[o + 7] = b.morphRate;
      dst[o + 8] = b.coverage * (m ? m.coverageMul : 1);
      dst[o + 9] = b.densityScale * (m ? m.densityScale : 1);
      dst[o + 10] = m ? m.morph : 0;
      dst[o + 11] = 0;
    } else {
      for (let k = 0; k < BODY_STRIDE; k++) dst[o + k] = 0;
    }
  }
}

export function createDefaultParams(): CloudParams {
  return {
    cloudHeight: 8.0,
    morphStrength: 0,
    showBodyBounds: true,
    selectedBody: null,
    skipLight: false,
    rayMarchSteps: 48,
    lightMarchSteps: 4,
    shadowDarkness: 5,
    sunIntensity: 17,
    cacheResolution: 96,
    cacheUpdateRate: 2,
    cacheSmooth: 0,
  };
}
