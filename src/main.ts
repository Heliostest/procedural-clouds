import Stats from 'stats.js';
import { createOrbitCamera } from './camera';
import { createRenderer } from './renderer';
import { createGui } from './gui';
import {
  createDefaultParams,
  CLOUD_PRESETS,
  SHAPE_PRESET_KEYS,
  type ShapeKey,
} from './params';
import { createDefaultWeather, buildRegions } from './weather';
import { evalRegionMod, type RegionMod } from './lifecycle';
import { createPlayer, parseScenario, serializeScenario, DEMO_SCENARIO, type ScenarioPlayer, type ScenarioSample } from './scenario';

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const weather = createDefaultWeather();
  const timeline = { scrub: false, time: 0 };
  const scenarioState = { enabled: false, playing: true, speed: 1, loop: false };
  let currentScenario = DEMO_SCENARIO;
  let player: ScenarioPlayer = createPlayer(currentScenario);
  let playhead = 0.0;
  let lastPlayhead = -1.0;

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
  let regions = buildRegions(weather);
  renderer.setRegions(regions);

  window.addEventListener('resize', renderer.resizeCanvas);
  renderer.resizeCanvas();

  let transitionFrom: Partial<Record<ShapeKey, number>> | null = null;
  let transitionTo: Partial<Record<ShapeKey, number>> | null = null;
  let transitionT = 1.0;
  const TRANSITION_DURATION = 1.2;

  const gui = createGui(params, weather, timeline, scenarioState, {
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
    onPreset(name) {
      const preset = CLOUD_PRESETS[name];
      if (!preset) return;
      const from: Partial<Record<ShapeKey, number>> = {};
      const to: Partial<Record<ShapeKey, number>> = {};
      for (const k of SHAPE_PRESET_KEYS) {
        from[k] = params[k];
        to[k] = preset[k];
      }
      transitionFrom = from;
      transitionTo = to;
      transitionT = 0.0;
    },
    onCacheResolution(res) {
      renderer.setDensityResolution(res);
    },
    onWeather() {
      const prevHasLife = regions.some((r) => r.lifecycle);
      regions = buildRegions(weather);
      const hasLife = regions.some((r) => r.lifecycle);
      if (hasLife && !prevHasLife) {
        timeBase = (performance.now() - startTime) / 1000.0;
        timeline.scrub = false;
        timeline.time = 0;
        gui.refreshTimeline();
      }
      if (!hasLife) renderer.setRegions(regions);
      lastMods = null;
    },
    onTrigger() {
      timeBase = (performance.now() - startTime) / 1000.0;
      timeline.scrub = false;
      timeline.time = 0;
      lastMods = null;
      gui.refreshTimeline();
    },
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  let lastSample: ScenarioSample | null = null;
  let scenarioError = '';
  const dbg = document.createElement('pre');
  dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;font:11px/1.45 monospace;color:#9feaff;background:rgba(0,0,0,0.6);white-space:pre;pointer-events:none;z-index:9999;border-radius:4px;max-width:52ch';
  document.body.appendChild(dbg);
  function updateDebug(sceneClock: number): void {
    const lines: string[] = [];
    lines.push(`mode: ${scenarioState.enabled ? 'SCENARIO' : 'manual'}`);
    lines.push(`clock: ${sceneClock.toFixed(2)}s`);
    if (scenarioState.enabled) {
      lines.push(`play:${scenarioState.playing ? '▶' : '⏸'} speed:${scenarioState.speed.toFixed(1)} loop:${scenarioState.loop}`);
      lines.push(`playhead: ${playhead.toFixed(2)} / ${player.duration}s   scrub:${timeline.scrub}`);
      if (lastSample) {
        lines.push(`wind: ${lastSample.windDeg}° spd ${lastSample.windSpeed}`);
        lastSample.regions.forEach((r, i) => {
          const m = lastSample!.mods[i];
          lines.push(`  R${i} ${r.shape}/${r.type} cov=${r.coverage.toFixed(2)} ds=${m.densityScale.toFixed(2)}`);
        });
      }
    } else {
      lines.push(`regions: ${regions.length}  weatherEnabled:${params.weatherEnabled}`);
      regions.forEach((r, i) => {
        lines.push(`  R${i} ${r.shape}/${r.type} cov=${r.coverage.toFixed(2)} life=${r.lifecycle ? 'on' : 'off'}`);
      });
    }
    if (scenarioError) lines.push(`ERROR: ${scenarioError}`);
    dbg.textContent = lines.join('\n');
  }

  const startTime = performance.now();
  let prevSceneTime = 0.0;
  let timeBase = 0.0;
  let lastMods: RegionMod[] | null = null;
  const MOD_EPS = 1 / 255;

  function frame(): void {
    stats.begin();
    const elapsed = (performance.now() - startTime) / 1000.0;
    const deltaTime = elapsed - prevSceneTime;
    prevSceneTime = elapsed;

    if (scenarioState.enabled) {
      if (timeline.scrub) {
        playhead = timeline.time;
      } else if (scenarioState.playing) {
        playhead += deltaTime * scenarioState.speed;
        if (playhead > player.duration) {
          playhead = scenarioState.loop ? playhead % player.duration : player.duration;
        }
      }
      if (Math.abs(playhead - lastPlayhead) > 1e-4 || !lastSample) {
        const s = player.sample(playhead);
        renderer.setRegions(s.regions, s.mods);
        params.windDeg = s.windDeg;
        params.windSpeed = s.windSpeed;
        lastSample = s;
        lastPlayhead = playhead;
      }
      lastMods = null;
    } else {
      if (lastPlayhead >= 0) {
        renderer.setRegions(regions);
        lastMods = null;
      }
      lastPlayhead = -1;
      const sceneTime = timeline.scrub ? timeline.time : elapsed - timeBase;
      if (regions.some((r) => r.lifecycle)) {
        const mods = regions.map((r) => evalRegionMod(r.lifecycle, sceneTime));
        const changed = !lastMods || mods.some((m, i) =>
          Math.abs(m.coverageMul - lastMods![i].coverageMul) > MOD_EPS ||
          Math.abs(m.densityScale - lastMods![i].densityScale) > MOD_EPS);
        if (changed) {
          renderer.setRegions(regions, mods);
          lastMods = mods;
        }
      }
    }

    camera.update();

    if (transitionT < 1.0 && transitionFrom && transitionTo) {
      transitionT = Math.min(1.0, transitionT + deltaTime / TRANSITION_DURATION);
      const e = transitionT * transitionT * (3.0 - 2.0 * transitionT);
      for (const k of SHAPE_PRESET_KEYS) {
        const a = transitionFrom[k]!;
        const b = transitionTo[k]!;
        params[k] = a + (b - a) * e;
      }
      gui.refreshShape();
    }

    const aspect = canvas.width / canvas.height;
    const cam = camera.computeFrame(aspect);
    const sceneClock = scenarioState.enabled ? playhead : elapsed;
    renderer.renderFrame(params, cam, elapsed, sceneClock);
    updateDebug(sceneClock);

    stats.end();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
