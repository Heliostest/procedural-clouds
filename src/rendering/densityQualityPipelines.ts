import {
  buildDensityQualityShaderSource,
  buildHierarchicalDensityQualityShaderSource,
  densityShaderSourceLength,
} from './densityShaderSources';
import type { DensityStorageMode } from '../density/bodyLocalBricks';
import type {
  DensityQualityBindingResources,
  DensityQualityBindings,
  DensityQualityKind,
  DensityQualityPipelineBundle,
  DensityQualityPipelineCreationStats,
  DensityQualityPipelineState,
  DensityQualitySelection,
} from './densityQualityContracts';

let nextBundleGeneration = 1;

function emptyCreationStats(): DensityQualityPipelineCreationStats {
  return {
    shaderModuleCreateCpuMs: 0,
    renderPipelineCreateCpuMs: 0,
    groundShadowPipelineCreateCpuMs: 0,
    sourceLength: 0,
  };
}

async function createTimed<T>(factory: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const started = performance.now();
  const value = await factory();
  return { value, elapsedMs: performance.now() - started };
}

export interface CreateDensityQualityPipelineBundleOptions {
  device: GPUDevice;
  kind: DensityQualityKind;
  colorFormat: GPUTextureFormat;
  storageMode?: DensityStorageMode;
}

