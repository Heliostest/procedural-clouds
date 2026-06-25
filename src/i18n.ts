export type Lang = 'en' | 'zh';

type Dict = Record<string, { en: string; zh: string }>;

const DICT: Dict = {
  title: { en: 'Cloud Parameters', zh: '云朵参数' },
  language: { en: 'Language', zh: '语言' },

  cloudBodies: { en: 'Cloud Bodies', zh: '云体' },
  select: { en: '◉ Select', zh: '◉ 选中' },
  centerX: { en: 'Center X', zh: '中心 X' },
  centerZ: { en: 'Center Z', zh: '中心 Z' },
  halfW: { en: 'Half W', zh: '半宽' },
  halfD: { en: 'Half D', zh: '半深' },
  radius: { en: 'Radius', zh: '半径' },
  feather: { en: 'Feather', zh: '羽化' },
  height: { en: 'Height', zh: '高度' },
  thickness: { en: 'Thickness', zh: '厚度' },
  type: { en: 'Type', zh: '类型' },
  coverage: { en: 'Coverage', zh: '覆盖度' },
  density: { en: 'Density', zh: '密度' },
  windDir: { en: 'Wind Dir °', zh: '风向 °' },
  windSpeed: { en: 'Wind Speed', zh: '风速' },
  morphRate: { en: 'Morph Rate', zh: '变形速率' },
  lifecycle: { en: 'Lifecycle', zh: '生命周期' },
  enable: { en: 'Enable', zh: '启用' },
  birth: { en: 'Birth', zh: '生成' },
  grow: { en: 'Grow', zh: '生长' },
  decay: { en: 'Decay', zh: '衰减' },
  death: { en: 'Death', zh: '消亡' },
  peak: { en: 'Peak', zh: '峰值' },
  remove: { en: '✕ Remove', zh: '✕ 删除' },
  addRect: { en: '+ Add Rect', zh: '+ 添加矩形' },
  addCircle: { en: '+ Add Circle', zh: '+ 添加圆形' },

  showWireframe: { en: 'Show Wireframe', zh: '显示线框' },
  boxHeight: { en: 'Box Height', zh: '盒体高度' },
  morphStrength: { en: 'Morph Strength', zh: '变形强度' },

  scenario: { en: 'Scenario', zh: '场景' },
  enableScenario: { en: 'Enable Scenario', zh: '启用场景' },
  playPause: { en: 'Play / Pause', zh: '播放 / 暂停' },
  speed: { en: 'Speed', zh: '速度' },
  loop: { en: 'Loop', zh: '循环' },
  timeline: { en: 'Timeline', zh: '时间轴' },
  triggerNow: { en: 'Trigger Now (t=0)', zh: '立即触发 (t=0)' },
  scrubTime: { en: 'Scrub Time', zh: '拖动时间' },
  sceneTime: { en: 'Scene Time', zh: '场景时间' },
  loadDemo: { en: 'Load Demo', zh: '加载示例' },
  loadJson: { en: 'Load JSON…', zh: '加载 JSON…' },
  pasteJson: { en: 'Paste JSON…', zh: '粘贴 JSON…' },
  exportJson: { en: 'Export JSON', zh: '导出 JSON' },

  lighting: { en: 'Lighting', zh: '光照' },
  sunAzimuth: { en: 'Sun Azimuth °', zh: '太阳方位角 °' },
  sunElevation: { en: 'Sun Elevation °', zh: '太阳高度角 °' },
  silverLining: { en: 'Silver Lining', zh: '银边' },
  powder: { en: 'Powder', zh: '粉末效果' },
  hgForward: { en: 'HG Forward', zh: 'HG 前向' },
  hgBackward: { en: 'HG Backward', zh: 'HG 后向' },
  hgBlend: { en: 'HG Blend', zh: 'HG 混合' },
  godRays: { en: 'God Rays', zh: '体积光' },

  render: { en: 'Render', zh: '渲染' },
  skipLight: { en: 'Skip Light March', zh: '跳过光照步进' },
  raySteps: { en: 'Ray Steps', zh: '光线步数' },
  lightSteps: { en: 'Light Steps', zh: '光照步数' },
  shadowDark: { en: 'Shadow Dark', zh: '阴影深度' },
  sunIntensity: { en: 'Sun Intensity', zh: '太阳强度' },
  cacheRes: { en: 'Cache Res', zh: '缓存分辨率' },
  cacheUpdate: { en: 'Cache Update', zh: '缓存更新' },
  cacheSmooth: { en: 'Cache Smooth', zh: '缓存平滑' },

  pastePlaceholder: { en: 'Paste Scenario JSON then click Apply', zh: '粘贴 Scenario JSON 后点 Apply' },
  apply: { en: 'Apply', zh: '应用' },
  close: { en: 'Close', zh: '关闭' },

  dbgMode: { en: 'mode', zh: '模式' },
  dbgScenario: { en: 'SCENARIO', zh: '场景' },
  dbgManual: { en: 'manual', zh: '手动' },
  dbgClock: { en: 'clock', zh: '时钟' },
  dbgPlayhead: { en: 'playhead', zh: '播放头' },
  dbgScrub: { en: 'scrub', zh: '拖动' },
  dbgBodies: { en: 'bodies', zh: '云体' },
  dbgSelected: { en: 'selected', zh: '选中' },
  dbgError: { en: 'ERROR', zh: '错误' },

  info: { en: 'Drag to orbit · Scroll to zoom · WebGPU Procedural Clouds', zh: '拖动旋转 · 滚轮缩放 · WebGPU 程序化云朵' },
};

const CLOUD_TYPES: Record<string, { en: string; zh: string }> = {
  cumulus: { en: 'Cumulus', zh: '积云' },
  stratus: { en: 'Stratus', zh: '层云' },
  stratocumulus: { en: 'Stratocumulus', zh: '层积云' },
  cumulonimbus: { en: 'Cumulonimbus', zh: '积雨云' },
  altocumulus: { en: 'Altocumulus', zh: '高积云' },
  altostratus: { en: 'Altostratus', zh: '高层云' },
  nimbostratus: { en: 'Nimbostratus', zh: '雨层云' },
  cirrus: { en: 'Cirrus', zh: '卷云' },
  cirrostratus: { en: 'Cirrostratus', zh: '卷层云' },
  cirrocumulus: { en: 'Cirrocumulus', zh: '卷积云' },
};

export function cloudTypeName(key: string): string {
  return CLOUD_TYPES[key]?.[lang] ?? key;
}

let lang: Lang = ((): Lang => {
  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) as Lang | null;
  if (saved === 'en' || saved === 'zh') return saved;
  return (typeof navigator !== 'undefined' && navigator.language.startsWith('zh')) ? 'zh' : 'en';
})();

const listeners = new Set<() => void>();

export function t(key: keyof typeof DICT): string {
  return DICT[key]?.[lang] ?? String(key);
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  if (typeof localStorage !== 'undefined') localStorage.setItem('lang', next);
  for (const cb of listeners) cb();
}

export function onLangChange(cb: () => void): void {
  listeners.add(cb);
}
