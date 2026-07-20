import { MAX_BODIES } from '../params';
import type {
  DensityBrickStats,
  DensityHierarchicalCacheOutput,
  DensityStorageLifecycle,
} from './contracts';
import {
  DENSITY_BRICK_CANDIDATE_ENTRY_BYTES,
  DENSITY_BRICK_CANDIDATE_META_BYTES,
  DENSITY_BRICK_RECORD_BYTES,
  buildDensityBrickCandidateGrid,
  buildDensityBrickLayout,
  packDensityBrickCandidateMeta,
  packDensityBrickRecords,
  reconcileDensityBrickLayout,
  type DensityBrickCandidateGrid,
  type DensityBrickLayout,
  type DensityStorageMode,
} from './bodyLocalBricks';
import {
  DensityBrickGenerationState,
  type DensityBrickGenerationToken,
} from './bodyLocalBrickGenerationState';
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

interface DensityBrickGenerationResources {
  readonly textures: [GPUTexture, GPUTexture];
  readonly views: [GPUTextureView, GPUTextureView];
  readonly outputBindGroups: [GPUBindGroup, GPUBindGroup];
  readonly sampler: GPUSampler;
  readonly recordBuffer: GPUBuffer;
  candidateBuffer: GPUBuffer;
  candidateBufferBytes: number;
  readonly candidateMetaBuffer: GPUBuffer;
  readonly dispatchBuffer: GPUBuffer;
  readonly dispatchBindGroup: GPUBindGroup;
  layout: DensityBrickLayout;
  candidateGrid: DensityBrickCandidateGrid | null;
  contentRevision: number;
  bindingGeneration: number;
  destroyed: boolean;
}

interface PendingBrickEncode {
  readonly target: DensityBrickGenerationResources;
  readonly token: DensityBrickGenerationToken | null;
  readonly cacheIndex: 0 | 1;
  readonly contentRevision: number;
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
  private readonly generations = new DensityBrickGenerationState<DensityBrickGenerationResources>();
  private readonly retiredAfterSubmit: DensityBrickGenerationResources[] = [];
  private requested: DensityStorageMode = 'global-only';
  private lifecycle: DensityStorageLifecycle = 'idle';
  private reason = 'not-requested';
  private profileFallbackReason = '';
  private allocationGeneration = 0;
  private bindingGeneration = 0;
  private lastContentRevision = 0;
  private pendingEncode: PendingBrickEncode | null = null;
  private dispatchCount = 0;
  private voxelCount = 0;
  private sampleId = 0;
  private rebuildCount = 0;
  private rebuildCpuMs = 0;
  private rebuildPeakBytes = 0;
  private createCpuMs = 0;
  private brickGpuMs: number | null = null;
  private gpuTimingError = '';
  private destroyed = false;
  private outputSuppressed = false;
  private pipeline: GPUComputePipeline | null = null;
  private workgroup: [number, number, number] = [8, 8, 4];
  private pipelinePromise: Promise<void> | null = null;
  private requestEpoch = 0;

  constructor(options: BodyLocalBrickCacheOptions) {
    this.device = options.device;
    this.createPipelineResources = options.createPipelineResources;
    this.getInputBindGroup = options.getInputBindGroup;
    this.getSharedFieldBindGroup = options.getSharedFieldBindGroup;
  }

  request(mode: DensityStorageMode, cacheRequired: boolean): void {
    if (this.destroyed) return;
    const shouldDeactivate = mode === 'global-only' || !cacheRequired;
    const wasRequested = this.requested;
    this.requested = mode;
    if (shouldDeactivate) {
      if (wasRequested !== 'global-only' || this.hasLiveResources() || this.pipelinePromise) this.requestEpoch++;
      this.destroyGenerationSet(this.generations.deactivate());
      this.destroyRetiredGenerations();
      this.pipelineResources = null;
      this.pipeline = null;
      this.profileFallbackReason = '';
      this.outputSuppressed = false;
      this.pendingEncode = null;
      this.dispatchCount = 0;
      this.voxelCount = 0;
      this.rebuildPeakBytes = 0;
      this.lifecycle = 'idle';
      this.reason = mode === 'global-only' ? 'not-requested' : 'deferred-for-realtime';
      return;
    }
    if (!this.pipelineResources) this.startPipelineCreation();
  }

