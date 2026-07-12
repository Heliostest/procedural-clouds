import { GENUS_ARTISTIC } from './genusArtistic';

export type Lang = 'en' | 'zh';

type Dict = Record<string, { en: string; zh: string }>;

const DICT: Dict = {
  title: { en: 'Cloud Parameters', zh: '云朵参数' },
  language: { en: 'Language', zh: '语言' },

  cloudBodies: { en: 'Cloud Bodies', zh: '云体' },
  select: { en: '◉ Select', zh: '◉ 选中' },
  gizmoMove: { en: 'Move', zh: '平移' },
  gizmoRotate: { en: 'Rotate', zh: '旋转' },
  gizmoScale: { en: 'Scale', zh: '缩放' },
  centerX: { en: 'Center X', zh: '中心 X' },
  centerZ: { en: 'Center Z', zh: '中心 Z' },
  halfW: { en: 'Half W', zh: '半宽' },
  halfD: { en: 'Half D', zh: '半深' },
  feather: { en: 'Feather', zh: '羽化' },
  height: { en: 'Height', zh: '高度' },
  thickness: { en: 'Thickness', zh: '厚度' },
  type: { en: 'Genus', zh: '云属' },
  coverage: { en: 'Coverage', zh: '覆盖度' },
  density: { en: 'Density', zh: '密度' },
  windDir: { en: 'Wind Dir °', zh: '风向 °' },
  windSpeed: { en: 'Wind Speed (m/s)', zh: '风速 (m/s)' },
  windHighWarning: { en: 'Warning: above the normal 0–80 m/s demo range.', zh: '警告：超过演示用正常范围 0–80 m/s。' },
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

  global: { en: 'Global', zh: '全局' },
  simulationRate: { en: 'Simulation Speed', zh: '仿真速度' },
  resetTime: { en: 'Reset Time (t=0)', zh: '重置时间 (t=0)' },
  resetWindAdvection: { en: 'Reset Wind Phase', zh: '重置平流相位' },
  comparePresets: { en: '⊞ Compare Side by Side', zh: '⊞ 并排对比' },
  showWireframe: { en: 'Show Wireframe', zh: '显示线框' },
  showAxes: { en: 'Show Axes', zh: '显示坐标系' },
  boxHalfExtent: { en: 'Box Half Extent XZ', zh: '盒体半宽 XZ' },
  verticalMetersPerWorldUnit: { en: 'Vertical m / World Unit', zh: '竖直米 / 世界单位' },
  horizontalMetersPerWorldUnit: { en: 'Horizontal m / World Unit', zh: '水平米 / 世界单位' },
  enforcePhysicalPlacement: { en: 'Enforce Physical Placement', zh: '强制物理位置' },
  applyGenusDefaults: { en: 'Apply Genus Placement', zh: '应用云属默认位置' },
  boxHeight: { en: 'Box Height', zh: '盒体高度' },
  weatherSize: { en: 'Weather Map Size', zh: '天气图分辨率' },
  verticalEdgeRange: { en: 'Vertical Edge Range', zh: '垂直包络强度' },
  verticalEdgeShape: { en: 'Vertical Edge Shape', zh: '垂直包络曲线' },
  morphStrength: { en: 'Morph Strength', zh: '变形强度' },
  cornerRadius: { en: 'Corner Radius', zh: '圆角半径' },
  edgeCurveWidth: { en: 'Edge Curve Width', zh: '曲线宽度' },
  edgeCurveShaper: { en: 'Edge Curve Shaper', zh: '曲线形状' },

  scenario: { en: 'Scenario', zh: '场景' },
  enableScenario: { en: 'Enable Scenario', zh: '启用场景' },
  playPause: { en: 'Play / Pause', zh: '播放 / 暂停' },
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
  msModel: { en: 'MS Model', zh: '多重散射模型' },
  energyConservingScatter: { en: 'Energy-Conserving Scatter', zh: '能量守恒散射积分' },
  densityShapeModel: { en: 'Density Shape Model', zh: '密度塑形模型' },
  heightAmbientModel: { en: 'Height Ambient', zh: '高度环境光' },
  hgForward: { en: 'HG Forward', zh: 'HG 前向' },
  hgBackward: { en: 'HG Backward', zh: 'HG 后向' },
  hgBlend: { en: 'HG Blend', zh: 'HG 混合' },
  typeLighting: { en: 'Genus Lighting', zh: '云属光照' },
  fxAbsorption: { en: 'Absorption', zh: '消光(按云属)' },
  godRays: { en: 'God Rays', zh: '体积光' },
  aerialDensity: { en: 'Aerial Density', zh: '大气密度' },
  aerialInscatter: { en: 'Aerial Inscatter', zh: '朝阳内散射' },
  aerialHeightFalloff: { en: 'Aerial Height Falloff', zh: '高度衰减' },
  shadowTintStrength: { en: 'Shadow Tint Strength', zh: '阴影冷色强度' },
  todPaletteBlend: { en: 'TOD Art Palette', zh: 'TOD 艺术色板' },

  presetEditor: { en: 'Preset Editor', zh: '预设编辑器' },
  editPreset: { en: 'Edit Genus', zh: '编辑云属' },
  presetProperties: { en: 'Other Properties', zh: '其他属性' },
  presetMorphology: { en: 'Genus Morphology', zh: '云属形态' },
  presetEdgeStyle: { en: 'Edge Rendering', zh: '边缘渲染' },
  copyPreset: { en: 'Copy This Preset', zh: '拷贝此预设' },
  copyAllPresets: { en: 'Copy All Presets', zh: '拷贝全部预设' },

  render: { en: 'Render', zh: '渲染' },
  renderMarch: { en: 'Ray March', zh: '光线步进' },
  renderAA: { en: 'Anti-aliasing', zh: '抗锯齿' },
  renderCache: { en: 'Density Cache', zh: '密度缓存' },
  renderEdge: { en: 'Edge Rendering', zh: '边缘渲染' },
  renderPost: { en: 'Post-process', zh: '后处理' },
  groundShadow: { en: 'Ground Cloud Shadow', zh: '地面云影' },
  skipLight: { en: 'Skip Light March', zh: '跳过光照步进' },
  adaptiveMarch: { en: 'Adaptive March', zh: '自适应步进' },
  temporalDither: { en: 'Temporal Dither', zh: '时域抖动' },
  taaEnabled: { en: 'TAA', zh: '时域抗锯齿 TAA' },
  taaBlend: { en: 'TAA History Weight', zh: 'TAA 历史权重' },
  raySteps: { en: 'Ray Steps', zh: '光线步数' },
  lightSteps: { en: 'Light Steps', zh: '光照步数' },
  shadowDark: { en: 'Shadow Dark', zh: '阴影深度' },
  sunIntensity: { en: 'Sun Intensity', zh: '太阳强度' },
  groundShadowMode: { en: 'Shadow Mode', zh: '云影模式' },
  groundShadowMaxSteps: { en: 'Max Shadow Steps', zh: '云影最大步数' },
  groundShadowStepScale: { en: 'Shadow Step Scale', zh: '云影步长倍率' },
  groundShadowJitter: { en: 'Shadow Jitter', zh: '云影抖动' },
  groundShadowMapResolution: { en: 'Map Resolution', zh: '云影图分辨率' },
  groundShadowMapUpdateRate: { en: 'Map Update Interval', zh: '云影图更新间隔' },
  groundShadowHistoryWeight: { en: 'History Weight', zh: '历史权重' },
  groundShadowFilterRadius: { en: 'Filter Radius', zh: '滤波半径' },
  cacheRes: { en: 'Cache Res', zh: '缓存分辨率' },
  cacheUpdate: { en: 'Cache Update', zh: '缓存更新' },
  cacheSmooth: { en: 'Cache Smooth', zh: '缓存平滑' },
  densityProducerMode: { en: 'Density Producer', zh: '密度生产器' },
  qualityMode: { en: 'Quality Mode', zh: '质量模式' },
  detailFreq: { en: 'Detail Freq', zh: '细节频率' },
  detailStrength: { en: 'Detail Strength', zh: '细节强度' },
  lightMarchStepSize: { en: 'Light March Step', zh: '光照步长' },
  edgeSharpening: { en: 'Edge Sharpening', zh: '边缘锐化' },
  edgeHardness: { en: 'Edge Hardness Scale', zh: '边缘硬度倍率' },
  edgeHardnessThreshold: { en: 'Edge Hardness Thr', zh: '边缘硬度阈值' },
  cacheWgX: { en: 'Cache WG X', zh: '缓存工作组 X' },
  cacheWgY: { en: 'Cache WG Y', zh: '缓存工作组 Y' },
  cacheWgZ: { en: 'Cache WG Z', zh: '缓存工作组 Z' },
  tonemap: { en: 'Tonemap', zh: '色调映射' },
  exposure: { en: 'Exposure', zh: '曝光' },
  bloomEnabled: { en: 'Bloom', zh: 'Bloom' },
  bloomThreshold: { en: 'Bloom Threshold', zh: 'Bloom 阈值' },
  bloomAmount: { en: 'Bloom Amount', zh: 'Bloom 强度' },

  pastePlaceholder: { en: 'Paste Scenario JSON then click Apply', zh: '粘贴 Scenario JSON 后点 Apply' },
  apply: { en: 'Apply', zh: '应用' },
  close: { en: 'Close', zh: '关闭' },

  dbgMode: { en: 'mode', zh: '模式' },
  dbgScenario: { en: 'SCENARIO', zh: '场景' },
  dbgManual: { en: 'manual', zh: '手动' },
  dbgClock: { en: 'clock', zh: '时钟' },
  dbgSimulation: { en: 'simulation', zh: '仿真' },
  dbgRunning: { en: 'running', zh: '运行' },
  dbgFrozen: { en: 'frozen', zh: '冻结' },
  dbgPlayhead: { en: 'playhead', zh: '播放头' },
  dbgScrub: { en: 'scrub', zh: '拖动' },
  dbgBodies: { en: 'bodies', zh: '云体' },
  dbgSelected: { en: 'selected', zh: '选中' },
  dbgError: { en: 'ERROR', zh: '错误' },
  perfTitle: { en: 'PERFORMANCE', zh: '性能' },
  perfFps: { en: 'fps', zh: '帧率' },
  perfCpu: { en: 'frame', zh: '帧耗时' },
  perfLoad: { en: 'load', zh: 'CPU负载' },
  perfGpu: { en: 'gpu', zh: 'GPU' },
  perfCloud: { en: 'cloud', zh: '云渲染' },
  perfCache: { en: 'cache', zh: '缓存' },
  perfRes: { en: 'res', zh: '分辨率' },
  perfRays: { en: 'rays', zh: '光线' },
  perfSamples: { en: 'samples/frame', zh: '采样/帧' },
  perfVoxels: { en: 'cache grid', zh: '缓存网格' },
  perfQuality: { en: 'quality', zh: '质量' },
  perfGpuNA: { en: 'GPU timing unsupported', zh: 'GPU计时不支持' },

  debug: { en: 'Debug', zh: '调试' },
  debugView: { en: 'Debug View', zh: '调试视图' },
  debugOff: { en: 'Off', zh: '关闭' },
  debugTransmittance: { en: 'Transmittance', zh: '透射率' },
  debugScattering: { en: 'Scattering', zh: '累计散射' },
  debugStepHeatmap: { en: 'Step Heatmap', zh: '步数热力' },
  debugWeatherCoverage: { en: 'Weather Coverage', zh: '天气覆盖' },
  debugRegionBounds: { en: 'Region Bounds', zh: '区域边界' },
  debugCloudDepth: { en: 'Cloud Depth', zh: '云深度' },
  debugSharedBase: { en: 'W5 Base Atlas', zh: 'W5 基础图集' },
  debugSharedDetail: { en: 'W5 Detail Atlas', zh: 'W5 细节图集' },
  debugSharedMacro: { en: 'W5 Macro Field', zh: 'W5 宏观场' },
  sharedFieldDebugSlice: { en: 'Atlas Slice', zh: '图集切片' },
  sharedFieldDebugChannel: { en: 'Field Channel', zh: '场通道' },
  sharedFieldDebugPhase: { en: 'Advection Phase', zh: '平流相位' },
  sharedFieldDebugSeams: { en: 'Show Period Seams', zh: '显示周期接缝' },
  measureLight: { en: 'Measure Light Share', zh: '测量光照占比' },
  measuring: { en: 'measuring...', zh: '测量中...' },
  lightShare: { en: 'light share', zh: '光照占比' },
  post: { en: 'post', zh: '后处理' },

  info: { en: 'WASD pan · QE height · Drag orbit · Scroll zoom · Shift faster', zh: 'WASD 平移 · QE 升降 · 拖拽环绕 · 滚轮缩放 · Shift 加速' },
};

