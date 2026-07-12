import type {
  DensityCacheProducer,
  DensityEncodeContext,
  DensityEncodeResult,
  DensityFrameInput,
  DensityProducerKind,
  DensityProducerLifecycle,
  DensityProducerSelection,
  DensityProducerStats,
} from './contracts';

export interface DensityProducerSelectorOptions {
  legacy: DensityCacheProducer;
  createRecipeV2(): Promise<DensityCacheProducer>;
}

export class DensityProducerSelector {
  private readonly legacy: DensityCacheProducer;
  private readonly createRecipeV2: () => Promise<DensityCacheProducer>;
  private recipeV2: DensityCacheProducer | null = null;
  private requested: DensityProducerKind = 'legacy';
  private active: DensityCacheProducer;
  private activeGeneration = 1;
  private candidateLifecycle: DensityProducerLifecycle = 'idle';
  private candidateReason = '';
  private fallbackReason = '';
  private creationPromise: Promise<void> | null = null;
  private transitionTarget: DensityCacheProducer | null = null;
  private transitionPrepared = false;
  private transitionEncoded = false;
  private desiredResolution: number;
  private desiredWorkgroup: [number, number, number];
  private destroyed = false;

  constructor(options: DensityProducerSelectorOptions) {
    this.legacy = options.legacy;
    this.createRecipeV2 = options.createRecipeV2;
    this.active = options.legacy;
    const stats = this.legacy.getStats();
    this.desiredResolution = stats.resolution;
    this.desiredWorkgroup = [...stats.workgroup] as [number, number, number];
  }

  request(kind: DensityProducerKind, cacheRequired = true): DensityCacheProducer {
    this.assertAlive();
    this.requested = kind;
    if (kind === 'recipe-v2' && cacheRequired) this.ensureRecipeV2();
    this.refreshReason(cacheRequired);
    return this.active;
  }

  prepareTransition(input: DensityFrameInput, cacheRequired: boolean): void {
    this.assertAlive();
    this.transitionPrepared = false;
    this.transitionEncoded = false;
    this.transitionTarget = null;
    if (!cacheRequired || this.requested === this.active.kind) return;
    const target = this.requested === 'legacy' ? this.legacy : this.recipeV2;
    if (!target) return;
    try {
      target.setResolution(this.desiredResolution);
      target.setWorkgroup(this.desiredWorkgroup);
      target.invalidate('producer-activation');
      const plan = target.prepareFrame(input);
      if (!plan.willEncode) {
        this.candidateLifecycle = 'warming';
        this.candidateReason = `${target.kind}-activation-refresh-not-scheduled`;
        return;
      }
      this.transitionTarget = target;
      this.transitionPrepared = true;
      this.candidateLifecycle = 'warming';
      this.candidateReason = `${target.kind}-warming`;
    } catch (error: unknown) {
      this.rejectTransition(target, error);
    }
  }

  encodeTransition(encoder: GPUCommandEncoder, context: DensityEncodeContext = {}): DensityEncodeResult | null {
    if (!this.transitionPrepared || !this.transitionTarget) return null;
    try {
      const result = this.transitionTarget.encode(encoder, context);
      if (result.status === 'encoded' && this.transitionTarget.getOutput().valid) {
        this.transitionEncoded = true;
        return result;
      }
      this.rejectTransition(this.transitionTarget, new Error(result.reason || result.status));
      return result;
    } catch (error: unknown) {
      const target = this.transitionTarget;
      const reason = error instanceof Error ? error.message : String(error);
      this.rejectTransition(target, error);
      return {
        status: 'rejected',
        cacheRan: false,
        contentRevision: target.getStats().contentRevision,
        reason,
      };
    }
  }

  commitTransition(): boolean {
    if (!this.transitionEncoded || !this.transitionTarget) return false;
    if (this.requested !== this.transitionTarget.kind) {
      this.transitionTarget = null;
      this.transitionEncoded = false;
      return false;
    }
    this.active = this.transitionTarget;
    this.activeGeneration++;
    this.candidateLifecycle = this.active.getStats().lifecycle;
    this.candidateReason = '';
    this.fallbackReason = '';
    this.transitionTarget = null;
    this.transitionPrepared = false;
    this.transitionEncoded = false;
    return true;
  }

