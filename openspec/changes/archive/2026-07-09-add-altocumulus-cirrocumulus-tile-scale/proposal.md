# Change: 高积云/卷积云鱼鳞胞元尺度

## Why

altocumulus 与 cirrocumulus 的辨识特征是规则重复的小云胞（鱼鳞/华夫）。当前两属仍直通兼容密度链，仅靠较高 `worleyBlend` 与不同 `scale` 区分，缺少独立的胞元重复尺度控制。`procedural-clouds-threejs/cloud-types.md` 已标注 `tileScale`（Ac≈0.8、Cc≈1.5），heli 尚未落地。

## What Changes

- 在 `evalAltocumulus()` / `evalCirrocumulus()` 内增加可调鱼鳞/胞元密度重塑，用 `tileScale` 控制重复单元尺度。
- preset morphology 新增 `tileScale`（`[0,1]` 规范化或有界映射）；默认 Ac/Cc 非零，其余八属为 0。
- 复用 `p7.w`（当前保留为 0）存放 `tileScale`，不扩第九个 `vec4`。
- `tileScale=0` 时两属 evaluator 在新增噪声前返回兼容密度。
- GUI/i18n 暴露该字段；dispatcher 仅向 Ac/Cc 传入扩展输入，其余八属保持标量签名。

## Non-Goals

- 不改 cirrus 纤维、Cb 对流塔、edge-style、光照特效、TOD 色板。
- 不把鱼鳞公式塞进 `evalCompatibilityGenus()` 或 dispatcher。
- 不新增 species/variant，不改 CloudBody / scenario schema。
- 不做降水、风切变倾斜或多层叠云。

## Capabilities

### Modified Capabilities

- `cloud-morphology`：Ac/Cc 鱼鳞胞元形态与零强度回退。
- `cloud-presets`：`tileScale` 默认值与十属完整性。
- `cloud-params`：`p7.w` 打包契约由保留位改为 `tileScale`。

## Prerequisites and Conflicts

- 基于已归档的 genus dispatcher 与 cirrus/Cb 形态扩展边界。
- `p7.xyz` 已被日盘/日晕/闪光占用；本变更只占用 `p7.w`，不得改写 xyz。
- active `add-artistic-direction-and-tod-palette` 不改 preset GPU 布局，无冲突。

## Impact

- **代码**：`src/params.ts`、`src/gui.ts`、`src/i18n.ts`、`shaders/genus/altocumulus.wgsl`、`shaders/genus/cirrocumulus.wgsl`、`shaders/genus/dispatch.wgsl`、`shaders/genus/common.wgsl`（仅共享 helper，若需要）、布局断言脚本。
- **规格**：修改 `cloud-morphology`、`cloud-presets`、`cloud-params`。
- **观感**：默认 Ac/Cc 有意更「鱼鳞」；`tileScale=0` 时 MUST 与改前一致。
- **回退**：两属 `tileScale` 置 0。

- Approval status: approved by the user on 2026-07-10; implementation completed under this change.
