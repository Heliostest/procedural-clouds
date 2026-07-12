import type { CloudBody } from '../body';
import type { BodyMod } from '../lifecycle';
import type { CloudParams } from '../params';
import type { WindAdvectionSample } from '../wind';

export const DENSITY_CACHE_FORMAT = 'rgba16float' as const;

export const DENSITY_CACHE_CHANNELS = Object.freeze({
  density: 'r',
  dominantGenus: 'g',
  secondaryGenus: 'b',
  secondaryBlend: 'a',
} as const);

export const DENSITY_PRODUCER_MODE = Object.freeze({
  legacy: 0,
  recipeV2: 1,
} as const);

export type DensityProducerKind = 'legacy' | 'recipe-v2';
export type DensityProducerLifecycle = 'idle' | 'creating' | 'warming' | 'ready' | 'failed' | 'device-lost' | 'destroyed';
export type DensityProducerAvailability = 'available' | 'unavailable' | 'invalid';

export interface DensityFrameInput {
  frameIndex: number;
  elapsedSeconds: number;
  sceneTimeSeconds: number;
  params: Readonly<CloudParams>;
  bodies: readonly CloudBody[];
  bodyMods: readonly BodyMod[];
  windSamples: readonly WindAdvectionSample[];
  sceneRevision: number;
}

export interface DensityFramePlan {
  producer: DensityProducerKind;
  willEncode: boolean;
  contentWillChange: boolean;
  cacheBlend: number;
  resourceGeneration: number;
  contentRevision: number;
}

export interface DensityEncodeContext {
  timestampWrites?: GPUComputePassTimestampWrites;
}

export interface DensityEncodeResult {
  status: 'encoded' | 'skipped' | 'rejected';
  cacheRan: boolean;
  contentRevision: number;
  reason: string;
}

export interface DensityCacheOutput {
  format: typeof DENSITY_CACHE_FORMAT;
  resolution: readonly [number, number, number];
  sampledViews: readonly [GPUTextureView, GPUTextureView];
  sampler: GPUSampler;
  cacheBlend: number;
  resourceGeneration: number;
  contentRevision: number;
  validSampleCount: number;
  valid: boolean;
}

export interface DensityTileMaskStats {
  enabled: boolean;
  fallbackReason: string;
  grid: readonly [number, number, number];
  tileCount: number;
  requiredBytes: number;
  allocatedBytes: number;
  emptyTileCount: number;
  occupiedTileCount: number;
  candidateMemberships: number;
  averageCandidates: number;
  maxCandidates: number;
  denseTileBodyPairs: number;
  maskedTileBodyPairs: number;
  denseVoxelBodyUpperBound: number;
  maskedVoxelBodyUpperBound: number;
  culledRatio: number;
  cpuBroadPhaseTests: number;
  generation: number;
  revision: number;
  rebuildCount: number;
  rebuildCpuMs: number;
  rebuildReason: string;
  evaluatorCalls: 0;
}

export interface DensityProducerStats {
  kind: DensityProducerKind;
  availability: DensityProducerAvailability;
  lifecycle: DensityProducerLifecycle;
  failureReason: string;
  cacheRan: boolean;
  cacheSampleId: number;
  contentRevision: number;
  resourceGeneration: number;
  resolution: number;
  workgroup: readonly [number, number, number];
  activeBodyCount: number;
  createCpuMs: number;
  rebuildCpuMs: number;
  shaderModuleCreateCpuMs: number;
  pipelineCreateCpuMs: number;
  sourceLength: number;
  recordBytes: number;
  outputBytes: number;
  dispatchWorkgroups: readonly [number, number, number];
  emptyDensity: boolean;
  tileMask: DensityTileMaskStats | null;
}

export interface DensityProducerSelection {
  requested: DensityProducerKind;
  active: DensityProducerKind;
  activeGeneration: number;
  candidateLifecycle: DensityProducerLifecycle;
  candidateReason: string;
  fallbackReason: string;
}

export interface DensityProducerCandidate {
  readonly kind: DensityProducerKind;
  readonly availability: DensityProducerAvailability;
  readonly reason: string;
}

export interface DensityCacheProducer {
  readonly kind: DensityProducerKind;
  prepareFrame(input: DensityFrameInput): DensityFramePlan;
  encode(encoder: GPUCommandEncoder, context?: DensityEncodeContext): DensityEncodeResult;
  getOutput(): DensityCacheOutput;
  setResolution(resolution: number): void;
  setWorkgroup(size: readonly [number, number, number]): void;
  invalidate(reason: string): void;
  getStats(): DensityProducerStats;
  handleDeviceLost(reason: GPUDeviceLostInfo): void;
  destroy(): void;
}
