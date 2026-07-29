import type {
  DensityCacheProducer,
  DensityEncodeContext,
  DensityEncodeResult,
  DensityFrameInput,
  DensityProducerKind,
  DensityProducerLifecycle,
  DensityProducerSelection,
  DensitySharedFieldDiagnostics,
  DensityProducerStats,
} from './contracts';
import type { DensityStorageMode } from './bodyLocalBricks';
import type { DensityDetailResources } from '../rendering/densityDetailResources';

export interface DensityProducerSelectorOptions {
  legacy: DensityCacheProducer;
  createRecipeV2(): Promise<DensityCacheProducer>;
  createDetailResources(
    diagnostics: DensitySharedFieldDiagnostics | null,
    unavailableReason?: string,
  ): DensityDetailResources;
}

export class DensityProducerSelector {
  private readonly legacy: DensityCacheProducer;
  private readonly createRecipeV2: () => Promise<DensityCacheProducer>;
  private readonly createDetailResources: DensityProducerSelectorOptions['createDetailResources'];
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
  private readonly encodedThisFrame = new Set<DensityCacheProducer>();
  private desiredResolution: number;
  private desiredWorkgroup: [number, number, number];
  private destroyed = false;
  private deviceLost = false;
  private creationEpoch = 0;
  private desiredStorageMode: DensityStorageMode = 'global-only';
  private desiredCacheRequired = false;

  constructor(options: DensityProducerSelectorOptions) {
    this.legacy = options.legacy;
    this.createRecipeV2 = options.createRecipeV2;
    this.createDetailResources = options.createDetailResources;
    this.active = options.legacy;
    const stats = this.legacy.getStats();
    this.desiredResolution = stats.resolution;
    this.desiredWorkgroup = [...stats.workgroup] as [number, number, number];
  }

  request(kind: DensityProducerKind, cacheRequired = true): DensityCacheProducer {
    this.assertAlive();
    this.requested = kind;
    this.desiredCacheRequired = kind === 'recipe-v2' && cacheRequired;
    if (kind === 'recipe-v2' && cacheRequired) this.ensureRecipeV2();
    this.refreshReason(cacheRequired);
    return this.active;
  }

