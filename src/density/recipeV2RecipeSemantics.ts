import type { CloudGenus } from '../genusProfile';

export type DensityV2Lane = readonly [number, number, number, number];

export interface DensityV2RecipeParameterBank {
  readonly enabled: boolean;
  readonly detailAttachmentCosts: readonly [number, number, number, number];
  readonly sampleLimits: readonly [number, number, number, number];
  readonly lanes: Readonly<Record<DensityV2ParameterLaneName, DensityV2Lane>>;
}

export type DensityV2ParameterLaneName =
  | 'domain0'
  | 'domain1'
  | 'vertical0'
  | 'vertical1'
  | 'topology0'
  | 'topology1'
  | 'topology2'
  | 'detail0'
  | 'detail1'
  | 'attachment0'
  | 'finalize0'
  | 'reserved0';

export const DENSITY_V2_PARAMETER_RANGES = Object.freeze({
  domain0: Object.freeze({ min: 0, max: 8 }),
  domain1: Object.freeze({ min: 0, max: 2 }),
  vertical0: Object.freeze({ min: 0, max: 2 }),
  vertical1: Object.freeze({ min: 0, max: 4 }),
  topology0: Object.freeze({ min: -1, max: 2 }),
  topology1: Object.freeze({ min: -1, max: 3 }),
  topology2: Object.freeze({ min: -1, max: 3 }),
  detail0: Object.freeze({ min: 0, max: 4 }),
  detail1: Object.freeze({ min: 0, max: 4 }),
  attachment0: Object.freeze({ min: 0, max: 0 }),
  finalize0: Object.freeze({ min: 0, max: 8 }),
  reserved0: Object.freeze({ min: 0, max: 0 }),
} satisfies Readonly<Record<DensityV2ParameterLaneName, { readonly min: number; readonly max: number }>>);

const ZERO: DensityV2Lane = Object.freeze([0, 0, 0, 0]);

function lane(a: number, b: number, c: number, d: number): DensityV2Lane {
  return Object.freeze([a, b, c, d]);
}

function disabledBank(): DensityV2RecipeParameterBank {
  return Object.freeze({
    enabled: false,
    detailAttachmentCosts: lane(0, 0, 0, 0),
    sampleLimits: lane(0, 0, 0, 0),
    lanes: Object.freeze({
      domain0: ZERO, domain1: ZERO, vertical0: ZERO, vertical1: ZERO,
      topology0: ZERO, topology1: ZERO, topology2: ZERO,
      detail0: ZERO, detail1: ZERO, attachment0: ZERO,
      finalize0: ZERO, reserved0: ZERO,
    }),
  });
}

const STRATUS_BANK: DensityV2RecipeParameterBank = Object.freeze({
  enabled: true,
  // [macroCostClass, detailCostClass, attachmentCount, hybridDetailEnabled]
  detailAttachmentCosts: lane(1, 0, 0, 0),
  // [maxBaseSamples (Macro included), maxDetailSamples, maxOctaves, maxAttachments]
  sampleLimits: lane(2, 0, 0, 0),
  lanes: Object.freeze({
    // [macroFrequency, baseFrequency, detailFrequency, seedScale]
    domain0: lane(1.35, 1.15, 0, 0.07),
    // [windPhaseScale, warpStrength, horizontalAnisotropy, verticalAnisotropy]
    domain1: lane(0.018, 0, 1, 0.36),
    // [bottomFade, topFade, downwardThicknessVariation, domeFalloff]
    vertical0: lane(0.10, 0.18, 0.28, 0),
    // [profileStart, profileSpan, reserved, reserved]
    vertical1: lane(0, 1, 0, 0),
    // [coverageThreshold, coverageSoftness, bodyCoverageGain, baseSoftness]
    topology0: lane(0.48, 0.18, 0.18, 0.16),
    // [baseThreshold, reserved, reserved, densityFloor]
    topology1: lane(0.48, 0, 0, 0.05),
    // [baseContrast, reserved, macroCoverageBias, reserved]
    topology2: lane(0.25, 0, 0.04, 0),
    detail0: ZERO,
    detail1: ZERO,
    attachment0: ZERO,
    // [densityMultiplier, edgeFeatherScale, maxDensity, reserved]
    finalize0: lane(1, 1, 6, 0),
    reserved0: ZERO,
  }),
});

