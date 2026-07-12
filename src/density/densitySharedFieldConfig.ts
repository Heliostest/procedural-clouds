export const DENSITY_SHARED_FIELD_CONFIG_VERSION = 1;
export const DENSITY_SHARED_FIELD_MAX_BYTES = 8 * 1024 * 1024;

export type DensitySharedFieldFormat = 'rgba8unorm' | 'r16float' | 'rgba16float';

export interface DensitySharedFieldConfig {
  version: typeof DENSITY_SHARED_FIELD_CONFIG_VERSION;
  atlasDimension: 64;
  macroDimension: 256;
  format: 'rgba8unorm';
  atlasSeed: number;
  macroSeed: number;
}

export interface DensitySharedFieldBudget {
  format: DensitySharedFieldFormat;
  bytesPerTexel: number;
  channelCount: number;
  baseBytes: number;
  detailBytes: number;
  macroBytes: number;
  payloadBytes: number;
  withinBudget: boolean;
}

export const DEFAULT_DENSITY_SHARED_FIELD_CONFIG: DensitySharedFieldConfig = Object.freeze({
  version: DENSITY_SHARED_FIELD_CONFIG_VERSION,
  atlasDimension: 64,
  macroDimension: 256,
  format: 'rgba8unorm',
  atlasSeed: 0x6d2b79f5,
  macroSeed: 0x1b56c4e9,
});

const FORMAT_LAYOUT = Object.freeze({
  rgba8unorm: { bytesPerTexel: 4, channelCount: 4 },
  r16float: { bytesPerTexel: 2, channelCount: 1 },
  rgba16float: { bytesPerTexel: 8, channelCount: 4 },
} satisfies Record<DensitySharedFieldFormat, { bytesPerTexel: number; channelCount: number }>);

export function estimateDensitySharedFieldBudget(
  format: DensitySharedFieldFormat,
  atlasDimension = 64,
  macroDimension = 256,
): DensitySharedFieldBudget {
  const layout = FORMAT_LAYOUT[format];
  const baseBytes = atlasDimension ** 3 * layout.bytesPerTexel;
  const detailBytes = baseBytes;
  // Macro remains RGBA8 for every diagnostic atlas candidate.
  const macroBytes = macroDimension ** 2 * 4;
  const payloadBytes = baseBytes + detailBytes + macroBytes;
  return {
    format,
    bytesPerTexel: layout.bytesPerTexel,
    channelCount: layout.channelCount,
    baseBytes,
    detailBytes,
    macroBytes,
    payloadBytes,
    withinBudget: payloadBytes <= DENSITY_SHARED_FIELD_MAX_BYTES,
  };
}

function finiteUint32(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`density-shared-field-invalid-${label}`);
  }
  return value >>> 0;
}

export function validateDensitySharedFieldConfig(
  value: Readonly<DensitySharedFieldConfig>,
  limits?: Pick<GPUSupportedLimits, 'maxTextureDimension2D' | 'maxTextureDimension3D'>,
): DensitySharedFieldConfig {
  if (value.version !== DENSITY_SHARED_FIELD_CONFIG_VERSION) {
    throw new Error(`density-shared-field-config-version-${value.version}`);
  }
  if (value.atlasDimension !== 64 || value.macroDimension !== 256 || value.format !== 'rgba8unorm') {
    throw new Error('density-shared-field-config-not-w5-fixed');
  }
  if (limits && (
    value.atlasDimension > limits.maxTextureDimension3D
    || value.macroDimension > limits.maxTextureDimension2D
  )) {
    throw new Error('density-shared-field-device-dimension-limit');
  }
  const budget = estimateDensitySharedFieldBudget(value.format, value.atlasDimension, value.macroDimension);
  if (!budget.withinBudget) throw new Error('density-shared-field-budget-exceeded');
  return {
    ...value,
    atlasSeed: finiteUint32(value.atlasSeed, 'atlas-seed'),
    macroSeed: finiteUint32(value.macroSeed, 'macro-seed'),
  };
}

