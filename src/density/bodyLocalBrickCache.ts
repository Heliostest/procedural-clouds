import { MAX_BODIES } from '../params';
import type {
  DensityBrickStats,
  DensityHierarchicalCacheOutput,
  DensityStorageLifecycle,
} from './contracts';
import {
  DENSITY_BRICK_CANDIDATE_ENTRY_BYTES,
  DENSITY_BRICK_RECORD_BYTES,
  buildDensityBrickCandidateGrid,
  buildDensityBrickLayout,
  packDensityBrickRecords,
  type DensityBrickCandidateGrid,
  type DensityBrickLayout,
  type DensityBrickLodState,
  type DensityStorageMode,
} from './bodyLocalBricks';
import type { DensityV2PackedFrame, DensityV2Vec3 } from './recipeV2Packing';
import {
  DENSITY_BRICK_DISPATCH_BYTES,
  DENSITY_BRICK_DISPATCH_STRIDE,
  type RecipeV2BrickPipelineResources,
} from './recipeV2Pipeline';

export interface BodyLocalBrickCacheOptions {
  readonly device: GPUDevice;
  createPipelineResources(workgroup: readonly [number, number, number]): Promise<RecipeV2BrickPipelineResources>;
  getInputBindGroup(): GPUBindGroup;
  getSharedFieldBindGroup(): GPUBindGroup;
}

export interface BodyLocalBrickPrepareOptions {
  readonly packed: DensityV2PackedFrame;
  readonly cameraPosition: DensityV2Vec3;
  readonly resolution: number;
  readonly workgroup: readonly [number, number, number];
  readonly cacheIndex: number;
  readonly cacheWillEncode: boolean;
  readonly nextContentRevision: number;
}

function nextPowerOfTwo(value: number): number {
  let result = 4;
  while (result < value) result *= 2;
  return result;
}

export class BodyLocalBrickCache {
  private readonly device: GPUDevice;
  private pipelineResources: RecipeV2BrickPipelineResources | null = null;
  private readonly createPipelineResources: BodyLocalBrickCacheOptions['createPipelineResources'];
  private readonly getInputBindGroup: () => GPUBindGroup;
  private readonly getSharedFieldBindGroup: () => GPUBindGroup;
  private requested: DensityStorageMode = 'global-only';
  private lifecycle: DensityStorageLifecycle = 'idle';
  private reason = 'not-requested';
  private profileFallbackReason = '';
  private textures: [GPUTexture, GPUTexture] | null = null;
  private views: [GPUTextureView, GPUTextureView] | null = null;
  private outputBindGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  private sampler: GPUSampler | null = null;
  private recordBuffer: GPUBuffer | null = null;
  private candidateBuffer: GPUBuffer | null = null;
  private candidateBufferBytes = 0;
  private dispatchBuffer: GPUBuffer | null = null;
  private dispatchBindGroup: GPUBindGroup | null = null;
  private layout: DensityBrickLayout | null = null;
  private candidateGrid: DensityBrickCandidateGrid | null = null;
  private previousLods = new Map<number, DensityBrickLodState>();
  private allocationGeneration = 0;
  private resourceGeneration = 0;
  private contentRevision = 0;
  private warmedAtlasMask = 0;
  private pendingEncode = false;
  private pendingCacheIndex = 0;
  private dispatchCount = 0;
  private voxelCount = 0;
  private sampleId = 0;
  private rebuildCount = 0;
  private rebuildCpuMs = 0;
  private createCpuMs = 0;
  private brickGpuMs: number | null = null;
  private gpuTimingError = '';
  private destroyed = false;
  private pipeline: GPUComputePipeline | null;
  private workgroup: [number, number, number] = [8, 8, 4];
  private pipelinePromise: Promise<void> | null = null;

  constructor(options: BodyLocalBrickCacheOptions) {
    this.device = options.device;
    this.createPipelineResources = options.createPipelineResources;
    this.getInputBindGroup = options.getInputBindGroup;
    this.getSharedFieldBindGroup = options.getSharedFieldBindGroup;
    this.pipeline = null;
  }

  request(mode: DensityStorageMode, cacheRequired: boolean): void {
    if (this.destroyed) return;
    this.requested = mode;
    if (mode === 'global-only' || !cacheRequired) {
      if (this.textures) this.destroyResources();
      this.pipelineResources = null;
      this.pipeline = null;
      this.profileFallbackReason = '';
      this.lifecycle = 'idle';
      this.reason = mode === 'global-only' ? 'not-requested' : 'deferred-for-realtime';
      return;
    }
    if (!this.pipelineResources) {
      this.startPipelineCreation();
      return;
    }
    if (!this.textures) this.createResources();
  }