function stratiformBank(options: {
  domain0: DensityV2Lane;
  domain1: DensityV2Lane;
  vertical0: DensityV2Lane;
  vertical1: DensityV2Lane;
  topology0: DensityV2Lane;
  topology1: DensityV2Lane;
  topology2: DensityV2Lane;
  finalize0: DensityV2Lane;
}): DensityV2RecipeParameterBank {
  return Object.freeze({
    enabled: true,
    detailAttachmentCosts: lane(1, 0, 0, 0),
    sampleLimits: lane(2, 0, 0, 0),
    lanes: Object.freeze({
      domain0: options.domain0,
      domain1: options.domain1,
      vertical0: options.vertical0,
      vertical1: options.vertical1,
      topology0: options.topology0,
      topology1: options.topology1,
      topology2: options.topology2,
      detail0: ZERO,
      detail1: ZERO,
      attachment0: ZERO,
      finalize0: options.finalize0,
      reserved0: ZERO,
    }),
  });
}

const CIRROSTRATUS_BANK = stratiformBank({
  domain0: lane(0.72, 0.62, 0, 0.03),
  domain1: lane(0.012, 0, 1.15, 0.24),
  vertical0: lane(0.08, 0.12, 0.04, 0),
  vertical1: lane(0.30, 0.40, 0, 0),
  topology0: lane(0.39, 0.18, 0.20, 0.22),
  topology1: lane(0.52, 0, 0, 0.10),
  topology2: lane(0.55, 0, 0.02, 0),
  finalize0: lane(1.05, 1, 4, 0),
});

const ALTOSTRATUS_BANK = stratiformBank({
  domain0: lane(1.15, 0.90, 0, 0.05),
  domain1: lane(0.015, 0, 1.45, 0.3),
  vertical0: lane(0.16, 0.22, 0.22, 0),
  vertical1: lane(0, 1, 0, 0),
  topology0: lane(0.44, 0.18, 0.20, 0.18),
  topology1: lane(0.54, 0, 0, 0.03),
  topology2: lane(0.92, 0, 0.02, 0),
  finalize0: lane(0.85, 1, 6, 0),
});

const NIMBOSTRATUS_BANK = stratiformBank({
  domain0: lane(0.95, 0.78, 0, 0.05),
  domain1: lane(0.012, 0, 1.25, 0.42),
  vertical0: lane(0.20, 0.24, 0.18, 0),
  vertical1: lane(0, 1, 0, 0),
  topology0: lane(0.37, 0.15, 0.16, 0.18),
  topology1: lane(0.56, 0, 0, 0.02),
  topology2: lane(0.97, 0, 0.015, 0),
  finalize0: lane(0.95, 1, 8, 0),
});

const CUMULUS_BANK: DensityV2RecipeParameterBank = Object.freeze({
  enabled: true,
  detailAttachmentCosts: lane(1, 1, 0, 0),
  sampleLimits: lane(3, 1, 0, 0),
  lanes: Object.freeze({
    domain0: lane(0.78, 1.08, 3.1, 0.13),
    domain1: lane(0.014, 0.12, 1, 1),
    vertical0: lane(0.055, 0.15, 0, 0.58),
    vertical1: lane(1.65, 0.72, 0.04, 0),
    topology0: lane(0.50, 0.14, 0.72, 0.12),
    topology1: lane(0.42, 0.28, 0.30, 0.04),
    topology2: lane(0, 1.75, 0.02, 0),
    // [erosionStrength, erosionHeightBias, detailFrequency, reserved]
    detail0: lane(0.24, 0.72, 3.1, 0),
    detail1: ZERO,
    attachment0: ZERO,
    finalize0: lane(1.12, 1, 6, 0),
    reserved0: ZERO,
  }),
});

