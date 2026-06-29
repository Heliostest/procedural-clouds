# 术语表 Glossary（中英对照）

本系统描述云彩时使用的专有名词。代码、UI、文档应统一使用这套术语。

## 一、核心结构 Core structure

| 中文 | English | 代码标识 | 说明 |
|---|---|---|---|
| 云体 | Cloud Body | `CloudBody` / body | 场景中一朵具体的云：有位置、形状、高度、引用某个云属 |
| 云属 | Genus | `body.type` / `CLOUD_TYPES` | 云的种类模板（积云/卷云…），定义形状与光照外观；WMO 十属 |
| 预设 | Preset | `CLOUD_PRESETS` / `ShapePreset` | 云属对应的一组参数（形态 + 光照） |
| 形状 | Shape | `BodyShape` | 云体的几何形态：矩形/圆形（程序化）或球/立方等实体（调试用） |
| 足迹 | Footprint | `weather.ts` `bodyAlpha` | 云体在 XZ 平面的俯视轮廓 |
| 全局参数 | Global | `CloudParams` | 影响整个场景的参数（盒体、太阳、渲染） |

## 二、形态参数 Shape parameters

| 中文 | English | 代码标识 | 说明 |
|---|---|---|---|
| 覆盖度 | Coverage | `coverage` | 云填满范围的比例（云体级 × 云属级） |
| 密度 | Density | `density` / `densityScale` | 云的厚实/不透光程度（云体级 × 云属级） |
| 羽化 | Feather | `feather` | 足迹水平边界的柔化宽度 |
| 高度 | Height | `base` | 云层底部高度（按盒体高度的比例 0–1） |
| 厚度 | Thickness | `thickness` | 云层竖直厚度，与高度共同决定竖直区间 |
| 高度剖面 | Altitude Profile | preset `altitude` | 噪声竖直剖面（相对比例，非世界高度） |
| 噪声尺度 | Noise Scale | preset `scale` | 形状噪声采样尺度 |
| 细节 / 细节强度 | Detail / Detail Strength | `detail` / `detailStrength` | 细节噪声的层级与强度 |
| 覆盖度阈值 | Coverage Threshold | `coverageThreshold` | 密度裁剪阈值 |
| 边缘锐度 | Edge Sharpness | `edgeSharpness` | 云边缘软硬 |
| 底部圆润度 | Base Roundness | `baseRoundness` | 底部密度衰减、圆底程度 |
| Worley/Perlin 混合 | Worley / Perlin Blend | `worleyBlend` | 细胞状与蓬松状噪声混合 |
| 垂直包络 | Vertical Envelope | `verticalEdgeRange` / `verticalEdgeShape` / `vEnvelope` | 顶/底竖直边界塑形 |
| 变形 | Morph | `morphRate` / `morphStrength` / `morph` | 形状随时间的演化/翻腾 |

## 三、风与时间 Wind & time

| 中文 | English | 代码标识 | 说明 |
|---|---|---|---|
| 风向 | Wind Direction | `windDeg` | 云噪声漂移方向（度） |
| 风速 | Wind Speed | `windSpeed` | 漂移速度（平流位移） |
| 平流 | Advection | — | 云团整体沿风向水平位移（区别于就地形变） |
| 生命周期 | Lifecycle | `BodyLife` / `lifecycle.ts` | 单云体的生成→生长→衰减→消亡包络 |
| 生成/生长/衰减/消亡 | Birth/Grow/Decay/Death | `birth/grow/decay/death` | 生命周期四阶段时间点 |
| 峰值 | Peak | `peak` | 成熟期密度/覆盖度倍率峰值 |
| 场景 | Scenario | `Scenario` / `scenario.ts` | 数据驱动的时间轴脚本 |
| 时间轴 | Timeline | `timeline` | 场景的时间控制（播放/拖动） |
| 播放头 | Playhead | `playhead` | 场景当前播放时刻 |
| 场景时间 | Scene Time | `sceneTime` | 驱动动画的时钟（区别于噪声时间轴） |

## 四、渲染与光照 Rendering & lighting

| 中文 | English | 代码标识 | 说明 |
|---|---|---|---|
| 盒体 | Box | `BOX_MIN` / `boxHeight` / `boxHalfExtent` | 云的渲染包围盒（世界尺寸） |
| 天气图 | Weather Map | `weather.ts` / `weatherSize` | 每云体的 2D 足迹/形状纹理 |
| 光线步进 | Ray March | `rayMarchSteps` | 主射线穿过盒体的采样步进 |
| 光照步进 | Light March | `lightMarch` / `lightMarchSteps` | 朝太阳方向采样以求自阴影 |
| 密度缓存 | Density Cache | `densityTex` / `cacheResolution` | 预烘焙密度的 3D 纹理（双缓冲） |
| 质量模式 | Quality Mode | `qualityMode` | Cached / Hybrid / Realtime |
| 缓存平滑 | Cache Smooth | `cacheSmooth` / `cacheBlend` | 缓存新旧帧的时间插值 |
| 边缘硬度 | Edge Hardness | `edgeHardness` | Raymarch 密度传递陡峭度（锐顶） |
| 太阳方位角/高度角 | Sun Azimuth / Elevation | `sunAzimuth` / `sunElevation` | 太阳位置 |
| HG 相函数 | Henyey-Greenstein Phase | `hgForward` / `hgBackward` / `phaseForward` / `phaseBack` | 前向/后向散射相位 |
| 银边 | Silver Lining | `silverLining` / `silverIntensity` | 太阳侧云缘亮边 |
| 粉末效果 | Powder | `powderStrength` | 朝光面暗化效果 |
| 吸收系数 | Absorption | `absorptionCoeff` | 光吸收/不透光程度 |
| 底部压暗 | Base Darkening | `baseDarkening` | 云底自阴影压暗 |
| 次表面散射 | Subsurface (SSS) | `sssStrength` | 薄处背光通透光晕 |
| 云属光照 | Genus Lighting | `typeLightingBlend` | 按云属覆盖全局光照的程度 |
| 体积光 | God Rays | `godrayStrength` | 屏幕空间径向光束 |

## 五、术语统一原则 Conventions

- 云的种类一律称 **云属 / Genus**；不再用“类型 / Type”指代云种（已统一 UI 标签）。
- 场景中一朵云一律称 **云体 / Body**；历史概念 “region/区域” 已废弃（仅 `scenario.ts` 保留旧 JSON 字段 `regions`/`regionId` 的向后兼容读取）。
- **高度（Height）** 指云体在盒内的竖直位置比例；**盒体高度（Box Height）** 指渲染盒的世界高度；**高度剖面（Altitude Profile）** 指云属噪声的竖直相对剖面——三者不可混淆。
