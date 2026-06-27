import GUI from 'lil-gui';
import { CLOUD_PRESETS, SHAPE_PRESET_KEYS, type ShapeKey, type CloudParams } from './params';
import type { BodyStore, CloudBody } from './body';
import { t, tip, getLang, setLang, cloudTypeName, presetFieldName, presetFieldDesc, type Lang } from './i18n';

type Ctrl = { domElement: HTMLElement };
function tipKey<C extends Ctrl>(c: C, key: string): C {
  const d = tip(key);
  if (d) c.domElement.title = d;
  return c;
}
function tipText<C extends Ctrl>(c: C, text: string): C {
  if (text) c.domElement.title = text;
  return c;
}
function tipFolder(f: { $title: HTMLElement }, text: string): void {
  if (text) f.$title.title = text;
}

export interface GuiHooks {
  onBodiesChanged(): void;
  onCacheResolution(res: number): void;
  onPresetsChanged(): void;
  onTrigger(): void;
  onScenarioDemo(): void;
  onScenarioLoad(text: string): void;
  onScenarioExport(): void;
}

const PRESET_FIELD_RANGE: Record<ShapeKey, [number, number, number]> = {
  density: [0, 3, 0.01],
  coverage: [0, 1, 0.01],
  altitude: [0, 1, 0.01],
  scale: [0.5, 8, 0.05],
  detail: [0, 3, 0.05],
  cloudHeight: [0.5, 4, 0.05],
  coverageThreshold: [0, 0.5, 0.01],
  edgeSharpness: [0, 1, 0.01],
  baseRoundness: [0, 1, 0.01],
  worleyBlend: [0, 1, 0.01],
  detailStrength: [0, 2, 0.01],
  altBase: [0, 1, 0.01],
  altTop: [0, 1, 0.01],
  absorptionCoeff: [0, 0.15, 0.001],
  phaseForward: [0, 0.95, 0.01],
  phaseBack: [-0.95, 0.95, 0.01],
  silverLining: [0, 1, 0.01],
  baseDarkening: [0, 1, 0.01],
  sssStrength: [0, 1, 0.01],
};

function presetToCode(key: string): string {
  const p = CLOUD_PRESETS[key];
  const fields = SHAPE_PRESET_KEYS.map((k) => `${k}: ${p[k]}`).join(', ');
  return `  ${key}: { ${fields} },`;
}