  getActive(): DensityCacheProducer {
    this.assertAlive();
    return this.active;
  }

  getSelection(): DensityProducerSelection {
    return {
      requested: this.requested,
      active: this.active.kind,
      activeGeneration: this.activeGeneration,
      candidateLifecycle: this.candidateLifecycle,
      candidateReason: this.candidateReason,
      fallbackReason: this.fallbackReason,
    };
  }

  getRecipeV2Stats(): DensityProducerStats | null {
    return this.recipeV2?.getStats() ?? null;
  }

  getRecipeV2Diagnostics() {
    return this.recipeV2?.getSharedFieldDiagnostics() ?? null;
  }

  recordRecipeV2SharedFieldGpuTiming(atlasMs: number | null, macroMs: number | null, error = ''): void {
    this.recipeV2?.recordSharedFieldGpuTiming(atlasMs, macroMs, error);
  }

  setResolution(resolution: number): void {
    this.assertAlive();
    this.desiredResolution = Math.max(32, Math.min(256, Math.round(resolution)));
    this.legacy.setResolution(this.desiredResolution);
    this.recipeV2?.setResolution(this.desiredResolution);
  }

  setWorkgroup(size: readonly [number, number, number]): void {
    this.assertAlive();
    this.desiredWorkgroup = size.map((value) => Math.round(value)) as [number, number, number];
    this.legacy.setWorkgroup(this.desiredWorkgroup);
    this.recipeV2?.setWorkgroup(this.desiredWorkgroup);
  }

  handleDeviceLost(reason: GPUDeviceLostInfo): void {
    if (this.destroyed) return;
    this.legacy.handleDeviceLost(reason);
    this.recipeV2?.handleDeviceLost(reason);
    this.candidateLifecycle = 'device-lost';
    this.candidateReason = reason.message || String(reason.reason);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.legacy.destroy();
    this.recipeV2?.destroy();
    this.candidateLifecycle = 'destroyed';
    this.transitionTarget = null;
  }

  private ensureRecipeV2(): void {
    if (this.recipeV2 || this.creationPromise || this.candidateLifecycle === 'failed') return;
    this.candidateLifecycle = 'creating';
    this.candidateReason = 'recipe-v2-creating';
    this.creationPromise = this.createRecipeV2().then((producer) => {
      if (this.destroyed) {
        producer.destroy();
        return;
      }
      producer.setResolution(this.desiredResolution);
      producer.setWorkgroup(this.desiredWorkgroup);
      this.recipeV2 = producer;
      this.candidateLifecycle = 'warming';
      this.candidateReason = 'recipe-v2-warming';
      this.fallbackReason = this.requested === 'recipe-v2' ? this.candidateReason : '';
    }).catch((error: unknown) => {
      this.candidateLifecycle = 'failed';
      this.candidateReason = error instanceof Error ? error.message : String(error);
      this.fallbackReason = this.requested === 'recipe-v2' ? this.candidateReason : '';
    }).finally(() => {
      this.creationPromise = null;
    });
  }

  private rejectTransition(target: DensityCacheProducer, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    if (target.kind === 'recipe-v2') {
      this.candidateLifecycle = 'failed';
      this.candidateReason = reason;
      this.fallbackReason = reason;
    } else {
      this.candidateReason = `legacy-transition-failed: ${reason}`;
      this.fallbackReason = this.candidateReason;
    }
    this.transitionTarget = null;
    this.transitionPrepared = false;
    this.transitionEncoded = false;
  }

  private refreshReason(cacheRequired: boolean): void {
    if (this.requested === this.active.kind) {
      this.fallbackReason = '';
      return;
    }
    if (!cacheRequired) {
      this.fallbackReason = `${this.requested}-deferred-for-realtime`;
      return;
    }
    if (this.requested === 'recipe-v2') {
      this.fallbackReason = this.candidateReason || 'recipe-v2-not-ready';
    } else {
      this.fallbackReason = 'legacy-warming';
    }
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('DensityProducerSelector is destroyed');
  }
}
