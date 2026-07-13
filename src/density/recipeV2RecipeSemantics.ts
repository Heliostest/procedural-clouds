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
    domain0: lane(0.72, 0.58, 0, 0.07),
    // [windPhaseScale, warpStrength, horizontalAnisotropy, verticalAnisotropy]
    domain1: lane(0.018, 0, 1, 0.36),
    // [bottomFade, topFade, thicknessVariation, domeFalloff]
    vertical0: lane(0.06, 0.11, 0.12, 0),
    vertical1: ZERO,
    // [coverageThreshold, coverageSoftness, bodyCoverageGain, densitySoftness]
    topology0: lane(0.48, 0.18, 0.82, 0),
    // [baseRWeight, baseGWeight, secondBaseWeight, connectivityBias]
    topology1: lane(1, 0, 0, 0.08),
    // [baseAmplitude, secondBaseScale, macroCoverageBias, reserved]
    topology2: lane(0.18, 0, 0.16, 0),
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
      vertical1: ZERO,
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
  domain0: lane(0.38, 0.32, 0, 0.03),
  domain1: lane(0.012, 0, 1.15, 0.24),
  vertical0: lane(0.04, 0.07, 0.035, 0),
  topology0: lane(0.34, 0.22, 1.05, 0),
  topology1: lane(1, 0, 0, 0.12),
  topology2: lane(0.07, 0, 0.22, 0),
  finalize0: lane(0.58, 1, 4, 0),
});

const ALTOSTRATUS_BANK = stratiformBank({
  domain0: lane(0.52, 0.46, 0, 0.05),
  domain1: lane(0.015, 0, 1.45, 0.3),
  vertical0: lane(0.13, 0.18, 0.08, 0),
  topology0: lane(0.40, 0.2, 0.96, 0),
  topology1: lane(1, 0, 0, 0.1),
  topology2: lane(0.12, 0, 0.2, 0),
  finalize0: lane(0.9, 1, 6, 0),
});

const NIMBOSTRATUS_BANK = stratiformBank({
  domain0: lane(0.44, 0.4, 0, 0.05),
  domain1: lane(0.012, 0, 1.25, 0.42),
  vertical0: lane(0.18, 0.2, 0.1, 0),
  topology0: lane(0.3, 0.2, 1.18, 0),
  topology1: lane(1, 0, 0, 0.2),
  topology2: lane(0.16, 0, 0.3, 0),
  finalize0: lane(1.35, 1, 8, 0),
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

const DISABLED_BANK = disabledBank();

export const DENSITY_V2_RECIPE_BANKS: Readonly<Record<CloudGenus, DensityV2RecipeParameterBank>> = Object.freeze({
  cumulus: CUMULUS_BANK,
  stratus: STRATUS_BANK,
  stratocumulus: DISABLED_BANK,
  cumulonimbus: DISABLED_BANK,
  altocumulus: DISABLED_BANK,
  altostratus: ALTOSTRATUS_BANK,
  nimbostratus: NIMBOSTRATUS_BANK,
  cirrus: DISABLED_BANK,
  cirrostratus: CIRROSTRATUS_BANK,
  cirrocumulus: DISABLED_BANK,
});

export const DENSITY_V2_ENABLED_GENERA = Object.freeze([
  'cumulus', 'stratus', 'altostratus', 'nimbostratus', 'cirrostratus',
] as const);

export function verifyDensityV2RecipeSemantics(): void {
  const enabled = Object.entries(DENSITY_V2_RECIPE_BANKS)
    .filter(([, bank]) => bank.enabled)
    .map(([genus]) => genus)
    .sort();
  if (enabled.join(',') !== [...DENSITY_V2_ENABLED_GENERA].sort().join(',')) {
    throw new Error(`Density V2 W7 enabled set mismatch: ${enabled.join(',')}`);
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
    || CUMULUS_BANK.sampleLimits.join(',') !== '3,1,0,0') {
    throw new Error('Density V2 W7 static sample limits changed');
  }
}