type FieldEntry = { name: { en: string; zh: string }; desc: { en: string; zh: string } };

const PRESET_FIELDS: Record<string, FieldEntry> = {
  density: {
    name: { en: 'Density', zh: '密度' },
    desc: {
      en: 'Overall density multiplier for this genus. Higher = thicker, more opaque cloud. Multiplies with each body\'s Density.',
      zh: '该云属的整体密度倍率。越大云越厚实、越不透光。会与单个云体的“密度”相乘。',
    },
  },
  coverage: {
    name: { en: 'Coverage', zh: '覆盖度' },
    desc: {
      en: 'Base macro coverage of this genus (how much sky the blobs fill). Multiplies with each body\'s Coverage.',
      zh: '该云属的基础宏观覆盖度（团块占满天空的比例）。会与单个云体的“覆盖度”相乘。',
    },
  },
  altitude: {
    name: { en: 'Altitude Profile', zh: '高度剖面' },
    desc: {
      en: 'Vertical NOISE profile (relative ratio, NOT world units): controls how density ramps up from the bottom and where it is cut off near the top. Larger = taller vertical extent. Different from the global Box Height, which is the world-space height of the render box.',
      zh: '竖直方向的噪声剖面（相对比例，不是世界高度）：控制密度从底部爬升的方式以及顶部截断的位置。值越大云团竖直延展越高。与全局“盒体高度”不同——后者是渲染盒体的世界高度。',
    },
  },
  scale: {
    name: { en: 'Noise Scale', zh: '噪声尺度' },
    desc: {
      en: 'Sampling scale of the shape noise. Larger = bigger, smoother blobs; smaller = finer, more fragmented shapes.',
      zh: '形状噪声的采样尺度。越大云块越大越平滑；越小越细碎、形状越破碎。',
    },
  },
  detail: {
    name: { en: 'Detail', zh: '细节' },
    desc: {
      en: 'Level/frequency of the detail noise. Higher adds more small-scale ragged structure to edges and surface.',
      zh: '细节噪声的层级/频次。越大边缘和表面增加越多的小尺度碎裂结构。',
    },
  },
  cloudHeight: {
    name: { en: 'Cloud Height (reserved)', zh: '云高（保留）' },
    desc: {
      en: 'Reserved preset field. Not directly used by the current renderer — the actual vertical band of a cloud comes from each body\'s Height + Thickness. Kept for compatibility.',
      zh: '预设保留字段。当前渲染器并未直接使用——云的实际竖直范围由每个云体的“高度 + 厚度”决定。仅为兼容保留。',
    },
  },
  coverageThreshold: {
    name: { en: 'Coverage Threshold', zh: '覆盖度阈值' },
    desc: {
      en: 'Density cutoff threshold. Raising it removes low-density regions, making clouds sparser with cleaner boundaries.',
      zh: '密度裁剪阈值。抬高后会去掉低密度区域，使云更稀疏、边界更干净。',
    },
  },
  edgeSharpness: {
    name: { en: 'Density Shape Sharpness', zh: '密度形状锐度' },
    desc: {
      en: 'Pre-cache density-shape contrast inside evalBody. It changes raw cloud structure; it is not the post-sample Edge Hardness control.',
      zh: 'evalBody 中、进入缓存前的密度形状对比度。它会改变原始云体结构，不是取样后的“边缘硬度”。',
    },
  },
  baseRoundness: {
    name: { en: 'Base Roundness', zh: '底部圆润度' },
    desc: {
      en: 'Fades density toward the bottom of the cloud. Higher gives a more rounded, puffy underside.',
      zh: '让云底部的密度逐渐衰减。越大云底越圆润、越蓬松饱满。',
    },
  },
  anvilStrength: {
    name: { en: 'Anvil Strength', zh: '砧顶强度' },
    desc: {
      en: 'Genus morphology: expands only the upper horizontal footprint. Changes raw density/cache structure and is independent of edge rendering.',
      zh: '云属形态参数：只扩展高层水平足迹。它会改变原始密度/缓存结构，与边缘渲染相互独立。',
    },
  },
  topCutoffSharpness: {
    name: { en: 'Top Cutoff Sharpness', zh: '顶部截断锐度' },
    desc: {
      en: 'Genus morphology: blends from the legacy rounded top to a narrow top cutoff. It remains active when edge sharpening is disabled.',
      zh: '云属形态参数：从旧圆化顶部过渡到窄范围顶部截断。关闭边缘锐化后仍然生效。',
    },
  },
  cirrusFiberStrength: {
    name: { en: 'Cirrus Fiber Strength', zh: '卷云纤维强度' },
    desc: {
      en: 'Reshapes cirrus density into elongated body-local fibers. Zero returns the compatibility density without extra noise.',
      zh: '把卷云密度重塑为沿云体局部轴延伸的纤维。为 0 时直接返回兼容密度，不执行新增噪声。',
    },
  },
  cirrusFiberCurl: {
    name: { en: 'Cirrus Fiber Curl', zh: '卷云纤维弯曲' },
    desc: {
      en: 'Controls bounded curl warping of cirrus fibers; body rotation controls their overall direction.',
      zh: '控制卷云纤维的有界 curl 扭曲；总体方向由云体旋转控制。',
    },
  },
  convectiveTowerStrength: {
    name: { en: 'Convective Tower Strength', zh: '对流塔强度' },
    desc: {
      en: 'Adds height-gated tower and cauliflower density to cumulonimbus while preserving its base and anvil controls.',
      zh: '为积雨云增加高度门控的对流塔与花椰菜密度，同时保留云底和砧顶控制。',
    },
  },
  convectiveCellScale: {
    name: { en: 'Convective Cell Scale', zh: '对流胞元尺度' },
    desc: {
      en: 'Controls the typical lobe size of cumulonimbus convective cells.',
      zh: '控制积雨云对流胞元和花椰菜分瓣的典型尺度。',
    },
  },
  tileScale: {
    name: { en: 'Tile Scale', zh: '鱼鳞尺度' },
    desc: {
      en: 'Repeating cloudlet / fish-scale frequency for altocumulus and cirrocumulus. 0 disables; higher = finer tiles.',
      zh: '高积云/卷积云的重复云胞（鱼鳞）频率。0 关闭；越大鳞片越细。',
    },
  },
  worleyBlend: {
    name: { en: 'Worley / Perlin Blend', zh: 'Worley/Perlin 混合' },
    desc: {
      en: 'Blends between Perlin (puffy, billowing) and Worley (cellular, clumpy) noise. 0 = puffy, 1 = cellular clumps.',
      zh: '在 Perlin（蓬松翻腾）与 Worley（细胞团块）噪声之间混合。0 = 蓬松，1 = 细胞状团块。',
    },
  },
  detailStrength: {
    name: { en: 'Detail Strength', zh: '细节强度' },
    desc: {
      en: 'How strongly the detail noise modulates density. Higher = more erosion/added structure on the cloud surface.',
      zh: '细节噪声对密度的影响强度。越大云表面被侵蚀/添加的结构越多。',
    },
  },
  altBase: {
    name: { en: 'Altitude Base (reserved)', zh: '高度下界（保留）' },
    desc: {
      en: 'Intended lower bound of the genus vertical band (0 = box bottom, 1 = top). Currently the actual band is driven per-body by Height; kept for design intent.',
      zh: '云属竖直带的下界设计值（0 = 盒底，1 = 盒顶）。当前实际竖直带由每个云体的“高度”决定；此处保留设计意图。',
    },
  },
  altTop: {
    name: { en: 'Altitude Top (reserved)', zh: '高度上界（保留）' },
    desc: {
      en: 'Intended upper bound of the genus vertical band (must exceed Altitude Base). Currently the actual band is driven per-body by Height + Thickness.',
      zh: '云属竖直带的上界设计值（需大于“高度下界”）。当前实际竖直带由每个云体的“高度 + 厚度”决定。',
    },
  },
  absorptionCoeff: {
    name: { en: 'Absorption', zh: '吸收系数' },
    desc: {
      en: 'Light absorption coefficient. Higher = more opaque and darker interior; lower = thin, translucent cloud.',
      zh: '光照吸收系数。越大越不透光、内部越暗；越小越薄、越通透。',
    },
  },
  phaseForward: {
    name: { en: 'Phase Forward', zh: '前向散射' },
    desc: {
      en: 'Henyey-Greenstein forward-scatter phase: the bright glow when looking toward the sun. Higher concentrates the forward highlight.',
      zh: 'Henyey-Greenstein 前向散射相位：朝向太阳方向看时的明亮高光。越大前向高光越集中。',
    },
  },
  phaseBack: {
    name: { en: 'Phase Back', zh: '后向散射' },
    desc: {
      en: 'Back-scatter phase. Negative values scatter light toward the anti-sun side, adding a rim away from the sun.',
      zh: '后向散射相位。负值让光向背向太阳的一侧散射，在背光侧形成边缘亮光。',
    },
  },
  silverLining: {
    name: { en: 'Silver Lining', zh: '银边' },
    desc: {
      en: 'Strength of the bright rim ("silver lining") on the sun-facing edges of the cloud.',
      zh: '云朝向太阳一侧边缘的亮边（“银边”）强度。',
    },
  },
  baseDarkening: {
    name: { en: 'Base Darkening', zh: '底部压暗' },
    desc: {
      en: 'Darkens the underside of the cloud to simulate self-shadowing. Higher = darker, heavier base (e.g. storm clouds).',
      zh: '压暗云底以模拟自阴影。越大云底越暗、越沉重（如暴风云）。',
    },
  },
  sssStrength: {
    name: { en: 'Subsurface (SSS)', zh: '次表面散射' },
    desc: {
      en: 'Subsurface scattering strength: soft translucent glow through thin parts of the cloud when back-lit.',
      zh: '次表面散射强度：背光时光线穿过云的薄处产生的柔和通透光晕。',
    },
  },
  sunDiscVisible: {
    name: { en: 'Sun Disc', zh: '朦胧日盘' },
    desc: {
      en: 'Softens the sun disc behind thin altostratus so the watery sun remains visible through the veil.',
      zh: '让薄高层云后的太阳呈朦胧日盘，透过率高时仍可见。',
    },
  },
  haloEffect: {
    name: { en: '22° Halo', zh: '22° 日晕' },
    desc: {
      en: 'Ice-crystal halo ring around the sun at about 22°, typical of cirrostratus.',
      zh: '卷层云典型的约 22° 冰晶日晕亮环。',
    },
  },
  internalLightning: {
    name: { en: 'Internal Lightning', zh: '内部闪光' },
    desc: {
      en: 'Sparse warm internal flashes driven by simulation time, for cumulonimbus drama.',
      zh: '由仿真时间驱动的稀疏暖色内部闪光，用于积雨云氛围。',
    },
  },
  edgeHardness: {
    name: { en: 'Edge Hardness', zh: '边缘硬度' },
    desc: {
      en: 'Per-genus post-sample density-transfer hardness. It changes opacity transition only and never creates an anvil or alters the cloud base.',
      zh: '按云属控制取样后的密度传递硬度。它只改变透明度过渡，不会生成砧顶或改变云底。',
    },
  },
  edgeErosionStrength: {
    name: { en: 'Edge Erosion', zh: '边缘侵蚀' },
    desc: {
      en: 'Per-genus analytic Worley/Curl erosion strength in the density threshold band. 0 skips the extra sampling cost.',
      zh: '按云属控制密度阈值窄带内的 Worley/Curl 解析侵蚀强度。0 会跳过额外采样开销。',
    },
  },
};

