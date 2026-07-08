import GUI from 'lil-gui';
import {
  BASE_PRESET_KEYS,
  CLOUD_PRESETS,
  EDGE_STYLE_PRESET_KEYS,
  MORPHOLOGY_PRESET_KEYS,
  SHAPE_PRESET_KEYS,
  getPresetField,
  setPresetField,
  type CloudParams,
  type ShapeKey,
} from './params';
import type { BodyStore, CloudBody } from './body';
import { t, tip, getLang, setLang, cloudTypeName, presetFieldName, presetFieldDesc, type Lang } from './i18n';
import { WIND_DEMO_MAX_MPS } from './wind';
import { SIMULATION_RATES, type SimulationState } from './simulationTime';

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

const LOG_SCALE_MIN = 0.001;
const LOG_SCALE_MAX = 100000;

function formatScaleValue(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.001) return v.toFixed(3);
  return v.toExponential(2);
}

type LogScaleKey = 'verticalMetersPerWorldUnit' | 'horizontalMetersPerWorldUnit';

interface LogNumberCtrl extends Ctrl {
  updateDisplay(): LogNumberCtrl;
  onChange(fn: () => void): LogNumberCtrl;
  $input: HTMLInputElement;
  $fill?: HTMLElement;
  _inputFocused?: boolean;
}

function addLogScaleSlider(
  folder: GUI,
  params: CloudParams,
  key: LogScaleKey,
  label: string,
  tipName: string,
): void {
  const logMin = Math.log10(LOG_SCALE_MIN);
  const logMax = Math.log10(LOG_SCALE_MAX);
  const clamp = (v: number) => Math.max(LOG_SCALE_MIN, Math.min(LOG_SCALE_MAX, v));
  const proxy = { logPos: Math.log10(clamp(params[key])) };

  const ctrl = folder.add(proxy, 'logPos', logMin, logMax, 0.001).name(label) as unknown as LogNumberCtrl;
  tipKey(ctrl, tipName);

  const sync = () => {
    params[key] = clamp(Math.pow(10, proxy.logPos));
    if (!ctrl._inputFocused) ctrl.$input.value = formatScaleValue(params[key]);
    const pct = (proxy.logPos - logMin) / (logMax - logMin);
    if (ctrl.$fill) ctrl.$fill.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
  };

  ctrl.updateDisplay = () => { sync(); return ctrl; };
  ctrl.onChange(sync);
  ctrl.$input.addEventListener('change', () => {
    const v = parseFloat(ctrl.$input.value);
    if (Number.isFinite(v) && v > 0) {
      params[key] = clamp(v);
      proxy.logPos = Math.log10(params[key]);
      sync();
    }
  });
  sync();
}

export interface GuiHooks {
  onBodiesChanged(): void;
  onCacheResolution(res: number): void;
  onWeatherSize(size: number): void;
  onCacheWorkgroup(x: number, y: number, z: number): void;
  onPresetsChanged(): void;
  onTrigger(): void;
  onResetWindAdvection(): void;
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
  anvilStrength: [0, 1, 0.01],
  topCutoffSharpness: [0, 1, 0.01],
  cirrusFiberStrength: [0, 1, 0.01],
  cirrusFiberCurl: [0, 1, 0.01],
  convectiveTowerStrength: [0, 1, 0.01],
  convectiveCellScale: [0, 1, 0.01],
  edgeHardness: [0, 1, 0.01],
  edgeErosionStrength: [0, 1, 0.01],
};

const RESERVED_PRESET_FIELDS = new Set<ShapeKey>(['cloudHeight', 'altBase', 'altTop']);
const MORPHOLOGY_BASE_FIELDS = new Set<ShapeKey>(['edgeSharpness']);

function presetToCode(key: string): string {
  const p = CLOUD_PRESETS[key];
  const fields = BASE_PRESET_KEYS.map((k) => `${k}: ${p[k]}`).join(', ');
  const morphology = MORPHOLOGY_PRESET_KEYS.map((k) => `${k}: ${p.morphology[k]}`).join(', ');
  const edgeStyle = EDGE_STYLE_PRESET_KEYS.map((k) => `${k}: ${p.edgeStyle[k]}`).join(', ');
  return `  ${key}: { ${fields}, morphology: { ${morphology} }, edgeStyle: { ${edgeStyle} } },`;
}

