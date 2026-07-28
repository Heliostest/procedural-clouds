import type { BodyMod } from './lifecycle';
import { mat4Invert, mat4LookAt, mat4Multiply, mat4Perspective } from './math/mat4';
import type { CloudParams } from './params';
import type { CameraFrame } from './camera';
import type { Renderer, RenderStats, RendererDeviceInfo, RendererStartupTiming } from './renderer';
import {
  benchmarkCase,
  benchmarkCaseFingerprint,
  benchmarkScene,
  caseParams,
  cloneBenchmarkBodies,
  cloneBenchmarkCamera,
  cloneBenchmarkWind,
  createDensityBenchmarkManifest,
  fingerprintValue,
  requiresGroundShadowTiming,
  resolveBenchmarkCamera,
  serializableCloudParams,
  stableStringify,
  type BenchmarkCamera,
  type BenchmarkCaseStatus,
  type DensityBenchmarkCase,
  type DensityBenchmarkManifest,
} from './densityBenchmarkManifest';

const IDENTITY_MOD: BodyMod = { coverageMul: 1, densityScale: 1, morph: 0 };

export interface BenchmarkPassStatistics {
  count: number;
  median: number;
  p90: number;
  p95: number;
  min: number;
  max: number;
}

export interface BenchmarkGpuTiming {
  availability: 'available' | 'unavailable';
  reason?: string;
  unit: 'gpu-ms';
  cloud?: BenchmarkPassStatistics;
  cache?: BenchmarkPassStatistics;
  brick?: BenchmarkPassStatistics;
  combinedCache?: BenchmarkPassStatistics;
  shadow?: BenchmarkPassStatistics;
  post?: BenchmarkPassStatistics;
}

export interface DensityBenchmarkCaseResult {
  caseId: string;
  status: BenchmarkCaseStatus;
  baselineId: string;
  manifestVersion: number;
  sourceRevision: string;
  capturedAt: string;
  configFingerprint: string;
  qualityMode: DensityBenchmarkCase['quality'];
  viewMode: DensityBenchmarkCase['view'];
  activeBodyCount: number;
  warmupFrames: number;
  cacheWarmups: number;
  renderedFrames: number;
  gpuTiming: BenchmarkGpuTiming;
  producerDiagnostics: {
    requested: string;
    active: string;
    pipelineCreateCpuMs: number;
    shaderModuleCreateCpuMs: number;
    sourceLength: number;
    recordBytes: number;
    outputBytes: number;
    evaluator: RenderStats['densityProducerEvaluator'];
    sharedFields: RenderStats['densityProducerSharedFields'];
    storageRequested: RenderStats['densityStorageRequested'];
    storageActive: RenderStats['densityStorageActive'];
    storageLifecycle: string;
    storageReason: string;
    bricks: RenderStats['densityProducerBricks'];
  };
  startupTiming: RendererStartupTiming;
  deviceInfo: RendererDeviceInfo;
  screenshotPath: string;
  screenshotCaptured: boolean;
  realtimeCompatibility: 'not-applicable' | 'pass' | 'failed';
  warnings: string[];
  stale: boolean;
}

export interface DensityBenchmarkEvidence {
  schemaVersion: number;
  baselineId: string;
  sourceRevision: string;
  generatedAt: string;
  manifestFingerprint: string;
  activeChanges: DensityBenchmarkManifest['activeChanges'];
  deviceInfo: RendererDeviceInfo;
  startupTiming: RendererStartupTiming;
  expectedCases: string[];
  completedCases: string[];
  missingCases: string[];
  staleCases: string[];
  referenceTimingComplete: boolean;
  w0Gate: 'complete' | 'incomplete';
  results: DensityBenchmarkCaseResult[];
}

export interface DensityBenchmarkStatus {
  state: 'idle' | 'warming' | 'sampling' | 'ready-for-screenshot' | 'complete' | 'invalid';
  caseId: string | null;
  warmupFrames: number;
  requiredWarmupFrames: number;
  cloudSamples: number;
  cacheSamples: number;
  requiredGpuSamples: number;
  message: string;
}

export type W10RuntimeOverrides = Partial<Pick<CloudParams,
  | 'cloudFrameEnabled'
  | 'worldStepEnabled'
  | 'worldStepMaxIterations'
  | 'worldStepMinMeters'
  | 'worldStepMaxMeters'
  | 'worldStepMaxRayDistanceMeters'
  | 'worldStepPerspectiveScale'
  | 'worldStepSupportSkipping'
  | 'worldStepCandidateSkipping'
  | 'stochasticSampling'
  | 'stbnFrozenSlice'
  | 'taaEnabled'
  | 'temporalQuality'
  | 'debugView'>>;