  prepare(options: BodyLocalBrickPrepareOptions): void {
    this.pendingEncode = false;
    if (this.requested !== 'hierarchical'
      || (this.lifecycle !== 'warming' && this.lifecycle !== 'ready')
      || !options.cacheWillEncode
      || !this.pipelineResources
      || !this.textures) {
      return;
    }
    try {
      const started = performance.now();
      const nextLayout = buildDensityBrickLayout({
        packed: options.packed,
        profile: this.pipelineResources.profile,
        cameraPosition: options.cameraPosition,
        previousLods: this.previousLods,
        generation: this.allocationGeneration + 1,
      });
      const layoutChanged = nextLayout.signature !== this.layout?.signature;
      if (layoutChanged) {
        this.allocationGeneration++;
        this.layout = buildDensityBrickLayout({
          packed: options.packed,
          profile: this.pipelineResources.profile,
          cameraPosition: options.cameraPosition,
          previousLods: this.previousLods,
          generation: this.allocationGeneration,
        });
        this.previousLods = new Map(this.layout.lodStates);
        this.warmedAtlasMask = 0;
        this.lifecycle = 'warming';
        this.reason = 'layout-warming';
        this.rebuildCount++;
        this.resourceGeneration++;
      } else {
        this.layout = this.layout ?? nextLayout;
      }
      const layout = this.layout;
      const candidateGrid = buildDensityBrickCandidateGrid({
        packed: options.packed,
        layout,
        resolution: options.resolution,
        workgroup: options.workgroup,
      });
      this.ensureCandidateBuffer(candidateGrid.words.byteLength);
      this.candidateGrid = candidateGrid;
      const records = packDensityBrickRecords(layout, options.nextContentRevision);
      this.device.queue.writeBuffer(this.requireRecordBuffer(), 0, records);
      this.device.queue.writeBuffer(this.requireCandidateBuffer(), 0, candidateGrid.words);
      this.writeDispatches(layout);
      this.pendingCacheIndex = options.cacheIndex;
      this.pendingEncode = true;
      this.dispatchCount = layout.residentCount;
      this.voxelCount = layout.allocations.reduce((total, allocation) => (
        total + (allocation?.physicalEdge ?? 0) ** 3
      ), 0);
      this.rebuildCpuMs += performance.now() - started;
    } catch (error: unknown) {
      this.pendingEncode = false;
      this.warmedAtlasMask = 0;
      this.lifecycle = 'failed';
      this.reason = `brick-prepare-failed:${error instanceof Error ? error.message : String(error)}`;
    }
  }

  setWorkgroup(workgroup: readonly [number, number, number]): void {
    const next = workgroup.map((value) => Math.max(1, Math.round(value))) as [number, number, number];
    if (next.every((value, index) => value === this.workgroup[index])) return;
    this.workgroup = next;
    if (!this.pipelineResources || this.destroyed) return;
    this.pipeline = this.pipelineResources.createPipeline(next);
    this.invalidate('workgroup');
  }

  invalidate(reason: string): void {
    if (!this.textures || this.destroyed) return;
    this.warmedAtlasMask = 0;
    this.lifecycle = 'warming';
    this.reason = reason;
  }