function cellularBank(options: {
  domain0: DensityV2Lane;
  domain1: DensityV2Lane;
  vertical0: DensityV2Lane;
  vertical1: DensityV2Lane;
  topology0: DensityV2Lane;
  topology1: DensityV2Lane;
  topology2: DensityV2Lane;
  detail0: DensityV2Lane;
  finalize0: DensityV2Lane;
}): DensityV2RecipeParameterBank {
  return Object.freeze({
    enabled: true,
    // Cellular has one Macro and two Base samples. It owns no Detail/attachments.
    detailAttachmentCosts: lane(1, 0, 0, 0),
    sampleLimits: lane(3, 0, 0, 0),
    lanes: Object.freeze({
      domain0: options.domain0,
      domain1: options.domain1,
      vertical0: options.vertical0,
      vertical1: options.vertical1,
      topology0: options.topology0,
      topology1: options.topology1,
      topology2: options.topology2,
      detail0: options.detail0,
      detail1: ZERO,
      attachment0: ZERO,
      finalize0: options.finalize0,
      reserved0: ZERO,
    }),
  });
}

const STRATOCUMULUS_BANK = cellularBank({
  // [macroFrequency, primaryCellFrequency, secondaryCellFrequency, seedScale]
  domain0: lane(0.85, 0.95, 1.35, 0.07),
  // [windPhaseScale, waveStrength, horizontalAnisotropy, verticalAnisotropy]
  domain1: lane(0.015, 0.02, 1.05, 0),
  // [bottomFade, topFade, thicknessVariation, reserved]
  vertical0: lane(0.12, 0.16, 0.16, 0),
  // [profileStart, profileSpan, lensAspect, reserved]
  vertical1: lane(0.05, 0.82, 0, 0),
  // [coverageThreshold, coverageSoftness, bodyCoverageGain, cellSoftness]
  topology0: lane(0.32, 0.18, 0.15, 0.10),
  // [interiorWeight, edgeWeight, secondaryWeight, connectivity]
  topology1: lane(0.65, 0.20, 0.25, 0.28),
  // [cellContrast, cellThreshold, macroCoverageBias, rippleFrequency]
  topology2: lane(1.0, 0.50, 0.10, 1.5),
  // [rippleAmplitude, lensStrength, rollStrength, reserved]
  detail0: lane(0.03, 0, 0, 0),
  finalize0: lane(0.95, 1, 6, 0),
});

const ALTOCUMULUS_BANK = cellularBank({
  domain0: lane(1.20, 1.75, 2.45, 0.09),
  domain1: lane(0.017, 0.04, 1.10, 0),
  vertical0: lane(0.10, 0.14, 0.10, 0),
  vertical1: lane(0.18, 0.38, 0, 0),
  topology0: lane(0.34, 0.18, 0.15, 0.09),
  topology1: lane(0.60, 0.25, 0.35, 0.16),
  topology2: lane(1.0, 0.50, 0.10, 2.4),
  detail0: lane(0.08, 0, 0, 0),
  finalize0: lane(0.90, 1, 6, 0),
});

const CIRROCUMULUS_BANK = cellularBank({
  domain0: lane(1.55, 2.80, 3.80, 0.12),
  domain1: lane(0.018, 0.08, 1.20, 0),
  vertical0: lane(0.08, 0.10, 0.05, 0),
  vertical1: lane(0.15, 0.12, 0, 0),
  topology0: lane(0.32, 0.18, 0.12, 0.08),
  topology1: lane(0.55, 0.30, 0.40, 0.08),
  topology2: lane(1.0, 0.50, 0.12, 3.0),
  detail0: lane(0.36, 0, 0, 0),
  finalize0: lane(0.72, 1, 4, 0),
});

const DISABLED_BANK = disabledBank();

export const DENSITY_V2_RECIPE_BANKS: Readonly<Record<CloudGenus, DensityV2RecipeParameterBank>> = Object.freeze({
  cumulus: CUMULUS_BANK,
  stratus: STRATUS_BANK,
  stratocumulus: STRATOCUMULUS_BANK,
  cumulonimbus: DISABLED_BANK,
  altocumulus: ALTOCUMULUS_BANK,
  altostratus: ALTOSTRATUS_BANK,
  nimbostratus: NIMBOSTRATUS_BANK,
  cirrus: DISABLED_BANK,
  cirrostratus: CIRROSTRATUS_BANK,
  cirrocumulus: CIRROCUMULUS_BANK,
});

export const DENSITY_V2_ENABLED_GENERA = Object.freeze([
  'cumulus', 'stratus', 'stratocumulus', 'altocumulus',
  'altostratus', 'nimbostratus', 'cirrostratus', 'cirrocumulus',
] as const);

