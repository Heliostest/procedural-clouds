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

const IDENTITY_MOD: BodyMod = { coverageMul: 1, densityScale: 1, morph: 0 };

async function main(): Promise<void> {
  if (import.meta.env.DEV) verifyPhysicalContracts();
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const store = createBodyStore(createDefaultBodies(), () => params.cloudHeight);
  const manualWind = createWindAdvectionController();
  const timeline = { scrub: false, time: 0, paused: false };
  const scenarioState = { enabled: false, playing: true, speed: 1, loop: false };
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

  const camera = createOrbitCamera(canvas);
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

  const gui = createGui(params, store, timeline, scenarioState, {
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

  let lastCam: CameraFrame | null = null;
  createGizmoController({
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
  dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;font:11px/1.45 monospace;color:#9feaff;background:rgba(0,0,0,0.6);white-space:pre;pointer-events:none;z-index:9999;border-radius:4px;max-width:52ch';
  document.body.appendChild(dbg);

  let emaCpuMs = 0;
  let emaWorkMs = 0;
  const QUALITY_NAMES = ['Cached', 'Hybrid', 'Realtime'];
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
    if (scenarioState.enabled) {
      lines.push(`play:${scenarioState.playing ? '▶' : '⏸'} speed:${scenarioState.speed.toFixed(1)} loop:${scenarioState.loop}`);
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
      lines.push(`${t('perfGpu')}: ${t('perfGpuNA')}`);
    }
    if (measureState !== 'idle') {
      lines.push(`${t('lightShare')}: ${t('measuring')}`);
    } else if (lightShare >= 0.0) {
      lines.push(`${t('lightShare')}: ~${(lightShare * 100.0).toFixed(0)}% of cloud pass`);
    }
    lines.push(`${t('perfRes')}: ${s.width}×${s.height} (${(px / 1e6).toFixed(2)}M px)`);
    lines.push(`${t('perfRays')}: ${params.rayMarchSteps}+${params.skipLight ? 0 : params.lightMarchSteps}   ${t('perfSamples')}: ${(samples / 1e6).toFixed(1)}M`);
    lines.push(`${t('perfVoxels')}: ${s.densityRes}³ (${((s.densityRes ** 3) / 1e6).toFixed(2)}M) wg ${s.cacheWg.join('×')}`);
    lines.push(`${t('perfQuality')}: ${QUALITY_NAMES[params.qualityMode] ?? params.qualityMode}   weather ${s.weatherSize}²`);
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

    if (scenarioState.enabled) {
      if (timeline.scrub) {
        playhead = timeline.time;
      } else if (scenarioState.playing) {
        playhead += deltaTime * scenarioState.speed;
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
    } else {
      if (lastPlayhead >= 0) {
        renderer.setBodies(store.list());
        renderer.setWindSamples(manualWind.samples(store.list()));
        lastPlayhead = -1;
      }
      if (!timeline.scrub && !timeline.paused) {
        manualClock += deltaTime;
        manualWind.advance(store.list(), deltaTime);
      }
      const sceneTime = timeline.scrub ? timeline.time : manualClock;
      const mods = store.list().map((b) => evalBodyMod(b, sceneTime));
      renderer.setBodyMods(mods);
      renderer.setWindSamples(manualWind.samples(store.list()));
    }

    const worldBoxHalfExtent = metersToWorldXZ(params.boxHalfExtent, params);
    const worldCloudHeight = metersToWorldY(params.cloudHeight, params);
    camera.setSceneBounds(worldBoxHalfExtent, worldCloudHeight);
    camera.update();

    const aspect = canvas.width / canvas.height;
    const cam = camera.computeFrame(aspect);
    lastCam = cam;
    const sceneClock = scenarioState.enabled
      ? playhead
      : (timeline.scrub ? timeline.time : manualClock);
    renderer.renderFrame(params, cam, elapsed, sceneClock);
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
