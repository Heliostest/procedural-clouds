import type { DensityCacheOutput, DensityStorageLifecycle } from '../density/contracts';
import type { DensityStorageMode } from '../density/bodyLocalBricks';

export const DENSITY_QUALITY_MODE = Object.freeze({
  cached: 0,
  hybrid: 1,
  realtime: 2,
} as const);

export type DensityQualityKind = 'cached' | 'hybrid' | 'realtime';
export type DensityQualityPipelineLifecycle = 'idle' | 'compiling' | 'ready' | 'failed' | 'destroyed';

export interface DensityQualityPipelineCreationStats {
  shaderModuleCreateCpuMs: number;
  renderPipelineCreateCpuMs: number;
  cloudFramePipelineCreateCpuMs: number;
  groundShadowPipelineCreateCpuMs: number;
  sourceLength: number;
}

export interface DensityQualityPipelineBundle {
  readonly kind: DensityQualityKind;
  readonly storageMode: DensityStorageMode;
  readonly generation: number;
  readonly cloudPipeline: GPURenderPipeline;
  readonly cloudFramePipeline: GPURenderPipeline | null;
  readonly cloudFrameFailureReason: string;
  readonly groundShadowPipeline: GPUComputePipeline;
  readonly usesDensityCache: boolean;
  readonly creation: DensityQualityPipelineCreationStats;
}

export interface DensityQualityPipelineState {
  kind: DensityQualityKind;
  storageMode: DensityStorageMode;
  lifecycle: DensityQualityPipelineLifecycle;
  reason: string;
  creation: DensityQualityPipelineCreationStats;
}

export interface DensityQualitySelection {
  requested: DensityQualityKind;
  active: DensityQualityKind;
  activeGeneration: number;
  lifecycle: DensityQualityPipelineLifecycle;
  reason: string;
  requestedStorage: DensityStorageMode;
  activeStorage: DensityStorageMode;
  storageLifecycle: DensityStorageLifecycle;
  storageReason: string;
}

export interface DensityQualityBindingResources {
  cameraBuffer: GPUBuffer;
  paramsBuffer: GPUBuffer;
  shapeView: GPUTextureView;
  weatherSampler: GPUSampler;
  presetBuffer: GPUBuffer;
  densityOutput: DensityCacheOutput;
  groundShadowStoreView: GPUTextureView;
  groundShadowSampler: GPUSampler;
  groundShadowView: GPUTextureView;
  stbnView: GPUTextureView;
  raymarchCountersBuffer: GPUBuffer;
}

export interface DensityQualityBindings {
  cloudScene: GPUBindGroup;
  cloudFrameScene: GPUBindGroup | null;
  groundShadowScene: GPUBindGroup;
  cloudDensity: GPUBindGroup | null;
  cloudFrameDensity: GPUBindGroup | null;
  groundShadowDensity: GPUBindGroup | null;
  groundShadowStore: GPUBindGroup;
  cloudGroundShadow: GPUBindGroup;
  cloudFrameGroundShadow: GPUBindGroup | null;
}

export function densityQualityKindFromMode(mode: number): DensityQualityKind {
  const rounded = Math.round(mode);
  if (rounded === DENSITY_QUALITY_MODE.cached) return 'cached';
  if (rounded === DENSITY_QUALITY_MODE.realtime) return 'realtime';
  return 'hybrid';
}

export function densityQualityModeFromKind(kind: DensityQualityKind): number {
  return DENSITY_QUALITY_MODE[kind];
}