export interface DensityBenchmarkController {
  readonly manifest: DensityBenchmarkManifest;
  isActive(): boolean;
  getFrameOverride(): { camera: CameraFrame; sceneClock: number } | null;
  getCamera(): BenchmarkCamera;
  setCamera(next: Partial<BenchmarkCamera>): BenchmarkCamera;
  followInteractiveCamera(next: Partial<BenchmarkCamera>): BenchmarkCamera;
  resetCamera(sceneId?: DensityBenchmarkCase['sceneId']): BenchmarkCamera;
  setW10Options(next: W10RuntimeOverrides): void;
  start(caseId: string): void;
  cancel(reason?: string): void;
  observe(stats: RenderStats): void;
  markScreenshot(caseId?: string): void;
  getStatus(): DensityBenchmarkStatus;
  getRuntimeDiagnostics(): {
    producer: DensityBenchmarkCaseResult['producerDiagnostics'];
    shadowHistoryResetReason: string;
    cloudFrame: Pick<RenderStats,
      | 'cloudFrameRequested'
      | 'cloudFrameActivePath'
      | 'cloudFrameFallbackReason'
      | 'cloudFrameAttachmentBytes'
      | 'cloudFrameHistoryBytes'
      | 'cloudFrameResourceGeneration'
      | 'cloudFrameContentRevision'
      | 'cloudFrameDiscontinuityGeneration'
      | 'cloudCurrentMs'
      | 'temporalResolveMs'
      | 'compositeMs'
      | 'gpuValidationErrors'>;
    raymarch: Pick<RenderStats,
      | 'worldStepRequested'
      | 'worldStepActive'
      | 'worldStepMinMeters'
      | 'worldStepMaxMeters'
      | 'worldStepMaxRayDistanceMeters'
      | 'worldStepMaxIterations'
      | 'worldStepSupportCount'
      | 'worldStepSupportSkipping'
      | 'worldStepCandidateSkipping'
      | 'stochasticSamplingRequested'
      | 'stochasticSamplingActive'
      | 'stochasticSamplingFallbackReason'
      | 'stbnFrozenSlice'
      | 'stbnBytes'
      | 'raymarchConfigGeneration'
      | 'raymarchCurrentFrameIndex'
      | 'raymarchCounterSampleId'
      | 'raymarchCounterConfigGeneration'
      | 'raymarchCounterFrameIndex'
      | 'raymarchCounterSamplePixels'
      | 'raymarchPrimaryIterationsPerPixel'
      | 'raymarchSupportSkipsPerPixel'
      | 'raymarchCandidateSkipsPerPixel'
      | 'raymarchDensitySamplesPerPixel'
      | 'raymarchLightSamplesPerPixel'
      | 'raymarchAverageStepMeters'
      | 'raymarchMaxStepMeters'
      | 'raymarchRefinementsPerPixel'
      | 'raymarchCoarseHintsPerPixel'>;
    temporal: Pick<RenderStats,
      | 'requestedTemporalMode'
      | 'activeTemporalMode'
      | 'temporalFallbackReason'
      | 'temporalBayerPhase'
      | 'taauCurrentWidth'
      | 'taauCurrentHeight'
      | 'taauBackgroundMs'
      | 'taauCurrentMs'
      | 'taauResolveMs'
      | 'temporalResolveMs'
      | 'compositeMs'
      | 'cloudCurrentMs'
      | 'taauHistoryRejectionRatio'
      | 'taauHistoryRejectionSampledEstimate'
      | 'taauRejectNoVelocityRatio'
      | 'taauRejectViewportRatio'
      | 'taauRejectDepthRatio'
      | 'taauRejectOpacityRatio'
      | 'taauCurrentPhaseSampleCount'
      | 'taauNonCurrentPhaseSampleCount'
      | 'taauCloudCoveredSampleCount'
      | 'taauCloudCoveredRejectionRatio'
      | 'taauCloudOpacityThreshold'
      | 'cloudFrameLowResAttachmentBytes'
      | 'taauHistoryDepthBytes'
      | 'cloudFrameHistoryBytes'
      | 'taauDepthRejectRel'
      | 'taauOpacityOutsideReactLo'
      | 'taauOpacityOutsideRejectHi'
      | 'taauResolveCounterSampleId'> & {
      timedPassSumMs: number;
      timedPassSumCovers: string;
    };
  };
  getResults(): DensityBenchmarkCaseResult[];
  getEvidence(): DensityBenchmarkEvidence;
  exportJson(): string;
  downloadJson(): void;
}

interface RunningCase {
  definition: DensityBenchmarkCase;
  camera: BenchmarkCamera;
  expectedRuntimeSignature: string;
  frameOverride: { camera: CameraFrame; sceneClock: number };
  warmupFrames: number;
  cacheWarmups: number;
  renderedFrames: number;
  lastGpuSampleId: number;
  lastCacheSampleId: number;
  lastBrickSampleId: number;
  lastShadowSampleId: number;
  samples: {
    cloud: number[];
    cache: number[];
    brick: number[];
    combinedCache: number[];
    shadow: number[];
    post: number[];
  };
  warnings: string[];
}