function allPresetsToCode(): string {
  return Object.keys(CLOUD_PRESETS).map(presetToCode).join('\n');
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
  const presetKeys = Object.keys(CLOUD_PRESETS);
  const api: CloudGui = { refreshTimeline() {}, refreshScenario() {}, refreshBodies() {} };
  let gui: GUI | null = null;

  function build(): void {
    if (gui) gui.destroy();
    gui = new GUI({ title: t('title') });

    const langProxy = { lang: getLang() };
    tipKey(gui.add(langProxy, 'lang', { English: 'en', 中文: 'zh' }).name(t('language')).onChange((v: Lang) => { setLang(v); build(); }), 'language');

    const bodiesFolder = gui.addFolder(t('cloudBodies'));
    let subFolders: GUI[] = [];

    function rebuildBodies(): void {
      for (const f of subFolders) f.destroy();
      subFolders = [];
      for (const b of store.list()) {
        const f = bodiesFolder.addFolder(`${b.id} (${b.shape}) · ${cloudTypeName(b.type)}`);
        subFolders.push(f);

        f.$title.textContent = '';
        const titleText = document.createTextNode(`${b.id} (${b.shape}) · ${cloudTypeName(b.type)} `);
        f.$title.appendChild(titleText);
        const actions = document.createElement('span');
        actions.style.cssText = 'float:right;display:inline-flex;align-items:center;gap:2px;margin-right:2px';
        const typeSel = document.createElement('select');
        typeSel.title = t('type');
        for (const k of presetKeys) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = cloudTypeName(k);
          if (k === b.type) opt.selected = true;
          typeSel.appendChild(opt);
        }
        typeSel.style.cssText = 'font:11px sans-serif;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:0 2px';
        typeSel.addEventListener('click', (e) => e.stopPropagation());
        typeSel.addEventListener('change', () => { b.type = typeSel.value; titleText.nodeValue = `${b.id} (${b.shape}) · ${cloudTypeName(b.type)} `; hooks.onBodiesChanged(); });
        const selBtn = document.createElement('button');
        selBtn.textContent = '◎';
        selBtn.title = t('select');
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = t('remove');
        for (const btn of [selBtn, delBtn]) btn.style.cssText = 'font:11px sans-serif;line-height:1;padding:1px 3px;cursor:pointer;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px';
        selBtn.addEventListener('click', (e) => { e.stopPropagation(); params.selectedBody = b.id; });
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); store.remove(b.id); if (params.selectedBody === b.id) params.selectedBody = null; rebuildBodies(); hooks.onBodiesChanged(); });
        actions.append(typeSel, selBtn, delBtn);
        f.$title.appendChild(actions);

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
          tipKey(f.add(proxy, 'cx', -4.5, 4.5, 0.1).name(t('centerX')).onChange(apply), 'centerX');
          tipKey(f.add(proxy, 'cz', -4.5, 4.5, 0.1).name(t('centerZ')).onChange(apply), 'centerZ');
          tipKey(f.add(proxy, 'hw', 0.2, 4.5, 0.1).name(t('halfW')).onChange(apply), 'halfW');
          tipKey(f.add(proxy, 'hd', 0.2, 4.5, 0.1).name(t('halfD')).onChange(apply), 'halfD');
        } else {
          const proxy = { cx: b.bounds[0], cz: b.bounds[1], r: b.bounds[2] };
          const apply = () => {
            b.bounds = [proxy.cx, proxy.cz, proxy.r, 0];
            hooks.onBodiesChanged();
          };
          tipKey(f.add(proxy, 'cx', -4.5, 4.5, 0.1).name(t('centerX')).onChange(apply), 'centerX');
          tipKey(f.add(proxy, 'cz', -4.5, 4.5, 0.1).name(t('centerZ')).onChange(apply), 'centerZ');
          tipKey(f.add(proxy, 'r', 0.2, 4.5, 0.1).name(t('radius')).onChange(apply), 'radius');
        }
        tipKey(f.add(b, 'feather', 0.0, 3.0, 0.05).name(t('feather')).onChange(hooks.onBodiesChanged), 'feather');
        tipKey(f.add(b, 'base', 0.0, 0.95, 0.01).name(t('height')).onChange(hooks.onBodiesChanged), 'height');
        tipKey(f.add(b, 'thickness', 0.05, 1.0, 0.01).name(t('thickness')).onChange(hooks.onBodiesChanged), 'thickness');
        tipKey(f.add(b, 'coverage', 0.0, 1.0, 0.01).name(t('coverage')).onChange(hooks.onBodiesChanged), 'coverage');
        tipKey(f.add(b, 'densityScale', 0.0, 2.0, 0.01).name(t('density')).onChange(hooks.onBodiesChanged), 'density');
        tipKey(f.add(b, 'windDeg', 0, 360, 1).name(t('windDir')).onChange(hooks.onBodiesChanged), 'windDir');
        tipKey(f.add(b, 'windSpeed', 0.0, 2.0, 0.01).name(t('windSpeed')).onChange(hooks.onBodiesChanged), 'windSpeed');
        tipKey(f.add(b, 'morphRate', 0.0, 1.0, 0.01).name(t('morphRate')).onChange(hooks.onBodiesChanged), 'morphRate');

        const lf = f.addFolder(t('lifecycle'));
        tipKey(lf.add(b.life, 'enabled').name(t('enable')).onChange(hooks.onTrigger), 'enable');
        tipKey(lf.add(b.life, 'birth', 0, 120, 0.5).name(t('birth')).onChange(hooks.onBodiesChanged), 'birth');
        tipKey(lf.add(b.life, 'grow', 0, 120, 0.5).name(t('grow')).onChange(hooks.onBodiesChanged), 'grow');
        tipKey(lf.add(b.life, 'decay', 0, 120, 0.5).name(t('decay')).onChange(hooks.onBodiesChanged), 'decay');
        tipKey(lf.add(b.life, 'death', 0, 120, 0.5).name(t('death')).onChange(hooks.onBodiesChanged), 'death');
        tipKey(lf.add(b.life, 'peak', 0.0, 2.0, 0.05).name(t('peak')).onChange(hooks.onBodiesChanged), 'peak');
      }
    }

    tipKey(bodiesFolder.add({ addRect: () => { const b = store.add('rect'); params.selectedBody = b.id; rebuildBodies(); hooks.onBodiesChanged(); } }, 'addRect').name(t('addRect')), 'addRect');
    tipKey(bodiesFolder.add({ addCircle: () => { const b = store.add('circle'); params.selectedBody = b.id; rebuildBodies(); hooks.onBodiesChanged(); } }, 'addCircle').name(t('addCircle')), 'addCircle');
    rebuildBodies();

    tipKey(gui.add(params, 'showBodyBounds').name(t('showWireframe')), 'showWireframe');
    tipKey(gui.add(params, 'cloudHeight', 1.0, 16.0, 0.5).name(t('boxHeight')), 'boxHeight');
    tipKey(gui.add(params, 'morphStrength', 0.0, 1.0, 0.01).name(t('morphStrength')), 'morphStrength');

    const scenarioFolder = gui.addFolder(t('scenario'));
    tipKey(scenarioFolder.add(scenario, 'enabled').name(t('enableScenario')), 'enableScenario');
    tipKey(scenarioFolder.add(scenario, 'playing').name(t('playPause')), 'playPause');
    tipKey(scenarioFolder.add(scenario, 'speed', 0.1, 8.0, 0.1).name(t('speed')), 'speed');
    tipKey(scenarioFolder.add(scenario, 'loop').name(t('loop')), 'loop');
    const timeFolder = scenarioFolder.addFolder(t('timeline'));
    tipKey(timeFolder.add({ trigger: hooks.onTrigger }, 'trigger').name(t('triggerNow')), 'triggerNow');
    tipKey(timeFolder.add(timeline, 'scrub').name(t('scrubTime')), 'scrubTime');
    tipKey(timeFolder.add(timeline, 'time', 0, 120, 0.1).name(t('sceneTime')), 'sceneTime');

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      f.text().then((txt) => hooks.onScenarioLoad(txt));
      fileInput.value = '';
    });
    const pastePanel = document.createElement('div');
    pastePanel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10000;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:10px;display:none;flex-direction:column;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,0.6)';
    const pasteTa = document.createElement('textarea');
    pasteTa.placeholder = t('pastePlaceholder');
    pasteTa.style.cssText = 'width:60ch;height:40vh;font:12px/1.4 monospace;background:#0e0e0e;color:#cfe;border:1px solid #333;border-radius:4px;padding:8px;resize:both';
    const pasteRow = document.createElement('div');
    pasteRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const pasteApply = document.createElement('button');
    pasteApply.textContent = t('apply');
    const pasteClose = document.createElement('button');
    pasteClose.textContent = t('close');
    for (const b of [pasteApply, pasteClose]) b.style.cssText = 'padding:4px 14px;cursor:pointer';
    pasteRow.append(pasteApply, pasteClose);
    pastePanel.append(pasteTa, pasteRow);
    document.body.appendChild(pastePanel);
    pasteClose.addEventListener('click', () => { pastePanel.remove(); });
    pasteApply.addEventListener('click', () => {
      hooks.onScenarioLoad(pasteTa.value);
      pastePanel.style.display = 'none';
    });

    tipKey(scenarioFolder.add({ demo: hooks.onScenarioDemo }, 'demo').name(t('loadDemo')), 'loadDemo');
    tipKey(scenarioFolder.add({ load: () => fileInput.click() }, 'load').name(t('loadJson')), 'loadJson');
    tipKey(scenarioFolder.add({ paste: () => { pastePanel.style.display = 'flex'; pasteTa.focus(); } }, 'paste').name(t('pasteJson')), 'pasteJson');
    tipKey(scenarioFolder.add({ exp: hooks.onScenarioExport }, 'exp').name(t('exportJson')), 'exportJson');

    const lightFolder = gui.addFolder(t('lighting'));
    tipKey(lightFolder.add(params, 'sunAzimuth', 0, 360, 1).name(t('sunAzimuth')), 'sunAzimuth');
    tipKey(lightFolder.add(params, 'sunElevation', -10, 90, 1).name(t('sunElevation')), 'sunElevation');
    tipKey(lightFolder.add(params, 'silverIntensity', 0.0, 2.0, 0.01).name(t('silverLining')), 'silverLining');
    tipKey(lightFolder.add(params, 'powderStrength', 0.0, 1.0, 0.01).name(t('powder')), 'powder');
    tipKey(lightFolder.add(params, 'hgForward', 0.0, 0.95, 0.01).name(t('hgForward')), 'hgForward');
    tipKey(lightFolder.add(params, 'hgBackward', -0.95, 0.95, 0.01).name(t('hgBackward')), 'hgBackward');
    tipKey(lightFolder.add(params, 'hgBlend', 0.0, 1.0, 0.01).name(t('hgBlend')), 'hgBlend');
    tipKey(lightFolder.add(params, 'typeLightingBlend', 0.0, 1.0, 0.01).name(t('typeLighting')), 'typeLighting');
    tipKey(lightFolder.add(params, 'godrayStrength', 0.0, 2.0, 0.01).name(t('godRays')), 'godRays');

    const presetFolder = gui.addFolder(t('presetEditor'));
    const editState = { preset: presetKeys[0] };
    let fieldsFolder: GUI | null = null;
    const copyToClipboard = (text: string) => {
      navigator.clipboard?.writeText(text).catch(() => {});
    };
    function rebuildFields(): void {
      if (fieldsFolder) fieldsFolder.destroy();
      fieldsFolder = presetFolder.addFolder(cloudTypeName(editState.preset));
      tipFolder(fieldsFolder, getLang() === 'zh'
        ? '该云属的形状与光照模板。所有云体引用这些预设；悬停每一项查看其设计意图与作用。'
        : 'Shape & lighting template for this genus. Bodies reference these presets; hover each row to see its design intent.');
      const p = CLOUD_PRESETS[editState.preset];
      for (const k of SHAPE_PRESET_KEYS) {
        const [lo, hi, step] = PRESET_FIELD_RANGE[k];
        tipText(fieldsFolder.add(p, k, lo, hi, step).name(presetFieldName(k)).onChange(hooks.onPresetsChanged), presetFieldDesc(k));
      }
    }
    const typeOpts: Record<string, string> = {};
    for (const k of presetKeys) typeOpts[cloudTypeName(k)] = k;
    tipKey(presetFolder.add(editState, 'preset', typeOpts).name(t('editPreset')).onChange(rebuildFields), 'editPreset');
    tipKey(presetFolder.add({ copy: () => copyToClipboard(presetToCode(editState.preset)) }, 'copy').name(t('copyPreset')), 'copyPreset');
    tipKey(presetFolder.add({ copyAll: () => copyToClipboard(allPresetsToCode()) }, 'copyAll').name(t('copyAllPresets')), 'copyAllPresets');
    rebuildFields();

    const renderFolder = gui.addFolder(t('render'));
    tipKey(renderFolder.add(params, 'skipLight').name(t('skipLight')), 'skipLight');
    tipKey(renderFolder.add(params, 'rayMarchSteps', 16, 64, 1).name(t('raySteps')), 'raySteps');
    tipKey(renderFolder.add(params, 'lightMarchSteps', 1, 8, 1).name(t('lightSteps')), 'lightSteps');
    tipKey(renderFolder.add(params, 'shadowDarkness', 0.5, 20.0, 0.1).name(t('shadowDark')), 'shadowDark');
    tipKey(renderFolder.add(params, 'sunIntensity', 0.5, 20.0, 0.1).name(t('sunIntensity')), 'sunIntensity');
    tipKey(renderFolder.add(params, 'cacheResolution', 32, 128, 1).name(t('cacheRes')).onFinishChange((v: number) => {
      const next = Math.max(32, Math.min(128, Math.round(v)));
      params.cacheResolution = next;
      hooks.onCacheResolution(next);
    }), 'cacheRes');
    tipKey(renderFolder.add(params, 'cacheUpdateRate', 1, 4, 1).name(t('cacheUpdate')), 'cacheUpdate');
    tipKey(renderFolder.add(params, 'cacheSmooth', 0.0, 0.95, 0.01).name(t('cacheSmooth')), 'cacheSmooth');
    tipKey(renderFolder.add(params, 'qualityMode', { Cached: 0, Hybrid: 1, Realtime: 2 }).name(t('qualityMode')), 'qualityMode');
    tipKey(renderFolder.add(params, 'detailFreq', 0.5, 8.0, 0.1).name(t('detailFreq')), 'detailFreq');
    tipKey(renderFolder.add(params, 'detailStrength', 0.0, 2.0, 0.01).name(t('detailStrength')), 'detailStrength');

    api.refreshTimeline = () => timeFolder.controllers.forEach((c) => c.updateDisplay());
    api.refreshScenario = () => {
      scenarioFolder.controllers.forEach((c) => c.updateDisplay());
      timeFolder.controllers.forEach((c) => c.updateDisplay());
    };
    api.refreshBodies = () => rebuildBodies();
  }

  build();
  return api;
}

export type { CloudBody };
