import {
  buildDensityQualityShaderSource,
  densityShaderSourceLength,
} from './densityShaderSources';
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
}

export async function createDensityQualityPipelineBundle(
  options: CreateDensityQualityPipelineBundleOptions,
): Promise<DensityQualityPipelineBundle> {
  const { device, kind, colorFormat } = options;
  const source = buildDensityQualityShaderSource(kind);
  const moduleStarted = performance.now();
  const module = device.createShaderModule({
    label: `density-quality-${kind}-module`,
    code: source,
  });
  const shaderModuleCreateCpuMs = performance.now() - moduleStarted;

  const renderPromise = createTimed(() => device.createRenderPipelineAsync({
    label: `density-quality-${kind}-cloud`,
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: colorFormat }] },
    primitive: { topology: 'triangle-list' },
  }));
  const groundShadowPromise = createTimed(() => device.createComputePipelineAsync({
    label: `density-quality-${kind}-ground-shadow`,
    layout: 'auto',
    compute: { module, entryPoint: 'csGroundShadow' },
  }));
  let render: Awaited<typeof renderPromise>;
  let groundShadow: Awaited<typeof groundShadowPromise>;
  try {
    [render, groundShadow] = await Promise.all([renderPromise, groundShadowPromise]);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${kind}-pipeline-create-failed: ${reason}`);
  }

  return {
    kind,
    generation: nextBundleGeneration++,
    cloudPipeline: render.value,
    groundShadowPipeline: groundShadow.value,
    usesDensityCache: kind !== 'realtime',
    creation: {
      shaderModuleCreateCpuMs,
      renderPipelineCreateCpuMs: render.elapsedMs,
      groundShadowPipelineCreateCpuMs: groundShadow.elapsedMs,
      sourceLength: densityShaderSourceLength(kind),
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
}

export class DensityQualityPipelineManager {
  private readonly bundles = new Map<DensityQualityKind, DensityQualityPipelineBundle>();
  private readonly states = new Map<DensityQualityKind, DensityQualityPipelineState>();
  private readonly createRealtime: () => Promise<DensityQualityPipelineBundle>;
  private requested: DensityQualityKind = 'hybrid';
  private active: DensityQualityKind;
  private activeGeneration = 1;
  private realtimePromise: Promise<void> | null = null;
  private destroyed = false;

  constructor(options: DensityQualityPipelineManagerOptions) {
    this.createRealtime = options.createRealtime;
    this.bundles.set('cached', options.cached);
    this.states.set('cached', this.readyState(options.cached));
    if (options.hybrid) {
      this.bundles.set('hybrid', options.hybrid);
      this.states.set('hybrid', this.readyState(options.hybrid));
      this.active = 'hybrid';
    } else {
      this.states.set('hybrid', {
        kind: 'hybrid',
        lifecycle: 'failed',
        reason: options.hybridFailureReason || 'hybrid-pipeline-create-failed',
        creation: emptyCreationStats(),
      });
      this.active = 'cached';
    }
    this.states.set('realtime', {
      kind: 'realtime',
      lifecycle: 'idle',
      reason: 'not-requested',
      creation: emptyCreationStats(),
    });
  }

  request(kind: DensityQualityKind): DensityQualitySelection {
    if (this.destroyed) return this.selection('pipeline-manager-destroyed');
    this.requested = kind;
    const state = this.requireState(kind);
    if (state.lifecycle === 'ready') {
      this.setActive(kind);
      return this.selection('');
    }
    if (kind === 'realtime' && state.lifecycle === 'idle') {
      this.startRealtimeCreation();
      return this.selection('realtime-compiling');
    }
    return this.selection(state.reason || `${kind}-${state.lifecycle}`);
  }

  getActiveBundle(): DensityQualityPipelineBundle {
    const bundle = this.bundles.get(this.active);
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

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.realtimePromise = null;
    for (const kind of ['cached', 'hybrid', 'realtime'] as const) {
      const previous = this.requireState(kind);
      this.states.set(kind, { ...previous, lifecycle: 'destroyed', reason: 'renderer-destroyed' });
    }
    this.bundles.clear();
  }

  private startRealtimeCreation(): void {
    if (this.realtimePromise || this.destroyed) return;
    this.states.set('realtime', {
      kind: 'realtime',
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
        lifecycle: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        creation: emptyCreationStats(),
      });
    }).finally(() => {
      this.realtimePromise = null;
    });
  }

  private setActive(kind: DensityQualityKind): void {
    if (kind === this.active) return;
    if (!this.bundles.has(kind)) throw new Error(`Cannot activate unavailable density quality bundle: ${kind}`);
    this.active = kind;
    this.activeGeneration++;
  }

  private selection(reason: string): DensityQualitySelection {
    const requestedState = this.requireState(this.requested);
    return {
      requested: this.requested,
      active: this.active,
      activeGeneration: this.activeGeneration,
      lifecycle: requestedState.lifecycle,
      reason: this.requested === this.active ? '' : (reason || requestedState.reason),
    };
  }

  private readyState(bundle: DensityQualityPipelineBundle): DensityQualityPipelineState {
    return {
      kind: bundle.kind,
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
}