export interface DensityBenchmarkOptions {
  canvas: HTMLCanvasElement;
  params: CloudParams;
  renderer: Renderer;
  sourceRevision?: string;
  onStatusChange?: (status: DensityBenchmarkStatus) => void;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function passStatistics(values: readonly number[]): BenchmarkPassStatistics | undefined {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (finite.length === 0) return undefined;
  return {
    count: finite.length,
    median: percentile(finite, 0.5),
    p90: percentile(finite, 0.9),
    p95: percentile(finite, 0.95),
    min: finite[0],
    max: finite[finite.length - 1],
  };
}

function producerDiagnostics(stats: RenderStats): DensityBenchmarkCaseResult['producerDiagnostics'] {
  return {
    requested: stats.densityProducerRequested,
    active: stats.densityProducerActive,
    pipelineCreateCpuMs: stats.densityProducerPipelineCreateCpuMs,
    shaderModuleCreateCpuMs: stats.densityProducerShaderModuleCreateCpuMs,
    sourceLength: stats.densityProducerSourceLength,
    recordBytes: stats.densityProducerRecordBytes,
    outputBytes: stats.densityProducerOutputBytes,
    evaluator: stats.densityProducerEvaluator
      ? JSON.parse(JSON.stringify(stats.densityProducerEvaluator)) as RenderStats['densityProducerEvaluator']
      : null,
    sharedFields: stats.densityProducerSharedFields
      ? JSON.parse(JSON.stringify(stats.densityProducerSharedFields)) as RenderStats['densityProducerSharedFields']
      : null,
    storageRequested: stats.densityStorageRequested,
    storageActive: stats.densityStorageActive,
    storageLifecycle: stats.densityStorageLifecycle,
    storageReason: stats.densityStorageFallbackReason,
    bricks: stats.densityProducerBricks
      ? JSON.parse(JSON.stringify(stats.densityProducerBricks)) as RenderStats['densityProducerBricks']
      : null,
  };
}

function cameraFrame(manifest: DensityBenchmarkManifest, camera: BenchmarkCamera): CameraFrame {
  const aspect = manifest.viewport.width / manifest.viewport.height;
  const projection = mat4Perspective(camera.fovYRadians, aspect, camera.near, camera.far);
  const view = mat4LookAt(camera.eye, camera.target, camera.up);
  const viewProj = mat4Multiply(projection, view);
  return {
    eye: [...camera.eye],
    viewProj,
    invViewProj: mat4Invert(viewProj),
  };
}

function mergeCamera(base: BenchmarkCamera, next: Partial<BenchmarkCamera>): BenchmarkCamera {
  return {
    eye: next.eye ? [...next.eye] : [...base.eye],
    target: next.target ? [...next.target] : [...base.target],
    up: next.up ? [...next.up] : [...base.up],
    fovYRadians: next.fovYRadians ?? base.fovYRadians,
    near: next.near ?? base.near,
    far: next.far ?? base.far,
  };
}

function applyParams(target: CloudParams, values: ReturnType<typeof caseParams>): void {
  const writable = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) writable[key] = value;
}

function runtimeSignature(
  canvas: HTMLCanvasElement,
  params: CloudParams,
  manifest: DensityBenchmarkManifest,
  candidate: DensityBenchmarkCase,
): string {
  return fingerprintValue({
    viewport: { width: canvas.width, height: canvas.height },
    params: serializableCloudParams(params),
    scene: benchmarkScene(manifest, candidate.sceneId),
    case: candidate,
  });
}

function expectedRuntimeSignature(
  manifest: DensityBenchmarkManifest,
  candidate: DensityBenchmarkCase,
): string {
  return fingerprintValue({
    viewport: manifest.viewport,
    params: caseParams(manifest, candidate),
    scene: benchmarkScene(manifest, candidate.sceneId),
    case: candidate,
  });
}

function copyResult(result: DensityBenchmarkCaseResult): DensityBenchmarkCaseResult {
  return JSON.parse(JSON.stringify(result)) as DensityBenchmarkCaseResult;
}

