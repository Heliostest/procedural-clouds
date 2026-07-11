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
export type DensityProducerLifecycle = 'ready' | 'failed' | 'device-lost' | 'destroyed';
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
}

export interface DensityProducerSelection {
  requested: DensityProducerKind;
  active: DensityProducerKind;
  fallbackReason: string;
}

export interface DensityCacheProducer {
  readonly kind: DensityProducerKind;
  prepareFrame(input: DensityFrameInput): DensityFramePlan;
  encode(encoder: GPUCommandEncoder, context?: DensityEncodeContext): DensityEncodeResult;
  getOutput(): DensityCacheOutput;
  setResolution(resolution: number): void;
  setWorkgroup(size: readonly [number, number, number]): void;
  getStats(): DensityProducerStats;
  handleDeviceLost(reason: GPUDeviceLostInfo): void;
  destroy(): void;
}
