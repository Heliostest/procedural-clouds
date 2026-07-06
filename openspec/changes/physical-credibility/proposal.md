# Change: 建立云场物理空间基础层

## Why

当前 demo 的云体位置、包围盒、相机与噪声都直接使用紧凑的渲染世界单位。`base/thickness/bounds` 可以表达相对布局，但不能稳定表达“云底约 1 km、卷云位于 7 km、积雨云顶部接近 12 km”等物理参考值；预设中的 `altBase/altTop` 也仍混有旧的全局高度层含义。

直接把 `cloudHeight` 从 8 改为 12000 会破坏相机、包围盒、96³ 密度缓存、raymarch 步长、天气图与噪声尺度。因此本变更只建立一个可独立验收和归档的 **P0 物理空间基础层**：场景数据使用米，渲染继续使用紧凑 world units，两者通过显式比例转换。

## What Changes

- **BREAKING（内部数据契约）— 物理场景空间**：`CloudBody.base/thickness/bounds/feather`、scenario event 的 `base/thickness`、`cloudHeight` 与 `boxHalfExtent` 在 CPU 数据和新版 scenario JSON 中统一使用米；旧 JSON 由兼容 loader 迁移。
- **高度基准**：Y=0 定义为场景地面基准（AGL-like scene datum），不声称是平均海平面绝对海拔；本变更不引入地形海拔或 MSL datum。
- **渲染空间映射**：新增 `verticalMetersPerWorldUnit` 与 `horizontalMetersPerWorldUnit`。CPU 在 GPU pack、天气图、gizmo、线框、坐标轴和相机适配边界处统一换算，shader 仍在紧凑 world units 中采样。
- **十属参考 profile**：新增带版本的 `temperate-demo-v1` profile set，分别保存推荐云底范围、默认云底、默认厚度与默认水平半宽；参考值明确区分 WMO 层级范围与项目艺术默认值。
- **默认 placement**：新增云体和换属统一经过 `BodyStore.setType()`；未锁定 placement 时应用 profile，已锁定时保留用户值。
- **物理约束模式**：默认仅警告；开启 enforcement 时只 clamp 云底到当前 profile 的推荐范围，并保证顶部不超过场景层顶。该逻辑只在 CPU 执行，不占用 GPU uniform。
- **垂直剖面语义**：`altBase/altTop` 与 preset `altitude` 只在云体自身 `[base, base+thickness]` 的局部 Y 中塑形，不再编码高云/中云/低云的全局盒体位置。初始迁移以 `[0,1]` 为基线，再按十属 A/B 校准内部形态。
- **场景迁移**：scenario v2 显式声明 `schemaVersion: 2`、`distanceUnit: "m"`；缺少版本的旧 JSON 按 legacy world units 读取，并通过当前世界比例转换为米，保持原画面位置。
- **完整尺度链适配**：同步更新相机 framing/far plane、GUI 范围、天气图绘制、坐标轴、gizmo、线框、密度缓存映射和 demo 数据，避免只修改高度数值。

## Non-Goals

- 风速 m/s、风场平流语义和 scenario `windUnit`；另行建立 P1 change。
- 生命周期不对称曲线、竖直发展和 genus 形态过渡；另行建立 P1 change。
- 种/变型、演化链模板、物理调试 overlay；另行建立 P2 change。
- 完整大气散射、水汽、降水、数值天气或全球云场重建。
- MSL 绝对海拔、地形高度 datum、纬度/季节驱动的动态气候 profile。

## Capabilities

### New Capabilities

- `cloud-physical-units`：米制场景数据、scene-ground datum 与紧凑渲染空间之间的显式映射。
- `cloud-genus-profile`：带来源和版本的十属参考表、默认 placement、锁定策略与约束行为。

### Modified Capabilities

- `cloud-body`：位置与范围字段改为米；新增 placement lock 与集中换属路径。
- `cloud-presets`：`altBase/altTop` 接入云体内部垂直包络，并移除全局高度层语义。
- `cloud-params`：新增米/渲染单位比例；明确场景尺寸和 enforcement 的 CPU 语义。
- `cloud-scenario`：增加 v2 距离单位契约和 legacy world-unit 迁移。

## Prerequisites

- 先归档已完成的 `lighting-quality`。
- 完成或明确暂停 `per-preset-lighting` 的剩余视觉验收；本变更以其当前 `CLOUD_PRESETS` 布局为基线，避免并行修改同一预设结构。

## Impact

- **代码**：`src/params.ts`、`src/body.ts`、`src/scenario.ts`、`src/gui.ts`、`src/i18n.ts`、`src/camera.ts`、`src/weather.ts`、`src/axis.ts`、`src/gizmo.ts`、`src/renderer.ts`、`shaders/cloud.wgsl`
- **文档**：`docs/glossary.md`、`docs/cloud-types-review.md`，并记录 WMO 与 `../procedural-clouds-threejs/cloud-types.md` 的来源边界
- **内部契约**：`CloudBody` 距离字段从 legacy world units 改为米，属于内部数据语义变更；scenario loader 保留旧 JSON 兼容
- **默认构图**：默认场景层顶为 12000 m、水平半宽为 16000 m，通过 1000 m/world-unit 映射为约 12×32×32 的紧凑渲染空间
- **回退**：保留 legacy demo preset 与 scenario v1 loader；关闭 enforcement 不改变用户 placement
