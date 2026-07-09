# Change: 增加三属标志性光照特效

## Why

altostratus、cirrostratus、cumulonimbus 已有可辨形态与按属光照，但仍缺各自最强辨识特征：薄云后的朦胧日盘、冰晶 22° 日晕、积雨云内部暖色闪光。这三项已在 `docs/roadmap-v2.md` 阶段 14 与 `procedural-clouds-threejs/cloud-types.md` 标注，属于低成本、高辨识度的锦上添花。

## What Changes

- `fs` 背景合成：altostratus 主导时，太阳光斑强度按最终云透过率衰减，薄云透出朦胧日盘，厚云仍遮挡。
- `fs` 天空：cirrostratus 主导时，在 `acos(sunTheta) ≈ 22°` 处叠加可调亮环。
- raymarch 散射：cumulonimbus 主导时，用仿真 `sceneTime` 驱动稀疏暖色闪光脉冲叠加到散射。
- preset 光照扩展：新增 `sunDiscVisible`、`haloEffect`、`internalLightning`（`[0,1]`），扩第八个 preset `vec4`（`p7`）；非目标属默认 0。
- GUI/i18n 暴露三项强度；零强度精确旁路，复现引入前观感。

## Non-Goals

- 不改密度场、genus evaluator、edge-style、物理风、地面阴影、TAA/Bloom/god rays。
- 不做真实大气折射日晕、真实闪电几何或 precipitation。
- 不新增 species/variant，不改 CloudBody / scenario JSON schema。
- 不实现 `tileScale`、多层叠云配方或其他 cloud-types 艺术向项。

## Capabilities

### Modified Capabilities

- `cloud-lighting`：增加日盘透过、22° 日晕、积雨云内部闪光三项着色行为。
- `cloud-presets`：三目标属默认开启对应特效强度；其余属为 0。
- `cloud-params`：preset 光照字段与 GPU 布局扩至 8 个 `vec4`，打包契约同步。

## Prerequisites and Conflicts

- 依赖已有按属光照（`blendedLighting` / `typeLightingBlend`）与仿真时间（`sceneTime`）；闪光 MUST 读仿真时间，不得用 wall-clock。
- active `add-cirrus-cumulonimbus-morphology` 已占 `p6`；本变更新增 `p7`，不得改写 p5/p6 既有映射。
- active `add-global-simulation-speed`：闪光脉冲随仿真倍速缩放；`0×` 时闪光相位冻结。

## Impact

- **代码**：`src/params.ts`、`src/gui.ts`、`src/i18n.ts`、`shaders/cloud.wgsl`；必要时布局断言脚本。
- **规格**：修改 `cloud-lighting`、`cloud-presets`、`cloud-params`。
- **内部布局**：每属 preset 由 7→8 个 `vec4`；不影响已保存 scenario/body。
- **观感**：仅三目标属默认有意变化；强度 0 时全属 MUST 与改前一致。
- **回退**：三项强度置 0 即可恢复。

- Approval status: approved by the user on 2026-07-09; implementation completed under this change.