export function verifyDensityV2RecipeSemantics(): void {
  const enabled = Object.entries(DENSITY_V2_RECIPE_BANKS)
    .filter(([, bank]) => bank.enabled)
    .map(([genus]) => genus)
    .sort();
  if (enabled.join(',') !== [...DENSITY_V2_ENABLED_GENERA].sort().join(',')) {
    throw new Error(`Density V2 W8 enabled set mismatch: ${enabled.join(',')}`);
  }
  for (const [genus, bank] of Object.entries(DENSITY_V2_RECIPE_BANKS)) {
    if (!bank.enabled && ([...bank.sampleLimits, ...bank.detailAttachmentCosts].some((value) => value !== 0))) {
      throw new Error(`Disabled Density V2 recipe has a non-zero cost: ${genus}`);
    }
    for (const [laneName, lane] of Object.entries(bank.lanes) as [DensityV2ParameterLaneName, DensityV2Lane][]) {
      const range = DENSITY_V2_PARAMETER_RANGES[laneName];
      if (lane.some((value) => !Number.isFinite(value) || value < range.min || value > range.max)) {
        throw new Error(`Density V2 recipe lane out of range: ${genus}.${laneName}`);
      }
    }
  }
  if ([STRATUS_BANK, CIRROSTRATUS_BANK, ALTOSTRATUS_BANK, NIMBOSTRATUS_BANK]
    .some((bank) => bank.sampleLimits.join(',') !== '2,0,0,0')
    || [STRATOCUMULUS_BANK, ALTOCUMULUS_BANK, CIRROCUMULUS_BANK]
      .some((bank) => bank.sampleLimits.join(',') !== '3,0,0,0')
    || CUMULUS_BANK.sampleLimits.join(',') !== '3,1,0,0') {
    throw new Error('Density V2 W8 static sample limits changed');
  }
  for (const [genus, bank] of Object.entries({
    stratus: STRATUS_BANK,
    cirrostratus: CIRROSTRATUS_BANK,
    altostratus: ALTOSTRATUS_BANK,
    nimbostratus: NIMBOSTRATUS_BANK,
  })) {
    const [profileStart, profileSpan] = bank.lanes.vertical1;
    if (profileSpan <= 0 || profileStart + profileSpan > 1 + 1e-6) {
      throw new Error(`Density V2 Stratiform profile is outside Body height: ${genus}`);
    }
  }
  const cellularBanks = [STRATOCUMULUS_BANK, ALTOCUMULUS_BANK, CIRROCUMULUS_BANK] as const;
  const cellFrequencies = cellularBanks.map((bank) => bank.lanes.domain0[1]);
  const profileSpans = cellularBanks.map((bank) => bank.lanes.vertical1[1]);
  const physicalProfileMeters = profileSpans.map((span, index) => span * [1400, 2500, 4000][index]);
  const connectivity = cellularBanks.map((bank) => bank.lanes.topology1[3]);
  if (!(cellFrequencies[0] < cellFrequencies[1] && cellFrequencies[1] < cellFrequencies[2])) {
    throw new Error('Density V2 Cellular effective scale must satisfy Sc > Ac > Cc');
  }
  if (!(profileSpans[0] > profileSpans[1] && profileSpans[1] > profileSpans[2])) {
    throw new Error('Density V2 Cellular profile span must satisfy Sc > Ac > Cc');
  }
  if (!(physicalProfileMeters[0] > physicalProfileMeters[1]
    && physicalProfileMeters[1] > physicalProfileMeters[2])) {
    throw new Error('Density V2 Cellular physical layer thickness must satisfy Sc > Ac > Cc');
  }
  if (!(connectivity[0] > connectivity[1] && connectivity[1] > connectivity[2])) {
    throw new Error('Density V2 Cellular connectivity must satisfy Sc > Ac > Cc');
  }
  for (const [index, bank] of cellularBanks.entries()) {
    if (bank.detailAttachmentCosts.join(',') !== '1,0,0,0'
      || bank.lanes.detail0[1] !== 0 || bank.lanes.detail0[2] !== 0
      || bank.lanes.domain1[3] !== 0) {
      throw new Error(`Density V2 Cellular cost or disabled lens/roll default changed: ${index}`);
    }
  }
}