export function densitySharedFieldSignature(config: Readonly<DensitySharedFieldConfig>): string {
  return [
    config.version,
    config.atlasDimension,
    config.macroDimension,
    config.format,
    config.atlasSeed >>> 0,
    config.macroSeed >>> 0,
  ].join(':');
}

export interface DensitySharedFieldRebuildPlan {
  atlas: boolean;
  macro: boolean;
  reason: string;
}

export function planDensitySharedFieldRebuild(
  previous: Readonly<DensitySharedFieldConfig>,
  next: Readonly<DensitySharedFieldConfig>,
): DensitySharedFieldRebuildPlan {
  const atlas = previous.format !== next.format
    || previous.atlasDimension !== next.atlasDimension
    || previous.atlasSeed !== next.atlasSeed;
  const macro = previous.format !== next.format
    || previous.macroDimension !== next.macroDimension
    || previous.macroSeed !== next.macroSeed;
  return {
    atlas,
    macro,
    reason: atlas || macro ? 'config-signature' : 'unchanged',
  };
}

export function verifyDensitySharedFieldConfigFixtures(): void {
  const defaults = estimateDensitySharedFieldBudget('rgba8unorm');
  if (defaults.payloadBytes !== 2_359_296 || defaults.payloadBytes / 1024 / 1024 !== 2.25) {
    throw new Error(`density-shared-field-default-budget-${defaults.payloadBytes}`);
  }
  const r16 = estimateDensitySharedFieldBudget('r16float');
  if (r16.payloadBytes !== 1_310_720 || r16.channelCount !== 1) {
    throw new Error(`density-shared-field-r16-budget-${r16.payloadBytes}`);
  }
  const rgba16 = estimateDensitySharedFieldBudget('rgba16float');
  if (rgba16.payloadBytes !== 4_456_448 || rgba16.payloadBytes / 1024 / 1024 !== 4.25) {
    throw new Error(`density-shared-field-rgba16-budget-${rgba16.payloadBytes}`);
  }
  if (!defaults.withinBudget || !r16.withinBudget || !rgba16.withinBudget) {
    throw new Error('density-shared-field-approved-format-over-budget');
  }
  validateDensitySharedFieldConfig(DEFAULT_DENSITY_SHARED_FIELD_CONFIG);
  const atlasOnly = planDensitySharedFieldRebuild(DEFAULT_DENSITY_SHARED_FIELD_CONFIG, {
    ...DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
    atlasSeed: DEFAULT_DENSITY_SHARED_FIELD_CONFIG.atlasSeed + 1,
  });
  const macroOnly = planDensitySharedFieldRebuild(DEFAULT_DENSITY_SHARED_FIELD_CONFIG, {
    ...DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
    macroSeed: DEFAULT_DENSITY_SHARED_FIELD_CONFIG.macroSeed + 1,
  });
  const unchanged = planDensitySharedFieldRebuild(
    DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
    DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
  );
  if (!atlasOnly.atlas || atlasOnly.macro || macroOnly.atlas || !macroOnly.macro
    || unchanged.atlas || unchanged.macro) {
    throw new Error('density-shared-field-independent-cadence-fixture');
  }
  const repeat = (value: number): number => value - Math.floor(value);
  for (const phase of [-3.75, -0.25, 0, 0.125, 2.75]) {
    const a = repeat(0.375 + phase);
    const b = repeat(1.375 + phase);
    if (Math.abs(a - b) > 1e-12) throw new Error('density-shared-field-repeat-phase-fixture');
  }
  if (densitySharedFieldSignature(DEFAULT_DENSITY_SHARED_FIELD_CONFIG)
    === densitySharedFieldSignature({ ...DEFAULT_DENSITY_SHARED_FIELD_CONFIG, atlasSeed: 7 })) {
    throw new Error('density-shared-field-seed-signature-fixture');
  }
}
