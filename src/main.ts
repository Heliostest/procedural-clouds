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

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const weather = createDefaultWeather();
  const timeline = { scrub: false, time: 0 };
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

  const gui = createGui(params, weather, timeline, {
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
      regions = buildRegions(weather);
      const hasLife = regions.some((r) => r.lifecycle);
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
    renderer.renderFrame(params, cam, elapsed);

    stats.end();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
