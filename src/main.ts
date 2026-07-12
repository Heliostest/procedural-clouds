import Stats from 'stats.js';
import { createOrbitCamera, type CameraFrame } from './camera';
import { createGizmoController } from './gizmo';
import { createRenderer } from './renderer';
import { createGui } from './gui';
import { createDefaultParams } from './params';
import { createBodyStore, createDefaultBodies, evalBodyMod } from './body';
import type { BodyMod } from './lifecycle';
import { createPlayer, parseScenario, serializeScenario, DEMO_SCENARIO, type ScenarioPlayer } from './scenario';
import { createAxisLabelOverlay } from './axis';
import { t, onLangChange } from './i18n';
import { enforcePlacement, placementWarning } from './genusProfile';
import { metersToWorldXZ, metersToWorldY } from './space';
import { verifyPhysicalContracts } from './physicalVerification';
import { createWindAdvectionController, WIND_DEMO_MAX_MPS } from './wind';
import { DEFAULT_SIMULATION_RATE, scaledSimulationDelta, type SimulationState } from './simulationTime';
import { createDensityBenchmarkController, type DensityBenchmarkController } from './densityBenchmark';

declare global {
  interface Window {
    densityBenchmark?: DensityBenchmarkController;
  }
}

const IDENTITY_MOD: BodyMod = { coverageMul: 1, densityScale: 1, morph: 0 };

