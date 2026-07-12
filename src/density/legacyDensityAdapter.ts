import { MAX_BODIES } from '../params';
import {
  DENSITY_CACHE_FORMAT,
  type DensityCacheOutput,
  type DensityCacheProducer,
  type DensityEncodeContext,
  type DensityEncodeResult,
  type DensityFrameInput,
  type DensityFramePlan,
  type DensityProducerLifecycle,
  type DensityProducerStats,
} from './contracts';
import type { LegacyDensityPipelineResources } from './legacyDensityPipeline';

export interface LegacyDensityAdapterOptions {
  device: GPUDevice;
  sampler: GPUSampler;
  initialResolution: number;
  initialWorkgroup: readonly [number, number, number];
  pipelineResources: LegacyDensityPipelineResources;
  createSceneBindGroup(pipeline: GPUComputePipeline): GPUBindGroup;
}

function normalizedResolution(value: number): number {
  return Math.max(32, Math.min(256, Math.round(value)));
}

function normalizedWorkgroup(size: readonly [number, number, number]): [number, number, number] {
  return [
    Math.max(1, Math.min(32, Math.round(size[0]))),
    Math.max(1, Math.min(32, Math.round(size[1]))),
    Math.max(1, Math.min(16, Math.round(size[2]))),
  ];
}

export class LegacyDensityAdapter implements DensityCacheProducer {
  readonly kind = 'legacy' as const;

  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipelineResources: LegacyDensityPipelineResources;
  private readonly createSceneBindGroup: LegacyDensityAdapterOptions['createSceneBindGroup'];
  private textures: [GPUTexture, GPUTexture] | null = null;
  private sampledViews: [GPUTextureView, GPUTextureView] | null = null;
  private pipeline: GPUComputePipeline;
  private sceneBindGroup: GPUBindGroup;
  private storeBindGroup: GPUBindGroup | null = null;
  private resolution: number;
  private workgroup: [number, number, number];
  private cacheIndex = 0;
  private cacheValidCount = 0;
  private cacheTransitionStart = 0;
  private cacheTransitionDuration = 1 / 60;
  private lastCacheUpdateElapsed = 0;
  private lastCachedWindOffsets: Array<[number, number]> = [];
  private cacheBlend = 0;
  private resourceGeneration = 0;
  private contentRevision = 0;
  private lastSceneRevision = -1;
  private preparedFrame = -1;
  private encodedFrame = -1;
  private pendingEncode = false;
  private forceRefresh = true;
  private activeBodyCount = 0;
  private lifecycle: DensityProducerLifecycle = 'ready';
  private failureReason = '';
  private cacheRan = false;
  private cacheSampleId = 0;
  private readonly createCpuMs: number;
  private rebuildCpuMs = 0;

  constructor(options: LegacyDensityAdapterOptions) {
    const started = performance.now();
    this.device = options.device;
    this.sampler = options.sampler;
    this.pipelineResources = options.pipelineResources;
    this.createSceneBindGroup = options.createSceneBindGroup;
    this.resolution = normalizedResolution(options.initialResolution);
    this.workgroup = normalizedWorkgroup(options.initialWorkgroup);
    this.pipeline = this.pipelineResources.pipeline;
    this.sceneBindGroup = this.createSceneBindGroup(this.pipeline);
    this.rebuildTextures();
    this.createCpuMs = performance.now() - started;
  }

