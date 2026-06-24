import Stats from 'stats.js';
import { createOrbitCamera } from './camera';
import { createRenderer } from './renderer';
import { createGui } from './gui';
import { createDefaultParams } from './params';
import { createBodyStore, createDefaultBodies, evalBodyMod } from './body';
import type { RegionMod } from './lifecycle';
import { createPlayer, parseScenario, serializeScenario, DEMO_SCENARIO, type ScenarioPlayer } from './scenario';

const IDENTITY_MOD: RegionMod = { coverageMul: 1, densityScale: 1, morph: 0 };

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const params = createDefaultParams();
  const store = createBodyStore(createDefaultBodies());
  const timeline = { scrub: false, time: 0 };
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
    onTrigger() {
      timeBase = (performance.now() - startTime) / 1000.0;
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
  function updateDebug(sceneClock: number): void {
    const lines: string[] = [];
    lines.push(`mode: ${scenarioState.enabled ? 'SCENARIO' : 'manual'}`);
    lines.push(`clock: ${sceneClock.toFixed(2)}s`);
    if (scenarioState.enabled) {
      lines.push(`play:${scenarioState.playing ? '▶' : '⏸'} speed:${scenarioState.speed.toFixed(1)} loop:${scenarioState.loop}`);
      lines.push(`playhead: ${playhead.toFixed(2)} / ${player.duration}s   scrub:${timeline.scrub}`);
    } else {
      lines.push(`bodies: ${store.list().length}  selected:${params.selectedBody ?? '-'}`);
      store.list().forEach((b) => {
        lines.push(`  ${b.id} ${b.shape}/${b.type} h=${b.base.toFixed(2)} cov=${b.coverage.toFixed(2)} life=${b.life.enabled ? 'on' : 'off'}`);
      });
    }
    if (scenarioError) lines.push(`ERROR: ${scenarioError}`);
    dbg.textContent = lines.join('\n');
  }

  const startTime = performance.now();
  let timeBase = 0.0;
  let lastElapsed = 0.0;

  function frame(): void {
    stats.begin();
    const elapsed = (performance.now() - startTime) / 1000.0;
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
      const sceneTime = timeline.scrub ? timeline.time : elapsed - timeBase;
      const mods = store.list().map((b) => evalBodyMod(b, sceneTime));
      renderer.setBodyMods(mods);
    }

    camera.update();

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