export function presetFieldName(key: string): string {
  return PRESET_FIELDS[key]?.name[lang] ?? key;
}

export function presetFieldDesc(key: string): string {
  return PRESET_FIELDS[key]?.desc[lang] ?? '';
}

const TIPS: Record<string, { en: string; zh: string }> = {
  language: { en: 'Switch the interface language.', zh: '切换界面语言。' },
  select: { en: 'Make this body the active selection (e.g. for gizmos).', zh: '将该云体设为当前选中（用于操作手柄等）。' },
  remove: { en: 'Delete this cloud body.', zh: '删除该云体。' },
  gizmoMove: { en: 'Select this body and show the 3-axis MOVE gizmo (drag the X/Y/Z arrows in the viewport to translate it). Click again to hide.', zh: '选中该云体并显示三向平移手柄（在视口中拖动 X/Y/Z 箭头进行平移）。再次点击关闭。' },
  gizmoRotate: { en: 'Select this body and show the 3-axis ROTATE gizmo (drag the X/Y/Z rings in the viewport to rotate it). Click again to hide.', zh: '选中该云体并显示三轴旋转手柄（在视口中拖动 X/Y/Z 圆环进行旋转）。再次点击关闭。' },
  gizmoScale: { en: 'Select this body and show the 3-axis SCALE gizmo (drag the X/Y/Z handles in the viewport to scale it). Click again to hide.', zh: '选中该云体并显示三向缩放手柄（在视口中拖动 X/Y/Z 手柄进行缩放）。再次点击关闭。' },
  type: { en: 'Cloud genus preset that defines this body\'s shape and lighting look.', zh: '决定该云体形状与光照外观的云属预设。' },
  centerX: { en: 'Horizontal center of the footprint along X (world units).', zh: '云体平面足迹在 X 方向的中心（世界单位）。' },
  centerZ: { en: 'Horizontal center of the footprint along Z (world units).', zh: '云体平面足迹在 Z 方向的中心（世界单位）。' },
  halfW: { en: 'Half-width of the rectangular footprint along X.', zh: '矩形足迹沿 X 方向的半宽。' },
  halfD: { en: 'Half-depth of the rectangular footprint along Z.', zh: '矩形足迹沿 Z 方向的半深。' },
  feather: { en: 'Softens the horizontal edge of the footprint. Larger = more gradual, wispy borders.', zh: '柔化足迹的水平边界。越大边界越渐变、越飘渺。' },
  height: { en: 'Height in meters above the scene-ground datum.', zh: '相对场景地面基准的高度（米）。' },
  thickness: { en: 'Vertical thickness in meters, added on top of Height.', zh: '叠加在高度之上的竖直厚度（米）。' },
  coverage: { en: 'How much of this body\'s footprint is filled with cloud. Multiplies with the genus Coverage.', zh: '该云体足迹内被云填满的比例。会与云属的“覆盖度”相乘。' },
  density: { en: 'Density multiplier for this body. Multiplies with the genus Density.', zh: '该云体的密度倍率。会与云属的“密度”相乘。' },
  windDir: { en: 'Direction the density moves toward: 0° = +X, 90° = +Z, clockwise when viewed from +Y. This is not meteorological from-direction.', zh: '密度结构移动的去向：0° = +X、90° = +Z，从 +Y 俯视顺时针增加；不是气象学的来向。' },
  windSpeed: { en: 'Horizontal world-transport speed in metres per second. The cloud footprint and density move together. Values above 80 m/s are shown as unusually high.', zh: '水平世界运输速度，单位米/秒；云体足迹与密度共同移动。超过 80 m/s 的值会标记为异常高。' },
  morphRate: { en: 'How fast the internal noise evolves/animates over time (shape boiling).', zh: '内部噪声随时间演化/翻腾的速度（形状“沸腾”）。' },
  enable: { en: 'Enable the time-based lifecycle (birth → grow → decay → death) for this body.', zh: '为该云体启用基于时间的生命周期（生成 → 生长 → 衰减 → 消亡）。' },
  birth: { en: 'Scene time (s) at which the cloud starts appearing.', zh: '云开始出现的场景时间（秒）。' },
  grow: { en: 'Scene time (s) at which the cloud reaches full size.', zh: '云生长到完整大小的场景时间（秒）。' },
  decay: { en: 'Scene time (s) at which the cloud starts fading.', zh: '云开始消退的场景时间（秒）。' },
  death: { en: 'Scene time (s) at which the cloud fully disappears.', zh: '云完全消失的场景时间（秒）。' },
  peak: { en: 'Peak density/coverage multiplier reached between grow and decay.', zh: '在生长与衰减之间达到的密度/覆盖度峰值倍率。' },
  addRect: { en: 'Add a new rectangular cloud body.', zh: '新增一个矩形云体。' },
  showWireframe: { en: 'Show the wireframe bounds of each cloud body for editing.', zh: '显示每个云体的线框边界，便于编辑。' },
  showAxes: { en: 'RGB render-world axes; tick labels are physical meters.', zh: 'RGB 渲染世界坐标轴；刻度标签显示物理米制距离。' },
  boxHeight: { en: 'Scene ceiling height in meters above scene ground.', zh: '相对场景地面的层顶高度（米）。' },
  boxHalfExtent: { en: 'Physical half-width of the cloud scene on X/Z, in meters.', zh: '云场 X/Z 方向的物理半宽（米）。' },
  verticalMetersPerWorldUnit: { en: 'Meters represented by one render-world Y unit.', zh: '每个渲染世界 Y 单位代表的米数。' },
  horizontalMetersPerWorldUnit: { en: 'Meters represented by one render-world X/Z unit.', zh: '每个渲染世界 X/Z 单位代表的米数。' },
  enforcePhysicalPlacement: { en: 'Clamp body base to the genus recommended range and keep its top below the scene ceiling.', zh: '将云底限制在云属推荐范围内，并确保云顶不超过场景层顶。' },
  applyGenusDefaults: { en: 'Reset this body to the current genus default base, thickness, and horizontal extent.', zh: '将该云体重置为当前云属的默认云底、厚度和水平尺度。' },
  weatherSize: { en: 'Resolution of the 2D weather/shape map per body. Recreates texture on change.', zh: '每个云体层的 2D 天气/形状图分辨率。修改后重建纹理。' },
  verticalEdgeRange: { en: 'Strength of top/bottom vertical envelope (vEnvelope). 0 ≈ hard cut.', zh: '顶/底垂直包络强度（vEnvelope）。0 ≈ 硬截断。' },
  verticalEdgeShape: { en: 'Exponent on vertical envelope (higher = rounder top/bottom).', zh: '垂直包络指数（越大顶底越圆）。' },
  densityShapeModel: { en: '0 = legacy density chain, 1 = height–weather shaping + two-level fbm erosion (Sky Ocean Sun clouds). Toggle for A/B; use density debug view.', zh: '0 = 旧兼容密度链，1 = 高度–天气塑形 + 两级 fbm 侵蚀（Sky Ocean Sun）。可切换 A/B；建议开密度调试视图对比。' },
  morphStrength: { en: 'Global blend amount toward the weather/morph target shape.', zh: '向天气/变形目标形状混合的全局强度。' },
  cornerRadius: { en: 'Rounds off rectangle corners so the footprint no longer has hard right angles. 0 = sharp corners.', zh: '圆角半径，消除矩形足迹的生硬直角。0 = 锐利直角。' },
  edgeCurveWidth: { en: 'Soft-edge range in feather units over which the SDF remaps to coverage at the boundary.', zh: '软边范围（以 feather 为单位），SDF 在边界处按此宽度过渡为 coverage。' },
  edgeCurveShaper: { en: 'Coverage falloff curve exponent. >1 = gentler tail (softer, more diffuse edge); <1 = sharper.', zh: '衰减曲线指数。>1 尾部更缓（边缘更柔更扩散）；<1 更锐。' },
  simulationRate: { en: 'Global simulation-time multiplier. 0× freezes cloud evolution while rendering and camera controls keep running.', zh: '全局仿真时间倍率。0× 冻结云体演化，但渲染和相机操作继续运行。' },
  resetTime: { en: 'Reset the manual animation clock back to t=0.', zh: '将手动模式的动画时钟重置回 t=0。' },
  resetWindAdvection: { en: 'Reset accumulated manual wind displacement and return clouds to their saved authoring placement without changing wind settings.', zh: '重置手动模式累计风位移，使云体回到保存的作者位置，不改变风设置。' },
  enableScenario: { en: 'Enable scenario playback (scripted timeline of events).', zh: '启用场景回放（脚本化的事件时间轴）。' },
  playPause: { en: 'Play or pause the scenario clock.', zh: '播放或暂停场景时钟。' },
  loop: { en: 'Loop the scenario back to the start when it finishes.', zh: '场景结束后循环回到开头。' },
  triggerNow: { en: 'Reset the scene clock to t=0 and re-trigger all lifecycles.', zh: '将场景时钟重置为 t=0 并重新触发所有生命周期。' },
  scrubTime: { en: 'Manually scrub the timeline instead of letting the clock run.', zh: '手动拖动时间轴，而非让时钟自动运行。' },
  sceneTime: { en: 'Current scene time (s) used when scrubbing.', zh: '拖动时使用的当前场景时间（秒）。' },
  loadDemo: { en: 'Load a built-in demo scenario.', zh: '加载内置示例场景。' },
  loadJson: { en: 'Load a scenario from a JSON file.', zh: '从 JSON 文件加载场景。' },
  pasteJson: { en: 'Paste scenario JSON text directly.', zh: '直接粘贴场景 JSON 文本。' },
  exportJson: { en: 'Export the current scenario as JSON.', zh: '将当前场景导出为 JSON。' },
  sunAzimuth: { en: 'Sun compass direction (degrees). Controls where shadows and highlights fall horizontally.', zh: '太阳的方位角（度）。控制阴影和高光在水平方向的落点。' },
  sunElevation: { en: 'Sun height above the horizon (degrees). Low = sunrise/sunset look, high = noon.', zh: '太阳相对地平线的高度角（度）。低 = 日出/日落感，高 = 正午。' },
  silverLining: { en: 'Global intensity of the silver-lining rim light on sun-facing edges.', zh: '太阳侧边缘银边亮光的全局强度。' },
  powder: { en: 'Powder/dark-edge effect strength (darkens cloud surfaces facing the light).', zh: '粉末/暗边效果强度（压暗朝光面的云表面）。' },
  msModel: { en: '0 = legacy 3-octave Beer, 1 = Sky Ocean Sun triple-Beer MS (μ-driven). Toggle for A/B.', zh: '0 = 旧三 octave Beer，1 = Sky Ocean Sun 三指数 Beer（μ 驱动）。可切换做 A/B。' },
  energyConservingScatter: { en: 'On = analytic (1-e^{-σΔt})·L/σ step integral (step-size stable). Off = legacy (1-e^{-d}) path for A/B.', zh: '开 = 解析积分 (1-e^{-σΔt})·L/σ（步长无关）。关 = 旧 (1-e^{-d}) 路径，便于 A/B。' },
  heightAmbientModel: { en: '0 = flat ambient*0.5, 1 = Sky Ocean Sun height tint (cool base / brighter top). Toggle for A/B.', zh: '0 = 常数环境光×0.5，1 = Sky Ocean Sun 高度染色（底冷顶亮）。可切换 A/B。' },
  hgForward: { en: 'Global forward-scatter phase (glow toward the sun). Blended with per-genus phase.', zh: '全局前向散射相位（朝太阳方向的光晕）。与各云属相位混合。' },
  hgBackward: { en: 'Global back-scatter phase. Negative scatters toward the anti-sun side.', zh: '全局后向散射相位。负值向背向太阳一侧散射。' },
  hgBlend: { en: 'Blend between the forward and backward scatter lobes.', zh: '在前向与后向散射波瓣之间混合。' },
  typeLighting: { en: 'How much per-genus lighting parameters (absorption, phase, SSS…) override the global ones. 0 = global only, 1 = full per-genus.', zh: '各云属光照参数（吸收、相位、SSS…）覆盖全局参数的程度。0 = 仅全局，1 = 完全按云属。' },
  fxAbsorption: { en: 'Toggle per-genus light extinction (opacity). Off = uniform extinction; on = each genus uses its own absorption (cirrus translucent, cumulonimbus dense/dark).', zh: '开关按云属的消光（不透光度）。关 = 统一消光；开 = 每种云属用各自的吸收系数（卷云通透，积雨云厚重发暗）。' },
  godRays: { en: 'Strength of volumetric god-rays / light shafts.', zh: '体积光（丁达尔光束）的强度。' },
  aerialDensity: { en: 'Density of the aerial-perspective haze applied over distance to clouds and ground.', zh: '大气透视雾的密度，随距离作用于云和地面。' },
  aerialInscatter: { en: 'Strength of the sunward in-scattered haze color mixed in by aerial perspective.', zh: '大气透视中朝阳方向内散射雾色的强度。' },
  aerialHeightFalloff: { en: 'How quickly aerial haze thins out with altitude.', zh: '大气雾随高度变薄的速率。' },
  shadowTintStrength: { en: 'How strongly shadowed cloud interiors shift toward the cool shadow color.', zh: '云内阴影区偏向冷色调的强度。' },
  todPaletteBlend: { en: '0 = legacy TOD colors, 1 = artistic palette from cloud-types.md. Mix for A/B.', zh: '0 = 旧版 TOD 色，1 = cloud-types.md 艺术色板。可混合做 A/B。' },
  editPreset: { en: 'Choose which cloud genus preset to edit below.', zh: '选择下方要编辑的云属预设。' },
  copyPreset: { en: 'Copy this preset\'s values to the clipboard as code.', zh: '将该预设的数值以代码形式拷贝到剪贴板。' },
  copyAllPresets: { en: 'Copy all presets to the clipboard as code.', zh: '将全部预设以代码形式拷贝到剪贴板。' },
  skipLight: { en: 'Skip the secondary light-march for speed (flatter, faster shading).', zh: '跳过二次光照步进以提速（着色更平、更快）。' },
  adaptiveMarch: { en: 'Fast-forwards through empty regions with larger steps, then backtracks one base step at cloud entry for fine marching.', zh: '空区使用大步快进，命中云边后回退一基础步再细步行进。' },
  temporalDither: { en: 'Golden-ratio temporal dither for frame-to-frame sample shift before TAA. Disable if flicker is too visible.', zh: '基于黄金比例的时域抖动，在 TAA 前用于跨帧错位采样；闪烁明显时可关闭。' },
  taaEnabled: { en: 'Temporal anti-aliasing: reprojects and blends prior frames to reduce aliasing and noise. Disable to fall back instantly.', zh: '时域抗锯齿：重投影并混合历史帧以降低锯齿与噪点；关闭即刻回退。' },
  taaBlend: { en: 'History weight per frame (higher = smoother but more ghosting/lag).', zh: '每帧历史权重（越高越平滑，但拖影/延迟更明显）。' },
  raySteps: { en: 'Primary ray march steps through the cloud box (8–256).', zh: '主光线行进步数（8–256）。' },
  lightSteps: { en: 'Number of samples toward the sun for shadowing. Higher = better self-shadows, slower.', zh: '朝太阳方向用于阴影的采样次数。越高自阴影越好、越慢。' },
  lightMarchStepSize: { en: 'Step size for sun-direction light march (self-shadow). Was 0.15.', zh: '朝太阳光照行进步长（自阴影）。原写死 0.15。' },
  shadowDark: { en: 'How dark the self-shadowing inside clouds gets.', zh: '云内部自阴影的深暗程度。' },
  sunIntensity: { en: 'Brightness of direct sunlight scattering in the clouds.', zh: '阳光在云中直接散射的亮度。' },
  groundShadowMode: { en: 'Legacy keeps the fixed 18-step baseline. Adaptive uses bounded world-stable stratified integration. Transmittance uses the cached world-space shadow texture when available.', zh: 'Legacy 保留固定 18 步基线；Adaptive 使用有上限的世界空间稳定分层积分；Transmittance 在可用时使用世界空间云影缓存。' },
  groundShadowMaxSteps: { en: 'Maximum adaptive samples along a ground-to-sun shadow ray.', zh: '地面朝阳云影射线的自适应最大采样数。' },
  groundShadowStepScale: { en: 'Multiplier for the density-voxel-derived target step. Higher is faster and coarser.', zh: '基于密度体素推导的目标步长倍率。越高越快、越粗。' },
  groundShadowJitter: { en: 'World-stable stratified offset that breaks regular shadow bands without frame-to-frame flicker.', zh: '世界空间稳定的分层偏移，用于打散规则云影条带且不产生逐帧闪烁。' },
  groundShadowMapResolution: { en: 'World-space transmittance map size. Larger maps preserve finer shadow detail at higher GPU cost.', zh: '世界空间透射率云影图尺寸。分辨率越高细节越好，但 GPU 成本越高。' },
  groundShadowMapUpdateRate: { en: 'Frames between scheduled map rebuilds. Scene changes and large wind motion still force an immediate rebuild.', zh: '计划更新云影图的帧间隔；场景变化和较大风位移仍会立即重建。' },
  groundShadowHistoryWeight: { en: 'Temporal history blend for the transmittance map. It is reduced or reset automatically when motion invalidates history.', zh: '透射率云影图的时间历史混合；运动导致历史失效时会自动降低或重置。' },
  groundShadowFilterRadius: { en: 'Tent-filter radius applied before temporal accumulation. Zero disables spatial filtering.', zh: '时间累积前使用的帐篷滤波半径；0 表示关闭空间滤波。' },
  cacheRes: { en: '3D density cache resolution (32–256). Cubic memory cost.', zh: '3D 密度缓存分辨率（32–256）。内存立方增长。' },
  cacheUpdate: { en: 'How many cache slices are refreshed per frame (lower spreads cost over time).', zh: '每帧刷新的缓存切片数（越低越能分摊开销）。' },
  cacheSmooth: { en: 'Temporal smoothing of the cache between updates (reduces flicker).', zh: '更新之间缓存的时间平滑（减少闪烁）。' },
  densityProducerMode: { en: 'Selects who produces the Cached/Hybrid density cache. W5 Recipe V2 owns shared fields but intentionally keeps density empty.', zh: '选择由谁生产 Cached/Hybrid 密度缓存。W5 Recipe V2 已拥有共享场，但仍有意保持全零密度。' },
  qualityMode: { en: 'Cached = fastest (uses cache), Realtime = full quality (no cache), Hybrid = mix.', zh: 'Cached = 最快（用缓存），Realtime = 全质量（不用缓存），Hybrid = 混合。' },
  detailFreq: { en: 'Global frequency of the high-frequency detail noise added at render time.', zh: '渲染时叠加的高频细节噪声的全局频率。' },
  detailStrength: { en: 'Global strength of the high-frequency detail noise added at render time.', zh: '渲染时叠加的高频细节噪声的全局强度。' },
  edgeSharpening: { en: 'Master switch for post-sample edge rendering. Off softens edges but preserves cached genus morphology such as cumulonimbus anvils.', zh: '取样后边缘渲染总开关。关闭后边缘变柔，但会保留缓存中的积雨云砧顶等云属形态。' },
  edgeHardness: { en: 'Global multiplier for each genus edge-transfer hardness. It does not affect anvil, top-cutoff, or base morphology.', zh: '各云属边缘传递硬度的全局倍率。它不会影响砧顶、顶部截断或云底形态。' },
  edgeHardnessThreshold: { en: 'Center threshold for edge hardness smoothstep.', zh: '边缘硬度 smoothstep 中心阈值。' },
  cacheWgX: { en: 'Density-cache compute workgroup X (rebuilds pipeline). Default 8.', zh: '密度缓存 compute 工作组 X（重建管线）。默认 8。' },
  cacheWgY: { en: 'Density-cache compute workgroup Y. Default 8.', zh: '密度缓存 compute 工作组 Y。默认 8。' },
  cacheWgZ: { en: 'Density-cache compute workgroup Z. Default 4.', zh: '密度缓存 compute 工作组 Z。默认 4。' },
  debugView: { en: 'Switch to a debug visualization mode.', zh: '切换到调试可视化模式。' },
  debugCloudDepth: { en: 'Transmittance-weighted mean hit distance along the view ray (near white, far black, sky black).', zh: '沿视线按透射权重加权的平均命中距离（近白远黑，天空黑）。' },
  sharedFieldDebugSlice: { en: 'Selects the Z slice through the shared 3D atlas.', zh: '选择共享 3D 图集的 Z 切片。' },
  sharedFieldDebugChannel: { en: 'Selects the packed RGBA field channel.', zh: '选择打包后的 RGBA 场通道。' },
  sharedFieldDebugPhase: { en: 'Offsets periodic coordinates without rebuilding the texture.', zh: '仅偏移周期坐标，不会重新生成纹理。' },
  sharedFieldDebugSeams: { en: 'Overlays the integer repeat boundaries in red.', zh: '以红线叠加整数重复边界。' },
  measureLight: { en: 'Run a 2×40-frame A/B test to estimate light-march cost share of the cloud pass.', zh: '运行 2×40 帧 A/B 测试，估算光照步进在云通道中的开销占比。' },
  tonemap: { en: 'Tonemap curve. ACES: higher contrast, natural highlight rolloff. AgX: minimal hue shift in large sky areas. Reinhard: legacy baseline.', zh: '色调映射曲线。ACES：对比度高、高光滚落自然。AgX：大面积天空色相偏移小。Reinhard：旧版基线。' },
  exposure: { en: 'Post-process exposure multiplier applied before tonemapping.', zh: '后处理曝光倍率，在色调映射前应用。' },
  bloomEnabled: { en: 'HDR bloom glow on bright areas (sun and lit cloud edges).', zh: '高亮区域 HDR 光晕（太阳与受光云缘）。' },
  bloomThreshold: { en: 'Luminance threshold for bloom extraction (HDR, after exposure).', zh: 'Bloom 提取亮度阈值（曝光后 HDR 域）。' },
  bloomAmount: { en: 'Bloom overlay strength.', zh: 'Bloom 叠加强度。' },
};

export function tip(key: string): string {
  return TIPS[key]?.[lang] ?? '';
}

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

export function genusArtistic(key: string): string {
  const entry = GENUS_ARTISTIC[key as keyof typeof GENUS_ARTISTIC];
  return entry?.[lang] ?? entry?.en ?? '';
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
