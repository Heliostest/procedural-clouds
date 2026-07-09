# Change: 引入三指数 Beer 多重散射（Sky Ocean Sun 廉价 MS）

## Why

当前 `sunVisibility` 已是三 octave Beer 雏形，但系数固定、与视线–太阳夹角无关，厚云背光易死黑、朝阳侧透光分层弱。`MiniVerse/reference` 的 `lightRay` 用「三指数 Beer + `scatterAmount(μ)` + 密度/高度调制」以极低成本改善云内透光；可在正式 Hillaire cone MS（roadmap 13.2）之前先落地，快速抬观感。

## What Changes

- 将朝阳光路可见度从固定权重三 octave 升级为参考式三指数 Beer：`e^{-τ} + a·e^{-0.1τ} + b·e^{-0.02τ}`，其中 `a/b` 由 `scatterAmount(μ)`（`μ = dot(sun, view)`）驱动。
- 在散射项上叠加参考式密度/高度调制：`mix(薄云高度塑形, 1, clamp(τ·k))`，使厚云更吃透射、薄高处更亮。
- 提供 GUI/`msModel`（或等价）开关：新路径 / 旧 `sunVisibility` A/B；默认启用新路径，旧路径复现引入前观感。
- 新路径开启时默认减弱 `powderStrength`（或提供推荐默认），避免与 MS 双重压暗；powder 仍可手动调回。
- **不**做 cone 采样、**不**形式化 Hillaire N-octave、**不**改主步进解析积分（仍属 13.2）。

## Non-Goals

- Cone-sampled light march、Hillaire `a=b=c≈0.5` 形式化 MS、主步进 `S=(1-e^{-σΔt})·scatter/σ`（roadmap 13.2）。
- `numericalMieFit`、大气球壳、密度模型重建（13.1）。
- 改 Bloom/TAA/HDR/天气图。

## Capabilities

### Modified Capabilities

- `cloud-lighting`：朝阳可见度改为可切换的三指数 Beer + μ 驱动散射量 + 可选密度/高度调制。
- `cloud-params`：新增 MS 模型开关与相关强度字段，经 `packParams` 单一事实来源写入。

## Prerequisites and Conflicts

- 依赖已有 `lightMarchDepth` / `sunVisibility` / 双瓣相位 / powder。
- 与 active 变更无冲突（当前无 active changes）。
- 与 roadmap 13.2 **兼容**：本变更为廉价过渡；13.2 落地后本路径可降为风格化备选或删除。
- 不扩 preset `vec4`；仅动 `Globals` 剩余/新增槽并同步 `BODY_BASE`。

## Impact

- **代码**：`shaders/cloud.wgsl`（`sunVisibility` 或并列 `sunVisibilityTripleBeer`）、`src/params.ts`、`src/gui.ts`、`src/i18n.ts`；可选更新 `docs/roadmap-v2.md` 备注。
- **规格**：修改 `cloud-lighting`、`cloud-params`。
- **观感**：厚云内部更透、朝阳侧分层更明显；可用开关回退。
- **性能**：无额外 light-march 步数；仅改可见度合成公式。
