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

export function densityV2CoverageGate(
  field: number,
  bodyCoverage: number,
  threshold: number,
  softness: number,
  bodyCoverageGain: number,
  macroCoverageBias: number,
): number {
  const signal = field + (Math.min(1.5, Math.max(0, bodyCoverage)) - 0.5) * bodyCoverageGain + macroCoverageBias;
  const width = Math.max(softness, 1e-4);
  return smoothstep(threshold - width, threshold + width, signal);
}

export function densityV2StratiformLowAmplitude(
  base: number,
  threshold: number,
  softness: number,
  contrast: number,
  densityFloor: number,
): number {
  const width = Math.max(softness, 1e-4);
  const shape = smoothstep(threshold - width, threshold + width, clamp01(base));
  return Math.max(0, 1 + (shape - 1) * clamp01(contrast) + densityFloor);
}

export function densityV2StratiformTop(macroThickness: number, variationStrength: number): number {
  return Math.min(1, Math.max(0.72, 1 + (macroThickness - 1) * variationStrength));
}

export function densityV2ProfileHeight(height01: number, start: number, span: number): number {
  return (height01 - Math.min(0.99, Math.max(0, start))) / Math.max(span, 1e-4);
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
  const top = Math.min(1, Math.max(0.72, 1 + topVariation));
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

export function densityV2CellularAnalyticHooks(
  normalizedX: number,
  normalizedZ: number,
  height01: number,
  macroPhase: number,
  waveStrength: number,
  rippleAmplitude: number,
  lensStrength: number,
  rollStrength: number,
  rippleFrequency: number,
  lensAspect: number,
  macroCellLayout = 0.5,
): readonly [number, number] {
  const wave = Math.max(waveStrength, 0);
  const rippleAmount = Math.max(rippleAmplitude, 0);
  const lensAmount = Math.max(lensStrength, 0);
  const rollAmount = Math.max(rollStrength, 0);
  if (wave <= 0 && rippleAmount <= 0 && lensAmount <= 0 && rollAmount <= 0) return [0, 1];
  const macroWave = macroPhase - 0.5;
  const macroCell = macroCellLayout - 0.5;
  const frequency = Math.max(rippleFrequency, 0);
  const phase0 = frequency * (normalizedX * 0.84 + normalizedZ * 0.54)
    + macroWave * 0.16 + macroCell * 0.07;
  const phase1 = frequency * 0.7861513778 * (normalizedX * -0.37 + normalizedZ * 0.93)
    - macroWave * 0.11 + macroCell * 0.13;
  const phase2 = frequency * 0.6131471928 * (normalizedX * 0.23 - normalizedZ * 0.97)
    + macroWave * 0.05 - macroCell * 0.17;
  const phase3 = frequency * 0.4370160244 * (normalizedX * -0.91 - normalizedZ * 0.41)
    - macroWave * 0.14 - macroCell * 0.03;
  const carrier0 = Math.sin(phase0 * Math.PI * 2);
  const carrier1 = Math.sin((phase1 + carrier0 * 0.11) * Math.PI * 2);
  const carrier2 = Math.sin((phase2 + carrier1 * 0.09) * Math.PI * 2);
  const carrier3 = Math.sin((phase3 + carrier0 * 0.07 - carrier2 * 0.05) * Math.PI * 2);
  const carrier = (carrier0 * 0.8 + carrier1 * 0.9 + carrier2 + carrier3 * 0.95) / 3.65;
  const offset = carrier * wave;
  const rippleDensity = 1 + carrier * rippleAmount * 0.28;
  const aspect = Math.max(lensAspect, 1);
  const lensDistance = Math.hypot(normalizedX, normalizedZ * aspect);
  const lens = (1 - clamp01(lensAmount))
    + Math.max(1 - lensDistance * lensDistance, 0) * clamp01(lensAmount);
  const roll = 1 + Math.cos((phase0 + height01) * Math.PI * 2) * rollAmount;
  return [offset, Math.max(rippleDensity * lens * roll, 0)];
}

export function densityV2CellularSignal(
  primaryInterior: number,
  primaryEdge: number,
  secondaryInterior: number,
  secondaryEdge: number,
  interiorWeight: number,
  edgeWeight: number,
  secondaryWeight: number,
  connectivity: number,
  contrast: number,
  threshold: number,
  softness: number,
): number {
  const secondary = secondaryInterior * 0.75 + secondaryEdge * 0.25;
  const weightSum = Math.max(interiorWeight + edgeWeight + secondaryWeight, 1e-4);
  const weighted = (primaryInterior * interiorWeight
    + primaryEdge * edgeWeight
    + secondary * secondaryWeight) / weightSum;
  const bridge = Math.max(primaryInterior, secondaryInterior) * 0.85;
  const signal = (
    weighted + (Math.max(weighted, bridge) - weighted) * clamp01(connectivity)
  ) * Math.max(contrast, 0);
  const width = Math.max(softness, 1e-4);
  const boundedThreshold = Math.min(0.95, Math.max(0.05, threshold));
  return smoothstep(boundedThreshold - width, boundedThreshold + width, signal);
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
  if (!approximatelyEqual(densityV2CoverageGate(0.4, 0.5, 0.5, 0.2, 0, 0), 0.15625)
    || !approximatelyEqual(densityV2CoverageGate(0.5, 0.5, 0.5, 0.2, 0, 0), 0.5)
    || !approximatelyEqual(densityV2CoverageGate(0.7, 0.5, 0.5, 0.2, 0, 0), 1)) {
    throw new Error('Density V2 coverage-gate mirror fixture failed');
  }
  if (!approximatelyEqual(densityV2StratiformLowAmplitude(0, 0.5, 0.2, 0.8, 0.05), 0.25)
    || !approximatelyEqual(densityV2StratiformLowAmplitude(0.5, 0.5, 0.2, 0.8, 0.05), 0.65)
    || !approximatelyEqual(densityV2StratiformLowAmplitude(1, 0.5, 0.2, 0.8, 0.05), 1.05)) {
    throw new Error('Density V2 stratiform low-amplitude mirror fixture failed');
  }
  if (!approximatelyEqual(densityV2StratiformTop(0, 0.2), 0.8)
    || densityV2StratiformTop(1, 0.2) !== 1
    || !approximatelyEqual(densityV2ProfileHeight(0.5, 0.25, 0.5), 0.5)) {
    throw new Error('Density V2 stratiform vertical mirror fixture failed');
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
  const identityHooks = densityV2CellularAnalyticHooks(0.25, -0.4, 0.5, 0.3, 0, 0, 0, 0, 3, 0);
  if (identityHooks[0] !== 0 || identityHooks[1] !== 1
    || (identityHooks as readonly number[]).length !== 2) {
    throw new Error('Density V2 Cellular zero-strength hook must be an exact identity');
  }
  const rippleHooks = densityV2CellularAnalyticHooks(0.25, -0.4, 0.5, 0.3, 0.12, 0.18, 0, 0, 3, 0);
  if (rippleHooks.some((value) => !Number.isFinite(value))
    || (rippleHooks as readonly number[]).length !== 2
    || Math.abs(rippleHooks[0]) > 0.12 + 1e-6
    || rippleHooks[1] < 1 - 0.18 * 0.28 - 1e-6
    || rippleHooks[1] > 1 + 0.18 * 0.28 + 1e-6) {
    throw new Error('Density V2 Cellular analytic hook bounds failed');
  }
  for (const hookFrequency of [1.5, 2.4, 3]) {
    const hookGridSize = 65;
    const hookGrid = Array.from({ length: hookGridSize }, (_, zIndex) => (
      Array.from({ length: hookGridSize }, (_, xIndex) => densityV2CellularAnalyticHooks(
        xIndex / (hookGridSize - 1) * 2 - 1,
        zIndex / (hookGridSize - 1) * 2 - 1,
        0.5,
        0.5,
        0,
        0.36,
        0,
        0,
        hookFrequency,
        1,
      )[1])
    ));
    let hookXX = 0;
    let hookXZ = 0;
    let hookZZ = 0;
    for (let zIndex = 1; zIndex < hookGridSize - 1; zIndex++) {
      for (let xIndex = 1; xIndex < hookGridSize - 1; xIndex++) {
        const gradientX = (hookGrid[zIndex]![xIndex + 1]! - hookGrid[zIndex]![xIndex - 1]!) * 0.5;
        const gradientZ = (hookGrid[zIndex + 1]![xIndex]! - hookGrid[zIndex - 1]![xIndex]!) * 0.5;
        hookXX += gradientX * gradientX;
        hookXZ += gradientX * gradientZ;
        hookZZ += gradientZ * gradientZ;
      }
    }
    const hookTrace = hookXX + hookZZ;
    const hookDiscriminant = Math.sqrt(Math.max(
      (hookXX - hookZZ) ** 2 + 4 * hookXZ * hookXZ,
      0,
    ));
    const hookLambdaMax = (hookTrace + hookDiscriminant) * 0.5;
    const hookLambdaMin = (hookTrace - hookDiscriminant) * 0.5;
    const hookAnisotropy = hookLambdaMax / Math.max(hookLambdaMin, 1e-9);
    if (!Number.isFinite(hookAnisotropy) || hookLambdaMin <= 1e-6 || hookAnisotropy > 2.6) {
      throw new Error(`Density V2 Cellular hook is one-dimensional at f=${hookFrequency} (${hookAnisotropy.toFixed(3)}x)`);
    }
    let hookAutocorrelationPeak = 0;
    const hookCenter = 1;
    for (let shiftZ = -32; shiftZ <= 32; shiftZ += 2) {
      for (let shiftX = -32; shiftX <= 32; shiftX += 2) {
        if (Math.hypot(shiftX, shiftZ) < 16) continue;
        let cross = 0;
        let energyA = 0;
        let energyB = 0;
        for (let zIndex = Math.max(0, -shiftZ); zIndex < Math.min(hookGridSize, hookGridSize - shiftZ); zIndex++) {
          for (let xIndex = Math.max(0, -shiftX); xIndex < Math.min(hookGridSize, hookGridSize - shiftX); xIndex++) {
            const a = hookGrid[zIndex]![xIndex]! - hookCenter;
            const b = hookGrid[zIndex + shiftZ]![xIndex + shiftX]! - hookCenter;
            cross += a * b;
            energyA += a * a;
            energyB += b * b;
          }
        }
        const correlation = Math.abs(cross) / Math.sqrt(Math.max(energyA * energyB, 1e-12));
        hookAutocorrelationPeak = Math.max(hookAutocorrelationPeak, correlation);
      }
    }
    if (!Number.isFinite(hookAutocorrelationPeak) || hookAutocorrelationPeak > 0.96) {
      throw new Error(
        `Density V2 Cellular hook has a repeated lattice at f=${hookFrequency} (${hookAutocorrelationPeak.toFixed(3)})`,
      );
    }
  }
  const disconnected = densityV2CellularSignal(0.72, 0.1, 0.2, 0.1, 0.6, 0.25, 0.4, 0.02, 1, 0.50, 0.10);
  const connected = densityV2CellularSignal(0.72, 0.1, 0.2, 0.1, 0.6, 0.25, 0.4, 0.28, 1, 0.50, 0.10);
  if (!Number.isFinite(disconnected) || !Number.isFinite(connected)
    || disconnected < 0 || connected > 1 || connected <= disconnected) {
    throw new Error('Density V2 Cellular signal/connectivity fixture failed');
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
