import GUI from 'lil-gui';
import { CLOUD_PRESETS, type CloudParams } from './params';
import type { WeatherConfig } from './weather';

export interface GuiHooks {
  onPreset(name: string): void;
  onCacheResolution(res: number): void;
  onWeather(): void;
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
  refreshShape(): void;
  refreshTimeline(): void;
  refreshScenario(): void;
}

export interface TimelineState {
  scrub: boolean;
  time: number;
}

export function createGui(params: CloudParams, weather: WeatherConfig, timeline: TimelineState, scenario: ScenarioState, hooks: GuiHooks): CloudGui {
  const gui = new GUI({ title: 'Cloud Parameters' });
  gui.add(params, 'preset', Object.keys(CLOUD_PRESETS)).name('Preset').onChange(hooks.onPreset);

  const shapeFolder = gui.addFolder('Shape');
  shapeFolder.add(params, 'density', 0.1, 4.0, 0.05);
  shapeFolder.add(params, 'coverage', 0.0, 1.0, 0.01);
  shapeFolder.add(params, 'scale', 0.2, 15.0, 0.05);
  shapeFolder.add(params, 'altitude', 0.1, 1.0, 0.01);
  shapeFolder.add(params, 'detail', 0.0, 15.0, 0.5);
  shapeFolder.add(params, 'coverageThreshold', 0.0, 0.8, 0.01).name('Cov Threshold');
  shapeFolder.add(params, 'edgeSharpness', 0.0, 1.0, 0.01).name('Edge Sharp');
  shapeFolder.add(params, 'baseRoundness', 0.0, 1.0, 0.01).name('Base Round');
  shapeFolder.add(params, 'worleyBlend', 0.0, 1.0, 0.01).name('Worley Blend');
  shapeFolder.add(params, 'detailStrength', 0.0, 2.0, 0.01).name('Detail Str');
  shapeFolder.add(params, 'altBase', 0.0, 1.0, 0.01).name('Alt Base');
  shapeFolder.add(params, 'altTop', 0.0, 1.0, 0.01).name('Alt Top');

  const layerFolder = gui.addFolder('Layer');
  layerFolder.add(params, 'cloudHeight', 1.0, 16.0, 0.5).name('Box Height');
  layerFolder.add(params, 'layerBase', 0.0, 0.95, 0.01).name('Layer Height');
  layerFolder.add(params, 'layerThickness', 0.05, 1.0, 0.01).name('Layer Thickness');

  const windFolder = gui.addFolder('Wind');
  windFolder.add(params, 'windDeg', 0, 360, 1).name('Direction °');
  windFolder.add(params, 'windSpeed', 0.0, 2.0, 0.01).name('Speed');
  windFolder.add(params, 'morphRate', 0.0, 1.0, 0.01).name('Morph Rate');

  const presetKeys = Object.keys(CLOUD_PRESETS);
  const weatherFolder = gui.addFolder('Weather Regions');
  weatherFolder.add(params, 'weatherEnabled').name('Enable Regions');
  weatherFolder.add(params, 'showRegionBounds').name('Show Wireframe');
  weatherFolder.add(params, 'morphStrength', 0.0, 1.0, 0.01).name('Morph Strength');
  const rA = weatherFolder.addFolder('Region A (rect)');
  rA.add(weather, 'aType', presetKeys).name('Type').onChange(hooks.onWeather);
  rA.add(weather, 'aCoverage', 0.0, 1.0, 0.01).name('Coverage').onChange(hooks.onWeather);
  rA.add(weather, 'aCenterX', -4.5, 4.5, 0.1).name('Center X').onChange(hooks.onWeather);
  rA.add(weather, 'aCenterZ', -4.5, 4.5, 0.1).name('Center Z').onChange(hooks.onWeather);
  rA.add(weather, 'aSizeX', 0.2, 4.5, 0.1).name('Half W').onChange(hooks.onWeather);
  rA.add(weather, 'aSizeZ', 0.2, 4.5, 0.1).name('Half D').onChange(hooks.onWeather);
  rA.add(weather, 'aFeather', 0.0, 3.0, 0.05).name('Feather').onChange(hooks.onWeather);
  const lA = rA.addFolder('Lifecycle');
  lA.add(weather, 'aLifeEnabled').name('Enable').onChange(hooks.onWeather);
  lA.add(weather, 'aBirth', 0, 120, 0.5).name('Birth').onChange(hooks.onWeather);
  lA.add(weather, 'aGrow', 0, 120, 0.5).name('Grow').onChange(hooks.onWeather);
  lA.add(weather, 'aDecay', 0, 120, 0.5).name('Decay').onChange(hooks.onWeather);
  lA.add(weather, 'aDeath', 0, 120, 0.5).name('Death').onChange(hooks.onWeather);
  lA.add(weather, 'aPeak', 0.0, 2.0, 0.05).name('Peak Density').onChange(hooks.onWeather);
  const rB = weatherFolder.addFolder('Region B (circle)');
  rB.add(weather, 'bType', presetKeys).name('Type').onChange(hooks.onWeather);
  rB.add(weather, 'bCoverage', 0.0, 1.0, 0.01).name('Coverage').onChange(hooks.onWeather);
  rB.add(weather, 'bCenterX', -4.5, 4.5, 0.1).name('Center X').onChange(hooks.onWeather);
  rB.add(weather, 'bCenterZ', -4.5, 4.5, 0.1).name('Center Z').onChange(hooks.onWeather);
  rB.add(weather, 'bRadius', 0.2, 4.5, 0.1).name('Radius').onChange(hooks.onWeather);
  rB.add(weather, 'bFeather', 0.0, 3.0, 0.05).name('Feather').onChange(hooks.onWeather);
  const lB = rB.addFolder('Lifecycle');
  lB.add(weather, 'bLifeEnabled').name('Enable').onChange(hooks.onWeather);
  lB.add(weather, 'bBirth', 0, 120, 0.5).name('Birth').onChange(hooks.onWeather);
  lB.add(weather, 'bGrow', 0, 120, 0.5).name('Grow').onChange(hooks.onWeather);
  lB.add(weather, 'bDecay', 0, 120, 0.5).name('Decay').onChange(hooks.onWeather);
  lB.add(weather, 'bDeath', 0, 120, 0.5).name('Death').onChange(hooks.onWeather);
  lB.add(weather, 'bPeak', 0.0, 2.0, 0.05).name('Peak Density').onChange(hooks.onWeather);

  const timeFolder = weatherFolder.addFolder('Timeline');
  timeFolder.add({ trigger: hooks.onTrigger }, 'trigger').name('Trigger Now (t=0)');
  timeFolder.add(timeline, 'scrub').name('Scrub Time');
  timeFolder.add(timeline, 'time', 0, 120, 0.1).name('Scene Time');

  const scenarioFolder = gui.addFolder('Scenario');
  scenarioFolder.add(scenario, 'enabled').name('Enable Scenario');
  scenarioFolder.add(scenario, 'playing').name('Play / Pause');
  scenarioFolder.add(scenario, 'speed', 0.1, 8.0, 0.1).name('Speed');
  scenarioFolder.add(scenario, 'loop').name('Loop');
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
  scenarioFolder.add({ paste: () => {
    pastePanel.style.display = 'flex';
    pasteTa.focus();
  } }, 'paste').name('Paste JSON…');
  scenarioFolder.add({ exp: hooks.onScenarioExport }, 'exp').name('Export JSON');

  gui.add(params, 'skipLight').name('Skip Light March');
  gui.add(params, 'rayMarchSteps', 16, 64, 1).name('Ray Steps');
  gui.add(params, 'lightMarchSteps', 1, 8, 1).name('Light Steps');
  gui.add(params, 'shadowDarkness', 0.5, 20.0, 0.1).name('Shadow Dark');
  gui.add(params, 'sunIntensity', 0.5, 20.0, 0.1).name('Sun Intensity');
  gui.add(params, 'cacheResolution', 32, 128, 1).name('Cache Res').onFinishChange((v: number) => {
    const next = Math.max(32, Math.min(128, Math.round(v)));
    params.cacheResolution = next;
    hooks.onCacheResolution(next);
  });
  gui.add(params, 'cacheUpdateRate', 1, 4, 1).name('Cache Update');
  gui.add(params, 'cacheSmooth', 0.0, 0.95, 0.01).name('Cache Smooth');

  return {
    refreshShape() {
      shapeFolder.controllers.forEach((c) => c.updateDisplay());
    },
    refreshTimeline() {
      timeFolder.controllers.forEach((c) => c.updateDisplay());
    },
    refreshScenario() {
      scenarioFolder.controllers.forEach((c) => c.updateDisplay());
      timeFolder.controllers.forEach((c) => c.updateDisplay());
    },
  };
}