  requestStorageMode(mode: DensityStorageMode, cacheRequired: boolean): void {
    this.assertAlive();
    this.desiredStorageMode = mode;
    this.desiredCacheRequired = cacheRequired;
    this.legacy.requestStorageMode('global-only', cacheRequired);
    this.recipeV2?.requestStorageMode(mode, cacheRequired);
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
      target.requestStorageMode(this.desiredStorageMode, cacheRequired);
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
    const target = this.transitionTarget;
    this.encodedThisFrame.add(target);
    try {
      const result = target.encode(encoder, context);
      if (result.status === 'encoded' && target.getOutput().valid) {
        this.transitionEncoded = true;
        return result;
      }
      this.rejectTransition(target, new Error(result.reason || result.status));
      return result;
    } catch (error: unknown) {
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

  afterSubmit(): void {
    const submittedProducers = new Set<DensityCacheProducer>([this.active, ...this.encodedThisFrame]);
    if (this.transitionTarget) submittedProducers.add(this.transitionTarget);
    this.encodedThisFrame.clear();
    let firstError: unknown = null;
    for (const producer of submittedProducers) {
      try {
        producer.afterSubmit();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
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

  getActiveDetailResources(): DensityDetailResources {
    this.assertAlive();
    return this.createDetailResources(
      this.active.getSharedFieldDiagnostics(),
      this.active.kind === 'legacy' ? 'legacy-producer' : 'shared-fields-unavailable',
    );
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

  recordRecipeV2BrickGpuTiming(brickMs: number | null, error = ''): void {
    this.recipeV2?.recordBrickGpuTiming(brickMs, error);
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
    this.deviceLost = true;
    this.creationEpoch++;
    this.legacy.handleDeviceLost(reason);
    this.recipeV2?.handleDeviceLost(reason);
    this.candidateLifecycle = 'device-lost';
    this.candidateReason = reason.message || String(reason.reason);
    this.transitionTarget = null;
    this.transitionPrepared = false;
    this.transitionEncoded = false;
    this.encodedThisFrame.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.creationEpoch++;
    this.legacy.destroy();
    this.recipeV2?.destroy();
    this.candidateLifecycle = 'destroyed';
    this.transitionTarget = null;
    this.encodedThisFrame.clear();
  }

  private ensureRecipeV2(): void {
    if (this.recipeV2 || this.creationPromise || this.candidateLifecycle === 'failed'
      || this.deviceLost || this.destroyed) return;
    const epoch = ++this.creationEpoch;
    this.candidateLifecycle = 'creating';
    this.candidateReason = 'recipe-v2-creating';
    const promise = this.createRecipeV2().then((producer) => {
      if (this.destroyed || this.deviceLost || epoch !== this.creationEpoch) {
        producer.destroy();
        return;
      }
      try {
        producer.setResolution(this.desiredResolution);
        producer.setWorkgroup(this.desiredWorkgroup);
        const cacheRequired = this.requested === 'recipe-v2' && this.desiredCacheRequired;
        producer.requestStorageMode(cacheRequired ? this.desiredStorageMode : 'global-only', cacheRequired);
        this.recipeV2 = producer;
        this.candidateLifecycle = cacheRequired ? 'warming' : 'idle';
        this.candidateReason = cacheRequired ? 'recipe-v2-warming' : 'recipe-v2-ready-deferred';
        this.fallbackReason = this.requested === 'recipe-v2' ? this.candidateReason : '';
      } catch (error: unknown) {
        try {
          producer.destroy();
        } catch {
          // Preserve the initialization error as the selector failure reason.
        }
        throw error;
      }
    }).catch((error: unknown) => {
      if (this.destroyed || this.deviceLost || epoch !== this.creationEpoch) return;
      this.candidateLifecycle = 'failed';
      this.candidateReason = error instanceof Error ? error.message : String(error);
      this.fallbackReason = this.requested === 'recipe-v2' ? this.candidateReason : '';
    }).finally(() => {
      if (this.creationPromise === promise) this.creationPromise = null;
    });
    this.creationPromise = promise;
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

interface DensitySelectorFixtureProducer {
  producer: DensityCacheProducer;
  readonly storageRequests: Array<readonly [DensityStorageMode, boolean]>;
  destroyed: boolean;
  afterSubmitCount: number;
}

interface DensitySelectorFixtureProducerOptions {
  readonly willEncode?: boolean;
  readonly validOutput?: boolean;
  readonly throwDuringEncode?: boolean;
  readonly throwDuringStorageRequest?: boolean;
}

function densitySelectorFixtureProducer(
  kind: DensityProducerKind,
  options: DensitySelectorFixtureProducerOptions = {},
): DensitySelectorFixtureProducer {
  const state: DensitySelectorFixtureProducer = {
    producer: null as unknown as DensityCacheProducer,
    storageRequests: [],
    destroyed: false,
    afterSubmitCount: 0,
  };
  state.producer = {
    kind,
    prepareFrame: () => ({ willEncode: options.willEncode === true }),
    encode: () => {
      if (options.throwDuringEncode) throw new Error('fixture-encode-failed');
      return {
        status: options.willEncode ? 'encoded' : 'skipped',
        cacheRan: options.willEncode === true,
        contentRevision: 0,
        reason: 'fixture',
      };
    },
    afterSubmit: () => { state.afterSubmitCount++; },
    getOutput: () => ({ valid: options.validOutput === true }),
    requestStorageMode: (mode: DensityStorageMode, cacheRequired: boolean) => {
      state.storageRequests.push([mode, cacheRequired]);
      if (options.throwDuringStorageRequest) throw new Error('fixture-storage-request-failed');
    },
    setResolution: () => {},
    setWorkgroup: () => {},
    invalidate: () => {},
    getStats: () => ({ resolution: 96, workgroup: [8, 8, 4], lifecycle: 'ready' }),
    getSharedFieldDiagnostics: () => null,
    recordSharedFieldGpuTiming: () => {},
    recordBrickGpuTiming: () => {},
    handleDeviceLost: () => {},
    destroy: () => { state.destroyed = true; },
  } as unknown as DensityCacheProducer;
  return state;
}

async function settleDensitySelectorFixture(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const densitySelectorFixtureDetailResources = (): DensityDetailResources => ({
  available: false,
  reason: 'fixture-unavailable',
  layoutVersion: 1,
  generation: 0,
  format: 'rgba8unorm',
  atlasDimension: 64,
  macroDimension: 256,
  sampler: null,
  baseView: null,
  detailView: null,
  macroView: null,
});

export async function verifyDensityProducerSelectorAsyncFixtures(): Promise<void> {
  const legacy = densitySelectorFixtureProducer('legacy');
  const deferredRecipe = densitySelectorFixtureProducer('recipe-v2');
  let resolveRecipe!: (producer: DensityCacheProducer) => void;
  const recipePromise = new Promise<DensityCacheProducer>((resolve) => { resolveRecipe = resolve; });
  const selector = new DensityProducerSelector({
    legacy: legacy.producer,
    createRecipeV2: () => recipePromise,
    createDetailResources: densitySelectorFixtureDetailResources,
  });
  selector.requestStorageMode('hierarchical', true);
  selector.request('recipe-v2', true);
  selector.requestStorageMode('global-only', false);
  selector.request('legacy', false);
  resolveRecipe(deferredRecipe.producer);
  await settleDensitySelectorFixture();
  const deferredRequest = deferredRecipe.storageRequests.at(-1);
  if (!deferredRequest || deferredRequest[0] !== 'global-only' || deferredRequest[1] !== false) {
    throw new Error('Density producer async fixture started bricks after switching to Legacy/Realtime');
  }

  const lostLegacy = densitySelectorFixtureProducer('legacy');
  const lostRecipe = densitySelectorFixtureProducer('recipe-v2');
  let resolveLost!: (producer: DensityCacheProducer) => void;
  const lostPromise = new Promise<DensityCacheProducer>((resolve) => { resolveLost = resolve; });
  const lostSelector = new DensityProducerSelector({
    legacy: lostLegacy.producer,
    createRecipeV2: () => lostPromise,
    createDetailResources: densitySelectorFixtureDetailResources,
  });
  lostSelector.requestStorageMode('hierarchical', true);
  lostSelector.request('recipe-v2', true);
  lostSelector.handleDeviceLost({ reason: 'destroyed', message: 'fixture-device-lost' } as GPUDeviceLostInfo);
  resolveLost(lostRecipe.producer);
  await settleDensitySelectorFixture();
  if (!lostRecipe.destroyed || lostSelector.getRecipeV2Stats() !== null
    || lostSelector.getSelection().candidateLifecycle !== 'device-lost') {
    throw new Error('Density producer async fixture resurrected Recipe V2 after device loss');
  }

  const destroyedLegacy = densitySelectorFixtureProducer('legacy');
  let rejectDestroyed!: (error: Error) => void;
  const destroyedPromise = new Promise<DensityCacheProducer>((_resolve, reject) => { rejectDestroyed = reject; });
  const destroyedSelector = new DensityProducerSelector({
    legacy: destroyedLegacy.producer,
    createRecipeV2: () => destroyedPromise,
    createDetailResources: densitySelectorFixtureDetailResources,
  });
  destroyedSelector.requestStorageMode('hierarchical', true);
  destroyedSelector.request('recipe-v2', true);
  destroyedSelector.destroy();
  rejectDestroyed(new Error('late-fixture-rejection'));
  await settleDensitySelectorFixture();
  if (destroyedSelector.getSelection().candidateLifecycle !== 'destroyed') {
    throw new Error('Density producer async fixture overwrote the destroyed terminal state');
  }

  const rejectedLegacy = densitySelectorFixtureProducer('legacy');
  const rejectedRecipe = densitySelectorFixtureProducer('recipe-v2', {
    willEncode: true,
    throwDuringEncode: true,
  });
  const rejectedSelector = new DensityProducerSelector({
    legacy: rejectedLegacy.producer,
    createRecipeV2: () => Promise.resolve(rejectedRecipe.producer),
    createDetailResources: densitySelectorFixtureDetailResources,
  });
  rejectedSelector.requestStorageMode('hierarchical', true);
  rejectedSelector.request('recipe-v2', true);
  await settleDensitySelectorFixture();
  rejectedSelector.prepareTransition({} as DensityFrameInput, true);
  rejectedSelector.encodeTransition({} as GPUCommandEncoder);
  rejectedSelector.afterSubmit();
  if (rejectedRecipe.afterSubmitCount !== 1) {
    throw new Error('Density producer transition fixture skipped post-submit retirement after rejection');
  }

  const failedInitLegacy = densitySelectorFixtureProducer('legacy');
  const failedInitRecipe = densitySelectorFixtureProducer('recipe-v2', {
    throwDuringStorageRequest: true,
  });
  const failedInitSelector = new DensityProducerSelector({
    legacy: failedInitLegacy.producer,
    createRecipeV2: () => Promise.resolve(failedInitRecipe.producer),
    createDetailResources: densitySelectorFixtureDetailResources,
  });
  failedInitSelector.requestStorageMode('hierarchical', true);
  failedInitSelector.request('recipe-v2', true);
  await settleDensitySelectorFixture();
  if (!failedInitRecipe.destroyed
    || failedInitSelector.getRecipeV2Stats() !== null
    || failedInitSelector.getSelection().candidateLifecycle !== 'failed') {
    throw new Error('Density producer async fixture leaked a partially initialized Recipe V2 producer');
  }
}
