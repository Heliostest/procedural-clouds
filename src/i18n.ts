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

  global: { en: 'Global', zh: '全局' },
  pauseAnim: { en: 'Pause Animation', zh: '暂停动画' },
  resetTime: { en: 'Reset Time (t=0)', zh: '重置时间 (t=0)' },
  comparePresets: { en: '⊞ Compare Side by Side', zh: '⊞ 并排对比' },
  showWireframe: { en: 'Show Wireframe', zh: '显示线框' },
  boxHalfExtent: { en: 'Box Half Extent XZ', zh: '盒体半宽 XZ' },
  boxHeight: { en: 'Box Height', zh: '盒体高度' },
  weatherSize: { en: 'Weather Map Size', zh: '天气图分辨率' },
  verticalEdgeRange: { en: 'Vertical Edge Range', zh: '垂直包络强度' },
  verticalEdgeShape: { en: 'Vertical Edge Shape', zh: '垂直包络曲线' },
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
  typeLighting: { en: 'Genus Lighting', zh: '云属光照' },
  godRays: { en: 'God Rays', zh: '体积光' },

  presetEditor: { en: 'Preset Editor', zh: '预设编辑器' },
  editPreset: { en: 'Edit Genus', zh: '编辑云属' },
  copyPreset: { en: 'Copy This Preset', zh: '拷贝此预设' },
  copyAllPresets: { en: 'Copy All Presets', zh: '拷贝全部预设' },

  render: { en: 'Render', zh: '渲染' },
  skipLight: { en: 'Skip Light March', zh: '跳过光照步进' },
  raySteps: { en: 'Ray Steps', zh: '光线步数' },
  lightSteps: { en: 'Light Steps', zh: '光照步数' },
  shadowDark: { en: 'Shadow Dark', zh: '阴影深度' },
  sunIntensity: { en: 'Sun Intensity', zh: '太阳强度' },
  cacheRes: { en: 'Cache Res', zh: '缓存分辨率' },
  cacheUpdate: { en: 'Cache Update', zh: '缓存更新' },
  cacheSmooth: { en: 'Cache Smooth', zh: '缓存平滑' },
  qualityMode: { en: 'Quality Mode', zh: '质量模式' },
  detailFreq: { en: 'Detail Freq', zh: '细节频率' },
  detailStrength: { en: 'Detail Strength', zh: '细节强度' },
  lightMarchStepSize: { en: 'Light March Step', zh: '光照步长' },
  edgeHardness: { en: 'Edge Hardness', zh: '边缘硬度' },
  edgeHardnessThreshold: { en: 'Edge Hardness Thr', zh: '边缘硬度阈值' },
  cacheWgX: { en: 'Cache WG X', zh: '缓存工作组 X' },
  cacheWgY: { en: 'Cache WG Y', zh: '缓存工作组 Y' },
  cacheWgZ: { en: 'Cache WG Z', zh: '缓存工作组 Z' },
  shape: { en: 'Shape', zh: '形状' },

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

  info: { en: 'Drag to orbit · Scroll to zoom · WebGPU Procedural Clouds', zh: '拖动旋转 · 滚轮缩放 · WebGPU 程序化云朵' },
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
    name: { en: 'Edge Sharpness', zh: '边缘锐度' },
    desc: {
      en: 'Sharpness of cloud edges. Higher = crisp, well-defined edges; lower = soft, fluffy, diffuse edges.',
      zh: '云边缘的锐度。越大边缘越硬朗清晰；越小越柔和蓬松、越扩散。',
    },
  },
  baseRoundness: {
    name: { en: 'Base Roundness', zh: '底部圆润度' },
    desc: {
      en: 'Fades density toward the bottom of the cloud. Higher gives a more rounded, puffy underside.',
      zh: '让云底部的密度逐渐衰减。越大云底越圆润、越蓬松饱满。',
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
  type: { en: 'Cloud genus preset that defines this body\'s shape and lighting look.', zh: '决定该云体形状与光照外观的云属预设。' },
  centerX: { en: 'Horizontal center of the footprint along X (world units).', zh: '云体平面足迹在 X 方向的中心（世界单位）。' },
  centerZ: { en: 'Horizontal center of the footprint along Z (world units).', zh: '云体平面足迹在 Z 方向的中心（世界单位）。' },
  halfW: { en: 'Half-width of the rectangular footprint along X.', zh: '矩形足迹沿 X 方向的半宽。' },
  halfD: { en: 'Half-depth of the rectangular footprint along Z.', zh: '矩形足迹沿 Z 方向的半深。' },
  radius: { en: 'Radius of the circular footprint.', zh: '圆形足迹的半径。' },
  feather: { en: 'Softens the horizontal edge of the footprint. Larger = more gradual, wispy borders.', zh: '柔化足迹的水平边界。越大边界越渐变、越飘渺。' },
  height: { en: 'Bottom altitude of this body\'s cloud band (0 = box bottom, 1 = box top), as a fraction of Box Height.', zh: '该云体云层底部高度（0 = 盒底，1 = 盒顶），按“盒体高度”的比例。' },
  thickness: { en: 'Vertical thickness of the cloud band, added on top of Height. Together they form the actual [base, top] band.', zh: '云层的竖直厚度，叠加在“高度”之上。两者共同构成实际的[底, 顶]竖直区间。' },
  coverage: { en: 'How much of this body\'s footprint is filled with cloud. Multiplies with the genus Coverage.', zh: '该云体足迹内被云填满的比例。会与云属的“覆盖度”相乘。' },
  density: { en: 'Density multiplier for this body. Multiplies with the genus Density.', zh: '该云体的密度倍率。会与云属的“密度”相乘。' },
  windDir: { en: 'Direction the cloud noise drifts (degrees, 0 = +X, clockwise).', zh: '云噪声漂移的方向（角度，0 = +X，顺时针）。' },
  windSpeed: { en: 'Speed at which the cloud noise drifts along the wind direction.', zh: '云噪声沿风向漂移的速度。' },
  morphRate: { en: 'How fast the internal noise evolves/animates over time (shape boiling).', zh: '内部噪声随时间演化/翻腾的速度（形状“沸腾”）。' },
  enable: { en: 'Enable the time-based lifecycle (birth → grow → decay → death) for this body.', zh: '为该云体启用基于时间的生命周期（生成 → 生长 → 衰减 → 消亡）。' },
  birth: { en: 'Scene time (s) at which the cloud starts appearing.', zh: '云开始出现的场景时间（秒）。' },
  grow: { en: 'Scene time (s) at which the cloud reaches full size.', zh: '云生长到完整大小的场景时间（秒）。' },
  decay: { en: 'Scene time (s) at which the cloud starts fading.', zh: '云开始消退的场景时间（秒）。' },
  death: { en: 'Scene time (s) at which the cloud fully disappears.', zh: '云完全消失的场景时间（秒）。' },
  peak: { en: 'Peak density/coverage multiplier reached between grow and decay.', zh: '在生长与衰减之间达到的密度/覆盖度峰值倍率。' },
  addRect: { en: 'Add a new rectangular cloud body.', zh: '新增一个矩形云体。' },
  addCircle: { en: 'Add a new circular cloud body.', zh: '新增一个圆形云体。' },
  showWireframe: { en: 'Show the wireframe bounds of each cloud body for editing.', zh: '显示每个云体的线框边界，便于编辑。' },
  boxHeight: { en: 'WORLD-space height of the whole render box (world units). All bodies live inside this box; their Height/Thickness are fractions of it.', zh: '整个渲染盒体的世界高度（世界单位）。所有云体都在此盒内，其“高度/厚度”都是相对该值的比例。' },
  boxHalfExtent: { en: 'Half-width of the cloud box on X/Z (symmetric). Was hardcoded ±4.5.', zh: '云盒 X/Z 半宽（对称）。原写死 ±4.5。' },
  weatherSize: { en: 'Resolution of the 2D weather/shape map per body. Recreates texture on change.', zh: '每个云体层的 2D 天气/形状图分辨率。修改后重建纹理。' },
  verticalEdgeRange: { en: 'Strength of top/bottom vertical envelope (vEnvelope). 0 ≈ hard cut.', zh: '顶/底垂直包络强度（vEnvelope）。0 ≈ 硬截断。' },
  verticalEdgeShape: { en: 'Exponent on vertical envelope (higher = rounder top/bottom).', zh: '垂直包络指数（越大顶底越圆）。' },
  morphStrength: { en: 'Global blend amount toward the weather/morph target shape.', zh: '向天气/变形目标形状混合的全局强度。' },
  pauseAnim: { en: 'Pause the cloud animation in manual mode (freezes wind drift, noise boiling and lifecycles).', zh: '在手动模式下暂停云的动画（冻结风吹漂移、噪声翻腾与生命周期）。' },
  resetTime: { en: 'Reset the manual animation clock back to t=0.', zh: '将手动模式的动画时钟重置回 t=0。' },
  enableScenario: { en: 'Enable scenario playback (scripted timeline of events).', zh: '启用场景回放（脚本化的事件时间轴）。' },
  playPause: { en: 'Play or pause the scenario clock.', zh: '播放或暂停场景时钟。' },
  speed: { en: 'Playback speed multiplier for the scenario clock.', zh: '场景时钟的播放速度倍率。' },
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
  hgForward: { en: 'Global forward-scatter phase (glow toward the sun). Blended with per-genus phase.', zh: '全局前向散射相位（朝太阳方向的光晕）。与各云属相位混合。' },
  hgBackward: { en: 'Global back-scatter phase. Negative scatters toward the anti-sun side.', zh: '全局后向散射相位。负值向背向太阳一侧散射。' },
  hgBlend: { en: 'Blend between the forward and backward scatter lobes.', zh: '在前向与后向散射波瓣之间混合。' },
  typeLighting: { en: 'How much per-genus lighting parameters (absorption, phase, SSS…) override the global ones. 0 = global only, 1 = full per-genus.', zh: '各云属光照参数（吸收、相位、SSS…）覆盖全局参数的程度。0 = 仅全局，1 = 完全按云属。' },
  godRays: { en: 'Strength of volumetric god-rays / light shafts.', zh: '体积光（丁达尔光束）的强度。' },
  editPreset: { en: 'Choose which cloud genus preset to edit below.', zh: '选择下方要编辑的云属预设。' },
  copyPreset: { en: 'Copy this preset\'s values to the clipboard as code.', zh: '将该预设的数值以代码形式拷贝到剪贴板。' },
  copyAllPresets: { en: 'Copy all presets to the clipboard as code.', zh: '将全部预设以代码形式拷贝到剪贴板。' },
  skipLight: { en: 'Skip the secondary light-march for speed (flatter, faster shading).', zh: '跳过二次光照步进以提速（着色更平、更快）。' },
  raySteps: { en: 'Primary ray march steps through the cloud box (8–256).', zh: '主光线行进步数（8–256）。' },
  lightSteps: { en: 'Number of samples toward the sun for shadowing. Higher = better self-shadows, slower.', zh: '朝太阳方向用于阴影的采样次数。越高自阴影越好、越慢。' },
  lightMarchStepSize: { en: 'Step size for sun-direction light march (self-shadow). Was 0.15.', zh: '朝太阳光照行进步长（自阴影）。原写死 0.15。' },
  shadowDark: { en: 'How dark the self-shadowing inside clouds gets.', zh: '云内部自阴影的深暗程度。' },
  sunIntensity: { en: 'Brightness of direct sunlight scattering in the clouds.', zh: '阳光在云中直接散射的亮度。' },
  cacheRes: { en: '3D density cache resolution (32–256). Cubic memory cost.', zh: '3D 密度缓存分辨率（32–256）。内存立方增长。' },
  cacheUpdate: { en: 'How many cache slices are refreshed per frame (lower spreads cost over time).', zh: '每帧刷新的缓存切片数（越低越能分摊开销）。' },
  cacheSmooth: { en: 'Temporal smoothing of the cache between updates (reduces flicker).', zh: '更新之间缓存的时间平滑（减少闪烁）。' },
  qualityMode: { en: 'Cached = fastest (uses cache), Realtime = full quality (no cache), Hybrid = mix.', zh: 'Cached = 最快（用缓存），Realtime = 全质量（不用缓存），Hybrid = 混合。' },
  detailFreq: { en: 'Global frequency of the high-frequency detail noise added at render time.', zh: '渲染时叠加的高频细节噪声的全局频率。' },
  detailStrength: { en: 'Global strength of the high-frequency detail noise added at render time.', zh: '渲染时叠加的高频细节噪声的全局强度。' },
  edgeHardness: { en: 'Raymarch density transfer steepness (0 = off).', zh: 'Raymarch 密度传递陡峭度（0=关）。' },
  edgeHardnessThreshold: { en: 'Center threshold for edge hardness smoothstep.', zh: '边缘硬度 smoothstep 中心阈值。' },
  cacheWgX: { en: 'Density-cache compute workgroup X (rebuilds pipeline). Default 8.', zh: '密度缓存 compute 工作组 X（重建管线）。默认 8。' },
  cacheWgY: { en: 'Density-cache compute workgroup Y. Default 8.', zh: '密度缓存 compute 工作组 Y。默认 8。' },
  cacheWgZ: { en: 'Density-cache compute workgroup Z. Default 4.', zh: '密度缓存 compute 工作组 Z。默认 4。' },
  shape: { en: 'Body form. Rect/Circle = procedural footprint cloud. Solids (sphere, cube, platonic…) = uniform analytic density (no noise/weather/cache) for debugging the renderer. All other sliders apply identically.', zh: '云体形态。矩形/圆形=程序化轮廓云。实体（球、立方、正多面体…）=均匀解析密度（无噪声/天气/缓存），用于调试渲染。其余滑杆作用完全一致。' },
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

const SHAPE_NAMES: Record<string, { en: string; zh: string }> = {
  rect: { en: 'Rect', zh: '矩形' },
  circle: { en: 'Circle', zh: '圆形' },
  sphere: { en: 'Sphere', zh: '球体' },
  cube: { en: 'Cube', zh: '立方体' },
  octahedron: { en: 'Octahedron', zh: '八面体' },
  tetrahedron: { en: 'Tetrahedron', zh: '四面体' },
  dodecahedron: { en: 'Dodecahedron', zh: '十二面体' },
  icosahedron: { en: 'Icosahedron', zh: '二十面体' },
  torus: { en: 'Torus', zh: '圆环' },
};

export function shapeName(key: string): string {
  return SHAPE_NAMES[key]?.[lang] ?? key;
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
