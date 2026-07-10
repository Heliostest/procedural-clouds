import type { CloudBody } from './body';
import type { BodyMod } from './lifecycle';
import { DEFAULT_SCENE_SCALE, metersToWorldXZ, metersToWorldY, normalizedSceneScale, type SceneScale } from './space';
import { assertCompleteGenusProfiles } from './genusProfile';
import type { WindAdvectionSample } from './wind';

export const MAX_BODIES = 12;
export const BODY_BASE = 60;
export const BODY_STRIDE = 20;

export const BODY_WIND_OFFSETS = {
  advectionOffsetWorldX: 4,
  advectionOffsetWorldZ: 5,
  morphTime: 6,
  reserved: 7,
} as const;

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
  sunAzimuth: 11,
  sunElevation: 12,
  silverIntensity: 13,
  powderStrength: 14,
  hgForward: 15,
  hgBackward: 16,
  hgBlend: 17,
  godrayStrength: 18,
  qualityMode: 19,
  detailFreq: 20,
  detailStrength: 21,
  typeLightingBlend: 22,
  boxHalfExtent: 23,
  lightMarchStepSize: 24,
  verticalEdgeRange: 25,
  verticalEdgeShape: 26,
  edgeHardness: 27,
  edgeHardnessThreshold: 28,
  cacheWorkgroupX: 29,
  cacheWorkgroupY: 30,
  cacheWorkgroupZ: 31,
  fxAbsorption: 32,
  debugView: 33,
  edgeCurveWidth: 34,
  edgeCurveShaper: 35,
  frameIndex: 36,
  adaptiveMarch: 37,
  temporalDither: 38,
  aerialDensity: 39,
  aerialInscatter: 40,
  aerialHeightFalloff: 41,
  shadowTintStrength: 42,
  jitterX: 43,
  jitterY: 44,
  taaEnabled: 45,
  edgeSharpening: 46,
  groundShadowMode: 47,
  groundShadowMaxSteps: 48,
  groundShadowStepScale: 49,
  groundShadowJitter: 50,
  groundShadowMapValid: 51,
  groundShadowMapGuard: 52,
  groundShadowPhase: 53,
  todPaletteBlend: 54,
  msModel: 55,
  energyConservingScatter: 56,
  densityShapeModel: 57,
  heightAmbientModel: 58,
};

export const GROUND_SHADOW_MODE = {
  legacy: 0,
  adaptive: 1,
  transmittance: 2,
} as const;

export const PARAMS_FLOAT_COUNT = BODY_BASE + MAX_BODIES * BODY_STRIDE;
export const PARAMS_BYTE_SIZE = PARAMS_FLOAT_COUNT * 4;

export const BASE_PRESET_KEYS = [
  'density', 'coverage', 'altitude', 'scale', 'detail', 'cloudHeight',
  'coverageThreshold', 'edgeSharpness', 'worleyBlend',
  'detailStrength', 'altBase', 'altTop',
  'absorptionCoeff', 'phaseForward', 'phaseBack', 'silverLining',
  'baseDarkening', 'sssStrength',
  'sunDiscVisible', 'haloEffect', 'internalLightning',
] as const;

export const MORPHOLOGY_PRESET_KEYS = [
  'baseRoundness', 'anvilStrength', 'topCutoffSharpness',
  'cirrusFiberStrength', 'cirrusFiberCurl',
  'convectiveTowerStrength', 'convectiveCellScale',
  'tileScale',
] as const;

export const EDGE_STYLE_PRESET_KEYS = [
  'edgeHardness', 'edgeErosionStrength',
] as const;

export const SHAPE_PRESET_KEYS = [
  ...BASE_PRESET_KEYS,
  ...MORPHOLOGY_PRESET_KEYS,
  ...EDGE_STYLE_PRESET_KEYS,
] as const;

export type BasePresetKey = (typeof BASE_PRESET_KEYS)[number];
export type MorphologyKey = (typeof MORPHOLOGY_PRESET_KEYS)[number];
export type EdgeStyleKey = (typeof EDGE_STYLE_PRESET_KEYS)[number];
export type ShapeKey = (typeof SHAPE_PRESET_KEYS)[number];