async function main(): Promise<void> {
  if (import.meta.env.DEV) verifyPhysicalContracts();
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const store = createBodyStore(createDefaultBodies(), () => params.cloudHeight);
  const manualWind = createWindAdvectionController();
  const timeline = { scrub: false, time: 0 };
  const simulationState: SimulationState = { rate: DEFAULT_SIMULATION_RATE };
  const scenarioState = { enabled: false, playing: true, loop: false };
  let currentScenario = DEMO_SCENARIO;
  let player: ScenarioPlayer = createPlayer(currentScenario);
  let playhead = 0.0;
  let lastPlayhead = -1.0;
  let scenarioError = '';

  let measureState: 'idle' | 'skip' | 'full' | 'done' = 'idle';
  let measureFrame = 0;
  let measureSum = 0;
  let measureAvgSkip = 0;
  let measureOriginalSkip = false;
  let lightShare = -1.0;

  function activateScenario(): void {
    player = createPlayer(currentScenario);
    playhead = 0;
    lastPlayhead = -1;
    scenarioState.enabled = true;
    scenarioState.playing = true;
    timeline.scrub = false;
    gui.refreshScenario();
  }

  let gizmo: ReturnType<typeof createGizmoController> | null = null;
  const camera = createOrbitCamera(canvas, {
    shouldOrbit: () => !gizmo?.isDragging(),
  });
  const renderer = await createRenderer(canvas);
  const axisLabels = createAxisLabelOverlay();
  function applyPlacementPolicy(bodies = store.list()): void {
    for (const body of bodies) {
      if (params.enforcePhysicalPlacement) enforcePlacement(body, params.cloudHeight);
      else placementWarning(body, params.cloudHeight);
    }
  }

  applyPlacementPolicy();
  renderer.setBodies(store.list());
  renderer.setWindSamples(manualWind.samples(store.list()));

  window.addEventListener('resize', renderer.resizeCanvas);
  window.addEventListener('beforeunload', renderer.destroy, { once: true });
  renderer.resizeCanvas();

  params.measureLightShare = () => {
    measureState = 'skip';
    measureFrame = 0;
    measureSum = 0;
    measureAvgSkip = 0;
    measureOriginalSkip = params.skipLight;
    params.skipLight = true;
    lightShare = -1.0;
  };

  const gui = createGui(params, store, timeline, simulationState, scenarioState, {
    onBodiesChanged() {
      applyPlacementPolicy();
      renderer.setBodies(store.list());
    },
    onCacheResolution(res) {
      renderer.setDensityResolution(res);
    },
    onWeatherSize(size) {
      renderer.setWeatherSize(size);
    },
    onCacheWorkgroup(x, y, z) {
      renderer.setCacheWorkgroup(x, y, z);
    },
    onPresetsChanged() {
      renderer.updatePresets();
    },
    onTrigger() {
      manualClock = 0;
      manualWind.reset();
      renderer.setWindSamples(manualWind.samples(store.list()));
      timeline.scrub = false;
      timeline.time = 0;
      gui.refreshTimeline();
    },
    onResetWindAdvection() {
      manualWind.reset();
      renderer.setWindSamples(manualWind.samples(store.list()));
    },
    onScenarioDemo() {
      currentScenario = DEMO_SCENARIO;
      activateScenario();
    },
    onScenarioLoad(text) {
      try {
        currentScenario = parseScenario(text, params);
        scenarioError = '';
        activateScenario();
      } catch (err) {
        scenarioError = (err as Error).message;
        console.error(err);
      }
    },
    onScenarioExport() {
      const json = serializeScenario(currentScenario);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scenario.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  let benchmarkStatusEl: HTMLPreElement | null = null;
  const benchmark = createDensityBenchmarkController({
    canvas,
    params,
    renderer,
    onStatusChange(status) {
      if (!benchmarkStatusEl) {
        benchmarkStatusEl = document.createElement('pre');
        benchmarkStatusEl.id = 'density-benchmark-status';
        benchmarkStatusEl.style.cssText = 'position:fixed;right:8px;bottom:8px;margin:0;padding:8px 10px;font:11px/1.45 monospace;color:#d7f7b5;background:rgba(0,0,0,0.72);white-space:pre;pointer-events:none;z-index:10000;border-radius:4px;max-width:58ch';
        document.body.appendChild(benchmarkStatusEl);
      }
      benchmarkStatusEl.textContent = [
        `W0 ${status.state}: ${status.caseId ?? '-'}`,
        `warmup ${status.warmupFrames}/${status.requiredWarmupFrames}`,
        `samples cloud ${status.cloudSamples}/${status.requiredGpuSamples} · cache ${status.cacheSamples}/${status.requiredGpuSamples}`,
        status.message,
      ].join('\n');
    },
  });
  window.densityBenchmark = benchmark;
  const benchmarkQuery = new URLSearchParams(window.location.search);
  const requestedBenchmarkCase = benchmarkQuery.get('benchmarkCase');
  if (benchmarkQuery.get('benchmark') === '1') {
    const panel = document.createElement('div');
    panel.id = 'density-benchmark-controls';
    panel.dataset.testid = 'density-benchmark-controls';
    panel.style.cssText = 'position:fixed;left:8px;top:44px;z-index:10001;display:grid;grid-template-columns:auto auto;gap:6px;padding:8px;background:rgba(0,0,0,0.78);color:#d7f7b5;font:11px/1.4 monospace;border-radius:4px';
    const select = document.createElement('select');
    select.dataset.testid = 'density-benchmark-case';
    for (const candidate of benchmark.manifest.cases) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.id;
      select.appendChild(option);
    }
    const startButton = document.createElement('button');
    startButton.dataset.testid = 'density-benchmark-start';
    startButton.textContent = 'Start case';
    startButton.addEventListener('click', () => benchmark.start(select.value));
    const screenshotButton = document.createElement('button');
    screenshotButton.dataset.testid = 'density-benchmark-mark-screenshot';
    screenshotButton.textContent = 'Mark screenshot';
    screenshotButton.addEventListener('click', () => benchmark.markScreenshot());
    const copyButton = document.createElement('button');
    copyButton.dataset.testid = 'density-benchmark-copy-results';
    copyButton.textContent = 'Copy results';
    copyButton.addEventListener('click', () => {
      void navigator.clipboard.writeText(benchmark.exportJson());
    });
    const copyManifestButton = document.createElement('button');
    copyManifestButton.dataset.testid = 'density-benchmark-copy-manifest';
    copyManifestButton.textContent = 'Copy manifest';
    copyManifestButton.addEventListener('click', () => {
      void navigator.clipboard.writeText(`${JSON.stringify(benchmark.manifest, null, 2)}\n`);
    });
    const downloadButton = document.createElement('button');
    downloadButton.dataset.testid = 'density-benchmark-download-results';
    downloadButton.textContent = 'Download results';
    downloadButton.addEventListener('click', benchmark.downloadJson);
    const cleanCaptureButton = document.createElement('button');
    cleanCaptureButton.dataset.testid = 'density-benchmark-clean-capture';
    cleanCaptureButton.textContent = 'Clean capture (1s)';
    cleanCaptureButton.addEventListener('click', () => {
      document.body.classList.add('density-benchmark-clean-capture');
      window.setTimeout(() => document.body.classList.remove('density-benchmark-clean-capture'), 1000);
    });
    const cleanCaptureStyle = document.createElement('style');
    cleanCaptureStyle.textContent = 'body.density-benchmark-clean-capture > *:not(#canvas) { visibility: hidden !important; }';
    document.head.appendChild(cleanCaptureStyle);
    panel.append(select, startButton, screenshotButton, copyButton, copyManifestButton, downloadButton, cleanCaptureButton);
    document.body.appendChild(panel);
  }
  if (requestedBenchmarkCase) benchmark.start(requestedBenchmarkCase);

  let lastCam: CameraFrame | null = null;
  gizmo = createGizmoController({
    canvas,
    params,
    store,
    getCam: () => lastCam,
    getWindOffsetM: (bodyId) => manualWind.sample(bodyId).offsetM,
    onChange: () => renderer.setBodies(store.list()),
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const dbg = document.createElement('pre');
  dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;font:11px/1.45 monospace;color:#9feaff;background:rgba(0,0,0,0.6);white-space:pre;pointer-events:none;z-index:9999;border-radius:4px;max-width:min(120ch, calc(100vw - 16px))';
  document.body.appendChild(dbg);

  let emaCpuMs = 0;
  let emaWorkMs = 0;
  const GROUND_SHADOW_NAMES = ['Legacy', 'Adaptive', 'Transmittance'];

  function estimatedGroundShadowSteps(): number {
    if (params.groundShadowMode === 0) return 18;
    const az = params.sunAzimuth * Math.PI / 180;
    const el = params.sunElevation * Math.PI / 180;
    const ce = Math.cos(el);
    const sx = Math.abs(ce * Math.sin(az));
    const sy = Math.max(Math.sin(el), 0.01);
    const sz = Math.abs(ce * Math.cos(az));
    const half = params.boxHalfExtent / params.horizontalMetersPerWorldUnit;
    const height = params.cloudHeight / params.verticalMetersPerWorldUnit;
    const path = Math.min(
      height / sy,
      sx > 1e-5 ? half / sx : Number.POSITIVE_INFINITY,
      sz > 1e-5 ? half / sz : Number.POSITIVE_INFINITY,
    );
    const voxel = (half * 2) / Math.max(1, renderer.getStats().densityRes);
    return Math.min(params.groundShadowMaxSteps, Math.max(8, Math.ceil(path / Math.max(voxel * params.groundShadowStepScale, 0.001))));
  }
  function updateDebug(sceneClock: number, cpuMs: number, workMs: number): void {
    emaCpuMs = emaCpuMs === 0 ? cpuMs : emaCpuMs * 0.9 + cpuMs * 0.1;
    emaWorkMs = emaWorkMs === 0 ? workMs : emaWorkMs * 0.9 + workMs * 0.1;
    const lines: string[] = [];
    lines.push(`${t('dbgMode')}: ${scenarioState.enabled ? t('dbgScenario') : t('dbgManual')}`);
    lines.push(`${t('dbgClock')}: ${sceneClock.toFixed(2)}s`);
    const simulationAdvancing = simulationState.rate > 0
      && !timeline.scrub
      && (!scenarioState.enabled || scenarioState.playing);
    lines.push(`${t('dbgSimulation')}: ${simulationState.rate}× ${t(simulationAdvancing ? 'dbgRunning' : 'dbgFrozen')}`);
    if (scenarioState.enabled) {
      lines.push(`play:${scenarioState.playing ? '▶' : '⏸'} loop:${scenarioState.loop}`);
      lines.push(`${t('dbgPlayhead')}: ${playhead.toFixed(2)} / ${player.duration}s   ${t('dbgScrub')}:${timeline.scrub}`);
    } else {
      lines.push(`${t('dbgBodies')}: ${store.list().length}  ${t('dbgSelected')}:${params.selectedBody ?? '-'}`);
      store.list().forEach((b) => {
        const highWind = b.windSpeedMps > WIND_DEMO_MAX_MPS ? ' ⚠' : '';
        lines.push(`  ${b.id} ${b.shape}/${b.type} h=${b.base.toFixed(0)}m wind=${b.windSpeedMps.toFixed(1)}m/s${highWind} cov=${b.coverage.toFixed(2)} life=${b.life.enabled ? 'on' : 'off'}`);
      });
    }
    if (scenarioError) lines.push(`${t('dbgError')}: ${scenarioError}`);

    const s = renderer.getStats();
    const px = s.width * s.height;
    const fps = emaCpuMs > 0 ? 1000 / emaCpuMs : 0;
    const samples = px * params.rayMarchSteps * (params.skipLight ? 1 : 1 + params.lightMarchSteps);
    const gpuMs = s.cloudMs + s.cacheMs + s.shadowMs + s.postMs;
    lines.push('');
    lines.push(`── ${t('perfTitle')} ──`);
    lines.push(`${t('perfFps')}: ${fps.toFixed(0)}   ${t('perfCpu')}: ${emaCpuMs.toFixed(2)}ms   ${t('perfLoad')}: ${emaWorkMs.toFixed(2)}ms`);
    if (s.gpuTiming) {
      lines.push(`${t('perfGpu')}: ${gpuMs.toFixed(2)}ms (${t('perfCloud')} ${s.cloudMs.toFixed(2)} · ${t('perfCache')} ${s.cacheMs.toFixed(2)} · ${t('post')} ${s.postMs.toFixed(2)})`);
      if (params.groundShadowMode === 2) lines.push(`shadow compute: ${s.shadowMs.toFixed(2)}ms`);
    } else {
      lines.push(`${t('perfGpu')}: ${t('perfGpuNA')}${s.gpuTimingError ? ` (${s.gpuTimingError})` : ''}`);
    }
    if (measureState !== 'idle') {
      lines.push(`${t('lightShare')}: ${t('measuring')}`);
    } else if (lightShare >= 0.0) {
      lines.push(`${t('lightShare')}: ~${(lightShare * 100.0).toFixed(0)}% of cloud pass`);
    }
    lines.push(`${t('perfRes')}: ${s.width}×${s.height} (${(px / 1e6).toFixed(2)}M px)`);
    lines.push(`${t('perfRays')}: ${params.rayMarchSteps}+${params.skipLight ? 0 : params.lightMarchSteps}   ${t('perfSamples')}: ${(samples / 1e6).toFixed(1)}M`);
    lines.push(`${t('perfVoxels')}: ${s.densityRes}³ (${((s.densityRes ** 3) / 1e6).toFixed(2)}M) wg ${s.cacheWg.join('×')}`);
    lines.push(`${t('perfQuality')}: requested=${s.densityQualityRequested} active=${s.densityQualityActive}${s.densityQualityFallbackReason ? ` fallback=${s.densityQualityFallbackReason}` : ''}   weather ${s.weatherSize}²`);
    const qualityPipelineSummary = (['cached', 'hybrid', 'realtime'] as const).map((kind) => {
      const state = s.densityQualityPipelines[kind];
      const createMs = state.creation.renderPipelineCreateCpuMs + state.creation.groundShadowPipelineCreateCpuMs;
      return `${kind}:${state.lifecycle}${createMs > 0 ? `/${createMs.toFixed(1)}ms` : ''}${state.reason ? `(${state.reason})` : ''}`;
    }).join(' ');
    lines.push(`quality pipelines: ${qualityPipelineSummary}`);
    lines.push(`density producer: requested=${s.densityProducerRequested} active=${s.densityProducerActive} gen=${s.densityProducerActiveGeneration} lifecycle=${s.densityProducerLifecycle}${s.densityProducerFallbackReason ? ` fallback=${s.densityProducerFallbackReason}` : ''}`);
    if (s.densityProducerRequested !== s.densityProducerActive || s.densityProducerCandidateReason) {
      lines.push(`density candidate: ${s.densityProducerCandidateLifecycle}${s.densityProducerCandidateReason ? ` (${s.densityProducerCandidateReason})` : ''}`);
    }
    if (s.densityProducerEmptyDensity) {
      const dispatch = s.densityProducerDispatchWorkgroups.join('x');
      lines.push(`W5 empty-density: records=${s.densityProducerRecordBytes}B output=${(s.densityProducerOutputBytes / 1048576).toFixed(1)}MiB dispatch=${dispatch}`);
      lines.push(`V2 create: adapter=${s.densityProducerCreateCpuMs.toFixed(1)}ms shader=${s.densityProducerShaderModuleCreateCpuMs.toFixed(1)}ms pipeline=${s.densityProducerPipelineCreateCpuMs.toFixed(1)}ms rebuild=${s.densityProducerRebuildCpuMs.toFixed(1)}ms source=${s.densityProducerSourceLength}`);
      const mask = s.densityProducerTileMask;
      if (mask) {
        const mode = mask.enabled ? 'enabled' : `dense-fallback:${mask.fallbackReason}`;
        lines.push(`W4 tile-mask: ${mode} grid=${mask.grid.join('x')} tiles=${mask.tileCount} bytes=${mask.allocatedBytes}/${mask.requiredBytes}`);
        lines.push(`tile candidates: empty=${mask.emptyTileCount} occupied=${mask.occupiedTileCount} avg=${mask.averageCandidates.toFixed(2)} max=${mask.maxCandidates} culled=${(mask.culledRatio * 100).toFixed(1)}% evaluatorCalls=${mask.evaluatorCalls}`);
        lines.push(`tile rebuild: gen=${mask.generation}/${mask.revision} count=${mask.rebuildCount} cpu=${mask.rebuildCpuMs.toFixed(2)}ms reason=${mask.rebuildReason}`);
      }
      const shared = s.densityProducerSharedFields;
      if (shared) {
        const atlasGpu = shared.atlasGpuMs === null ? 'n/a' : `${shared.atlasGpuMs.toFixed(2)}ms`;
        const macroGpu = shared.macroGpuMs === null ? 'n/a' : `${shared.macroGpuMs.toFixed(2)}ms`;
        lines.push(`W5 shared-fields: ${shared.status} ${shared.format} atlas=${shared.atlasDimension}³ macro=${shared.macroDimension}² resources=${shared.resourceCount} bytes=${(shared.payloadBytes / 1048576).toFixed(2)}/${(shared.peakBudgetBytes / 1048576).toFixed(0)}MiB`);
        lines.push(`field builds: atlas=${shared.atlasBuildCount}/gen${shared.atlasGeneration}/${atlasGpu} macro=${shared.macroBuildCount}/gen${shared.macroGeneration}/${macroGpu} encodeCPU=${shared.buildEncodeCpuMs.toFixed(2)}ms`);
        lines.push(`field formats: ${shared.formatEvidence.map((item) => `${item.format}:${item.storageWritable && item.filterSampled ? 'ok' : 'unavailable'}/${(item.bytes / 1048576).toFixed(2)}MiB/${item.channelCount}ch`).join(' ')}`);
      }
    }
    if (s.densityProducerFailureReason) lines.push(`density failure: ${s.densityProducerFailureReason}`);
    if (s.densitySharedFieldDebugReason) lines.push(`W5 debug unavailable: ${s.densitySharedFieldDebugReason}`);
    lines.push(`ground shadow: ${GROUND_SHADOW_NAMES[params.groundShadowMode] ?? params.groundShadowMode} ~${estimatedGroundShadowSteps()}/${params.groundShadowMaxSteps} samples`);
    if (params.groundShadowMode === 2) {
      lines.push(`shadow map: ${s.shadowMapResolution}² ${s.shadowUpdated ? 'updated' : 'reused'} history-reset:${s.shadowHistoryResetReason}`);
    }
    dbg.textContent = lines.join('\n');
  }

  const infoEl = document.getElementById('info');
  const applyInfo = () => { if (infoEl) infoEl.textContent = t('info'); };
  applyInfo();
  onLangChange(applyInfo);

  const startTime = performance.now();
  let manualClock = 0.0;
  let lastElapsed = 0.0;
  let lastFrameStamp = performance.now();

  function frame(): void {
    stats.begin();
    const now = performance.now();
    const cpuMs = now - lastFrameStamp;
    lastFrameStamp = now;
    const elapsed = (now - startTime) / 1000.0;
    const deltaTime = elapsed - lastElapsed;
    lastElapsed = elapsed;
    const simulationDelta = scaledSimulationDelta(deltaTime, simulationState.rate);

    const benchmarkFrame = benchmark.getFrameOverride();
    if (!benchmarkFrame && scenarioState.enabled) {
      if (timeline.scrub) {
        playhead = timeline.time;
      } else if (scenarioState.playing) {
        playhead += simulationDelta;
        if (playhead > player.duration) {
          playhead = scenarioState.loop ? playhead % player.duration : player.duration;
        }
      }
      if (Math.abs(playhead - lastPlayhead) > 1e-4) {
        const s = player.sample(playhead);
        applyPlacementPolicy(s.bodies);
        renderer.setBodies(s.bodies);
        renderer.setBodyMods(s.bodies.map(() => IDENTITY_MOD));
        renderer.setWindSamples(s.windSamples);
        lastPlayhead = playhead;
      }
    } else if (!benchmarkFrame) {
      if (lastPlayhead >= 0) {
        renderer.setBodies(store.list());
        renderer.setWindSamples(manualWind.samples(store.list()));
        lastPlayhead = -1;
      }
      if (!timeline.scrub) {
        manualClock += simulationDelta;
        manualWind.advance(store.list(), simulationDelta);
      }
      const sceneTime = timeline.scrub ? timeline.time : manualClock;
      const mods = store.list().map((b) => evalBodyMod(b, sceneTime));
      renderer.setBodyMods(mods);
      renderer.setWindSamples(manualWind.samples(store.list()));
    }

    const worldBoxHalfExtent = metersToWorldXZ(params.boxHalfExtent, params);
    const worldCloudHeight = metersToWorldY(params.cloudHeight, params);
    camera.setSceneBounds(worldBoxHalfExtent, worldCloudHeight);
    if (!benchmarkFrame) camera.update(deltaTime);

    const aspect = canvas.width / canvas.height;
    const cam = benchmarkFrame?.camera ?? camera.computeFrame(aspect);
    lastCam = cam;
    const sceneClock = benchmarkFrame?.sceneClock ?? (scenarioState.enabled
      ? playhead
      : (timeline.scrub ? timeline.time : manualClock));
    renderer.renderFrame(params, cam, elapsed, sceneClock);
    benchmark.observe(renderer.getStats());
    axisLabels.update(params.showAxes, cam.viewProj, canvas, worldBoxHalfExtent, worldCloudHeight, {
      verticalMetersPerWorldUnit: params.verticalMetersPerWorldUnit,
      horizontalMetersPerWorldUnit: params.horizontalMetersPerWorldUnit,
    });
    const workMs = performance.now() - now;

    if (measureState !== 'idle') {
      measureFrame++;
      if (measureFrame > 10) {
        measureSum += renderer.getStats().cloudMs;
      }
      if (measureState === 'skip' && measureFrame >= 40) {
        measureAvgSkip = measureSum / 30.0;
        measureState = 'full';
        measureFrame = 0;
        measureSum = 0;
        params.skipLight = false;
      } else if (measureState === 'full' && measureFrame >= 40) {
        const avgFull = measureSum / 30.0;
        if (avgFull > 0) {
          lightShare = Math.max(0, (avgFull - measureAvgSkip) / avgFull);
        }
        params.skipLight = measureOriginalSkip;
        measureState = 'done';
        setTimeout(() => { measureState = 'idle'; }, 3000);
      }
    }

    updateDebug(sceneClock, cpuMs, workMs);

    stats.end();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const failure = document.createElement('pre');
  failure.id = 'startup-error';
  failure.style.cssText = 'position:fixed;inset:12px;z-index:20000;margin:0;padding:16px;overflow:auto;color:#ffb4b4;background:#180909;font:13px/1.5 monospace;white-space:pre-wrap';
  failure.textContent = message;
  document.body.appendChild(failure);
});