export function createDensityBenchmarkController(options: DensityBenchmarkOptions): DensityBenchmarkController {
  const { canvas, params, renderer } = options;
  const manifest = createDensityBenchmarkManifest(options.sourceRevision);
  const results = new Map<string, DensityBenchmarkCaseResult>();
  let running: RunningCase | null = null;
  let displayedFrameOverride: { camera: CameraFrame; sceneClock: number } | null = null;
  let activeCamera = cloneBenchmarkCamera(manifest.camera);
  let cameraPinned = false;
  let status: DensityBenchmarkStatus = {
    state: 'idle',
    caseId: null,
    warmupFrames: 0,
    requiredWarmupFrames: manifest.warmupFrames,
    cloudSamples: 0,
    cacheSamples: 0,
    requiredGpuSamples: manifest.minimumGpuSamples,
    message: 'Benchmark controller is disabled.',
  };

  function applyFrameCamera(camera: BenchmarkCamera, sceneClock?: number): void {
    activeCamera = cloneBenchmarkCamera(camera);
    if (!displayedFrameOverride) return;
    displayedFrameOverride = {
      camera: cameraFrame(manifest, activeCamera),
      sceneClock: sceneClock ?? displayedFrameOverride.sceneClock,
    };
    if (running) {
      running.camera = cloneBenchmarkCamera(activeCamera);
      running.frameOverride = displayedFrameOverride;
    }
  }

  function publish(next: DensityBenchmarkStatus): void {
    status = next;
    options.onStatusChange?.({ ...status });
  }

  function statusFor(active: RunningCase, message: string): DensityBenchmarkStatus {
    const warming = active.warmupFrames < manifest.warmupFrames;
    return {
      state: warming ? 'warming' : 'sampling',
      caseId: active.definition.id,
      warmupFrames: active.warmupFrames,
      requiredWarmupFrames: manifest.warmupFrames,
      cloudSamples: active.samples.cloud.length,
      cacheSamples: active.samples.cache.length,
      requiredGpuSamples: manifest.minimumGpuSamples,
      message,
    };
  }

  function complete(active: RunningCase, stats: RenderStats): void {
    const gpuTiming: BenchmarkGpuTiming = stats.gpuTiming
      ? {
          availability: 'available',
          unit: 'gpu-ms',
          cloud: passStatistics(active.samples.cloud),
          cache: passStatistics(active.samples.cache),
          brick: passStatistics(active.samples.brick),
          combinedCache: passStatistics(active.samples.combinedCache),
          shadow: passStatistics(active.samples.shadow),
          post: passStatistics(active.samples.post),
        }
      : {
          availability: 'unavailable',
          reason: stats.gpuTimingError || 'timestamp-query is not supported by this adapter',
          unit: 'gpu-ms',
        };
    const existing = results.get(active.definition.id);
    results.set(active.definition.id, {
      caseId: active.definition.id,
      status: 'complete',
      baselineId: manifest.baselineId,
      manifestVersion: manifest.schemaVersion,
      sourceRevision: manifest.sourceRevision,
      capturedAt: new Date().toISOString(),
      configFingerprint: benchmarkCaseFingerprint(manifest, active.definition, active.camera),
      qualityMode: active.definition.quality,
      viewMode: active.definition.view,
      activeBodyCount: stats.activeBodyCount,
      warmupFrames: active.warmupFrames,
      cacheWarmups: active.cacheWarmups,
      renderedFrames: active.renderedFrames,
      gpuTiming,
      producerDiagnostics: producerDiagnostics(stats),
      startupTiming: { ...stats.startupTiming },
      deviceInfo: JSON.parse(JSON.stringify(stats.deviceInfo)) as RendererDeviceInfo,
      screenshotPath: active.definition.screenshotPath,
      screenshotCaptured: existing?.screenshotCaptured ?? false,
      realtimeCompatibility: active.definition.realtimeCompatibilityOnly ? 'pass' : 'not-applicable',
      warnings: active.warnings.slice(),
      stale: false,
    });
    running = null;
    publish({
      state: active.definition.screenshotRequired ? 'ready-for-screenshot' : 'complete',
      caseId: active.definition.id,
      warmupFrames: active.warmupFrames,
      requiredWarmupFrames: manifest.warmupFrames,
      cloudSamples: active.samples.cloud.length,
      cacheSamples: active.samples.cache.length,
      requiredGpuSamples: manifest.minimumGpuSamples,
      message: active.definition.screenshotRequired
        ? `Case complete. Capture ${active.definition.screenshotPath}.`
        : 'Case complete.',
    });
  }

  function invalidate(reason: string): void {
    const active = running;
    if (!active) return;
    const stats = renderer.getStats();
    results.set(active.definition.id, {
      caseId: active.definition.id,
      status: 'invalid',
      baselineId: manifest.baselineId,
      manifestVersion: manifest.schemaVersion,
      sourceRevision: manifest.sourceRevision,
      capturedAt: new Date().toISOString(),
      configFingerprint: benchmarkCaseFingerprint(manifest, active.definition, active.camera),
      qualityMode: active.definition.quality,
      viewMode: active.definition.view,
      activeBodyCount: stats.activeBodyCount,
      warmupFrames: active.warmupFrames,
      cacheWarmups: active.cacheWarmups,
      renderedFrames: active.renderedFrames,
      gpuTiming: { availability: 'unavailable', reason, unit: 'gpu-ms' },
      producerDiagnostics: producerDiagnostics(stats),
      startupTiming: { ...stats.startupTiming },
      deviceInfo: JSON.parse(JSON.stringify(stats.deviceInfo)) as RendererDeviceInfo,
      screenshotPath: active.definition.screenshotPath,
      screenshotCaptured: false,
      realtimeCompatibility: active.definition.realtimeCompatibilityOnly ? 'failed' : 'not-applicable',
      warnings: [...active.warnings, reason],
      stale: false,
    });
    running = null;
    publish({
      state: 'invalid',
      caseId: active.definition.id,
      warmupFrames: active.warmupFrames,
      requiredWarmupFrames: manifest.warmupFrames,
      cloudSamples: active.samples.cloud.length,
      cacheSamples: active.samples.cache.length,
      requiredGpuSamples: manifest.minimumGpuSamples,
      message: reason,
    });
  }

  function getCamera(): BenchmarkCamera {
    return cloneBenchmarkCamera(activeCamera);
  }

  function setCamera(next: Partial<BenchmarkCamera>): BenchmarkCamera {
    cameraPinned = true;
    applyFrameCamera(mergeCamera(activeCamera, next));
    return getCamera();
  }

  function followInteractiveCamera(next: Partial<BenchmarkCamera>): BenchmarkCamera {
    applyFrameCamera(mergeCamera(activeCamera, next));
    return getCamera();
  }

  function resetCamera(sceneId?: DensityBenchmarkCase['sceneId']): BenchmarkCamera {
    cameraPinned = false;
    const resolved = sceneId
      ? resolveBenchmarkCamera(manifest, sceneId)
      : running
        ? resolveBenchmarkCamera(manifest, running.definition.sceneId)
        : cloneBenchmarkCamera(manifest.camera);
    applyFrameCamera(resolved);
    return getCamera();
  }

  function start(caseId: string): void {
    const definition = benchmarkCase(manifest, caseId);
    const scene = benchmarkScene(manifest, definition.sceneId);
    const nextParams = caseParams(manifest, definition);
    applyParams(params, nextParams);
    renderer.setFixedCanvasSize(manifest.viewport);
    renderer.setDensityResolution(nextParams.cacheResolution);
    renderer.setWeatherSize(nextParams.weatherSize);
    renderer.setCacheWorkgroup(
      nextParams.cacheWorkgroupX,
      nextParams.cacheWorkgroupY,
      nextParams.cacheWorkgroupZ,
    );
    const bodies = cloneBenchmarkBodies(scene);
    renderer.setBodies(bodies);
    renderer.setBodyMods(bodies.map(() => ({ ...IDENTITY_MOD })));
    renderer.setWindSamples(cloneBenchmarkWind(scene));
    if (!cameraPinned) activeCamera = resolveBenchmarkCamera(manifest, definition.sceneId);
    const caseCamera = cloneBenchmarkCamera(activeCamera);
    const stats = renderer.getStats();
    running = {
      definition,
      camera: caseCamera,
      expectedRuntimeSignature: expectedRuntimeSignature(manifest, definition),
      frameOverride: {
        camera: cameraFrame(manifest, caseCamera),
        sceneClock: scene.sceneTimeSeconds,
      },
      warmupFrames: 0,
      cacheWarmups: 0,
      renderedFrames: 0,
      lastGpuSampleId: stats.gpuSampleId,
      lastCacheSampleId: stats.cacheSampleId,
      lastBrickSampleId: stats.brickSampleId,
      lastShadowSampleId: stats.shadowSampleId,
      samples: { cloud: [], cache: [], brick: [], combinedCache: [], shadow: [], post: [] },
      warnings: cameraPinned ? ['camera override pinned via setCamera'] : [],
    };
    displayedFrameOverride = running.frameOverride;
    publish(statusFor(running, `Warming ${definition.id}.`));
  }

  function cancel(reason = 'Benchmark cancelled.'): void {
    if (running) invalidate(reason);
    displayedFrameOverride = null;
    renderer.setFixedCanvasSize(null);
  }

  function observe(stats: RenderStats): void {
    const active = running;
    if (!active) return;
    active.renderedFrames++;
    const actualSignature = runtimeSignature(canvas, params, manifest, active.definition);
    if (actualSignature !== active.expectedRuntimeSignature) {
      invalidate('Manifest-controlled state changed during sampling.');
      return;
    }
    if (stats.width !== manifest.viewport.width || stats.height !== manifest.viewport.height) {
      invalidate(`Render target drifted to ${stats.width}x${stats.height}.`);
      return;
    }
    const expectedProducer = active.definition.producer ?? 'legacy';
    if (expectedProducer === 'recipe-v2'
      && (stats.densityProducerCandidateLifecycle === 'failed' || stats.densityProducerLifecycle === 'failed')) {
      invalidate(`Density producer recipe-v2 failed: ${stats.densityProducerFallbackReason || stats.densityProducerFailureReason || 'unknown'}`);
      return;
    }
    if (stats.densityProducerRequested !== expectedProducer || stats.densityProducerActive !== expectedProducer) {
      active.lastGpuSampleId = stats.gpuSampleId;
      active.lastCacheSampleId = stats.cacheSampleId;
      active.lastBrickSampleId = stats.brickSampleId;
      active.lastShadowSampleId = stats.shadowSampleId;
      publish(statusFor(active, `Waiting for density producer ${expectedProducer}; active=${stats.densityProducerActive}.`));
      return;
    }
    const expectedStorage = active.definition.storage ?? 'global-only';
    if (expectedStorage === 'hierarchical' && stats.densityStorageLifecycle === 'failed') {
      invalidate(`Density storage hierarchical failed: ${stats.densityStorageFallbackReason || stats.densityProducerBricks?.reason || 'unknown'}`);
      return;
    }
    if (stats.densityStorageRequested !== expectedStorage || stats.densityStorageActive !== expectedStorage) {
      active.lastGpuSampleId = stats.gpuSampleId;
      active.lastCacheSampleId = stats.cacheSampleId;
      active.lastBrickSampleId = stats.brickSampleId;
      active.lastShadowSampleId = stats.shadowSampleId;
      publish(statusFor(active, `Waiting for density storage ${expectedStorage}; active=${stats.densityStorageActive}.`));
      return;
    }
    const warmupFramesDone = active.warmupFrames >= manifest.warmupFrames;
    const cacheWarmupsDone = active.cacheWarmups >= manifest.minimumCacheWarmups
      || !stats.gpuTiming;
    if (!warmupFramesDone || !cacheWarmupsDone) {
      active.warmupFrames++;
      active.lastGpuSampleId = stats.gpuSampleId;
      if (stats.cacheSampleId !== active.lastCacheSampleId) {
        active.cacheWarmups++;
        active.lastCacheSampleId = stats.cacheSampleId;
      }
      active.lastShadowSampleId = stats.shadowSampleId;
      active.lastBrickSampleId = stats.brickSampleId;
      publish(statusFor(active, `Warming ${active.definition.id}.`));
      return;
    }

    if (!active.definition.timingRequired) {
      complete(active, stats);
      return;
    }
    if (!stats.gpuTiming) {
      active.warnings.push(`${stats.gpuTimingError || 'timestamp-query unavailable'}; visual evidence only`);
      complete(active, stats);
      return;
    }
    if (stats.gpuSampleId !== active.lastGpuSampleId) {
      active.lastGpuSampleId = stats.gpuSampleId;
      active.samples.cloud.push(stats.cloudMs);
      active.samples.post.push(stats.postMs);
    }
    if (stats.cacheSampleId !== active.lastCacheSampleId) {
      active.lastCacheSampleId = stats.cacheSampleId;
      active.samples.cache.push(stats.cacheMs);
      if (expectedStorage === 'hierarchical' && stats.brickSampleId !== active.lastBrickSampleId) {
        active.lastBrickSampleId = stats.brickSampleId;
        active.samples.brick.push(stats.brickMs);
        active.samples.combinedCache.push(stats.cacheMs + stats.brickMs);
      } else if (expectedStorage === 'global-only') {
        active.samples.combinedCache.push(stats.cacheMs);
      }
    }
    if (stats.shadowSampleId !== active.lastShadowSampleId) {
      active.lastShadowSampleId = stats.shadowSampleId;
      active.samples.shadow.push(stats.shadowMs);
    }
    const enough = active.samples.cloud.length >= manifest.minimumGpuSamples
      && active.samples.cache.length >= manifest.minimumGpuSamples
      && (expectedStorage !== 'hierarchical' || active.samples.brick.length >= manifest.minimumGpuSamples)
      && (!requiresGroundShadowTiming(active.definition)
        || active.samples.shadow.length >= manifest.minimumGpuSamples)
      && active.samples.post.length >= manifest.minimumGpuSamples;
    if (enough) {
      complete(active, stats);
      return;
    }
    publish(statusFor(active, `Sampling ${active.definition.id}.`));
  }

  function markScreenshot(caseId = status.caseId ?? ''): void {
    const result = results.get(caseId);
    const definition = manifest.cases.find((candidate) => candidate.id === caseId);
    if (!result || !definition) throw new Error(`Cannot mark screenshot for unfinished case '${caseId}'`);
    if (!definition.screenshotRequired) throw new Error(`Case '${caseId}' does not require a screenshot`);
    result.screenshotCaptured = true;
    if (status.caseId === caseId) {
      publish({ ...status, state: 'complete', message: `Screenshot recorded for ${caseId}.` });
    }
  }

  function getResults(): DensityBenchmarkCaseResult[] {
    return manifest.cases
      .map((candidate) => results.get(candidate.id))
      .filter((result): result is DensityBenchmarkCaseResult => result !== undefined)
      .map(copyResult);
  }

  function setW10Options(next: W10RuntimeOverrides): void {
    Object.assign(params, next);
  }

  function getRuntimeDiagnostics(): {
    producer: DensityBenchmarkCaseResult['producerDiagnostics'];
    shadowHistoryResetReason: string;
    cloudFrame: DensityBenchmarkController['getRuntimeDiagnostics'] extends () => infer T
      ? T extends { cloudFrame: infer C } ? C : never
      : never;
    raymarch: DensityBenchmarkController['getRuntimeDiagnostics'] extends () => infer T
      ? T extends { raymarch: infer R } ? R : never
      : never;
    temporal: DensityBenchmarkController['getRuntimeDiagnostics'] extends () => infer T
      ? T extends { temporal: infer U } ? U : never
      : never;
  } {
    const stats = renderer.getStats();
    const timedPassSumMs = (stats.cacheRan ? stats.cacheMs : 0)
      + (stats.shadowRan ? stats.shadowMs : 0)
      + stats.cloudMs
      + stats.temporalResolveMs
      + stats.compositeMs
      + stats.postMs;
    return {
      producer: producerDiagnostics(stats),
      shadowHistoryResetReason: stats.shadowHistoryResetReason,
      cloudFrame: {
        cloudFrameRequested: stats.cloudFrameRequested,
        cloudFrameActivePath: stats.cloudFrameActivePath,
        cloudFrameFallbackReason: stats.cloudFrameFallbackReason,
        cloudFrameAttachmentBytes: stats.cloudFrameAttachmentBytes,
        cloudFrameHistoryBytes: stats.cloudFrameHistoryBytes,
        cloudFrameResourceGeneration: stats.cloudFrameResourceGeneration,
        cloudFrameContentRevision: stats.cloudFrameContentRevision,
        cloudFrameDiscontinuityGeneration: stats.cloudFrameDiscontinuityGeneration,
        cloudCurrentMs: stats.cloudCurrentMs,
        temporalResolveMs: stats.temporalResolveMs,
        compositeMs: stats.compositeMs,
        gpuValidationErrors: [...stats.gpuValidationErrors],
      },
      raymarch: {
        worldStepRequested: stats.worldStepRequested,
        worldStepActive: stats.worldStepActive,
        worldStepMinMeters: stats.worldStepMinMeters,
        worldStepMaxMeters: stats.worldStepMaxMeters,
        worldStepMaxRayDistanceMeters: stats.worldStepMaxRayDistanceMeters,
        worldStepMaxIterations: stats.worldStepMaxIterations,
        worldStepSupportCount: stats.worldStepSupportCount,
        worldStepSupportSkipping: stats.worldStepSupportSkipping,
        worldStepCandidateSkipping: stats.worldStepCandidateSkipping,
        stochasticSamplingRequested: stats.stochasticSamplingRequested,
        stochasticSamplingActive: stats.stochasticSamplingActive,
        stochasticSamplingFallbackReason: stats.stochasticSamplingFallbackReason,
        stbnFrozenSlice: stats.stbnFrozenSlice,
        stbnBytes: stats.stbnBytes,
        raymarchConfigGeneration: stats.raymarchConfigGeneration,
        raymarchCurrentFrameIndex: stats.raymarchCurrentFrameIndex,
        raymarchCounterSampleId: stats.raymarchCounterSampleId,
        raymarchCounterConfigGeneration: stats.raymarchCounterConfigGeneration,
        raymarchCounterFrameIndex: stats.raymarchCounterFrameIndex,
        raymarchCounterSamplePixels: stats.raymarchCounterSamplePixels,
        raymarchPrimaryIterationsPerPixel: stats.raymarchPrimaryIterationsPerPixel,
        raymarchSupportSkipsPerPixel: stats.raymarchSupportSkipsPerPixel,
        raymarchCandidateSkipsPerPixel: stats.raymarchCandidateSkipsPerPixel,
        raymarchDensitySamplesPerPixel: stats.raymarchDensitySamplesPerPixel,
        raymarchLightSamplesPerPixel: stats.raymarchLightSamplesPerPixel,
        raymarchAverageStepMeters: stats.raymarchAverageStepMeters,
        raymarchMaxStepMeters: stats.raymarchMaxStepMeters,
        raymarchRefinementsPerPixel: stats.raymarchRefinementsPerPixel,
        raymarchCoarseHintsPerPixel: stats.raymarchCoarseHintsPerPixel,
      },
      temporal: {
        requestedTemporalMode: stats.requestedTemporalMode,
        activeTemporalMode: stats.activeTemporalMode,
        temporalFallbackReason: stats.temporalFallbackReason,
        temporalBayerPhase: stats.temporalBayerPhase,
        taauCurrentWidth: stats.taauCurrentWidth,
        taauCurrentHeight: stats.taauCurrentHeight,
        taauBackgroundMs: stats.taauBackgroundMs,
        taauCurrentMs: stats.taauCurrentMs,
        taauResolveMs: stats.taauResolveMs,
        temporalResolveMs: stats.temporalResolveMs,
        compositeMs: stats.compositeMs,
        cloudCurrentMs: stats.cloudCurrentMs,
        taauHistoryRejectionRatio: stats.taauHistoryRejectionRatio,
        taauHistoryRejectionSampledEstimate: stats.taauHistoryRejectionSampledEstimate,
        taauRejectNoVelocityRatio: stats.taauRejectNoVelocityRatio,
        taauRejectViewportRatio: stats.taauRejectViewportRatio,
        taauRejectDepthRatio: stats.taauRejectDepthRatio,
        taauRejectOpacityRatio: stats.taauRejectOpacityRatio,
        taauCurrentPhaseSampleCount: stats.taauCurrentPhaseSampleCount,
        taauNonCurrentPhaseSampleCount: stats.taauNonCurrentPhaseSampleCount,
        taauCloudCoveredSampleCount: stats.taauCloudCoveredSampleCount,
        taauCloudCoveredRejectionRatio: stats.taauCloudCoveredRejectionRatio,
        taauCloudOpacityThreshold: stats.taauCloudOpacityThreshold,
        cloudFrameLowResAttachmentBytes: stats.cloudFrameLowResAttachmentBytes,
        taauHistoryDepthBytes: stats.taauHistoryDepthBytes,
        cloudFrameHistoryBytes: stats.cloudFrameHistoryBytes,
        taauDepthRejectRel: stats.taauDepthRejectRel,
        taauOpacityOutsideReactLo: stats.taauOpacityOutsideReactLo,
        taauOpacityOutsideRejectHi: stats.taauOpacityOutsideRejectHi,
        taauResolveCounterSampleId: stats.taauResolveCounterSampleId,
        timedPassSumMs,
        timedPassSumCovers: 'cacheMs(if cacheRan)+shadowMs(if shadowRan)+cloudMs+temporalResolveMs+compositeMs+postMs; instrumented passes only, not full-frame GPU wall time; excludes brick and shared atlas/macro timestamps',
      },
    };
  }

  function getEvidence(): DensityBenchmarkEvidence {
    const stats = renderer.getStats();
    const collected = getResults();
    const completedCases = collected
      .filter((result) => result.status === 'complete')
      .map((result) => result.caseId);
    const staleCases = collected.filter((result) => result.stale).map((result) => result.caseId);
    const gateCases = manifest.cases.filter((candidate) => candidate.gateRequired);
    const gateCaseIds = new Set(gateCases.map((candidate) => candidate.id));
    const missingCases = gateCases
      .filter((candidate) => {
        const result = results.get(candidate.id);
        if (!result || result.status !== 'complete' || result.stale) return true;
        return candidate.screenshotRequired && !result.screenshotCaptured;
      })
      .map((candidate) => candidate.id);
    const timedCases = gateCases.filter((candidate) => candidate.timingRequired);
    const referenceTimingComplete = timedCases.length === 0 || (stats.gpuTiming && timedCases.every((candidate) => {
      const result = results.get(candidate.id);
      return result?.gpuTiming.availability === 'available'
        && (result.gpuTiming.cloud?.count ?? 0) >= manifest.minimumGpuSamples
        && (result.gpuTiming.cache?.count ?? 0) >= manifest.minimumGpuSamples
        && (candidate.storage !== 'hierarchical'
          || (result.gpuTiming.brick?.count ?? 0) >= manifest.minimumGpuSamples)
        && (!requiresGroundShadowTiming(candidate)
          || (result.gpuTiming.shadow?.count ?? 0) >= manifest.minimumGpuSamples)
        && (result.gpuTiming.post?.count ?? 0) >= manifest.minimumGpuSamples;
    }));
    return {
      schemaVersion: manifest.schemaVersion,
      baselineId: manifest.baselineId,
      sourceRevision: manifest.sourceRevision,
      generatedAt: new Date().toISOString(),
      manifestFingerprint: fingerprintValue(manifest),
      activeChanges: manifest.activeChanges,
      deviceInfo: JSON.parse(JSON.stringify(stats.deviceInfo)) as RendererDeviceInfo,
      startupTiming: { ...stats.startupTiming },
      expectedCases: gateCases.map((candidate) => candidate.id),
      completedCases,
      missingCases,
      staleCases,
      referenceTimingComplete,
      w0Gate: missingCases.length === 0
        && !staleCases.some((caseId) => gateCaseIds.has(caseId))
        && referenceTimingComplete
        ? 'complete'
        : 'incomplete',
      results: collected,
    };
  }

  function exportJson(): string {
    return `${JSON.stringify(getEvidence(), null, 2)}\n`;
  }

  function downloadJson(): void {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${manifest.baselineId}-results.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    manifest,
    isActive: () => displayedFrameOverride !== null,
    getFrameOverride: () => displayedFrameOverride,
    getCamera,
    setCamera,
    followInteractiveCamera,
    resetCamera,
    setW10Options,
    start,
    cancel,
    observe,
    markScreenshot,
    getStatus: () => ({ ...status }),
    getResults,
    getRuntimeDiagnostics,
    getEvidence,
    exportJson,
    downloadJson,
  };
}

export function manifestJson(manifest: DensityBenchmarkManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function sameBenchmarkConfiguration(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