export async function createDensityQualityPipelineBundle(
  options: CreateDensityQualityPipelineBundleOptions,
): Promise<DensityQualityPipelineBundle> {
  const { device, kind, colorFormat } = options;
  const storageMode = options.storageMode ?? 'global-only';
  if (kind === 'realtime' && storageMode === 'hierarchical') {
    throw new Error('Realtime cannot create a hierarchical cache bundle');
  }
  const source = storageMode === 'hierarchical'
    ? buildHierarchicalDensityQualityShaderSource(kind as 'cached' | 'hybrid')
    : buildDensityQualityShaderSource(kind);
  const moduleStarted = performance.now();
  const module = device.createShaderModule({
    label: `density-quality-${kind}-${storageMode}-module`,
    code: source,
  });
  const shaderModuleCreateCpuMs = performance.now() - moduleStarted;

  const renderPromise = createTimed(() => device.createRenderPipelineAsync({
    label: `density-quality-${kind}-${storageMode}-cloud`,
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: colorFormat }] },
    primitive: { topology: 'triangle-list' },
  }));
  const groundShadowPromise = createTimed(() => device.createComputePipelineAsync({
    label: `density-quality-${kind}-${storageMode}-ground-shadow`,
    layout: 'auto',
    compute: { module, entryPoint: 'csGroundShadow' },
  }));
  let render: Awaited<typeof renderPromise>;
  let groundShadow: Awaited<typeof groundShadowPromise>;
  try {
    [render, groundShadow] = await Promise.all([renderPromise, groundShadowPromise]);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const compilation = await module.getCompilationInfo();
    const messages = compilation.messages
      .filter((message) => message.type === 'error')
      .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`)
      .join(' | ');
    throw new Error(`${kind}-${storageMode}-pipeline-create-failed: ${messages || reason}`);
  }

  return {
    kind,
    storageMode,
    generation: nextBundleGeneration++,
    cloudPipeline: render.value,
    groundShadowPipeline: groundShadow.value,
    usesDensityCache: kind !== 'realtime',
    creation: {
      shaderModuleCreateCpuMs,
      renderPipelineCreateCpuMs: render.elapsedMs,
      groundShadowPipelineCreateCpuMs: groundShadow.elapsedMs,
      sourceLength: storageMode === 'hierarchical' ? source.length : densityShaderSourceLength(kind),
    },
  };
}

export function createDensityQualityBindings(
  device: GPUDevice,
  bundle: DensityQualityPipelineBundle,
  resources: DensityQualityBindingResources,
): DensityQualityBindings {
  const sharedSceneEntries: GPUBindGroupEntry[] = [
    { binding: 1, resource: { buffer: resources.paramsBuffer } },
    { binding: 4, resource: { buffer: resources.presetBuffer } },
  ];
  const weatherEntries: GPUBindGroupEntry[] = [
    { binding: 2, resource: resources.shapeView },
    { binding: 3, resource: resources.weatherSampler },
  ];
  // Every fragment entry can reach the shared weather debug view, even Cached.
  const cloudScene = device.createBindGroup({
    label: `density-quality-${bundle.kind}-cloud-scene`,
    layout: bundle.cloudPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resources.cameraBuffer } },
      ...sharedSceneEntries,
      ...weatherEntries,
    ],
  });
  const groundShadowScene = device.createBindGroup({
    label: `density-quality-${bundle.kind}-ground-shadow-scene`,
    layout: bundle.groundShadowPipeline.getBindGroupLayout(0),
    // Cached shadow integration samples the density cache only. Hybrid detail and
    // the Realtime evaluator still need weather resources in their shadow entry.
    entries: bundle.kind === 'cached'
      ? sharedSceneEntries
      : [...sharedSceneEntries, ...weatherEntries],
  });

  let cloudDensity: GPUBindGroup | null = null;
  let groundShadowDensity: GPUBindGroup | null = null;
  if (bundle.usesDensityCache) {
    const densityEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: resources.densityOutput.sampler },
      { binding: 1, resource: resources.densityOutput.sampledViews[0] },
      { binding: 2, resource: resources.densityOutput.sampledViews[1] },
    ];
    if (bundle.storageMode === 'hierarchical') {
      const hierarchical = resources.densityOutput.hierarchical;
      if (!hierarchical?.valid) throw new Error('Hierarchical bundle requires a valid hierarchical output');
      densityEntries.push(
        { binding: 3, resource: hierarchical.sampler },
        { binding: 4, resource: hierarchical.sampledViews[0] },
        { binding: 5, resource: hierarchical.sampledViews[1] },
        { binding: 6, resource: { buffer: hierarchical.recordBuffer } },
        { binding: 7, resource: { buffer: hierarchical.candidateBuffer } },
      );
    }
    cloudDensity = device.createBindGroup({
      label: `density-quality-${bundle.kind}-cloud-density`,
      layout: bundle.cloudPipeline.getBindGroupLayout(1),
      entries: densityEntries,
    });
    groundShadowDensity = device.createBindGroup({
      label: `density-quality-${bundle.kind}-ground-shadow-density`,
      layout: bundle.groundShadowPipeline.getBindGroupLayout(1),
      entries: densityEntries,
    });
  }

  const groundShadowStore = device.createBindGroup({
    label: `density-quality-${bundle.kind}-ground-shadow-store`,
    layout: bundle.groundShadowPipeline.getBindGroupLayout(2),
    entries: [{ binding: 1, resource: resources.groundShadowStoreView }],
  });
  const cloudGroundShadow = device.createBindGroup({
    label: `density-quality-${bundle.kind}-cloud-ground-shadow`,
    layout: bundle.cloudPipeline.getBindGroupLayout(3),
    entries: [
      { binding: 0, resource: resources.groundShadowSampler },
      { binding: 1, resource: resources.groundShadowView },
    ],
  });

  return {
    cloudScene,
    groundShadowScene,
    cloudDensity,
    groundShadowDensity,
    groundShadowStore,
    cloudGroundShadow,
  };
}

export interface DensityQualityPipelineManagerOptions {
  cached: DensityQualityPipelineBundle;
  hybrid?: DensityQualityPipelineBundle;
  hybridFailureReason?: string;
  createRealtime(): Promise<DensityQualityPipelineBundle>;
  createHierarchical(kind: 'cached' | 'hybrid'): Promise<DensityQualityPipelineBundle>;
}

export class DensityQualityPipelineManager {
  private readonly bundles = new Map<DensityQualityKind, DensityQualityPipelineBundle>();
  private readonly states = new Map<DensityQualityKind, DensityQualityPipelineState>();
  private readonly hierarchicalBundles = new Map<'cached' | 'hybrid', DensityQualityPipelineBundle>();
  private readonly hierarchicalStates = new Map<'cached' | 'hybrid', DensityQualityPipelineState>();
  private readonly createRealtime: () => Promise<DensityQualityPipelineBundle>;
  private readonly createHierarchical: (kind: 'cached' | 'hybrid') => Promise<DensityQualityPipelineBundle>;
  private requested: DensityQualityKind = 'hybrid';
  private active: DensityQualityKind;
  private requestedStorage: DensityStorageMode = 'global-only';
  private activeStorage: DensityStorageMode = 'global-only';
  private activeGeneration = 1;
  private realtimePromise: Promise<void> | null = null;
  private readonly hierarchicalPromises = new Map<'cached' | 'hybrid', Promise<void>>();
  private destroyed = false;

  constructor(options: DensityQualityPipelineManagerOptions) {
    this.createRealtime = options.createRealtime;
    this.createHierarchical = options.createHierarchical;
    this.bundles.set('cached', options.cached);
    this.states.set('cached', this.readyState(options.cached));
    if (options.hybrid) {
      this.bundles.set('hybrid', options.hybrid);
      this.states.set('hybrid', this.readyState(options.hybrid));
      this.active = 'hybrid';
    } else {
      this.states.set('hybrid', {
        kind: 'hybrid',
        storageMode: 'global-only',
        lifecycle: 'failed',
        reason: options.hybridFailureReason || 'hybrid-pipeline-create-failed',
        creation: emptyCreationStats(),
      });
      this.active = 'cached';
    }
    this.states.set('realtime', {
      kind: 'realtime',
      storageMode: 'global-only',
      lifecycle: 'idle',
      reason: 'not-requested',
      creation: emptyCreationStats(),
    });
    for (const kind of ['cached', 'hybrid'] as const) {
      this.hierarchicalStates.set(kind, {
        kind,
        storageMode: 'hierarchical',
        lifecycle: 'idle',
        reason: 'not-requested',
        creation: emptyCreationStats(),
      });
    }
  }

  request(
    kind: DensityQualityKind,
    storageMode: DensityStorageMode = 'global-only',
    hierarchicalOutputValid = false,
  ): DensityQualitySelection {
    if (this.destroyed) return this.selection('pipeline-manager-destroyed');
    this.requested = kind;
    this.requestedStorage = storageMode;
    const state = this.requireState(kind);
    if (state.lifecycle === 'ready') {
      if (kind !== 'realtime' && storageMode === 'hierarchical') {
        const hierarchicalState = this.requireHierarchicalState(kind);
        if (hierarchicalState.lifecycle === 'idle') this.startHierarchicalCreation(kind);
        if (hierarchicalState.lifecycle === 'ready' && hierarchicalOutputValid) {
          this.setActive(kind, 'hierarchical');
        } else {
          this.setActive(kind, 'global-only');
        }
      } else {
        this.setActive(kind, 'global-only');
      }
      return this.selection('');
    }
    if (kind === 'realtime' && state.lifecycle === 'idle') {
      this.startRealtimeCreation();
      return this.selection('realtime-compiling');
    }
    return this.selection(state.reason || `${kind}-${state.lifecycle}`);
  }

  getActiveBundle(): DensityQualityPipelineBundle {
    const bundle = this.activeStorage === 'hierarchical' && this.active !== 'realtime'
      ? this.hierarchicalBundles.get(this.active)
      : this.bundles.get(this.active);
    if (!bundle) throw new Error(`Active density quality bundle is unavailable: ${this.active}`);
    return bundle;
  }

  getSelection(): DensityQualitySelection {
    return this.selection(this.requested === this.active ? '' : this.requireState(this.requested).reason);
  }

  getStates(): Record<DensityQualityKind, DensityQualityPipelineState> {
    return {
      cached: { ...this.requireState('cached'), creation: { ...this.requireState('cached').creation } },
      hybrid: { ...this.requireState('hybrid'), creation: { ...this.requireState('hybrid').creation } },
      realtime: { ...this.requireState('realtime'), creation: { ...this.requireState('realtime').creation } },
    };
  }

  getHierarchicalStates(): Record<'cached' | 'hybrid', DensityQualityPipelineState> {
    return {
      cached: { ...this.requireHierarchicalState('cached'), creation: { ...this.requireHierarchicalState('cached').creation } },
      hybrid: { ...this.requireHierarchicalState('hybrid'), creation: { ...this.requireHierarchicalState('hybrid').creation } },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.realtimePromise = null;
    this.hierarchicalPromises.clear();
    for (const kind of ['cached', 'hybrid', 'realtime'] as const) {
      const previous = this.requireState(kind);
      this.states.set(kind, { ...previous, lifecycle: 'destroyed', reason: 'renderer-destroyed' });
    }
    for (const kind of ['cached', 'hybrid'] as const) {
      const previous = this.requireHierarchicalState(kind);
      this.hierarchicalStates.set(kind, { ...previous, lifecycle: 'destroyed', reason: 'renderer-destroyed' });
    }
    this.bundles.clear();
    this.hierarchicalBundles.clear();
  }

  private startRealtimeCreation(): void {
    if (this.realtimePromise || this.destroyed) return;
    this.states.set('realtime', {
      kind: 'realtime',
      storageMode: 'global-only',
      lifecycle: 'compiling',
      reason: 'realtime-compiling',
      creation: emptyCreationStats(),
    });
    this.realtimePromise = this.createRealtime().then((bundle) => {
      if (this.destroyed) return;
      this.bundles.set('realtime', bundle);
      this.states.set('realtime', this.readyState(bundle));
      if (this.requested === 'realtime') this.setActive('realtime');
    }).catch((error: unknown) => {
      if (this.destroyed) return;
      this.states.set('realtime', {
        kind: 'realtime',
        storageMode: 'global-only',
        lifecycle: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        creation: emptyCreationStats(),
      });
    }).finally(() => {
      this.realtimePromise = null;
    });
  }

  private startHierarchicalCreation(kind: 'cached' | 'hybrid'): void {
    if (this.hierarchicalPromises.has(kind) || this.destroyed) return;
    this.hierarchicalStates.set(kind, {
      kind,
      storageMode: 'hierarchical',
      lifecycle: 'compiling',
      reason: 'hierarchical-compiling',
      creation: emptyCreationStats(),
    });
    const promise = this.createHierarchical(kind).then((bundle) => {
      if (this.destroyed) return;
      this.hierarchicalBundles.set(kind, bundle);
      this.hierarchicalStates.set(kind, this.readyState(bundle));
    }).catch((error: unknown) => {
      if (this.destroyed) return;
      this.hierarchicalStates.set(kind, {
        kind,
        storageMode: 'hierarchical',
        lifecycle: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        creation: emptyCreationStats(),
      });
    }).finally(() => {
      this.hierarchicalPromises.delete(kind);
    });
    this.hierarchicalPromises.set(kind, promise);
  }

  private setActive(kind: DensityQualityKind, storageMode: DensityStorageMode = 'global-only'): void {
    if (kind === 'realtime') storageMode = 'global-only';
    if (kind === this.active && storageMode === this.activeStorage) return;
    const available = storageMode === 'hierarchical' && kind !== 'realtime'
      ? this.hierarchicalBundles.has(kind)
      : this.bundles.has(kind);
    if (!available) throw new Error(`Cannot activate unavailable density quality bundle: ${kind}/${storageMode}`);
    this.active = kind;
    this.activeStorage = storageMode;
    this.activeGeneration++;
  }

  private selection(reason: string): DensityQualitySelection {
    const requestedState = this.requireState(this.requested);
    const hierarchicalState = this.requested !== 'realtime' && this.requestedStorage === 'hierarchical'
      ? this.requireHierarchicalState(this.requested)
      : null;
    const storageReason = this.requestedStorage === this.activeStorage
      ? ''
      : hierarchicalState?.reason || 'hierarchical-output-warming';
    return {
      requested: this.requested,
      active: this.active,
      activeGeneration: this.activeGeneration,
      lifecycle: requestedState.lifecycle,
      reason: this.requested === this.active ? '' : (reason || requestedState.reason),
      requestedStorage: this.requestedStorage,
      activeStorage: this.activeStorage,
      storageLifecycle: hierarchicalState?.lifecycle === 'compiling'
        ? 'creating'
        : hierarchicalState?.lifecycle ?? 'idle',
      storageReason,
    };
  }

  private readyState(bundle: DensityQualityPipelineBundle): DensityQualityPipelineState {
    return {
      kind: bundle.kind,
      storageMode: bundle.storageMode,
      lifecycle: 'ready',
      reason: '',
      creation: { ...bundle.creation },
    };
  }

  private requireState(kind: DensityQualityKind): DensityQualityPipelineState {
    const state = this.states.get(kind);
    if (!state) throw new Error(`Density quality state is unavailable: ${kind}`);
    return state;
  }

  private requireHierarchicalState(kind: 'cached' | 'hybrid'): DensityQualityPipelineState {
    const state = this.hierarchicalStates.get(kind);
    if (!state) throw new Error(`Hierarchical density quality state is unavailable: ${kind}`);
    return state;
  }
}
