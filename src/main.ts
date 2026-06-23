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

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const weather = createDefaultWeather();
  const camera = createOrbitCamera(canvas);
  const renderer = await createRenderer(canvas);
  renderer.setRegions(buildRegions(weather));

  window.addEventListener('resize', renderer.resizeCanvas);
  renderer.resizeCanvas();

  let transitionFrom: Partial<Record<ShapeKey, number>> | null = null;
  let transitionTo: Partial<Record<ShapeKey, number>> | null = null;
  let transitionT = 1.0;
  const TRANSITION_DURATION = 1.2;

  const gui = createGui(params, weather, {
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
      renderer.setRegions(buildRegions(weather));
    },
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  const startTime = performance.now();
  let prevSceneTime = 0.0;

  function frame(): void {
    stats.begin();
    const elapsed = (performance.now() - startTime) / 1000.0;
    const deltaTime = elapsed - prevSceneTime;
    prevSceneTime = elapsed;

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
