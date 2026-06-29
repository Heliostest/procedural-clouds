import Stats from 'stats.js';
import { createOrbitCamera } from './camera';
import { createRenderer } from './renderer';
import { createGui } from './gui';
import { createDefaultParams } from './params';
import { createBodyStore, createDefaultBodies, evalBodyMod } from './body';
import type { BodyMod } from './lifecycle';
import { createPlayer, parseScenario, serializeScenario, DEMO_SCENARIO, type ScenarioPlayer } from './scenario';
import { t, onLangChange } from './i18n';

const IDENTITY_MOD: BodyMod = { coverageMul: 1, densityScale: 1, morph: 0 };

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const store = createBodyStore(createDefaultBodies());
  const timeline = { scrub: false, time: 0, paused: false };
  const scenarioState = { enabled: false, playing: true, speed: 1, loop: false };
  let currentScenario = DEMO_SCENARIO;
  let player: ScenarioPlayer = createPlayer(currentScenario);
  let playhead = 0.0;
  let lastPlayhead = -1.0;
  let scenarioError = '';

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
  renderer.setBodies(store.list());

  window.addEventListener('resize', renderer.resizeCanvas);
  renderer.resizeCanvas();

  const gui = createGui(params, store, timeline, scenarioState, {
    onBodiesChanged() {
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
      timeline.scrub = false;
      timeline.time = 0;
      gui.refreshTimeline();
    },
    onScenarioDemo() {
      currentScenario = DEMO_SCENARIO;
      activateScenario();
    },
    onScenarioLoad(text) {
      try {
        currentScenario = parseScenario(text);
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

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const dbg = document.createElement('pre');
  dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;font:11px/1.45 monospace;color:#9feaff;background:rgba(0,0,0,0.6);white-space:pre;pointer-events:none;z-index:9999;border-radius:4px;max-width:52ch';
  document.body.appendChild(dbg);

  let emaCpuMs = 0;
  let emaWorkMs = 0;
  const QUALITY_NAMES = ['Cached', 'Hybrid', 'Realtime'];
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
        lines.push(`  ${b.id} ${b.shape}/${b.type} h=${b.base.toFixed(2)} cov=${b.coverage.toFixed(2)} life=${b.life.enabled ? 'on' : 'off'}`);
      });
    }
    if (scenarioError) lines.push(`${t('dbgError')}: ${scenarioError}`);

    const s = renderer.getStats();
    const px = s.width * s.height;
    const fps = emaCpuMs > 0 ? 1000 / emaCpuMs : 0;
    const samples = px * params.rayMarchSteps * (params.skipLight ? 1 : 1 + params.lightMarchSteps);
    const gpuMs = s.cloudMs + s.cacheMs;
    lines.push('');
    lines.push(`── ${t('perfTitle')} ──`);
    lines.push(`${t('perfFps')}: ${fps.toFixed(0)}   ${t('perfCpu')}: ${emaCpuMs.toFixed(2)}ms   ${t('perfLoad')}: ${emaWorkMs.toFixed(2)}ms`);
    if (s.gpuTiming) {
      lines.push(`${t('perfGpu')}: ${gpuMs.toFixed(2)}ms (${t('perfCloud')} ${s.cloudMs.toFixed(2)} · ${t('perfCache')} ${s.cacheMs.toFixed(2)})`);
    } else {
      lines.push(`${t('perfGpu')}: ${t('perfGpuNA')}`);
    }
    lines.push(`${t('perfRes')}: ${s.width}×${s.height} (${(px / 1e6).toFixed(2)}M px)`);
    lines.push(`${t('perfRays')}: ${params.rayMarchSteps}+${params.skipLight ? 0 : params.lightMarchSteps}   ${t('perfSamples')}: ${(samples / 1e6).toFixed(1)}M`);
    lines.push(`${t('perfVoxels')}: ${s.densityRes}³ (${((s.densityRes ** 3) / 1e6).toFixed(2)}M) wg ${s.cacheWg.join('×')}`);
    lines.push(`${t('perfQuality')}: ${QUALITY_NAMES[params.qualityMode] ?? params.qualityMode}   weather ${s.weatherSize}²`);
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
        renderer.setBodies(s.bodies);
        renderer.setBodyMods(s.bodies.map(() => IDENTITY_MOD));
        lastPlayhead = playhead;
      }
    } else {
      if (lastPlayhead >= 0) {
        renderer.setBodies(store.list());
        lastPlayhead = -1;
      }
      if (!timeline.scrub && !timeline.paused) manualClock += deltaTime;
      const sceneTime = timeline.scrub ? timeline.time : manualClock;
      const mods = store.list().map((b) => evalBodyMod(b, sceneTime));
      renderer.setBodyMods(mods);
    }

    camera.update();

    const aspect = canvas.width / canvas.height;
    const cam = camera.computeFrame(aspect);
    const sceneClock = scenarioState.enabled
      ? playhead
      : (timeline.scrub ? timeline.time : manualClock);
    renderer.renderFrame(params, cam, elapsed, sceneClock);
    const workMs = performance.now() - now;
    updateDebug(sceneClock, cpuMs, workMs);

    stats.end();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