  prepareFrame(input: DensityFrameInput): DensityFramePlan {
    this.assertReady('prepareFrame');
    if (input.frameIndex === this.preparedFrame) {
      throw new Error(`LegacyDensityAdapter.prepareFrame called twice for frame ${input.frameIndex}`);
    }
    if (input.sceneRevision !== this.lastSceneRevision) {
      this.sceneBindGroup = this.createSceneBindGroup(this.pipeline);
      this.lastSceneRevision = input.sceneRevision;
    }

    this.preparedFrame = input.frameIndex;
    this.pendingEncode = false;
    this.cacheRan = false;
    this.activeBodyCount = Math.min(input.bodies.length, MAX_BODIES);

    const updateRate = Math.max(1, Math.round(input.params.cacheUpdateRate));
    const scheduledUpdate = input.frameIndex % updateRate === 0;
    const willEncode = input.params.qualityMode !== 2
      && (this.forceRefresh || scheduledUpdate || this.windMovedPastVoxel(input));

    if (willEncode) {
      const interval = this.lastCacheUpdateElapsed > 0
        ? input.elapsedSeconds - this.lastCacheUpdateElapsed
        : 1 / 60;
      this.cacheTransitionDuration = Math.max(1 / 240, interval);
      this.cacheTransitionStart = input.elapsedSeconds;
      this.lastCacheUpdateElapsed = input.elapsedSeconds;
      this.cacheIndex = 1 - this.cacheIndex;
      this.cacheValidCount++;
      this.lastCachedWindOffsets = input.windSamples.map((sample) => [sample.offsetM[0], sample.offsetM[1]]);
      this.pendingEncode = true;
    }

    if (this.cacheValidCount <= 1) {
      this.cacheBlend = this.cacheIndex === 0 ? 0 : 1;
    } else {
      let progress = Math.min(
        1,
        Math.max(0, (input.elapsedSeconds - this.cacheTransitionStart) / this.cacheTransitionDuration),
      );
      if (input.params.cacheSmooth > 0) {
        progress = Math.pow(progress, 1 / (1 + input.params.cacheSmooth * 4));
      }
      this.cacheBlend = this.cacheIndex === 1 ? progress : 1 - progress;
    }

    return {
      producer: this.kind,
      willEncode,
      contentWillChange: willEncode,
      cacheBlend: this.cacheBlend,
      resourceGeneration: this.resourceGeneration,
      contentRevision: this.contentRevision,
    };
  }

