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
import {
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_FRAME_GPU_LAYOUT,
  DENSITY_RECIPE_GPU_LAYOUT,
  DENSITY_V2_RECORD_BYTES,
} from './recipeV2Layout';
import { packDensityV2Frame } from './recipeV2Packing';
import {
  createRecipeV2PipelineResources,
  type RecipeV2PipelineResources,
} from './recipeV2Pipeline';
import { packDensityRecipeV2Table } from './recipeV2Recipes';

export interface RecipeDensityV2AdapterOptions {
  device: GPUDevice;
  initialResolution: number;
  initialWorkgroup: readonly [number, number, number];
  pipelineResources: RecipeV2PipelineResources;
}

export interface CreateRecipeDensityV2AdapterOptions {
  device: GPUDevice;
  initialResolution: number;
  initialWorkgroup: readonly [number, number, number];
}

function normalizedResolution(value: number): number {
  return Math.max(32, Math.min(256, Math.round(value)));
}

export class RecipeDensityV2Adapter implements DensityCacheProducer {
  readonly kind = 'recipe-v2' as const;

  private readonly device: GPUDevice;
  private readonly pipelineResources: RecipeV2PipelineResources;
  private readonly sampler: GPUSampler;
  private readonly frameBuffer: GPUBuffer;
  private readonly bodyBuffer: GPUBuffer;
  private readonly recipeBuffer: GPUBuffer;
  private readonly inputBindGroup: GPUBindGroup;
  private textures: [GPUTexture, GPUTexture] | null = null;
  private sampledViews: [GPUTextureView, GPUTextureView] | null = null;
  private outputBindGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  private pipeline: GPUComputePipeline;
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
  private preparedFrame = -1;
  private encodedFrame = -1;
  private pendingEncode = false;
  private forceRefresh = true;
  private activeBodyCount = 0;
  private lifecycle: DensityProducerLifecycle = 'warming';
  private failureReason = '';
  private cacheRan = false;
  private cacheSampleId = 0;
  private readonly createCpuMs: number;
  private rebuildCpuMs = 0;

