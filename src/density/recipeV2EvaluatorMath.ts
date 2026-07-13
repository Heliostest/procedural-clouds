export type DensityV2Vec3 = readonly [number, number, number];
export type DensityV2Quaternion = readonly [number, number, number, number];

export interface DensityV2Contribution {
  readonly density: number;
  readonly genusId: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function densityV2InverseQuaternionRotate(
  point: DensityV2Vec3,
  quaternion: DensityV2Quaternion,
): DensityV2Vec3 {
  const [x, y, z, w] = [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]];
  const tx = 2 * (y * point[2] - z * point[1]);
  const ty = 2 * (z * point[0] - x * point[2]);
  const tz = 2 * (x * point[1] - y * point[0]);
  return [
    point[0] + w * tx + (y * tz - z * ty),
    point[1] + w * ty + (z * tx - x * tz),
    point[2] + w * tz + (x * ty - y * tx),
  ];
}

export function densityV2RoundedSheetFade(x: number, z: number, feather: number): number {
  const outsideX = Math.max(Math.abs(x) - 1, 0);
  const outsideZ = Math.max(Math.abs(z) - 1, 0);
  const outside = Math.hypot(outsideX, outsideZ);
  return 1 - smoothstep(0, Math.max(feather, 1e-4), outside);
}

export function densityV2EllipseFade(x: number, z: number, feather: number): number {
  const radius = Math.hypot(x, z);
  return 1 - smoothstep(1, 1 + Math.max(feather, 1e-4), radius);
}

export function densityV2ThinSheetProfile(
  height01: number,
  bottomFade: number,
  topFade: number,
  topVariation = 0,
): number {
  const top = clamp01(1 + topVariation);
  return smoothstep(0, Math.max(bottomFade, 1e-4), height01)
    * (1 - smoothstep(Math.max(0, top - topFade), top, height01));
}

export function densityV2SoftLayerProfile(
  height01: number,
  bottomFade: number,
  topFade: number,
  topVariation = 0,
): number {
  if (height01 <= 0 || height01 >= 1) return 0;
  const top = Math.min(1, Math.max(0.72, 1 + topVariation));
  if (height01 >= top) return 0;
  return smoothstep(0, Math.max(bottomFade, 1e-4), height01)
    * (1 - smoothstep(Math.max(0, top - topFade), top, height01));
}

export function densityV2DomeTop(radius01: number, falloff: number, exponent: number): number {
  const radial = Math.pow(clamp01(radius01), Math.max(exponent, 1e-4));
  return Math.max(0.08, 1 - clamp01(falloff) * radial);
}

export function densityV2FlatBaseDomeProfile(
  height01: number,
  radius01: number,
  bottomFade: number,
  topFade: number,
  falloff: number,
  exponent: number,
): number {
  if (height01 <= 0) return 0;
  const top = densityV2DomeTop(radius01, falloff, exponent);
  if (height01 >= top) return 0;
  const bottom = smoothstep(0, Math.max(bottomFade, 1e-4), height01);
  const upper = 1 - smoothstep(Math.max(0, top - topFade), top, height01);
  return bottom * upper;
}

export function densityV2HeightBiasedErosion(
  detail: number,
  height01: number,
  strength: number,
  heightBias: number,
): number {
  const bias = (1 - clamp01(heightBias)) + clamp01(heightBias) * clamp01(height01);
  return clamp01(detail) * Math.max(0, strength) * bias;
}

export function densityV2Finalize(rawDensity: number, bodyDensity: number, lifecycle: number, multiplier: number, maxDensity: number): number {
  const result = Math.max(0, rawDensity) * Math.max(0, bodyDensity) * Math.max(0, lifecycle) * Math.max(0, multiplier);
  return Number.isFinite(result) ? Math.min(result, Math.max(0, maxDensity)) : 0;
}

export function densityV2SoftCompose(contributions: readonly DensityV2Contribution[]): readonly [number, number, number, number] {
  let total = 0;
  let bestDensity = 0;
  let secondDensity = 0;
  let bestGenus = 0;
  let secondGenus = 0;
  for (const contribution of contributions) {
    const density = Number.isFinite(contribution.density) ? Math.max(0, contribution.density) : 0;
    total += density;
    if (density > bestDensity) {
      secondDensity = bestDensity;
      secondGenus = bestGenus;
      bestDensity = density;
      bestGenus = contribution.genusId;
    } else if (density > secondDensity) {
      secondDensity = density;
      secondGenus = contribution.genusId;
    }
  }
  if (bestDensity <= 0) return [0, 0, 0, 0];
  const rest = Math.max(total - bestDensity, 0);
  const restCap = Math.max(bestDensity, 0.25);
  const softDensity = bestDensity + restCap * (1 - Math.exp(-rest / restCap));
  const secondWeight = secondDensity / Math.max(bestDensity + secondDensity, 1e-4);
  return [softDensity, bestGenus, secondGenus, secondWeight];
}

function approximatelyEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function verifyDensityV2EvaluatorMathFixtures(): void {
  const identity = densityV2InverseQuaternionRotate([2, -3, 5], [0, 0, 0, 1]);
  if (!identity.every((value, index) => approximatelyEqual(value, [2, -3, 5][index]))) {
    throw new Error('Density V2 inverse quaternion identity fixture failed');
  }
  const halfTurnY = densityV2InverseQuaternionRotate([1, 0, 0], [0, 1, 0, 0]);
  if (!approximatelyEqual(halfTurnY[0], -1) || !approximatelyEqual(halfTurnY[2], 0)) {
    throw new Error('Density V2 inverse quaternion rotation fixture failed');
  }
  if (densityV2RoundedSheetFade(0, 0, 0.1) !== 1
    || densityV2RoundedSheetFade(1.2, 1.2, 0.1) !== 0
    || densityV2EllipseFade(0, 0, 0.1) !== 1
    || densityV2EllipseFade(1.2, 0, 0.1) !== 0) {
    throw new Error('Density V2 analytic footprint fixture failed');
  }
  const sheetSamples = [-0.1, 0, 0.05, 0.5, 0.95, 1, 1.1]
    .map((height) => densityV2ThinSheetProfile(height, 0.06, 0.11));
  if (sheetSamples.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || sheetSamples[0] !== 0 || sheetSamples.at(-1) !== 0 || sheetSamples[3] <= 0) {
    throw new Error('Density V2 thin sheet profile fixture failed');
  }
  const softSamples = [-0.1, 0, 0.1, 0.5, 0.9, 1, 1.1]
    .map((height) => densityV2SoftLayerProfile(height, 0.18, 0.2, -0.04));
  if (softSamples.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || softSamples[0] !== 0 || softSamples.at(-1) !== 0 || softSamples[3] <= 0) {
    throw new Error('Density V2 soft layer profile fixture failed');
  }
  let previousTop = Number.POSITIVE_INFINITY;
  for (const radius of [0, 0.25, 0.5, 0.75, 1]) {
    const top = densityV2DomeTop(radius, 0.58, 1.65);
    if (top > previousTop + 1e-6) throw new Error('Density V2 dome top is not monotonic');
    previousTop = top;
  }
  if (densityV2FlatBaseDomeProfile(-0.01, 0, 0.055, 0.15, 0.58, 1.65) !== 0
    || densityV2FlatBaseDomeProfile(0.2, 0, 0.055, 0.15, 0.58, 1.65) <= 0
    || densityV2FlatBaseDomeProfile(0.8, 1, 0.055, 0.15, 0.58, 1.65) !== 0) {
    throw new Error('Density V2 flat-base dome fixture failed');
  }
  const erosionLow = densityV2HeightBiasedErosion(1, 0, 0.24, 0.72);
  const erosionHigh = densityV2HeightBiasedErosion(1, 1, 0.24, 0.72);
  if (erosionLow < 0 || erosionHigh > 0.24 || erosionHigh <= erosionLow) {
    throw new Error('Density V2 height-biased erosion fixture failed');
  }
  const composed = densityV2SoftCompose([{ density: 1, genusId: 1 }, { density: 0.5, genusId: 0 }]);
  const expected = 1 + (1 - Math.exp(-0.5));
  if (!approximatelyEqual(composed[0], expected) || composed[1] !== 1 || composed[2] !== 0
    || !approximatelyEqual(composed[3], 1 / 3)) {
    throw new Error('Density V2 Legacy-compatible composition fixture failed');
  }
  for (let index = 0; index < 64; index++) {
    const value = densityV2Finalize(index / 16 - 1, 1.2, 0.9, 1.12, 6);
    if (!Number.isFinite(value) || value < 0 || value > 6) {
      throw new Error('Density V2 finite/nonnegative finalize fixture failed');
    }
  }
}
