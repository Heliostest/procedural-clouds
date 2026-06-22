## Why

阶段 1 已把参数层重构为可按名读写的分组结构，但 `CloudShape` 仍只暴露 `density/coverage/scale/altitude/detail` 等少数全局量，密度场无法表达「云属形态」——所有云看起来都是同一种蓬松团。要实现 roadmap「指定云彩类型」，需让密度场暴露可调的形态量，并把 `../procedural-clouds-threejs/cloud-types.md` 的 10 种云属映射成预设，供切换。

## What Changes

- 扩展 `CloudShape`，新增形态控制字段：`coverageThreshold`（覆盖阈值）、`edgeSharpness`（Voronoi remap 锐度）、`baseRoundness`（底部曲率：平底 vs 圆底）、`worleyBlend`（Voronoi 距离场与 Perlin/FBM 的权重）、`detailStrength`（细节强度，替代/补充现有 detail）、`altBase`/`altTop`（归一化高度带上下界）。
- `cloudDensity()` 接入新字段：
  - 阶段 2/3 的 `mapRange(... factor ...)` 引入 `edgeSharpness` 做 `pow`/`smoothstep` 锐化。
  - 阶段 1 高度掩膜按 `baseRoundness` 改变底部曲率。
  - 引入 `worleyBlend` 在 Voronoi 距离场与 `noise_fbm` 之间 `mix`，控制「细胞感 vs 蓬松感」。
  - 高度带改由 `altBase/altTop` 归一化区间约束。
- `main.js` 新增 `CLOUD_PRESETS` 表（cumulus/stratus/stratocumulus/cumulonimbus/altocumulus/altostratus/nimbostratus/cirrus/cirrostratus/cirrocumulus），数值参考 cloud-types.md。
- GUI 增加预设下拉；切换时把预设值**插值**到当前 `CloudShape`（平滑过渡，避免突变）。

## Capabilities

### New Capabilities
- `cloud-presets`: 云属预设数据表与切换机制——10 种云属的形态参数集合、选择 UI、以及切换时向当前形态平滑插值的过渡逻辑。

### Modified Capabilities
- `cloud-params`: `CloudShape` 需扩展暴露形态控制字段（coverageThreshold/edgeSharpness/baseRoundness/worleyBlend/detailStrength/altBase/altTop），属于 spec 级的参数契约变更。

## Impact

- `shaders/cloud.wgsl`：`CloudShape` 结构新增字段；`cloudDensity()` 阶段 1-3 接入新字段；可能需要 `noise_fbm`/Perlin 采样（检查 `noise.wgsl` 是否已有，无则补）。
- `main.js`：`PARAM_OFFSETS` 扩展新字段偏移、`PARAMS_FLOAT_COUNT` 增大；`buildParams` 写入新字段；新增 `CLOUD_PRESETS`；GUI 预设下拉与插值过渡逻辑；frame 循环驱动过渡。
- 依赖：阶段 1 的 `cloud-params`（已归档）。
- 不影响：相机、缓存 ping-pong、bind group layout、风/天气图（后续阶段）。
- 验收基线：能切出 cumulus（平底圆顶蓬松）、stratus（均匀薄毯）、cirrus（高空细丝）、cumulonimbus（暗底高耸）四类肉眼可辨形态。
