# Change: 引入云属艺术向文案并对齐 TOD 色板

## Why

`procedural-clouds-threejs/cloud-types.md` 为十属提供了 `artistic` 观感指引，以及 8 档 Time-of-Day「亮面 / 阴影 / 天空」色板。heli 已有 8 结点 `todColors()` 与按属光照，但：① 各属缺少可引用的艺术向验收文案；② 现有 TOD 关键色未对齐该色板，黄昏/暮色仍偏紫灰、云底暖色偏淡（roadmap 阶段 5 重校准备注）。把这两项落地，可降低调参主观成本，并直接改善昼夜观感。

## What Changes

- 将十属 `artistic` 文案（中英）纳入项目单一事实来源，并在预设编辑器按当前云属展示，作为调参/验收参考。
- 将 `todColors()` 的 `TOD_SUN` / `TOD_SHADOW` / `TOD_BG`（及配套 `TOD_AMBIENT` / `TOD_TOP`）关键色对齐 cloud-types 8 档艺术色板；结点高度角契约保持 `[-15,-6,0,5,12,25,45,90]`。
- 提供可关闭的色板混合或 A/B 开关，默认启用新色板；关闭时复现归档前关键色。
- 更新 `docs/cloud-types-review.md` / roadmap 相关备注，标明艺术向参考已入库。

## Non-Goals

- 不改密度、形态、edge-style、特效（日盘/日晕/闪光）、物理风、TAA/Bloom。
- 不做 Hosek-Wilkie / Bruneton 大气 LUT（仍属 roadmap 13.3）。
- 不按云属做独立 RGB lit/shadow 列（仍用全局 TOD + per-type `baseDarkening`）。
- 不引入 dawn/sunset 方位不对称（场景仍只有高度角）；0° 结点继续 dawn/sunset 共用。
- 不把 artistic 文案写进 GPU uniform 或影响着色数学。

## Capabilities

### Modified Capabilities

- `cloud-lighting`：TOD 关键色对齐艺术色板，并保留可回退路径。
- `cloud-presets`：预设编辑器展示当前云属艺术向文案。
- `cloud-genus-profile`：十属艺术向文案成为 profile/文档契约的一部分（与 placement profile 并列的参考元数据）。

## Prerequisites and Conflicts

- 依赖已归档的阶段 7 TOD 8 结点与 `SkyColors.shadow`。
- 与 active `add-cirrus-cumulonimbus-morphology` / `add-global-simulation-speed` 无布局冲突；本变更不扩 preset `vec4`。
- 阶段 5「人眼重校准」中与色板相关的部分由本变更承接；tonemap/exposure 数值复查仍可另做。

## Impact

- **代码**：`shaders/cloud.wgsl`（TOD 表）、`src/i18n.ts`、`src/gui.ts`；可选 `src/genusArtistic.ts` 或并入 `genusProfile.ts`；`docs/`。
- **规格**：修改 `cloud-lighting`、`cloud-presets`、`cloud-genus-profile`。
- **观感**：昼夜色温有意变化；可用开关回退旧表。
- **回退**：关闭新色板混合 / 恢复旧常量表即可。

- Approval status: approved by the user on 2026-07-10; implementation completed under this change.