  prepare(options: BodyLocalBrickPrepareOptions): void {
    this.pendingEncode = null;
    if (this.requested !== 'hierarchical'
      || !options.cacheWillEncode
      || !this.pipelineResources
      || !this.pipeline) {
      return;
    }
    try {
      if (this.retiredAfterSubmit.length > 0) {
        throw new Error('retired brick generation was not released after queue submission');
      }
      const started = performance.now();
      const active = this.generations.getActive();
      let staging = this.generations.getStaging();
      const baseLayout = staging?.layout ?? active?.layout ?? null;
      const nextLayout = buildDensityBrickLayout({
        packed: options.packed,
        profile: this.pipelineResources.profile,
        cameraPosition: options.cameraPosition,
        previousLods: baseLayout?.lodStates,
        generation: this.allocationGeneration + 1,
      });

      let target: DensityBrickGenerationResources;
      let token: DensityBrickGenerationToken | null = null;
      if (staging && nextLayout.signature === staging.layout.signature) {
        staging.layout = reconcileDensityBrickLayout(
          staging.layout,
          nextLayout,
          staging.layout.generation,
        ).layout;
        target = staging;
        token = this.requireStagingToken();
      } else if (active && nextLayout.signature === active.layout.signature) {
        if (staging) {
          const cancelled = this.generations.cancel(this.requireStagingToken());
          if (cancelled) this.destroyGeneration(cancelled);
          staging = null;
        }
        active.layout = reconcileDensityBrickLayout(
          active.layout,
          nextLayout,
          active.layout.generation,
        ).layout;
        target = active;
      } else {
        if (staging) {
          const cancelled = this.generations.cancel(this.requireStagingToken());
          if (cancelled) this.destroyGeneration(cancelled);
        }
        this.allocationGeneration++;
        const stagedLayout = Object.freeze({
          ...nextLayout,
          generation: this.allocationGeneration,
        });
        target = this.createGeneration(stagedLayout);
        token = this.generations.beginStaging(target, stagedLayout.generation);
        this.rebuildCount++;
      }

      const candidateGrid = buildDensityBrickCandidateGrid({
        packed: options.packed,
        layout: target.layout,
        resolution: options.resolution,
        workgroup: options.workgroup,
      });
      const candidateMappingChanged = target.candidateGrid !== null
        && (target.candidateGrid.resolution !== candidateGrid.resolution
          || target.candidateGrid.workgroup.some((value, index) => (
            value !== candidateGrid.workgroup[index]
          ))
          || target.candidateGrid.stats.grid.some((value, index) => (
            value !== candidateGrid.stats.grid[index]
          )));
      const candidateBindingChanged = this.ensureCandidateBuffer(target, candidateGrid.words.byteLength);
      target.candidateGrid = candidateGrid;
      const records = packDensityBrickRecords(target.layout, options.nextContentRevision);
      this.device.queue.writeBuffer(target.recordBuffer, 0, records);
      this.device.queue.writeBuffer(target.candidateBuffer, 0, candidateGrid.words);
      this.device.queue.writeBuffer(
        target.candidateMetaBuffer,
        0,
        packDensityBrickCandidateMeta(candidateGrid),
      );
      this.writeDispatches(target, target.layout);
      if ((candidateBindingChanged || candidateMappingChanged) && target === active) {
        target.bindingGeneration = ++this.bindingGeneration;
      }
      this.pendingEncode = {
        target,
        token,
        cacheIndex: options.cacheIndex === 1 ? 1 : 0,
        contentRevision: options.nextContentRevision,
      };
      this.dispatchCount = target.layout.residentCount;
      this.voxelCount = target.layout.allocations.reduce((total, allocation) => (
        total + (allocation?.physicalEdge ?? 0) ** 3
      ), 0);
      this.updateLifecycleForGenerations(token ? 'layout-staging' : '');
      this.rebuildCpuMs += performance.now() - started;
      this.assertAtlasBudget();
    } catch (error: unknown) {
      this.failPrepare(error);
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
    if (this.destroyed || this.requested !== 'hierarchical') return;
    this.pendingEncode = null;
    this.reason = reason;
    if (!this.generations.getActive()) this.lifecycle = 'warming';
  }

  encode(encoder: GPUCommandEncoder, timestampWrites?: GPUComputePassTimestampWrites): boolean {
    const pending = this.pendingEncode;
    if (!pending || !this.pipelineResources || !this.pipeline) return false;
    this.pendingEncode = null;
    let pass: GPUComputePassEncoder | null = null;
    try {
      // Resolve every dependency before opening the pass. If a supplier rejects
      // during a device/lifecycle transition, the caller still has a usable
      // command encoder for the global-only fallback passes.
      const inputBindGroup = this.getInputBindGroup();
      const sharedFieldBindGroup = this.getSharedFieldBindGroup();
      const outputBindGroup = pending.target.outputBindGroups[pending.cacheIndex];
      pass = encoder.beginComputePass(timestampWrites ? { timestampWrites } : undefined);
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, inputBindGroup);
      pass.setBindGroup(1, outputBindGroup);
      pass.setBindGroup(2, sharedFieldBindGroup);
      for (const allocation of pending.target.layout.allocations) {
        if (!allocation) continue;
        pass.setBindGroup(3, pending.target.dispatchBindGroup, [
          allocation.compactIndex * DENSITY_BRICK_DISPATCH_STRIDE,
        ]);
        pass.dispatchWorkgroups(
          Math.ceil(allocation.physicalEdge / this.workgroup[0]),
          Math.ceil(allocation.physicalEdge / this.workgroup[1]),
          Math.ceil(allocation.physicalEdge / this.workgroup[2]),
        );
      }
      pass.end();
      pass = null;
      pending.target.contentRevision = pending.contentRevision;
      this.lastContentRevision = pending.contentRevision;
      this.sampleId++;

      if (pending.token) {
        const retiredActive = this.generations.getActive();
        const result = this.generations.markAtlasWarm(pending.token, pending.cacheIndex);
        if (result.published) {
          pending.target.bindingGeneration = ++this.bindingGeneration;
          if (retiredActive && retiredActive !== pending.target) this.retiredAfterSubmit.push(retiredActive);
          this.lifecycle = 'ready';
          this.reason = '';
        } else if (result.accepted || result.reason === 'duplicate') {
          this.updateLifecycleForGenerations('atlas-pair-warming');
        } else {
          throw new Error(`brick-generation-completion-${result.reason}`);
        }
      } else {
        this.lifecycle = 'ready';
        this.reason = '';
      }
      this.assertAtlasBudget();
      this.outputSuppressed = false;
      return true;
    } catch (error: unknown) {
      if (pass) {
        try {
          pass.end();
        } catch {
          // The original encode error is the actionable fallback reason.
        }
      }
      this.failEncode(pending, error);
      return false;
    }
  }