function allPresetsToCode(): string {
  return Object.keys(CLOUD_PRESETS).map(presetToCode).join('\n');
}

export interface ScenarioState {
  enabled: boolean;
  playing: boolean;
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

export function createGui(params: CloudParams, store: BodyStore, timeline: TimelineState, simulation: SimulationState, scenario: ScenarioState, hooks: GuiHooks): CloudGui {
  const presetKeys = Object.keys(CLOUD_PRESETS);
  const api: CloudGui = { refreshTimeline() {}, refreshScenario() {}, refreshBodies() {} };
  let gui: GUI | null = null;

  function build(): void {
    if (gui) gui.destroy();
    gui = new GUI({ title: t('title'), closeFolders: true });

    const langSel = document.createElement('select');
    langSel.title = tip('language');
    for (const [label, val] of [['English', 'en'], ['中文', 'zh']] as const) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === getLang()) opt.selected = true;
      langSel.appendChild(opt);
    }
    langSel.style.cssText = 'float:right;margin-right:6px;font:11px sans-serif;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:0 2px';
    langSel.addEventListener('click', (e) => e.stopPropagation());
    langSel.addEventListener('change', () => { setLang(langSel.value as Lang); build(); });
    gui.$title.appendChild(langSel);

    const bodiesFolder = gui.addFolder(t('cloudBodies'));
    let subFolders: GUI[] = [];
    const gizmoSyncs: Array<() => void> = [];