export type PresetMorphology = Record<MorphologyKey, number>;
export type PresetEdgeStyle = Record<EdgeStyleKey, number>;
export type ShapePreset = Record<BasePresetKey, number> & {
  morphology: PresetMorphology;
  edgeStyle: PresetEdgeStyle;
};

export function getPresetField(preset: ShapePreset, key: ShapeKey): number {
  if ((MORPHOLOGY_PRESET_KEYS as readonly string[]).includes(key)) {
    return preset.morphology[key as MorphologyKey];
  }
  if ((EDGE_STYLE_PRESET_KEYS as readonly string[]).includes(key)) {
    return preset.edgeStyle[key as EdgeStyleKey];
  }
  return preset[key as BasePresetKey];
}

export function setPresetField(preset: ShapePreset, key: ShapeKey, value: number): void {
  if ((MORPHOLOGY_PRESET_KEYS as readonly string[]).includes(key)) {
    preset.morphology[key as MorphologyKey] = value;
  } else if ((EDGE_STYLE_PRESET_KEYS as readonly string[]).includes(key)) {
    preset.edgeStyle[key as EdgeStyleKey] = value;
  } else {
    preset[key as BasePresetKey] = value;
  }
}

export const CLOUD_PRESETS: Record<string, ShapePreset> = {
  cumulus:       { density: 1.0, coverage: 0.55, altitude: 0.5, scale: 3.75, detail: 1.0, cloudHeight: 1.6, coverageThreshold: 0.0,  edgeSharpness: 0.6,  worleyBlend: 0.5,  detailStrength: 1.0, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.045, phaseForward: 0.6, phaseBack: -0.2, silverLining: 0.4, baseDarkening: 0.35, sssStrength: 0.3, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.35, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  stratus:       { density: 1.2, coverage: 0.9, altitude: 0.35, scale: 6.0, detail: 0.5, cloudHeight: 1.0, coverageThreshold: 0.0, edgeSharpness: 0.15, worleyBlend: 0.1, detailStrength: 0.4, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.06, phaseForward: 0.3, phaseBack: -0.1, silverLining: 0.1, baseDarkening: 0.15, sssStrength: 0.15, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  stratocumulus: { density: 1.1, coverage: 0.7, altitude: 0.45, scale: 4.5, detail: 1.0, cloudHeight: 1.3, coverageThreshold: 0.0, edgeSharpness: 0.4, worleyBlend: 0.4, detailStrength: 0.8, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.05, phaseForward: 0.4, phaseBack: -0.2, silverLining: 0.25, baseDarkening: 0.25, sssStrength: 0.25, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.2, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  cumulonimbus:  { density: 2.2, coverage: 0.5,  altitude: 0.7,  scale: 5.0,  detail: 2.0, cloudHeight: 3.5, coverageThreshold: 0.1,  edgeSharpness: 0.8,  worleyBlend: 0.65, detailStrength: 1.1, altBase: 0.0,  altTop: 1.0,  absorptionCoeff: 0.1,   phaseForward: 0.7,  phaseBack: -0.3, silverLining: 0.6,  baseDarkening: 0.6,  sssStrength: 0.2,  sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.65, morphology: { baseRoundness: 0.5,  anvilStrength: 0.85, topCutoffSharpness: 0.85, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.82, convectiveCellScale: 0.55, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.85, edgeErosionStrength: 0.85 } },
  altocumulus:   { density: 0.9, coverage: 0.55, altitude: 0.4, scale: 2.5, detail: 1.0, cloudHeight: 1.5, coverageThreshold: 0.05, edgeSharpness: 0.5, worleyBlend: 0.7, detailStrength: 0.7, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.035, phaseForward: 0.4, phaseBack: -0.2, silverLining: 0.3, baseDarkening: 0.2, sssStrength: 0.35, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.1, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.55 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  altostratus:   { density: 1.0, coverage: 0.85, altitude: 0.35, scale: 6.0, detail: 0.5, cloudHeight: 1.2, coverageThreshold: 0.0, edgeSharpness: 0.15, worleyBlend: 0.05, detailStrength: 0.3, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.02, phaseForward: 0.5, phaseBack: 0.0, silverLining: 0.1, baseDarkening: 0.1, sssStrength: 0.5, sunDiscVisible: 0.85, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  nimbostratus:  { density: 1.8, coverage: 0.95, altitude: 0.5, scale: 6.5, detail: 0.5, cloudHeight: 1.6, coverageThreshold: 0.0, edgeSharpness: 0.1, worleyBlend: 0.1, detailStrength: 0.4, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.09, phaseForward: 0.2, phaseBack: 0.0, silverLining: 0.05, baseDarkening: 0.5, sssStrength: 0.1, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  cirrus:        { density: 0.6, coverage: 0.35, altitude: 0.3, scale: 2.2, detail: 2.5, cloudHeight: 1.2, coverageThreshold: 0.15, edgeSharpness: 0.7, worleyBlend: 0.15, detailStrength: 1.3, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.008, phaseForward: 0.8, phaseBack: 0.0, silverLining: 0.5, baseDarkening: 0.05, sssStrength: 0.7, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.78, cirrusFiberCurl: 0.55, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  cirrostratus:  { density: 0.5, coverage: 0.7, altitude: 0.3, scale: 5.0, detail: 0.5, cloudHeight: 1.1, coverageThreshold: 0.0, edgeSharpness: 0.1, worleyBlend: 0.0, detailStrength: 0.3, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.005, phaseForward: 0.85, phaseBack: 0.0, silverLining: 0.2, baseDarkening: 0.0, sssStrength: 0.8, sunDiscVisible: 0.0, haloEffect: 0.75, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.0 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
  cirrocumulus:  { density: 0.6, coverage: 0.4, altitude: 0.3, scale: 1.5, detail: 1.5, cloudHeight: 1.1, coverageThreshold: 0.1, edgeSharpness: 0.6, worleyBlend: 0.8, detailStrength: 0.9, altBase: 0.0, altTop: 1.0, absorptionCoeff: 0.01, phaseForward: 0.7, phaseBack: 0.0, silverLining: 0.3, baseDarkening: 0.1, sssStrength: 0.6, sunDiscVisible: 0.0, haloEffect: 0.0, internalLightning: 0.0, morphology: { baseRoundness: 0.0, anvilStrength: 0.0, topCutoffSharpness: 0.0, cirrusFiberStrength: 0.0, cirrusFiberCurl: 0.0, convectiveTowerStrength: 0.0, convectiveCellScale: 0.0, tileScale: 0.82 }, edgeStyle: { edgeHardness: 0.0, edgeErosionStrength: 0.0 } },
};

export type PresetKey = keyof typeof CLOUD_PRESETS;

export const PRESET_ORDER = Object.keys(CLOUD_PRESETS);
assertCompleteGenusProfiles(PRESET_ORDER);
export const PRESET_COUNT = PRESET_ORDER.length;
export const PRESET_VEC4_COUNT = 8;
export const PRESET_FLOAT_COUNT = PRESET_COUNT * PRESET_VEC4_COUNT * 4;
export const PRESET_BYTE_SIZE = PRESET_FLOAT_COUNT * 4;

export const PRESET_P5_OFFSETS = {
  edgeHardness: 20,
  anvilStrength: 21,
  topCutoffSharpness: 22,
  edgeErosionStrength: 23,
} as const;

export const PRESET_P6_OFFSETS = {
  cirrusFiberStrength: 24,
  cirrusFiberCurl: 25,
  convectiveTowerStrength: 26,
  convectiveCellScale: 27,
} as const;

export const PRESET_P7_OFFSETS = {
  sunDiscVisible: 28,
  haloEffect: 29,
  internalLightning: 30,
  tileScale: 31,
} as const;

const PRESET_P5_BASE = 5 * 4;
const PRESET_P6_BASE = 6 * 4;
const PRESET_P7_BASE = 7 * 4;
if (
  PRESET_P5_OFFSETS.edgeHardness !== PRESET_P5_BASE
  || PRESET_P5_OFFSETS.anvilStrength !== PRESET_P5_BASE + 1
  || PRESET_P5_OFFSETS.topCutoffSharpness !== PRESET_P5_BASE + 2
  || PRESET_P5_OFFSETS.edgeErosionStrength !== PRESET_P5_BASE + 3
) {
  throw new Error('Preset p5 CPU layout no longer matches the WGSL x/y/z/w contract');
}
if (
  PRESET_P6_OFFSETS.cirrusFiberStrength !== PRESET_P6_BASE
  || PRESET_P6_OFFSETS.cirrusFiberCurl !== PRESET_P6_BASE + 1
  || PRESET_P6_OFFSETS.convectiveTowerStrength !== PRESET_P6_BASE + 2
  || PRESET_P6_OFFSETS.convectiveCellScale !== PRESET_P6_BASE + 3
) {
  throw new Error('Preset p6 CPU layout no longer matches the WGSL x/y/z/w contract');
}
if (
  PRESET_P7_OFFSETS.sunDiscVisible !== PRESET_P7_BASE
  || PRESET_P7_OFFSETS.haloEffect !== PRESET_P7_BASE + 1
  || PRESET_P7_OFFSETS.internalLightning !== PRESET_P7_BASE + 2
  || PRESET_P7_OFFSETS.tileScale !== PRESET_P7_BASE + 3
) {
  throw new Error('Preset p7 CPU layout no longer matches the WGSL x/y/z/w contract');
}

export function presetIndex(name: string): number {
  const i = PRESET_ORDER.indexOf(name);
  return i < 0 ? 0 : i;
}

export function packPresetArray(): Float32Array {
  const out = new Float32Array(PRESET_FLOAT_COUNT);
  PRESET_ORDER.forEach((key, i) => {
    const p = CLOUD_PRESETS[key];
    const o = i * PRESET_VEC4_COUNT * 4;
    out[o + 0] = p.density;           out[o + 1] = p.coverage;
    out[o + 2] = p.altitude;          out[o + 3] = p.scale;
    out[o + 4] = p.detail;            out[o + 5] = p.cloudHeight;
    out[o + 6] = p.coverageThreshold; out[o + 7] = p.edgeSharpness;
    out[o + 8] = p.morphology.baseRoundness; out[o + 9] = p.worleyBlend;
    out[o + 10] = p.detailStrength;   out[o + 11] = p.altBase;
    out[o + 12] = p.altTop;           out[o + 13] = p.absorptionCoeff;
    out[o + 14] = p.phaseForward;     out[o + 15] = p.phaseBack;
    out[o + 16] = p.silverLining;     out[o + 17] = p.baseDarkening;
    out[o + 18] = p.sssStrength;
    out[o + PRESET_P5_OFFSETS.edgeHardness] = p.edgeStyle.edgeHardness;
    out[o + PRESET_P5_OFFSETS.anvilStrength] = p.morphology.anvilStrength;
    out[o + PRESET_P5_OFFSETS.topCutoffSharpness] = p.morphology.topCutoffSharpness;
    out[o + PRESET_P5_OFFSETS.edgeErosionStrength] = p.edgeStyle.edgeErosionStrength;
    out[o + PRESET_P6_OFFSETS.cirrusFiberStrength] = p.morphology.cirrusFiberStrength;
    out[o + PRESET_P6_OFFSETS.cirrusFiberCurl] = p.morphology.cirrusFiberCurl;
    out[o + PRESET_P6_OFFSETS.convectiveTowerStrength] = p.morphology.convectiveTowerStrength;
    out[o + PRESET_P6_OFFSETS.convectiveCellScale] = p.morphology.convectiveCellScale;
    out[o + PRESET_P7_OFFSETS.sunDiscVisible] = p.sunDiscVisible;
    out[o + PRESET_P7_OFFSETS.haloEffect] = p.haloEffect;
    out[o + PRESET_P7_OFFSETS.internalLightning] = p.internalLightning;
    out[o + PRESET_P7_OFFSETS.tileScale] = p.morphology.tileScale;
  });
  return out;
}

export interface CloudParams {
  cloudHeight: number;
  verticalMetersPerWorldUnit: number;
  horizontalMetersPerWorldUnit: number;
  enforcePhysicalPlacement: boolean;
  morphStrength: number;
  showBodyBounds: boolean;
  showAxes: boolean;
  selectedBody: string | null;
  gizmoMode: 'move' | 'rotate' | 'scale' | null;
  skipLight: boolean;
  rayMarchSteps: number;
  lightMarchSteps: number;
  shadowDarkness: number;
  sunIntensity: number;
  cacheResolution: number;
  cacheUpdateRate: number;
  cacheSmooth: number;
  sunAzimuth: number;
  sunElevation: number;
  silverIntensity: number;
  powderStrength: number;
  hgForward: number;
  hgBackward: number;
  hgBlend: number;
  godrayStrength: number;
  qualityMode: number;
  detailFreq: number;
  detailStrength: number;
  typeLightingBlend: number;
  fxAbsorption: boolean;
  boxHalfExtent: number;
  weatherSize: number;
  lightMarchStepSize: number;
  verticalEdgeRange: number;
  verticalEdgeShape: number;
  edgeHardness: number;
  edgeHardnessThreshold: number;
  edgeSharpening: boolean;
  cacheWorkgroupX: number;
  cacheWorkgroupY: number;
  cacheWorkgroupZ: number;
  debugView: number;
  tonemapMode: number;
  exposure: number;
  edgeCurveWidth: number;
  edgeCurveShaper: number;
  adaptiveMarch: boolean;
  temporalDither: boolean;
  cornerRadius: number;
  aerialDensity: number;
  aerialInscatter: number;
  aerialHeightFalloff: number;
  shadowTintStrength: number;
  groundShadowMode: number;
  groundShadowMaxSteps: number;
  groundShadowStepScale: number;
  groundShadowJitter: number;
  groundShadowMapResolution: number;
  groundShadowMapUpdateRate: number;
  groundShadowHistoryWeight: number;
  groundShadowFilterRadius: number;
  taaEnabled: boolean;
  taaBlend: number;
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomAmount: number;
  todPaletteBlend: number;
  msModel: number;
  energyConservingScatter: boolean;
  densityShapeModel: number;
  heightAmbientModel: number;
  measureLightShare: () => void;
}

export const SHAPE_ID_RECT = 0;

function footprintData(b: CloudBody): [number, number, number] {
  const cx = (b.bounds[0] + b.bounds[2]) / 2;
  const cz = (b.bounds[1] + b.bounds[3]) / 2;
  const r = Math.max((b.bounds[2] - b.bounds[0]) / 2, (b.bounds[3] - b.bounds[1]) / 2);
  return [cx, cz, r];
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

export function packBodies(
  dst: Float32Array,
  bodies: CloudBody[],
  mods?: BodyMod[],
  windSamples?: readonly WindAdvectionSample[],
  requestedScale: SceneScale = DEFAULT_SCENE_SCALE,
): void {
  const n = Math.min(bodies.length, MAX_BODIES);
  const scale = normalizedSceneScale(requestedScale);
  const boxHeight = dst[PARAM_OFFSETS.cloudHeight] || 8;
  dst[PARAM_OFFSETS.activeBodyCount] = n;
  for (let i = 0; i < MAX_BODIES; i++) {
    const o = BODY_BASE + i * BODY_STRIDE;
    if (i < n) {
      const b = bodies[i];
      const m = mods?.[i];
      const wind = windSamples?.[i];
      const base = metersToWorldY(b.base, scale);
      const thickness = metersToWorldY(b.thickness, scale);
      const altTop = Math.min(boxHeight, base + Math.max(0.02, thickness));
      dst[o + 0] = base;
      dst[o + 1] = altTop;
      dst[o + 2] = presetIndex(b.type);
      dst[o + 3] = 1.0;
      dst[o + BODY_WIND_OFFSETS.advectionOffsetWorldX] = metersToWorldXZ(wind?.offsetM[0] ?? 0, scale);
      dst[o + BODY_WIND_OFFSETS.advectionOffsetWorldZ] = metersToWorldXZ(wind?.offsetM[1] ?? 0, scale);
      dst[o + BODY_WIND_OFFSETS.morphTime] = wind?.morphTime ?? 0;
      dst[o + BODY_WIND_OFFSETS.reserved] = 0;
      dst[o + 8] = b.coverage * (m ? m.coverageMul : 1);
      dst[o + 9] = b.densityScale * (m ? m.densityScale : 1);
      dst[o + 10] = m ? m.morph : 0;
      dst[o + 11] = metersToWorldXZ(b.feather, scale);
      const fp = footprintData(b);
      dst[o + 12] = metersToWorldXZ(fp[0], scale);
      dst[o + 13] = metersToWorldXZ(fp[1], scale);
      dst[o + 14] = metersToWorldXZ(fp[2], scale);
      dst[o + 15] = SHAPE_ID_RECT;
      dst[o + 16] = b.rot ? b.rot[0] : 0;
      dst[o + 17] = b.rot ? b.rot[1] : 0;
      dst[o + 18] = b.rot ? b.rot[2] : 0;
      dst[o + 19] = 0;
    } else {
      for (let k = 0; k < BODY_STRIDE; k++) dst[o + k] = 0;
    }
  }
}

export function createDefaultParams(): CloudParams {
  return {
    cloudHeight: 12000,
    verticalMetersPerWorldUnit: DEFAULT_SCENE_SCALE.verticalMetersPerWorldUnit,
    horizontalMetersPerWorldUnit: DEFAULT_SCENE_SCALE.horizontalMetersPerWorldUnit,
    enforcePhysicalPlacement: false,
    morphStrength: 0,
    showBodyBounds: true,
    showAxes: true,
    selectedBody: null,
    gizmoMode: null,
    skipLight: false,
    rayMarchSteps: 64,
    lightMarchSteps: 8,
    shadowDarkness: 5,
    sunIntensity: 10,
    cacheResolution: 96,
    cacheUpdateRate: 2,
    cacheSmooth: 0,
    sunAzimuth: 34,
    sunElevation: 70,
    silverIntensity: 0,
    powderStrength: 0, // msModel=1 默认关闭 powder，避免与三指数 Beer 双重压暗
    hgForward: 0.45,
    hgBackward: 0.45,
    hgBlend: 1.0,
    godrayStrength: 0,
    qualityMode: 1,
    detailFreq: 2.5,
    detailStrength: 0,
    typeLightingBlend: 1.0,
    fxAbsorption: true,
    boxHalfExtent: 32000,
    weatherSize: 256,
    lightMarchStepSize: 0.15,
    verticalEdgeRange: 0.55,
    verticalEdgeShape: 2.0,
    edgeHardness: 1,
    edgeHardnessThreshold: 0.05,
    edgeSharpening: false,
    cacheWorkgroupX: 8,
    cacheWorkgroupY: 8,
    cacheWorkgroupZ: 4,
    debugView: 0,
    tonemapMode: 1,
    exposure: 0.1,
    edgeCurveWidth: 0.5,
    edgeCurveShaper: 1.0,
    adaptiveMarch: false,
    temporalDither: true,
    cornerRadius: 0.5,
    aerialDensity: 0.02,
    aerialInscatter: 1.0,
    aerialHeightFalloff: 0.15,
    shadowTintStrength: 0.6,
    groundShadowMode: GROUND_SHADOW_MODE.adaptive,
    groundShadowMaxSteps: 64,
    groundShadowStepScale: 0.25,
    groundShadowJitter: 0.13,
    groundShadowMapResolution: 1024,
    groundShadowMapUpdateRate: 4,
    groundShadowHistoryWeight: 0.24,
    groundShadowFilterRadius: 1,
    taaEnabled: true,
    taaBlend: 0.95,
    bloomEnabled: false,
    bloomThreshold: 1.0,
    bloomAmount: 0.5,
    todPaletteBlend: 1.0,
    msModel: 1,
    energyConservingScatter: true,
    densityShapeModel: 1,
    heightAmbientModel: 1,
    measureLightShare: () => {},
  };
}