  afterSubmit(): void {
    this.destroyRetiredGenerations();
  }

  getOutput(): DensityHierarchicalCacheOutput | null {
    const active = this.generations.getActive();
    if (this.outputSuppressed || !active?.candidateGrid || !this.pipelineResources) return null;
    const dimension = active.layout.profile.dimension;
    return {
      format: active.layout.profile.format,
      profile: active.layout.profile.id,
      dimensions: [dimension, dimension, dimension],
      sampledViews: active.views,
      sampler: active.sampler,
      recordBuffer: active.recordBuffer,
      candidateBuffer: active.candidateBuffer,
      candidateMetaBuffer: active.candidateMetaBuffer,
      candidateGrid: active.candidateGrid.stats.grid,
      layoutGeneration: active.bindingGeneration,
      allocationGeneration: active.layout.generation,
      contentRevision: active.contentRevision,
      valid: true,
    };
  }

  getStats(coarseOutputBytes: number): DensityBrickStats {
    const active = this.generations.getActive();
    const staging = this.generations.getStaging();
    const diagnostic = active ?? staging;
    const profile = diagnostic?.layout.profile ?? this.pipelineResources?.profile;
    const candidate = diagnostic?.candidateGrid?.stats ?? null;
    const liveGenerations = this.liveGenerations();
    const generationSnapshot = this.generations.snapshot();
    const textureBytes = liveGenerations.reduce((total, generation) => (
      total + generation.layout.profile.residentBytes
    ), 0);
    const generationBufferBytes = liveGenerations.reduce((total, generation) => (
      total
      + DENSITY_BRICK_RECORD_BYTES
      + generation.candidateBufferBytes
      + DENSITY_BRICK_CANDIDATE_META_BYTES
      + DENSITY_BRICK_DISPATCH_STRIDE * MAX_BODIES
    ), 0);
    return {
      requested: this.requested,
      active: this.getOutput() ? 'hierarchical' : 'global-only',
      lifecycle: this.lifecycle,
      reason: this.reason,
      profileFallbackReason: this.profileFallbackReason,
      profile: profile?.id ?? '',
      format: profile?.format ?? '',
      dimensions: profile ? [profile.dimension, profile.dimension, profile.dimension] : [0, 0, 0],
      residentBytes: active ? active.layout.profile.residentBytes : 0,
      rebuildPeakBytes: this.rebuildPeakBytes,
      totalDensityBytes: coarseOutputBytes + textureBytes + generationBufferBytes,
      recordBytes: diagnostic ? DENSITY_BRICK_RECORD_BYTES : 0,
      candidateBytes: diagnostic ? candidate?.bytes ?? diagnostic.candidateBufferBytes : 0,
      allocationGeneration: active?.layout.generation ?? this.allocationGeneration,
      activeGeneration: active?.layout.generation ?? 0,
      activeBindingGeneration: active?.bindingGeneration ?? 0,
      stagingGeneration: staging?.layout.generation ?? 0,
      stagingWarmMask: generationSnapshot.staging?.warmedAtlasMask ?? 0,
      livePairCount: liveGenerations.length,
      contentRevision: active?.contentRevision ?? this.lastContentRevision,
      rebuildCount: this.rebuildCount,
      rebuildCpuMs: this.rebuildCpuMs,
      residentBodyCount: diagnostic?.layout.residentCount ?? 0,
      nonresidentBodyCount: diagnostic?.layout.nonresidentCount ?? 0,
      lods: diagnostic?.layout.allocations.flatMap((allocation) => (
        allocation ? [allocation.logicalEdge] : []
      )) ?? [],
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
    this.requestEpoch++;
    this.destroyGenerationSet(this.generations.deviceLost());
    this.destroyRetiredGenerations();
    this.pipelineResources = null;
    this.pipeline = null;
    this.pendingEncode = null;
    this.outputSuppressed = true;
    this.dispatchCount = 0;
    this.voxelCount = 0;
    this.rebuildPeakBytes = 0;
    this.lifecycle = 'failed';
    this.reason = reason || 'device-lost';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.requestEpoch++;
    this.destroyGenerationSet(this.generations.destroy());
    this.destroyRetiredGenerations();
    this.pipelineResources = null;
    this.pipeline = null;
    this.pendingEncode = null;
    this.rebuildPeakBytes = 0;
    this.lifecycle = 'destroyed';
    this.reason = 'producer-destroyed';
  }

  private startPipelineCreation(): void {
    if (this.pipelinePromise || this.destroyed) return;
    const epoch = this.requestEpoch;
    const creationWorkgroup = [...this.workgroup] as [number, number, number];
    this.lifecycle = 'creating';
    this.reason = 'hierarchical-pipeline-compiling';
    const promise = this.createPipelineResources(creationWorkgroup).then((resources) => {
      if (this.destroyed || epoch !== this.requestEpoch || this.requested !== 'hierarchical') return;
      this.pipelineResources = resources;
      this.pipeline = creationWorkgroup.every((value, index) => value === this.workgroup[index])
        ? resources.pipeline
        : resources.createPipeline(this.workgroup);
      this.profileFallbackReason = resources.profileFallbackReason;
      this.lifecycle = 'warming';
      this.reason = resources.profileFallbackReason || 'pipeline-ready';
    }).catch((error: unknown) => {
      if (this.destroyed || epoch !== this.requestEpoch) return;
      this.outputSuppressed = true;
      this.lifecycle = 'failed';
      this.reason = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      if (this.pipelinePromise !== promise) return;
      this.pipelinePromise = null;
      const requestChangedWhileCreating = epoch !== this.requestEpoch;
      if (!this.destroyed
        && this.requested === 'hierarchical'
        && !this.pipelineResources
        && this.lifecycle !== 'failed'
        && requestChangedWhileCreating) {
        this.startPipelineCreation();
      }
    });
    this.pipelinePromise = promise;
  }

  private createGeneration(layout: DensityBrickLayout): DensityBrickGenerationResources {
    if (!this.pipelineResources) throw new Error('Density brick pipeline resources unavailable');
    const started = performance.now();
    const profile = layout.profile;
    const createdTextures: GPUTexture[] = [];
    const createdBuffers: GPUBuffer[] = [];
    try {
      const createTexture = (): GPUTexture => {
        const texture = this.device.createTexture({
          label: `density-body-local-atlas-${profile.id}-generation-${layout.generation}`,
          size: [profile.dimension, profile.dimension, profile.dimension],
          dimension: '3d',
          format: profile.format,
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        createdTextures.push(texture);
        return texture;
      };
      const textures = [createTexture(), createTexture()] as [GPUTexture, GPUTexture];
      const views = textures.map((texture) => texture.createView({ dimension: '3d' })) as [
        GPUTextureView,
        GPUTextureView,
      ];
      const outputBindGroups = textures.map((texture, index) => this.device.createBindGroup({
        label: `density-body-local-atlas-output-${index}-generation-${layout.generation}`,
        layout: this.pipelineResources!.outputLayout,
        entries: [{ binding: 0, resource: texture.createView({ dimension: '3d' }) }],
      })) as [GPUBindGroup, GPUBindGroup];
      const sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
      });
      const createBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer => {
        const buffer = this.device.createBuffer(descriptor);
        createdBuffers.push(buffer);
        return buffer;
      };
      const recordBuffer = createBuffer({
        label: 'density-body-local-records',
        size: DENSITY_BRICK_RECORD_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const candidateBufferBytes = nextPowerOfTwo(DENSITY_BRICK_CANDIDATE_ENTRY_BYTES);
      const candidateBuffer = createBuffer({
        label: 'density-body-local-candidate-grid',
        size: candidateBufferBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const candidateMetaBuffer = createBuffer({
        label: 'density-body-local-candidate-meta',
        size: DENSITY_BRICK_CANDIDATE_META_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const dispatchBuffer = createBuffer({
        label: 'density-body-local-dispatches',
        size: DENSITY_BRICK_DISPATCH_STRIDE * MAX_BODIES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const dispatchBindGroup = this.device.createBindGroup({
        label: 'density-body-local-dispatch-binding',
        layout: this.pipelineResources.dispatchLayout,
        entries: [{
          binding: 0,
          resource: { buffer: dispatchBuffer, offset: 0, size: DENSITY_BRICK_DISPATCH_BYTES },
        }],
      });
      const generation: DensityBrickGenerationResources = {
        textures,
        views,
        outputBindGroups,
        sampler,
        recordBuffer,
        candidateBuffer,
        candidateBufferBytes,
        candidateMetaBuffer,
        dispatchBuffer,
        dispatchBindGroup,
        layout,
        candidateGrid: null,
        contentRevision: 0,
        bindingGeneration: 0,
        destroyed: false,
      };
      this.createCpuMs += performance.now() - started;
      return generation;
    } catch (error: unknown) {
      for (const texture of createdTextures) texture.destroy();
      for (const buffer of createdBuffers) buffer.destroy();
      throw error;
    }
  }

  private ensureCandidateBuffer(target: DensityBrickGenerationResources, bytes: number): boolean {
    const required = nextPowerOfTwo(Math.max(DENSITY_BRICK_CANDIDATE_ENTRY_BYTES, bytes));
    if (required <= target.candidateBufferBytes) return false;
    const replacement = this.device.createBuffer({
      label: 'density-body-local-candidate-grid',
      size: required,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    target.candidateBuffer.destroy();
    target.candidateBuffer = replacement;
    target.candidateBufferBytes = required;
    return true;
  }

  private writeDispatches(target: DensityBrickGenerationResources, layout: DensityBrickLayout): void {
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
    this.device.queue.writeBuffer(target.dispatchBuffer, 0, buffer);
  }

  private failPrepare(error: unknown): void {
    this.pendingEncode = null;
    const stagingSnapshot = this.generations.snapshot().staging;
    const failed = stagingSnapshot ? this.generations.fail(stagingSnapshot.token) : null;
    if (failed) this.destroyGeneration(failed);
    this.outputSuppressed = true;
    this.lifecycle = 'failed';
    this.reason = `brick-prepare-failed:${error instanceof Error ? error.message : String(error)}`;
  }

  private failEncode(pending: PendingBrickEncode, error: unknown): void {
    if (pending.token) {
      const failed = this.generations.fail(pending.token);
      if (failed) this.retiredAfterSubmit.push(failed);
    }
    this.outputSuppressed = true;
    this.lifecycle = 'failed';
    this.reason = `brick-encode-failed:${error instanceof Error ? error.message : String(error)}`;
  }

  private updateLifecycleForGenerations(reason: string): void {
    if (this.generations.getActive()) {
      this.lifecycle = 'ready';
      this.reason = reason;
    } else {
      this.lifecycle = 'warming';
      this.reason = reason || 'atlas-pair-warming';
    }
  }

  private requireStagingToken(): DensityBrickGenerationToken {
    const token = this.generations.snapshot().staging?.token;
    if (!token) throw new Error('Density brick staging token unavailable');
    return token;
  }

  private liveGenerations(): DensityBrickGenerationResources[] {
    const values = [
      this.generations.getActive(),
      this.generations.getStaging(),
      ...this.retiredAfterSubmit,
    ].filter((value): value is DensityBrickGenerationResources => value !== null);
    return [...new Set(values)];
  }

  private hasLiveResources(): boolean {
    return this.liveGenerations().length > 0;
  }

  private assertAtlasBudget(): void {
    const live = this.liveGenerations();
    if (live.length > 2) throw new Error(`Density brick rebuild exposed ${live.length} live atlas pairs`);
    const bytes = live.reduce((total, generation) => total + generation.layout.profile.residentBytes, 0);
    if (bytes > 32 * 1024 * 1024) {
      throw new Error(`Density brick rebuild exceeds 32 MiB: ${bytes}`);
    }
    this.rebuildPeakBytes = Math.max(this.rebuildPeakBytes, bytes);
  }

  private destroyGenerationSet(set: {
    readonly active: DensityBrickGenerationResources | null;
    readonly staging: DensityBrickGenerationResources | null;
  }): void {
    if (set.active) this.destroyGeneration(set.active);
    if (set.staging && set.staging !== set.active) this.destroyGeneration(set.staging);
  }

  private destroyRetiredGenerations(): void {
    for (const generation of this.retiredAfterSubmit.splice(0)) this.destroyGeneration(generation);
  }

  private destroyGeneration(generation: DensityBrickGenerationResources): void {
    if (generation.destroyed) return;
    generation.destroyed = true;
    for (const texture of generation.textures) texture.destroy();
    generation.recordBuffer.destroy();
    generation.candidateBuffer.destroy();
    generation.candidateMetaBuffer.destroy();
    generation.dispatchBuffer.destroy();
  }
}