    function rebuildBodies(): void {
      const openIds = new Set(subFolders.filter((f) => !f._closed).map((f) => f._title));
      const prevIds = new Set(subFolders.map((f) => f._title));
      gizmoSyncs.length = 0;
      for (const f of subFolders) f.destroy();
      subFolders = [];
      for (const b of store.list()) {
        const f = bodiesFolder.addFolder(b.id);
        subFolders.push(f);

        f.$title.textContent = '';
        const titleText = document.createTextNode(`${b.id} `);
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
        typeSel.addEventListener('change', () => {
          store.setType(b.id, typeSel.value);
          rebuildBodies();
          hooks.onBodiesChanged();
        });
        const moveBtn = document.createElement('button');
        moveBtn.textContent = '✥';
        moveBtn.title = tip('gizmoMove');
        const rotBtn = document.createElement('button');
        rotBtn.textContent = '⟳';
        rotBtn.title = tip('gizmoRotate');
        const scaleBtn = document.createElement('button');
        scaleBtn.textContent = '⤢';
        scaleBtn.title = tip('gizmoScale');
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = t('remove');
        for (const btn of [moveBtn, rotBtn, scaleBtn, delBtn]) btn.style.cssText = 'font:12px sans-serif;line-height:1;padding:1px 4px;cursor:pointer;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px';
        const syncGizmoBtns = () => {
          const active = params.selectedBody === b.id;
          moveBtn.style.background = active && params.gizmoMode === 'move' ? '#2f6db0' : '#2a2a2a';
          rotBtn.style.background = active && params.gizmoMode === 'rotate' ? '#2f6db0' : '#2a2a2a';
          scaleBtn.style.background = active && params.gizmoMode === 'scale' ? '#2f6db0' : '#2a2a2a';
        };
        const setGizmo = (mode: 'move' | 'rotate' | 'scale') => {
          if (params.selectedBody === b.id && params.gizmoMode === mode) {
            params.gizmoMode = null;
          } else {
            params.selectedBody = b.id;
            params.gizmoMode = mode;
          }
          gizmoSyncs.forEach((sync) => sync());
        };
        moveBtn.addEventListener('click', (e) => { e.stopPropagation(); setGizmo('move'); });
        rotBtn.addEventListener('click', (e) => { e.stopPropagation(); setGizmo('rotate'); });
        scaleBtn.addEventListener('click', (e) => { e.stopPropagation(); setGizmo('scale'); });
        gizmoSyncs.push(syncGizmoBtns);
        syncGizmoBtns();
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); store.remove(b.id); if (params.selectedBody === b.id) { params.selectedBody = null; params.gizmoMode = null; } rebuildBodies(); hooks.onBodiesChanged(); });
        actions.append(typeSel, moveBtn, rotBtn, scaleBtn, delBtn);
        f.$title.appendChild(actions);

        const lim = params.boxHalfExtent;
        const proxy = {
          cx: (b.bounds[0] + b.bounds[2]) / 2,
          cz: (b.bounds[1] + b.bounds[3]) / 2,
          hw: (b.bounds[2] - b.bounds[0]) / 2,
          hd: (b.bounds[3] - b.bounds[1]) / 2,
        };
        const apply = () => {
          store.update(b.id, { bounds: [proxy.cx - proxy.hw, proxy.cz - proxy.hd, proxy.cx + proxy.hw, proxy.cz + proxy.hd] });
          hooks.onBodiesChanged();
        };
        tipKey(f.add(proxy, 'cx', -lim, lim, 100).name(t('centerX')).onChange(apply), 'centerX');
        tipKey(f.add(proxy, 'cz', -lim, lim, 100).name(t('centerZ')).onChange(apply), 'centerZ');
        tipKey(f.add(proxy, 'hw', 100, lim, 100).name(t('halfW')).onChange(apply), 'halfW');
        tipKey(f.add(proxy, 'hd', 100, lim, 100).name(t('halfD')).onChange(apply), 'halfD');
        tipKey(f.add(b, 'feather', 0, Math.min(5000, lim), 50).name(t('feather')).onChange(() => { b.placementLocked = true; hooks.onBodiesChanged(); }), 'feather');
        const bh = params.cloudHeight;
        tipKey(f.add(b, 'base', 0, Math.max(1, bh - 1), 100).name(t('height')).onChange(() => { b.placementLocked = true; hooks.onBodiesChanged(); }), 'height');
        tipKey(f.add(b, 'thickness', 1, bh, 100).name(t('thickness')).onChange(() => { b.placementLocked = true; hooks.onBodiesChanged(); }), 'thickness');
        tipKey(f.add({ applyGenusDefaults: () => { store.applyTypeDefaults(b.id); rebuildBodies(); hooks.onBodiesChanged(); } }, 'applyGenusDefaults').name(t('applyGenusDefaults')), 'applyGenusDefaults');
        tipKey(f.add(b, 'coverage', 0.0, 1.0, 0.01).name(t('coverage')).onChange(hooks.onBodiesChanged), 'coverage');
        tipKey(f.add(b, 'densityScale', 0.0, 2.0, 0.01).name(t('density')).onChange(hooks.onBodiesChanged), 'density');
        tipKey(f.add(b, 'windDeg', 0, 360, 1).name(t('windDir')).onChange(hooks.onBodiesChanged), 'windDir');
        let lastValidWindSpeed = b.windSpeedMps;
        const windProxy = { windSpeedMps: b.windSpeedMps };
        const windSpeedCtrl = tipKey(f.add(windProxy, 'windSpeedMps').name(t('windSpeed')).onChange(() => {
          const next = Number(windProxy.windSpeedMps);
          if (!Number.isFinite(next) || next < 0) {
            windProxy.windSpeedMps = lastValidWindSpeed;
            windSpeedCtrl.updateDisplay();
            return;
          }
          lastValidWindSpeed = next;
          b.windSpeedMps = next;
          const high = next > WIND_DEMO_MAX_MPS;
          windSpeedCtrl.domElement.style.outline = high ? '1px solid #d89b2b' : '';
          windSpeedCtrl.domElement.title = high ? `${tip('windSpeed')} ${t('windHighWarning')}` : tip('windSpeed');
          hooks.onBodiesChanged();
        }), 'windSpeed');
        if (b.windSpeedMps > WIND_DEMO_MAX_MPS) {
          windSpeedCtrl.domElement.style.outline = '1px solid #d89b2b';
          windSpeedCtrl.domElement.title = `${tip('windSpeed')} ${t('windHighWarning')}`;
        }
        tipKey(f.add(b, 'morphRate', 0.0, 1.0, 0.01).name(t('morphRate')).onChange(hooks.onBodiesChanged), 'morphRate');

        const lf = f.addFolder(t('lifecycle'));
        tipKey(lf.add(b.life, 'enabled').name(t('enable')).onChange(hooks.onTrigger), 'enable');
        tipKey(lf.add(b.life, 'birth', 0, 120, 0.5).name(t('birth')).onChange(hooks.onBodiesChanged), 'birth');
        tipKey(lf.add(b.life, 'grow', 0, 120, 0.5).name(t('grow')).onChange(hooks.onBodiesChanged), 'grow');
        tipKey(lf.add(b.life, 'decay', 0, 120, 0.5).name(t('decay')).onChange(hooks.onBodiesChanged), 'decay');
        tipKey(lf.add(b.life, 'death', 0, 120, 0.5).name(t('death')).onChange(hooks.onBodiesChanged), 'death');
        tipKey(lf.add(b.life, 'peak', 0.0, 2.0, 0.05).name(t('peak')).onChange(hooks.onBodiesChanged), 'peak');

        if (openIds.has(b.id) || (!prevIds.has(b.id) && params.selectedBody === b.id)) f.open();
      }
    }

    tipKey(bodiesFolder.add({ addRect: () => { const b = store.add(); params.selectedBody = b.id; rebuildBodies(); hooks.onBodiesChanged(); } }, 'addRect').name(t('addRect')), 'addRect');
    rebuildBodies();

    const globalFolder = gui.addFolder(t('global'));
    const simulationRateRow = document.createElement('div');
    simulationRateRow.className = 'lil-controller simulation-rate-buttons';
    simulationRateRow.title = tip('simulationRate');
    const simulationRateName = document.createElement('div');
    simulationRateName.className = 'lil-name';
    simulationRateName.textContent = t('simulationRate');
    const simulationRateWidget = document.createElement('div');
    simulationRateWidget.className = 'lil-widget';
    const simulationRateButtons = SIMULATION_RATES.map((rate) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${rate}×`;
      button.setAttribute('aria-label', `${t('simulationRate')} ${rate}×`);
      button.addEventListener('click', () => {
        simulation.rate = rate;
        simulationRateButtons.forEach((candidate, index) => {
          candidate.setAttribute('aria-pressed', String(SIMULATION_RATES[index] === simulation.rate));
        });
      });
      simulationRateWidget.appendChild(button);
      return button;
    });
    simulationRateButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(SIMULATION_RATES[index] === simulation.rate));
    });
    simulationRateRow.append(simulationRateName, simulationRateWidget);
    globalFolder.$children.appendChild(simulationRateRow);
    tipKey(globalFolder.add({ resetTime: hooks.onTrigger }, 'resetTime').name(t('resetTime')), 'resetTime');
    tipKey(globalFolder.add({ resetWindAdvection: hooks.onResetWindAdvection }, 'resetWindAdvection').name(t('resetWindAdvection')), 'resetWindAdvection');
    tipKey(globalFolder.add(params, 'showBodyBounds').name(t('showWireframe')), 'showWireframe');
    tipKey(globalFolder.add(params, 'showAxes').name(t('showAxes')), 'showAxes');
    tipKey(globalFolder.add(params, 'boxHalfExtent', 1000, 100000, 500).name(t('boxHalfExtent')), 'boxHalfExtent');
    tipKey(globalFolder.add(params, 'cloudHeight', 1000, 30000, 500).name(t('boxHeight')).onChange(() => { rebuildBodies(); hooks.onBodiesChanged(); }), 'boxHeight');
    addLogScaleSlider(globalFolder, params, 'verticalMetersPerWorldUnit', t('verticalMetersPerWorldUnit'), 'verticalMetersPerWorldUnit');
    addLogScaleSlider(globalFolder, params, 'horizontalMetersPerWorldUnit', t('horizontalMetersPerWorldUnit'), 'horizontalMetersPerWorldUnit');
    tipKey(globalFolder.add(params, 'enforcePhysicalPlacement').name(t('enforcePhysicalPlacement')).onChange(hooks.onBodiesChanged), 'enforcePhysicalPlacement');
    tipKey(globalFolder.add(params, 'weatherSize', 64, 1024, 1).name(t('weatherSize')).onFinishChange((v: number) => {
      const next = Math.max(64, Math.min(1024, Math.round(v)));
      params.weatherSize = next;
      hooks.onWeatherSize(next);
    }), 'weatherSize');
    tipKey(globalFolder.add(params, 'verticalEdgeRange', 0.0, 2.0, 0.01).name(t('verticalEdgeRange')), 'verticalEdgeRange');
    tipKey(globalFolder.add(params, 'verticalEdgeShape', 0.1, 8.0, 0.05).name(t('verticalEdgeShape')), 'verticalEdgeShape');
    tipKey(globalFolder.add(params, 'morphStrength', 0.0, 1.0, 0.01).name(t('morphStrength')), 'morphStrength');
    tipKey(globalFolder.add(params, 'cornerRadius', 0.0, 2.0, 0.05).name(t('cornerRadius')), 'cornerRadius');
    tipKey(globalFolder.add(params, 'edgeCurveWidth', 0.1, 1.0, 0.01).name(t('edgeCurveWidth')), 'edgeCurveWidth');
    tipKey(globalFolder.add(params, 'edgeCurveShaper', 0.25, 4.0, 0.05).name(t('edgeCurveShaper')), 'edgeCurveShaper');

    const scenarioFolder = gui.addFolder(t('scenario'));
    tipKey(scenarioFolder.add(scenario, 'enabled').name(t('enableScenario')), 'enableScenario');
    tipKey(scenarioFolder.add(scenario, 'playing').name(t('playPause')), 'playPause');
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
    tipKey(lightFolder.add(params, 'fxAbsorption').name(t('fxAbsorption')), 'fxAbsorption');
    tipKey(lightFolder.add(params, 'godrayStrength', 0.0, 2.0, 0.01).name(t('godRays')), 'godRays');
    tipKey(lightFolder.add(params, 'aerialDensity', 0, 0.2, 0.001).name(t('aerialDensity')), 'aerialDensity');
    tipKey(lightFolder.add(params, 'aerialInscatter', 0, 2, 0.01).name(t('aerialInscatter')), 'aerialInscatter');
    tipKey(lightFolder.add(params, 'aerialHeightFalloff', 0, 1, 0.01).name(t('aerialHeightFalloff')), 'aerialHeightFalloff');
    tipKey(lightFolder.add(params, 'shadowTintStrength', 0, 1, 0.01).name(t('shadowTintStrength')), 'shadowTintStrength');

    function openCompare(initA: string): void {
      const fields = SHAPE_PRESET_KEYS.filter((k) => !RESERVED_PRESET_FIELDS.has(k));
      const cols: string[] = [initA, presetKeys.find((k) => k !== initA) ?? initA];

      const panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10000;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,0.6);max-height:85vh';
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px';
      const compTitle = document.createElement('span');
      compTitle.textContent = t('comparePresets');
      compTitle.style.cssText = 'font:13px sans-serif;color:#9cf';
      const topBtns = document.createElement('div');
      topBtns.style.cssText = 'display:flex;gap:6px';
      const addColBtn = document.createElement('button');
      addColBtn.textContent = '+';
      addColBtn.title = t('comparePresets');
      const closeBtn = document.createElement('button');
      closeBtn.textContent = t('close');
      for (const b of [addColBtn, closeBtn]) b.style.cssText = 'padding:2px 12px;cursor:pointer;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;font:12px sans-serif';
      closeBtn.addEventListener('click', () => panel.remove());
      addColBtn.addEventListener('click', () => { cols.push(presetKeys[0]); render(); });
      topBtns.append(addColBtn, closeBtn);
      topRow.append(compTitle, topBtns);

      const body = document.createElement('div');
      body.style.cssText = 'display:flex;gap:8px;overflow:auto';
      panel.append(topRow, body);
      document.body.appendChild(panel);

      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString());

      function render(): void {
        body.innerHTML = '';

        const labelCol = document.createElement('div');
        labelCol.style.cssText = 'display:flex;flex-direction:column;flex:0 0 auto';
        const labelHead = document.createElement('div');
        labelHead.style.cssText = 'height:26px';
        labelCol.appendChild(labelHead);
        for (const k of fields) {
          const cell = document.createElement('div');
          cell.textContent = presetFieldName(k);
          cell.title = presetFieldDesc(k);
          cell.style.cssText = 'height:24px;line-height:24px;padding-right:10px;font:12px sans-serif;color:#bbb;white-space:nowrap';
          labelCol.appendChild(cell);
        }
        body.appendChild(labelCol);

        cols.forEach((preset, ci) => {
          const col = document.createElement('div');
          col.style.cssText = 'display:flex;flex-direction:column;flex:0 0 auto;border-left:1px solid #333;padding-left:8px';
          const sel = document.createElement('select');
          sel.style.cssText = 'height:26px;font:12px sans-serif;background:#2a2a2a;color:#9cf;border:1px solid #555;border-radius:3px;padding:0 2px';
          for (const k of presetKeys) {
            const o = document.createElement('option');
            o.value = k; o.textContent = cloudTypeName(k);
            if (k === preset) o.selected = true;
            sel.appendChild(o);
          }
          sel.addEventListener('change', () => { cols[ci] = sel.value; render(); });
          col.appendChild(sel);

          const p = CLOUD_PRESETS[preset];
          for (const k of fields) {
            const [lo, hi, step] = PRESET_FIELD_RANGE[k];
            const value = getPresetField(p, k);
            const differs = cols.some((other) => getPresetField(CLOUD_PRESETS[other], k) !== value);
            const cell = document.createElement('div');
            cell.style.cssText = `height:24px;display:flex;align-items:center;gap:6px;padding:0 4px;border-radius:3px;background:${differs ? '#3a2a14' : 'transparent'}`;
            const sld = document.createElement('input');
            sld.type = 'range';
            sld.min = String(lo); sld.max = String(hi); sld.step = String(step);
            sld.value = String(value);
            sld.style.cssText = 'flex:1;width:110px;accent-color:#5af';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = fmt(value);
            inp.min = String(lo); inp.max = String(hi); inp.step = String(step);
            inp.style.cssText = 'height:20px;width:64px;text-align:right;font:12px monospace;background:#0e0e0e;color:#cfe;border:1px solid #333;border-radius:3px';
            const apply = (v: number, redraw: boolean) => {
              if (Number.isNaN(v)) return;
              setPresetField(p, k, v); hooks.onPresetsChanged();
              if (redraw) { render(); } else { inp.value = fmt(v); sld.value = String(v); }
            };
            sld.addEventListener('input', () => apply(parseFloat(sld.value), false));
            sld.addEventListener('change', () => render());
            inp.addEventListener('change', () => apply(parseFloat(inp.value), true));
            cell.append(sld, inp);
            col.appendChild(cell);
          }
          body.appendChild(col);
        });
      }
      render();
    }

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
        ? '该云属的形态、边缘风格与光照模板。形态会改变缓存密度；边缘风格只影响取样后的渲染响应。'
        : 'Morphology, edge style, and lighting for this genus. Morphology changes cached density; edge style changes only post-sample rendering.');
      const p = CLOUD_PRESETS[editState.preset];
      const generalFolder = fieldsFolder.addFolder(t('presetProperties'));
      const morphologyFolder = fieldsFolder.addFolder(t('presetMorphology'));
      const edgeStyleFolder = fieldsFolder.addFolder(t('presetEdgeStyle'));
      tipFolder(morphologyFolder, getLang() === 'zh'
        ? '云属宏观结构；修改后会在后续密度缓存刷新中生效。'
        : 'Genus macro structure; changes enter the density cache on subsequent refreshes.');
      tipFolder(edgeStyleFolder, getLang() === 'zh'
        ? '取样后的边缘渲染；不改变密度缓存中的砧顶、顶部或云底结构。'
        : 'Post-sample edge rendering; never changes cached anvil, top, or base structure.');

      const addField = (folder: GUI, target: Record<string, number>, k: ShapeKey) => {
        const [lo, hi, step] = PRESET_FIELD_RANGE[k];
        tipText(folder.add(target, k, lo, hi, step).name(presetFieldName(k)).onChange(hooks.onPresetsChanged), presetFieldDesc(k));
      };

      for (const k of BASE_PRESET_KEYS) {
        if (RESERVED_PRESET_FIELDS.has(k) || MORPHOLOGY_BASE_FIELDS.has(k)) continue;
        addField(generalFolder, p as unknown as Record<string, number>, k);
      }
      for (const k of MORPHOLOGY_BASE_FIELDS) {
        addField(morphologyFolder, p as unknown as Record<string, number>, k);
      }
      for (const k of MORPHOLOGY_PRESET_KEYS) {
        addField(morphologyFolder, p.morphology as Record<string, number>, k);
      }
      for (const k of EDGE_STYLE_PRESET_KEYS) {
        addField(edgeStyleFolder, p.edgeStyle as Record<string, number>, k);
      }
    }
    const typeOpts: Record<string, string> = {};
    for (const k of presetKeys) typeOpts[cloudTypeName(k)] = k;
    tipKey(presetFolder.add(editState, 'preset', typeOpts).name(t('editPreset')).onChange(rebuildFields), 'editPreset');
    tipKey(presetFolder.add({ compare: () => openCompare(editState.preset) }, 'compare').name(t('comparePresets')), 'comparePresets');
    tipKey(presetFolder.add({ copy: () => copyToClipboard(presetToCode(editState.preset)) }, 'copy').name(t('copyPreset')), 'copyPreset');
    tipKey(presetFolder.add({ copyAll: () => copyToClipboard(allPresetsToCode()) }, 'copyAll').name(t('copyAllPresets')), 'copyAllPresets');
    rebuildFields();

    const renderFolder = gui.addFolder(t('render'));

    const marchFolder = renderFolder.addFolder(t('renderMarch'));
    tipKey(marchFolder.add(params, 'skipLight').name(t('skipLight')), 'skipLight');
    tipKey(marchFolder.add(params, 'adaptiveMarch').name(t('adaptiveMarch')), 'adaptiveMarch');
    tipKey(marchFolder.add(params, 'temporalDither').name(t('temporalDither')), 'temporalDither');
    tipKey(marchFolder.add(params, 'rayMarchSteps', 8, 256, 1).name(t('raySteps')), 'raySteps');
    tipKey(marchFolder.add(params, 'lightMarchSteps', 1, 24, 1).name(t('lightSteps')), 'lightSteps');
    tipKey(marchFolder.add(params, 'lightMarchStepSize', 0.01, 1.0, 0.01).name(t('lightMarchStepSize')), 'lightMarchStepSize');
    tipKey(marchFolder.add(params, 'shadowDarkness', 0.5, 20.0, 0.1).name(t('shadowDark')), 'shadowDark');
    tipKey(marchFolder.add(params, 'sunIntensity', 0.5, 20.0, 0.1).name(t('sunIntensity')), 'sunIntensity');

    const groundShadowFolder = renderFolder.addFolder(t('groundShadow'));
    tipKey(groundShadowFolder.add(params, 'groundShadowMode', { Legacy: 0, Adaptive: 1, Transmittance: 2 }).name(t('groundShadowMode')), 'groundShadowMode');
    tipKey(groundShadowFolder.add(params, 'groundShadowMaxSteps', 8, 64, 1).name(t('groundShadowMaxSteps')), 'groundShadowMaxSteps');
    tipKey(groundShadowFolder.add(params, 'groundShadowStepScale', 0.25, 4.0, 0.05).name(t('groundShadowStepScale')), 'groundShadowStepScale');
    tipKey(groundShadowFolder.add(params, 'groundShadowJitter', 0.0, 1.0, 0.01).name(t('groundShadowJitter')), 'groundShadowJitter');
    tipKey(groundShadowFolder.add(params, 'groundShadowMapResolution', { '256': 256, '512': 512, '1024': 1024 }).name(t('groundShadowMapResolution')), 'groundShadowMapResolution');
    tipKey(groundShadowFolder.add(params, 'groundShadowMapUpdateRate', 1, 8, 1).name(t('groundShadowMapUpdateRate')), 'groundShadowMapUpdateRate');
    tipKey(groundShadowFolder.add(params, 'groundShadowHistoryWeight', 0.0, 0.98, 0.01).name(t('groundShadowHistoryWeight')), 'groundShadowHistoryWeight');
    tipKey(groundShadowFolder.add(params, 'groundShadowFilterRadius', 0, 2, 1).name(t('groundShadowFilterRadius')), 'groundShadowFilterRadius');

    const aaFolder = renderFolder.addFolder(t('renderAA'));
    tipKey(aaFolder.add(params, 'taaEnabled').name(t('taaEnabled')), 'taaEnabled');
    tipKey(aaFolder.add(params, 'taaBlend', 0.5, 0.98, 0.01).name(t('taaBlend')), 'taaBlend');

    const cacheFolder = renderFolder.addFolder(t('renderCache'));
    tipKey(cacheFolder.add(params, 'cacheResolution', 32, 256, 1).name(t('cacheRes')).onFinishChange((v: number) => {
      const next = Math.max(32, Math.min(256, Math.round(v)));
      params.cacheResolution = next;
      hooks.onCacheResolution(next);
    }), 'cacheRes');
    tipKey(cacheFolder.add(params, 'cacheUpdateRate', 1, 8, 1).name(t('cacheUpdate')), 'cacheUpdate');
    tipKey(cacheFolder.add(params, 'cacheSmooth', 0.0, 0.95, 0.01).name(t('cacheSmooth')), 'cacheSmooth');
    tipKey(cacheFolder.add(params, 'qualityMode', { Cached: 0, Hybrid: 1, Realtime: 2 }).name(t('qualityMode')), 'qualityMode');
    tipKey(cacheFolder.add(params, 'detailFreq', 0.5, 16.0, 0.1).name(t('detailFreq')), 'detailFreq');
    tipKey(cacheFolder.add(params, 'detailStrength', 0.0, 4.0, 0.01).name(t('detailStrength')), 'detailStrength');
    const wgProxy = {
      x: params.cacheWorkgroupX,
      y: params.cacheWorkgroupY,
      z: params.cacheWorkgroupZ,
    };
    const applyWg = () => {
      params.cacheWorkgroupX = wgProxy.x;
      params.cacheWorkgroupY = wgProxy.y;
      params.cacheWorkgroupZ = wgProxy.z;
      hooks.onCacheWorkgroup(wgProxy.x, wgProxy.y, wgProxy.z);
    };
    tipKey(cacheFolder.add(wgProxy, 'x', 1, 32, 1).name(t('cacheWgX')).onFinishChange(applyWg), 'cacheWgX');
    tipKey(cacheFolder.add(wgProxy, 'y', 1, 32, 1).name(t('cacheWgY')).onFinishChange(applyWg), 'cacheWgY');
    tipKey(cacheFolder.add(wgProxy, 'z', 1, 16, 1).name(t('cacheWgZ')).onFinishChange(applyWg), 'cacheWgZ');

    const edgeFolder = renderFolder.addFolder(t('renderEdge'));
    tipKey(edgeFolder.add(params, 'edgeSharpening').name(t('edgeSharpening')), 'edgeSharpening');
    tipKey(edgeFolder.add(params, 'edgeHardness', 0.0, 2.0, 0.01).name(t('edgeHardness')), 'edgeHardness');
    tipKey(edgeFolder.add(params, 'edgeHardnessThreshold', 0.001, 0.5, 0.001).name(t('edgeHardnessThreshold')), 'edgeHardnessThreshold');

    const postFolder = renderFolder.addFolder(t('renderPost'));
    tipKey(postFolder.add(params, 'bloomEnabled').name(t('bloomEnabled')), 'bloomEnabled');
    tipKey(postFolder.add(params, 'bloomThreshold', 0.0, 3.0, 0.01).name(t('bloomThreshold')), 'bloomThreshold');
    tipKey(postFolder.add(params, 'bloomAmount', 0.0, 2.0, 0.01).name(t('bloomAmount')), 'bloomAmount');
    tipKey(postFolder.add(params, 'tonemapMode', { Reinhard: 0, ACES: 1, AgX: 2 }).name(t('tonemap')), 'tonemap');
    tipKey(postFolder.add(params, 'exposure', 0.1, 3.0, 0.01).name(t('exposure')), 'exposure');

    const debugFolder = gui.addFolder(t('debug'));
    const debugOptions: Record<string, number> = {};
    debugOptions[t('debugOff')] = 0;
    debugOptions[t('debugTransmittance')] = 1;
    debugOptions[t('debugScattering')] = 2;
    debugOptions[t('debugStepHeatmap')] = 3;
    debugOptions[t('debugWeatherCoverage')] = 4;
    debugOptions[t('debugRegionBounds')] = 5;
    debugOptions[t('debugCloudDepth')] = 6;
    tipKey(debugFolder.add(params, 'debugView', debugOptions).name(t('debugView')), 'debugView');
    tipKey(debugFolder.add(params, 'measureLightShare').name(t('measureLight')), 'measureLight');

    gui.foldersRecursive().forEach((f) => f.close());

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
