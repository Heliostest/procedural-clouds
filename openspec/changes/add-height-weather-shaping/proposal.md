# Change: 引入参考式高度–天气塑形（Sky Ocean Sun clouds）

## Why

兼容密度链已有 weather 足迹、altitude mask 与 `vEnvelope`，但 coverage→密度几乎不随高度改变响应曲线，云层上下缘偏「挤牙膏」、团块感弱。`MiniVerse/reference` 的 `clouds()` 用「双尺度 weather × 高度门控 × `pow(weather, 0.3+1.5·h)` × 两级 fbm 侵蚀 + 早退」以低成本做出更自然的垂直塑形；可在完整 Nubis 密度重建（roadmap 13.1）之前先落地，快速抬形态观感。

## What Changes

- 在共享兼容密度路径（`evalCompatibilityGenus` / `genus/common.wgsl`）增加可切换的参考式塑形：`densityShapeModel=0` 复现现路径；`=1` 启用高度–天气塑形。
- 启用时：以足迹 coverage 为 weather 基，叠加低成本大尺度调制（同 weather 低频采样或等价 XZ fbm），再乘高度 `smoothstep` 门控，并用 `pow(weather, 0.3+1.5·smoothstep(0.2,0.5,h))` 做高度相关塑形。
- 启用时：在塑形后做两级 fbm 侵蚀（粗 `~0.7·fbm` + 细 `~0.2·fbm`），各级 `≤0` 早退；`fast`/光照粗路径可只跑粗级。
- 保留既有 `altBase/altTop`、砧顶/平底/edge-style、属专属形态（纤维/对流塔/tileScale）职责；新塑形只改 coverage→基础密度的响应，不旁路属专属公式。
- GUI 暴露 `densityShapeModel`；默认 `1`；`0` 像素级复现引入前观感。

## Non-Goals

- 不做 Perlin-Worley / 完整 Nubis 密度重建、weather 多通道重构（roadmap 13.1）。
- 不做三指数 Beer MS、cone light march、大气球壳、海洋。
- 不改 TAA/Bloom/HDR、不扩 preset `vec4` 槽（新字段进 `Globals`）。
- 不把公式写进 dispatcher 或拆进十个属 evaluator；属专属入口继续先调兼容链再叠本属形态。

## Capabilities

### Modified Capabilities

- `cloud-morphology`：兼容密度链增加可切换的高度–天气塑形与两级 fbm 侵蚀。
- `cloud-params`：新增 `densityShapeModel`（及可选强度倍率），经 `packParams` 单一事实来源写入。

## Prerequisites and Conflicts

- 依赖已归档的 genus dispatcher / `evalCompatibilityGenus` 与 SDF weather 足迹。
- 与 active `add-triple-beer-multi-scatter` **无冲突**（彼改光照，本改密度）。
- 与 roadmap 13.1 **兼容**：本变更为廉价过渡；13.1 落地后本路径可并入新密度模型或降为风格开关。
- 不改变 CloudBody / scenario JSON schema。

## Impact

- **代码**：`shaders/genus/common.wgsl`（主）、必要时 `noise.wgsl`；`src/params.ts`、`src/gui.ts`、`src/i18n.ts`；可选备注 `docs/roadmap-v2.md`。
- **规格**：修改 `cloud-morphology`、`cloud-params`。
- **观感**：云层上下缘更软、中层更「成团」；可用开关回退。
- **性能**：新路径多 1–2 次 fbm；靠 `cloudShape≤0` / 侵蚀后 `≤0` 早退抵消空区成本；须用 Hybrid 打点验收。
