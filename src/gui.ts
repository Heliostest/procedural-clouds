import GUI from 'lil-gui';
import { CLOUD_PRESETS, type CloudParams } from './params';
import type { BodyStore, CloudBody } from './body';

export interface GuiHooks {
  onBodiesChanged(): void;
  onCacheResolution(res: number): void;
  onTrigger(): void;
  onScenarioDemo(): void;
  onScenarioLoad(text: string): void;
  onScenarioExport(): void;
}

export interface ScenarioState {
  enabled: boolean;
  playing: boolean;
  speed: number;
  loop: boolean;
}

export interface CloudGui {
  refreshTimeline(): void;
  refreshScenario(): void;
  refreshBodies(): void;
}

export interface TimelineState {
  scrub: boolean;
  time: number;
}

export function createGui(params: CloudParams, store: BodyStore, timeline: TimelineState, scenario: ScenarioState, hooks: GuiHooks): CloudGui {
  const gui = new GUI({ title: 'Cloud Parameters' });
  const presetKeys = Object.keys(CLOUD_PRESETS);

  const bodiesFolder = gui.addFolder('Cloud Bodies');
  let subFolders: GUI[] = [];

  function rebuildBodies(): void {
    for (const f of subFolders) f.destroy();
    subFolders = [];
    for (const b of store.list()) {
      const f = bodiesFolder.addFolder(`${b.id} (${b.shape}) · ${b.type}`);
      subFolders.push(f);

      f.add({ select: () => { params.selectedBody = b.id; } }, 'select').name('◉ Select');

      if (b.shape === 'rect') {
        const proxy = {
          cx: (b.bounds[0] + b.bounds[2]) / 2,
          cz: (b.bounds[1] + b.bounds[3]) / 2,
          hw: (b.bounds[2] - b.bounds[0]) / 2,
          hd: (b.bounds[3] - b.bounds[1]) / 2,
        };
        const apply = () => {
          b.bounds = [proxy.cx - proxy.hw, proxy.cz - proxy.hd, proxy.cx + proxy.hw, proxy.cz + proxy.hd];
          hooks.onBodiesChanged();
        };
        f.add(proxy, 'cx', -4.5, 4.5, 0.1).name('Center X').onChange(apply);
        f.add(proxy, 'cz', -4.5, 4.5, 0.1).name('Center Z').onChange(apply);
        f.add(proxy, 'hw', 0.2, 4.5, 0.1).name('Half W').onChange(apply);
        f.add(proxy, 'hd', 0.2, 4.5, 0.1).name('Half D').onChange(apply);
      } else {
        const proxy = { cx: b.bounds[0], cz: b.bounds[1], r: b.bounds[2] };
        const apply = () => {
          b.bounds = [proxy.cx, proxy.cz, proxy.r, 0];
          hooks.onBodiesChanged();
        };
        f.add(proxy, 'cx', -4.5, 4.5, 0.1).name('Center X').onChange(apply);
        f.add(proxy, 'cz', -4.5, 4.5, 0.1).name('Center Z').onChange(apply);
        f.add(proxy, 'r', 0.2, 4.5, 0.1).name('Radius').onChange(apply);
      }
      f.add(b, 'feather', 0.0, 3.0, 0.05).name('Feather').onChange(hooks.onBodiesChanged);
      f.add(b, 'base', 0.0, 0.95, 0.01).name('Height').onChange(hooks.onBodiesChanged);
      f.add(b, 'thickness', 0.05, 1.0, 0.01).name('Thickness').onChange(hooks.onBodiesChanged);
      f.add(b, 'type', presetKeys).name('Type').onChange((v: string) => { b.type = v; f.title(`${b.id} (${b.shape}) · ${v}`); hooks.onBodiesChanged(); });
      f.add(b, 'coverage', 0.0, 1.0, 0.01).name('Coverage').onChange(hooks.onBodiesChanged);
      f.add(b, 'densityScale', 0.0, 2.0, 0.01).name('Density').onChange(hooks.onBodiesChanged);
      f.add(b, 'windDeg', 0, 360, 1).name('Wind Dir °').onChange(hooks.onBodiesChanged);
      f.add(b, 'windSpeed', 0.0, 2.0, 0.01).name('Wind Speed').onChange(hooks.onBodiesChanged);
      f.add(b, 'morphRate', 0.0, 1.0, 0.01).name('Morph Rate').onChange(hooks.onBodiesChanged);

      const lf = f.addFolder('Lifecycle');
      lf.add(b.life, 'enabled').name('Enable').onChange(hooks.onTrigger);
      lf.add(b.life, 'birth', 0, 120, 0.5).name('Birth').onChange(hooks.onBodiesChanged);
      lf.add(b.life, 'grow', 0, 120, 0.5).name('Grow').onChange(hooks.onBodiesChanged);
      lf.add(b.life, 'decay', 0, 120, 0.5).name('Decay').onChange(hooks.onBodiesChanged);
      lf.add(b.life, 'death', 0, 120, 0.5).name('Death').onChange(hooks.onBodiesChanged);
      lf.add(b.life, 'peak', 0.0, 2.0, 0.05).name('Peak').onChange(hooks.onBodiesChanged);

      f.add({ del: () => { store.remove(b.id); if (params.selectedBody === b.id) params.selectedBody = null; rebuildBodies(); hooks.onBodiesChanged(); } }, 'del').name('✕ Remove');
    }
  }

  bodiesFolder.add({ addRect: () => { const b = store.add('rect'); params.selectedBody = b.id; rebuildBodies(); hooks.onBodiesChanged(); } }, 'addRect').name('+ Add Rect');
  bodiesFolder.add({ addCircle: () => { const b = store.add('circle'); params.selectedBody = b.id; rebuildBodies(); hooks.onBodiesChanged(); } }, 'addCircle').name('+ Add Circle');
  rebuildBodies();

  gui.add(params, 'showBodyBounds').name('Show Wireframe');
  gui.add(params, 'cloudHeight', 1.0, 16.0, 0.5).name('Box Height');
  gui.add(params, 'morphStrength', 0.0, 1.0, 0.01).name('Morph Strength');

  const scenarioFolder = gui.addFolder('Scenario');
  scenarioFolder.add(scenario, 'enabled').name('Enable Scenario');
  scenarioFolder.add(scenario, 'playing').name('Play / Pause');
  scenarioFolder.add(scenario, 'speed', 0.1, 8.0, 0.1).name('Speed');
  scenarioFolder.add(scenario, 'loop').name('Loop');
  const timeFolder = scenarioFolder.addFolder('Timeline');
  timeFolder.add({ trigger: hooks.onTrigger }, 'trigger').name('Trigger Now (t=0)');
  timeFolder.add(timeline, 'scrub').name('Scrub Time');
  timeFolder.add(timeline, 'time', 0, 120, 0.1).name('Scene Time');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    f.text().then((t) => hooks.onScenarioLoad(t));
    fileInput.value = '';
  });
  const pastePanel = document.createElement('div');
  pastePanel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10000;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:10px;display:none;flex-direction:column;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,0.6)';
  const pasteTa = document.createElement('textarea');
  pasteTa.placeholder = '粘贴 Scenario JSON 后点 Apply';
  pasteTa.style.cssText = 'width:60ch;height:40vh;font:12px/1.4 monospace;background:#0e0e0e;color:#cfe;border:1px solid #333;border-radius:4px;padding:8px;resize:both';
  const pasteRow = document.createElement('div');
  pasteRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const pasteApply = document.createElement('button');
  pasteApply.textContent = 'Apply';
  const pasteClose = document.createElement('button');
  pasteClose.textContent = 'Close';
  for (const b of [pasteApply, pasteClose]) b.style.cssText = 'padding:4px 14px;cursor:pointer';
  pasteRow.append(pasteApply, pasteClose);
  pastePanel.append(pasteTa, pasteRow);
  document.body.appendChild(pastePanel);
  pasteClose.addEventListener('click', () => { pastePanel.style.display = 'none'; });
  pasteApply.addEventListener('click', () => {
    hooks.onScenarioLoad(pasteTa.value);
    pastePanel.style.display = 'none';
  });

  scenarioFolder.add({ demo: hooks.onScenarioDemo }, 'demo').name('Load Demo');
  scenarioFolder.add({ load: () => fileInput.click() }, 'load').name('Load JSON…');
  scenarioFolder.add({ paste: () => { pastePanel.style.display = 'flex'; pasteTa.focus(); } }, 'paste').name('Paste JSON…');
  scenarioFolder.add({ exp: hooks.onScenarioExport }, 'exp').name('Export JSON');

  const lightFolder = gui.addFolder('Lighting');
  lightFolder.add(params, 'sunAzimuth', 0, 360, 1).name('Sun Azimuth °');
  lightFolder.add(params, 'sunElevation', -10, 90, 1).name('Sun Elevation °');
  lightFolder.add(params, 'silverIntensity', 0.0, 2.0, 0.01).name('Silver Lining');
  lightFolder.add(params, 'powderStrength', 0.0, 1.0, 0.01).name('Powder');
  lightFolder.add(params, 'hgForward', 0.0, 0.95, 0.01).name('HG Forward');
  lightFolder.add(params, 'hgBackward', -0.95, 0.95, 0.01).name('HG Backward');
  lightFolder.add(params, 'hgBlend', 0.0, 1.0, 0.01).name('HG Blend');
  lightFolder.add(params, 'godrayStrength', 0.0, 2.0, 0.01).name('God Rays');

  const renderFolder = gui.addFolder('Render');
  renderFolder.add(params, 'skipLight').name('Skip Light March');
  renderFolder.add(params, 'rayMarchSteps', 16, 64, 1).name('Ray Steps');
  renderFolder.add(params, 'lightMarchSteps', 1, 8, 1).name('Light Steps');
  renderFolder.add(params, 'shadowDarkness', 0.5, 20.0, 0.1).name('Shadow Dark');
  renderFolder.add(params, 'sunIntensity', 0.5, 20.0, 0.1).name('Sun Intensity');
  renderFolder.add(params, 'cacheResolution', 32, 128, 1).name('Cache Res').onFinishChange((v: number) => {
    const next = Math.max(32, Math.min(128, Math.round(v)));
    params.cacheResolution = next;
    hooks.onCacheResolution(next);
  });
  renderFolder.add(params, 'cacheUpdateRate', 1, 4, 1).name('Cache Update');
  renderFolder.add(params, 'cacheSmooth', 0.0, 0.95, 0.01).name('Cache Smooth');

  return {
    refreshTimeline() {
      timeFolder.controllers.forEach((c) => c.updateDisplay());
    },
    refreshScenario() {
      scenarioFolder.controllers.forEach((c) => c.updateDisplay());
      timeFolder.controllers.forEach((c) => c.updateDisplay());
    },
    refreshBodies() {
      rebuildBodies();
    },
  };
}

export type { CloudBody };