  encode(encoder: GPUCommandEncoder, timestampWrites?: GPUComputePassTimestampWrites): boolean {
    if (!this.pendingEncode || !this.pipelineResources || !this.layout) return false;
    const pass = encoder.beginComputePass(timestampWrites ? { timestampWrites } : undefined);
    if (!this.pipeline) throw new Error('Density brick pipeline unavailable');
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.getInputBindGroup());
    pass.setBindGroup(1, this.requireOutputBindGroups()[this.pendingCacheIndex]);
    pass.setBindGroup(2, this.getSharedFieldBindGroup());
    const dispatchBindGroup = this.requireDispatchBindGroup();
    for (const allocation of this.layout.allocations) {
      if (!allocation) continue;
      pass.setBindGroup(3, dispatchBindGroup, [allocation.compactIndex * DENSITY_BRICK_DISPATCH_STRIDE]);
      pass.dispatchWorkgroups(
        Math.ceil(allocation.physicalEdge / this.workgroup[0]),
        Math.ceil(allocation.physicalEdge / this.workgroup[1]),
        Math.ceil(allocation.physicalEdge / this.workgroup[2]),
      );
    }
    pass.end();
    this.pendingEncode = false;
    this.warmedAtlasMask |= 1 << this.pendingCacheIndex;
    this.contentRevision++;
    this.sampleId++;
    if (this.warmedAtlasMask === 0b11) {
      this.lifecycle = 'ready';
      this.reason = '';
    } else {
      this.lifecycle = 'warming';
      this.reason = 'atlas-pair-warming';
    }
    return true;
  }

  getOutput(): DensityHierarchicalCacheOutput | null {
    if (this.lifecycle !== 'ready' || !this.layout || !this.candidateGrid || !this.views
      || !this.sampler || !this.recordBuffer || !this.candidateBuffer || !this.pipelineResources) {
      return null;
    }
    const dimension = this.pipelineResources.profile.dimension;
    return {
      format: this.pipelineResources.profile.format,
      profile: this.pipelineResources.profile.id,
      dimensions: [dimension, dimension, dimension],
      sampledViews: this.views,
      sampler: this.sampler,
      recordBuffer: this.recordBuffer,
      candidateBuffer: this.candidateBuffer,
      candidateGrid: this.candidateGrid.stats.grid,
      layoutGeneration: this.resourceGeneration,
      allocationGeneration: this.allocationGeneration,
      contentRevision: this.contentRevision,
      valid: true,
    };
  }

  getStats(coarseOutputBytes: number): DensityBrickStats {
    const profile = this.pipelineResources?.profile;
    const candidate = this.candidateGrid?.stats ?? null;
    const layout = this.layout;
    return {
      requested: this.requested,
      active: this.lifecycle === 'ready' ? 'hierarchical' : 'global-only',
      lifecycle: this.lifecycle,
      reason: this.reason,
      profileFallbackReason: this.profileFallbackReason,
      profile: profile?.id ?? '',
      format: profile?.format ?? '',
      dimensions: profile ? [profile.dimension, profile.dimension, profile.dimension] : [0, 0, 0],
      residentBytes: this.textures && profile ? profile.residentBytes : 0,
      rebuildPeakBytes: this.textures && profile ? profile.residentBytes * 2 : 0,
      totalDensityBytes: coarseOutputBytes + (this.textures && profile ? profile.residentBytes : 0)
        + (this.recordBuffer ? DENSITY_BRICK_RECORD_BYTES : 0) + this.candidateBufferBytes,
      recordBytes: this.recordBuffer ? DENSITY_BRICK_RECORD_BYTES : 0,
      candidateBytes: this.candidateBuffer ? candidate?.bytes ?? this.candidateBufferBytes : 0,
      allocationGeneration: this.allocationGeneration,
      contentRevision: this.contentRevision,
      rebuildCount: this.rebuildCount,
      rebuildCpuMs: this.rebuildCpuMs,
      residentBodyCount: layout?.residentCount ?? 0,
      nonresidentBodyCount: layout?.nonresidentCount ?? 0,
      lods: layout?.allocations.flatMap((allocation) => allocation ? [allocation.logicalEdge] : []) ?? [],
      dispatchCount: this.dispatchCount,
      voxelCount: this.voxelCount,
      sampleId: this.sampleId,
      candidate,
      fallbackSamples: null,
      createCpuMs: this.createCpuMs,
      brickGpuMs: this.brickGpuMs,
      gpuTimingError: this.gpuTimingError,
    };
  }

  recordGpuTiming(brickMs: number | null, error = ''): void {
    this.brickGpuMs = brickMs;
    this.gpuTimingError = error;
  }

  handleDeviceLost(reason: string): void {
    if (this.destroyed) return;
    this.destroyResources();
    this.lifecycle = 'failed';
    this.reason = reason || 'device-lost';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyResources();
    this.lifecycle = 'destroyed';
    this.reason = 'producer-destroyed';
  }

  private startPipelineCreation(): void {
    if (this.pipelinePromise || this.destroyed) return;
    this.lifecycle = 'creating';
    this.reason = 'hierarchical-pipeline-compiling';
    this.pipelinePromise = this.createPipelineResources(this.workgroup).then((resources) => {
      if (this.destroyed || this.requested !== 'hierarchical') return;
      this.pipelineResources = resources;
      this.pipeline = resources.pipeline;
      this.profileFallbackReason = resources.profileFallbackReason;
      this.reason = resources.profileFallbackReason;
      this.createResources();
    }).catch((error: unknown) => {
      if (this.destroyed) return;
      this.lifecycle = 'failed';
      this.reason = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      this.pipelinePromise = null;
    });
  }

  private createResources(): void {
    if (!this.pipelineResources || this.textures || this.destroyed) return;
    const started = performance.now();
    this.lifecycle = 'creating';
    this.reason = 'creating-resources';
    const profile = this.pipelineResources.profile;
    const createTexture = (): GPUTexture => this.device.createTexture({
      label: `density-body-local-atlas-${profile.id}`,
      size: [profile.dimension, profile.dimension, profile.dimension],
      dimension: '3d',
      format: profile.format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.textures = [createTexture(), createTexture()];
    this.views = [
      this.textures[0].createView({ dimension: '3d' }),
      this.textures[1].createView({ dimension: '3d' }),
    ];
    this.outputBindGroups = this.textures.map((texture, index) => this.device.createBindGroup({
      label: `density-body-local-atlas-output-${index}`,
      layout: this.pipelineResources!.outputLayout,
      entries: [{ binding: 0, resource: texture.createView({ dimension: '3d' }) }],
    })) as [GPUBindGroup, GPUBindGroup];
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    });
    this.recordBuffer = this.device.createBuffer({
      label: 'density-body-local-records',
      size: DENSITY_BRICK_RECORD_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.dispatchBuffer = this.device.createBuffer({
      label: 'density-body-local-dispatches',
      size: DENSITY_BRICK_DISPATCH_STRIDE * MAX_BODIES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.dispatchBindGroup = this.device.createBindGroup({
      label: 'density-body-local-dispatch-binding',
      layout: this.pipelineResources.dispatchLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.dispatchBuffer, offset: 0, size: DENSITY_BRICK_DISPATCH_BYTES },
      }],
    });
    this.ensureCandidateBuffer(DENSITY_BRICK_CANDIDATE_ENTRY_BYTES);
    this.resourceGeneration++;
    this.lifecycle = 'warming';
    this.reason = 'resources-created';
    this.createCpuMs += performance.now() - started;
  }

  private ensureCandidateBuffer(bytes: number): void {
    const required = nextPowerOfTwo(Math.max(DENSITY_BRICK_CANDIDATE_ENTRY_BYTES, bytes));
    if (this.candidateBuffer && required <= this.candidateBufferBytes) return;
    this.candidateBuffer?.destroy();
    this.candidateBuffer = this.device.createBuffer({
      label: 'density-body-local-candidate-grid',
      size: required,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.candidateBufferBytes = required;
    this.resourceGeneration++;
  }

  private writeDispatches(layout: DensityBrickLayout): void {
    const buffer = new ArrayBuffer(DENSITY_BRICK_DISPATCH_STRIDE * MAX_BODIES);
    for (const allocation of layout.allocations) {
      if (!allocation) continue;
      const base = allocation.compactIndex * DENSITY_BRICK_DISPATCH_STRIDE;
      new Uint32Array(buffer, base, 4).set([...allocation.origin, allocation.compactIndex]);
      new Uint32Array(buffer, base + 16, 4).set([
        allocation.logicalEdge,
        allocation.physicalEdge,
        allocation.padding,
        0,
      ]);
      new Float32Array(buffer, base + 32, 4).set([...allocation.supportCenter, 0]);
      new Float32Array(buffer, base + 48, 4).set([...allocation.supportHalfExtents, 0]);
      new Float32Array(buffer, base + 64, 4).set([...allocation.supportRotation.slice(0, 3), 0]);
      new Float32Array(buffer, base + 80, 4).set([...allocation.supportRotation.slice(3, 6), 0]);
      new Float32Array(buffer, base + 96, 4).set([...allocation.supportRotation.slice(6, 9), 0]);
    }
    this.device.queue.writeBuffer(this.requireDispatchBuffer(), 0, buffer);
  }

  private destroyResources(): void {
    if (this.textures) for (const texture of this.textures) texture.destroy();
    this.recordBuffer?.destroy();
    this.candidateBuffer?.destroy();
    this.dispatchBuffer?.destroy();
    this.textures = null;
    this.views = null;
    this.outputBindGroups = null;
    this.sampler = null;
    this.recordBuffer = null;
    this.candidateBuffer = null;
    this.candidateBufferBytes = 0;
    this.dispatchBuffer = null;
    this.dispatchBindGroup = null;
    this.layout = null;
    this.candidateGrid = null;
    this.previousLods.clear();
    this.warmedAtlasMask = 0;
    this.pendingEncode = false;
    this.dispatchCount = 0;
    this.voxelCount = 0;
    this.resourceGeneration++;
  }

  private requireRecordBuffer(): GPUBuffer {
    if (!this.recordBuffer) throw new Error('Density brick record buffer unavailable');
    return this.recordBuffer;
  }

  private requireCandidateBuffer(): GPUBuffer {
    if (!this.candidateBuffer) throw new Error('Density brick candidate buffer unavailable');
    return this.candidateBuffer;
  }

  private requireDispatchBuffer(): GPUBuffer {
    if (!this.dispatchBuffer) throw new Error('Density brick dispatch buffer unavailable');
    return this.dispatchBuffer;
  }

  private requireDispatchBindGroup(): GPUBindGroup {
    if (!this.dispatchBindGroup) throw new Error('Density brick dispatch binding unavailable');
    return this.dispatchBindGroup;
  }

  private requireOutputBindGroups(): [GPUBindGroup, GPUBindGroup] {
    if (!this.outputBindGroups) throw new Error('Density brick atlas outputs unavailable');
    return this.outputBindGroups;
  }
}