  encode(encoder: GPUCommandEncoder, context: DensityEncodeContext = {}): DensityEncodeResult {
    if (this.lifecycle !== 'ready') {
      return this.rejected(`producer-${this.lifecycle}`);
    }
    if (this.preparedFrame < 0) return this.rejected('frame-not-prepared');
    if (this.encodedFrame === this.preparedFrame) return this.rejected('frame-already-encoded');
    this.encodedFrame = this.preparedFrame;
    if (!this.pendingEncode) {
      return {
        status: 'skipped',
        cacheRan: false,
        contentRevision: this.contentRevision,
        reason: 'cache-not-scheduled',
      };
    }

    const textures = this.requireTextures();
    this.storeBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: textures[this.cacheIndex].createView({ dimension: '3d' }) },
      ],
    });
    const descriptor = context.timestampWrites
      ? { timestampWrites: context.timestampWrites }
      : undefined;
    const pass = encoder.beginComputePass(descriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.sceneBindGroup);
    pass.setBindGroup(2, this.storeBindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.resolution / this.workgroup[0]),
      Math.ceil(this.resolution / this.workgroup[1]),
      Math.ceil(this.resolution / this.workgroup[2]),
    );
    pass.end();

    this.pendingEncode = false;
    this.forceRefresh = false;
    this.cacheRan = true;
    this.cacheSampleId++;
    this.contentRevision++;
    return {
      status: 'encoded',
      cacheRan: true,
      contentRevision: this.contentRevision,
      reason: '',
    };
  }

  getOutput(): DensityCacheOutput {
    const views = this.requireViews();
    return {
      format: DENSITY_CACHE_FORMAT,
      resolution: [this.resolution, this.resolution, this.resolution],
      sampledViews: views,
      sampler: this.sampler,
      cacheBlend: this.cacheBlend,
      resourceGeneration: this.resourceGeneration,
      contentRevision: this.contentRevision,
      validSampleCount: this.cacheValidCount,
      valid: this.lifecycle === 'ready' && this.cacheValidCount > 0,
    };
  }

  setResolution(resolution: number): void {
    this.assertReady('setResolution');
    const next = normalizedResolution(resolution);
    if (next === this.resolution && this.textures) return;
    this.resolution = next;
    this.rebuildTextures();
  }

  setWorkgroup(size: readonly [number, number, number]): void {
    this.assertReady('setWorkgroup');
    const next = normalizedWorkgroup(size);
    if (next.every((value, index) => value === this.workgroup[index])) return;
    const started = performance.now();
    this.workgroup = next;
    this.pipeline = this.pipelineResources.createPipeline(this.workgroup);
    this.sceneBindGroup = this.createSceneBindGroup(this.pipeline);
    this.storeBindGroup = null;
    this.rebuildCpuMs += performance.now() - started;
  }

  invalidate(_reason: string): void {
    this.forceRefresh = true;
    this.lastCachedWindOffsets = [];
  }

  getStats(): DensityProducerStats {
    return {
      kind: this.kind,
      availability: this.lifecycle === 'ready' ? 'available' : 'invalid',
      lifecycle: this.lifecycle,
      failureReason: this.failureReason,
      cacheRan: this.cacheRan,
      cacheSampleId: this.cacheSampleId,
      contentRevision: this.contentRevision,
      resourceGeneration: this.resourceGeneration,
      resolution: this.resolution,
      workgroup: this.workgroup,
      activeBodyCount: this.activeBodyCount,
      createCpuMs: this.createCpuMs,
      rebuildCpuMs: this.rebuildCpuMs,
      shaderModuleCreateCpuMs: this.pipelineResources.creation.shaderModuleCreateCpuMs,
      pipelineCreateCpuMs: this.pipelineResources.creation.pipelineCreateCpuMs,
      sourceLength: this.pipelineResources.creation.sourceLength,
      recordBytes: 0,
      outputBytes: this.resolution ** 3 * 8 * 2,
      dispatchWorkgroups: [
        Math.ceil(this.resolution / this.workgroup[0]),
        Math.ceil(this.resolution / this.workgroup[1]),
        Math.ceil(this.resolution / this.workgroup[2]),
      ],
      emptyDensity: false,
      tileMask: null,
    };
  }

  handleDeviceLost(reason: GPUDeviceLostInfo): void {
    if (this.lifecycle === 'destroyed') return;
    this.lifecycle = 'device-lost';
    this.failureReason = reason.message || String(reason.reason);
    this.pendingEncode = false;
    this.destroyTextures();
  }

  destroy(): void {
    if (this.lifecycle === 'destroyed') return;
    this.destroyTextures();
    this.storeBindGroup = null;
    this.lifecycle = 'destroyed';
    this.failureReason = 'producer-destroyed';
    this.pendingEncode = false;
  }

  private windMovedPastVoxel(input: DensityFrameInput): boolean {
    if (input.windSamples.length !== this.lastCachedWindOffsets.length) return true;
    const horizontalVoxelM = (input.params.boxHalfExtent * 2) / Math.max(1, this.resolution);
    for (let i = 0; i < input.windSamples.length; i++) {
      const current = input.windSamples[i].offsetM;
      const previous = this.lastCachedWindOffsets[i];
      if (Math.hypot(current[0] - previous[0], current[1] - previous[1]) > horizontalVoxelM) {
        return true;
      }
    }
    return false;
  }

  private rebuildTextures(): void {
    const started = performance.now();
    this.destroyTextures();
    const createTexture = (): GPUTexture => this.device.createTexture({
      size: [this.resolution, this.resolution, this.resolution],
      dimension: '3d',
      format: DENSITY_CACHE_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.textures = [createTexture(), createTexture()];
    this.sampledViews = [
      this.textures[0].createView({ dimension: '3d' }),
      this.textures[1].createView({ dimension: '3d' }),
    ];
    this.storeBindGroup = null;
    this.cacheIndex = 0;
    this.cacheValidCount = 0;
    this.cacheBlend = 0;
    this.lastCachedWindOffsets = [];
    this.forceRefresh = true;
    this.resourceGeneration++;
    this.rebuildCpuMs += performance.now() - started;
  }

  private destroyTextures(): void {
    if (this.textures) {
      for (const texture of this.textures) texture.destroy();
    }
    this.textures = null;
    this.sampledViews = null;
  }

  private requireTextures(): [GPUTexture, GPUTexture] {
    if (!this.textures) throw new Error(`Legacy density textures unavailable (${this.lifecycle})`);
    return this.textures;
  }

  private requireViews(): [GPUTextureView, GPUTextureView] {
    if (!this.sampledViews) throw new Error(`Legacy density output unavailable (${this.lifecycle})`);
    return this.sampledViews;
  }

  private assertReady(operation: string): void {
    if (this.lifecycle !== 'ready') {
      throw new Error(`LegacyDensityAdapter.${operation} rejected: ${this.lifecycle}`);
    }
  }

  private rejected(reason: string): DensityEncodeResult {
    return {
      status: 'rejected',
      cacheRan: false,
      contentRevision: this.contentRevision,
      reason,
    };
  }
}
