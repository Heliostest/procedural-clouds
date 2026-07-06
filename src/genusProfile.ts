import type { BodyShape, CloudBody } from './body';

export const CLOUD_GENERA = [
  'cumulus',
  'stratus',
  'stratocumulus',
  'cumulonimbus',
  'altocumulus',
  'altostratus',
  'nimbostratus',
  'cirrus',
  'cirrostratus',
  'cirrocumulus',
] as const;

export type CloudGenus = (typeof CLOUD_GENERA)[number];

export interface GenusPhysicalProfile {
  recommendedBaseRangeM: readonly [number, number];
  defaultBaseM: number;
  defaultThicknessM: number;
  defaultHorizontalHalfExtentM: number;
  sourceNote: string;
}

const WMO_TEMPERATE = 'WMO temperate level; project default from procedural-clouds-threejs/cloud-types.md';

export const GENUS_PROFILE_SET = {
  id: 'temperate-demo-v1',
  datum: 'scene-ground',
  profiles: {
    cumulus: { recommendedBaseRangeM: [0, 2000], defaultBaseM: 1000, defaultThicknessM: 1500, defaultHorizontalHalfExtentM: 800, sourceNote: WMO_TEMPERATE },
    stratus: { recommendedBaseRangeM: [0, 2000], defaultBaseM: 300, defaultThicknessM: 1200, defaultHorizontalHalfExtentM: 5000, sourceNote: WMO_TEMPERATE },
    stratocumulus: { recommendedBaseRangeM: [0, 2000], defaultBaseM: 600, defaultThicknessM: 1400, defaultHorizontalHalfExtentM: 3000, sourceNote: WMO_TEMPERATE },
    cumulonimbus: { recommendedBaseRangeM: [0, 2000], defaultBaseM: 500, defaultThicknessM: 11500, defaultHorizontalHalfExtentM: 3000, sourceNote: WMO_TEMPERATE },
    altocumulus: { recommendedBaseRangeM: [2000, 7000], defaultBaseM: 2500, defaultThicknessM: 2500, defaultHorizontalHalfExtentM: 1500, sourceNote: WMO_TEMPERATE },
    altostratus: { recommendedBaseRangeM: [2000, 7000], defaultBaseM: 2000, defaultThicknessM: 3000, defaultHorizontalHalfExtentM: 8000, sourceNote: WMO_TEMPERATE },
    nimbostratus: { recommendedBaseRangeM: [0, 7000], defaultBaseM: 1000, defaultThicknessM: 3000, defaultHorizontalHalfExtentM: 10000, sourceNote: `${WMO_TEMPERATE}; extends across levels` },
    cirrus: { recommendedBaseRangeM: [5000, 13000], defaultBaseM: 7000, defaultThicknessM: 5000, defaultHorizontalHalfExtentM: 4000, sourceNote: WMO_TEMPERATE },
    cirrostratus: { recommendedBaseRangeM: [5000, 13000], defaultBaseM: 6000, defaultThicknessM: 5000, defaultHorizontalHalfExtentM: 12000, sourceNote: WMO_TEMPERATE },
    cirrocumulus: { recommendedBaseRangeM: [5000, 13000], defaultBaseM: 6000, defaultThicknessM: 4000, defaultHorizontalHalfExtentM: 2000, sourceNote: WMO_TEMPERATE },
  },
} as const;

export function isCloudGenus(value: string): value is CloudGenus {
  return (CLOUD_GENERA as readonly string[]).includes(value);
}

export function genusProfile(type: string): GenusPhysicalProfile {
  return GENUS_PROFILE_SET.profiles[isCloudGenus(type) ? type : 'cumulus'];
}

export function assertCompleteGenusProfiles(presetKeys: readonly string[]): void {
  const missing = presetKeys.filter((key) => !isCloudGenus(key));
  const extra = CLOUD_GENERA.filter((key) => !presetKeys.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Genus profile mismatch: missing profiles [${missing.join(', ')}], extra profiles [${extra.join(', ')}]`);
  }
}

function centeredBounds(shape: BodyShape, bounds: number[], halfExtentM: number): number[] {
  if (shape === 'rect') {
    const cx = bounds.length >= 4 ? (bounds[0] + bounds[2]) / 2 : 0;
    const cz = bounds.length >= 4 ? (bounds[1] + bounds[3]) / 2 : 0;
    return [cx - halfExtentM, cz - halfExtentM, cx + halfExtentM, cz + halfExtentM];
  }
  return [bounds[0] ?? 0, bounds[1] ?? 0, halfExtentM, 0];
}

export function applyGenusDefaults(body: CloudBody, cloudHeightM: number): void {
  const profile = genusProfile(body.type);
  body.base = Math.min(profile.defaultBaseM, Math.max(0, cloudHeightM - 1));
  body.thickness = Math.max(1, Math.min(profile.defaultThicknessM, cloudHeightM - body.base));
  body.bounds = centeredBounds(body.shape, body.bounds, profile.defaultHorizontalHalfExtentM);
  body.placementLocked = false;
}

export function placementWarning(body: CloudBody, cloudHeightM: number): string | null {
  const profile = genusProfile(body.type);
  if (!Number.isFinite(body.base) || !Number.isFinite(body.thickness) || body.thickness <= 0) {
    return 'invalid placement';
  }
  if (body.base < profile.recommendedBaseRangeM[0] || body.base > profile.recommendedBaseRangeM[1]) {
    return 'base outside recommended genus range';
  }
  if (body.base + body.thickness > cloudHeightM) return 'body top exceeds scene ceiling';
  return null;
}

export function enforcePlacement(body: CloudBody, cloudHeightM: number): void {
  const profile = genusProfile(body.type);
  const ceilingBase = Math.max(0, cloudHeightM - 1);
  const minBase = Math.min(profile.recommendedBaseRangeM[0], ceilingBase);
  const maxBase = Math.max(minBase, Math.min(profile.recommendedBaseRangeM[1], ceilingBase));
  body.base = Math.max(minBase, Math.min(maxBase, Number.isFinite(body.base) ? body.base : profile.defaultBaseM));
  const thickness = Number.isFinite(body.thickness) ? body.thickness : profile.defaultThicknessM;
  body.thickness = Math.max(1, Math.min(thickness, Math.max(1, cloudHeightM - body.base)));
}
