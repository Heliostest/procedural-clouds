import GUI from 'lil-gui';
import { CLOUD_PRESETS, type CloudParams } from './params';
import type { WeatherConfig } from './weather';

export interface GuiHooks {
  onPreset(name: string): void;
  onCacheResolution(res: number): void;
  onWeather(): void;
}

export interface CloudGui {
  refreshShape(): void;
}

export function createGui(params: CloudParams, weather: WeatherConfig, hooks: GuiHooks): CloudGui {
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
  shapeFolder.add(params, 'cloudHeight', 0.5, 5.0, 0.1).name('Cloud Height');

  const windFolder = gui.addFolder('Wind');
  windFolder.add(params, 'windDeg', 0, 360, 1).name('Direction °');
  windFolder.add(params, 'windSpeed', 0.0, 2.0, 0.01).name('Speed');
  windFolder.add(params, 'morphRate', 0.0, 1.0, 0.01).name('Morph Rate');

  const presetKeys = Object.keys(CLOUD_PRESETS);
  const weatherFolder = gui.addFolder('Weather Regions');
  const rA = weatherFolder.addFolder('Region A (rect)');
  rA.add(weather, 'aType', presetKeys).name('Type').onChange(hooks.onWeather);
  rA.add(weather, 'aCoverage', 0.0, 1.0, 0.01).name('Coverage').onChange(hooks.onWeather);
  rA.add(weather, 'aCenterX', -4.5, 4.5, 0.1).name('Center X').onChange(hooks.onWeather);
  rA.add(weather, 'aCenterZ', -4.5, 4.5, 0.1).name('Center Z').onChange(hooks.onWeather);
  rA.add(weather, 'aSizeX', 0.2, 4.5, 0.1).name('Half W').onChange(hooks.onWeather);
  rA.add(weather, 'aSizeZ', 0.2, 4.5, 0.1).name('Half D').onChange(hooks.onWeather);
  rA.add(weather, 'aFeather', 0.0, 3.0, 0.05).name('Feather').onChange(hooks.onWeather);
  const rB = weatherFolder.addFolder('Region B (circle)');
  rB.add(weather, 'bType', presetKeys).name('Type').onChange(hooks.onWeather);
  rB.add(weather, 'bCoverage', 0.0, 1.0, 0.01).name('Coverage').onChange(hooks.onWeather);
  rB.add(weather, 'bCenterX', -4.5, 4.5, 0.1).name('Center X').onChange(hooks.onWeather);
  rB.add(weather, 'bCenterZ', -4.5, 4.5, 0.1).name('Center Z').onChange(hooks.onWeather);
  rB.add(weather, 'bRadius', 0.2, 4.5, 0.1).name('Radius').onChange(hooks.onWeather);
  rB.add(weather, 'bFeather', 0.0, 3.0, 0.05).name('Feather').onChange(hooks.onWeather);

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
  };
}