  constructor(options: RecipeDensityV2AdapterOptions) {
    const started = performance.now();
    this.device = options.device;
    this.pipelineResources = options.pipelineResources;
    this.pipeline = options.pipelineResources.pipeline;
    this.resolution = normalizedResolution(options.initialResolution);
    this.workgroup = [...options.initialWorkgroup] as [number, number, number];
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    });
    this.frameBuffer = this.device.createBuffer({
      label: 'recipe-density-v2-frame-buffer',
      size: DENSITY_FRAME_GPU_LAYOUT.stride,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bodyBuffer = this.device.createBuffer({
      label: 'recipe-density-v2-body-buffer',
      size: DENSITY_BODY_GPU_LAYOUT.stride * DENSITY_BODY_GPU_LAYOUT.count,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.recipeBuffer = this.device.createBuffer({
      label: 'recipe-density-v2-recipe-buffer',
      size: DENSITY_RECIPE_GPU_LAYOUT.stride * DENSITY_RECIPE_GPU_LAYOUT.count,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.recipeBuffer, 0, packDensityRecipeV2Table());
    this.inputBindGroup = this.device.createBindGroup({
      label: 'recipe-density-v2-inputs',
      layout: this.pipelineResources.inputLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.bodyBuffer } },
        { binding: 2, resource: { buffer: this.recipeBuffer } },
      ],
    });
    this.rebuildTextures();
    this.createCpuMs = performance.now() - started;
  }

  prepareFrame(input: DensityFrameInput): DensityFramePlan {
    this.assertUsable('prepareFrame');
    if (input.frameIndex === this.preparedFrame) {
      throw new Error(`RecipeDensityV2Adapter.prepareFrame called twice for frame ${input.frameIndex}`);
    }
    this.preparedFrame = input.frameIndex;
    this.pendingEncode = false;
    this.cacheRan = false;
    const packed = packDensityV2Frame(input, this.resolution);
    this.activeBodyCount = packed.activeBodyCount;
    this.device.queue.writeBuffer(this.frameBuffer, 0, packed.frame);
    this.device.queue.writeBuffer(this.bodyBuffer, 0, packed.bodies);

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
    if (this.lifecycle !== 'warming' && this.lifecycle !== 'ready') {
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
    const outputBindGroups = this.requireOutputBindGroups();
    const descriptor = context.timestampWrites ? { timestampWrites: context.timestampWrites } : undefined;
    const pass = encoder.beginComputePass(descriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.inputBindGroup);
    pass.setBindGroup(1, outputBindGroups[this.cacheIndex]);
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
    this.lifecycle = 'ready';
    return {
      status: 'encoded',
      cacheRan: true,
      contentRevision: this.contentRevision,
      reason: '',
    };
  }

  getOutput(): DensityCacheOutput {
    const sampledViews = this.requireViews();
    return {
      format: DENSITY_CACHE_FORMAT,
      resolution: [this.resolution, this.resolution, this.resolution],
      sampledViews,
      sampler: this.sampler,
      cacheBlend: this.cacheBlend,
      resourceGeneration: this.resourceGeneration,
      contentRevision: this.contentRevision,
      validSampleCount: this.cacheValidCount,
      valid: this.lifecycle === 'ready' && this.cacheValidCount > 0,
    };
  }

  setResolution(resolution: number): void {
    this.assertUsable('setResolution');
    const next = normalizedResolution(resolution);
    if (next === this.resolution && this.textures) return;
    this.resolution = next;
    this.rebuildTextures();
  }

  setWorkgroup(size: readonly [number, number, number]): void {
    this.assertUsable('setWorkgroup');
    if (size.every((value, index) => Math.round(value) === this.workgroup[index])) return;
    const started = performance.now();
    this.pipeline = this.pipelineResources.createPipeline(size);
    this.workgroup = size.map((value) => Math.round(value)) as [number, number, number];
    this.forceRefresh = true;
    this.rebuildCpuMs += performance.now() - started;
  }

  invalidate(_reason: string): void {
    this.forceRefresh = true;
    this.lastCachedWindOffsets = [];
  }

  getStats(): DensityProducerStats {
    return {
      kind: this.kind,
      availability: this.lifecycle === 'warming' || this.lifecycle === 'ready' ? 'available' : 'invalid',
      lifecycle: this.lifecycle,
      failureReason: this.failureReason,
      cacheRan: this.cacheRan,
      cacheSampleId: this.cacheSampleId,
      contentRevision: this.contentRevision,
      resourceGeneration: this.resourceGeneration,
      resolution: this.resolution,
      workgroup: this.workgroup,
      activeBodyCount: Math.min(this.activeBodyCount, MAX_BODIES),
      createCpuMs: this.createCpuMs,
      rebuildCpuMs: this.rebuildCpuMs,
      shaderModuleCreateCpuMs: this.pipelineResources.creation.shaderModuleCreateCpuMs,
      pipelineCreateCpuMs: this.pipelineResources.creation.pipelineCreateCpuMs,
      sourceLength: this.pipelineResources.creation.sourceLength,
      recordBytes: DENSITY_V2_RECORD_BYTES,
      outputBytes: this.resolution ** 3 * 8 * 2,
      dispatchWorkgroups: [
        Math.ceil(this.resolution / this.workgroup[0]),
        Math.ceil(this.resolution / this.workgroup[1]),
        Math.ceil(this.resolution / this.workgroup[2]),
      ],
      emptyDensity: true,
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
    this.frameBuffer.destroy();
    this.bodyBuffer.destroy();
    this.recipeBuffer.destroy();
    this.lifecycle = 'destroyed';
    this.failureReason = 'producer-destroyed';
    this.pendingEncode = false;
  }

  private windMovedPastVoxel(input: DensityFrameInput): boolean {
    if (input.windSamples.length !== this.lastCachedWindOffsets.length) return true;
    const horizontalVoxelM = (input.params.boxHalfExtent * 2) / Math.max(1, this.resolution);
    for (let index = 0; index < input.windSamples.length; index++) {
      const current = input.windSamples[index].offsetM;
      const previous = this.lastCachedWindOffsets[index];
      if (Math.hypot(current[0] - previous[0], current[1] - previous[1]) > horizontalVoxelM) return true;
    }
    return false;
  }

  private rebuildTextures(): void {
    const started = performance.now();
    this.destroyTextures();
    const createTexture = (): GPUTexture => this.device.createTexture({
      label: 'recipe-density-v2-output',
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
    this.outputBindGroups = this.textures.map((texture, index) => this.device.createBindGroup({
      label: `recipe-density-v2-output-${index}`,
      layout: this.pipelineResources.outputLayout,
      entries: [{ binding: 0, resource: texture.createView({ dimension: '3d' }) }],
    })) as [GPUBindGroup, GPUBindGroup];
    this.cacheIndex = 0;
    this.cacheValidCount = 0;
    this.cacheBlend = 0;
    this.lastCachedWindOffsets = [];
    this.forceRefresh = true;
    this.lifecycle = 'warming';
    this.resourceGeneration++;
    this.rebuildCpuMs += performance.now() - started;
  }

  private destroyTextures(): void {
    if (this.textures) for (const texture of this.textures) texture.destroy();
    this.textures = null;
    this.sampledViews = null;
    this.outputBindGroups = null;
  }

  private requireViews(): [GPUTextureView, GPUTextureView] {
    if (!this.sampledViews) throw new Error(`Recipe V2 density output unavailable (${this.lifecycle})`);
    return this.sampledViews;
  }

  private requireOutputBindGroups(): [GPUBindGroup, GPUBindGroup] {
    if (!this.outputBindGroups) throw new Error(`Recipe V2 storage bindings unavailable (${this.lifecycle})`);
    return this.outputBindGroups;
  }

  private assertUsable(operation: string): void {
    if (this.lifecycle !== 'warming' && this.lifecycle !== 'ready') {
      throw new Error(`RecipeDensityV2Adapter.${operation} rejected: ${this.lifecycle}`);
    }
  }

  private rejected(reason: string): DensityEncodeResult {
    return { status: 'rejected', cacheRan: false, contentRevision: this.contentRevision, reason };
  }
}

export async function createRecipeDensityV2Adapter(
  options: CreateRecipeDensityV2AdapterOptions,
): Promise<RecipeDensityV2Adapter> {
  const pipelineResources = await createRecipeV2PipelineResources(options.device, options.initialWorkgroup);
  return new RecipeDensityV2Adapter({ ...options, pipelineResources });
}
