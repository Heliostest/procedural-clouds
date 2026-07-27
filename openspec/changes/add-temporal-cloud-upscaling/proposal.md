# Change: 4×4 Bayer Temporal Cloud Upscaling（W11）

## Why

W10A 已冻结 cloud-only `CloudFrameOutput` ABI，W10B 已冻结 world-step/skip/STBN 采样基线；全分辨率每帧 raymarch 仍是主 GPU 成本。W11 用固定 4×4 Bayer 时域升采样（TAAU）把 current cloud 降到宽高各 1/4（raymarched texel 数为 1/16），再在 full-res resolve/history 重建，为后续 W12 细节预算腾出采样资金。

## What Changes

- 在保留现有 full-resolution TAA（ping-pong history、YCoCg 3×3 variance clip、Halton jitter、resize/开关 reset）的前提下，新增互斥的 TAAU 质量路径：同一像素只允许一个 history owner，不得先 TAA 再 TAAU。
- 增加 low-res cloud current pass（宽高各 `full/4`，ceil 映射有 fixture）；`frame % 16` 选择 Bayer phase；TAAU 模式下 Bayer 独占 projection/current-pixel jitter，不再叠加 Halton；W10B STBN/IGN 只扰动 ray 起点/步进与采样序列。
- Full-res TAAU resolve：当前 phase 写 current sample，其余 15 phase 从重投影 history 恢复；velocity 取自 low-res 3×3 最近有效云深度/最高 derived opacity（`opacity = 1 - T`）；增加 viewport/depth/opacity/generation/camera-cut rejection 与 reactive/disocclusion 规则。
- 固化三代失效语义名：`resourceGeneration`、`contentRevision`、`discontinuityGeneration`（或等价 discontinuity flag）；结构性不连续整屏 invalidation，正常 content revision / 风平流不得每帧整屏 reset。
- 暴露 TAAU 模式参数、phase/debug 诊断与 Gate 证据路径；legacy combined emergency fallback 下 MUST 禁用 TAAU。
- **不**实现 W12 render-time detail；**不**改 BSM/光照、Density Recipe/family；**不**重定义 W10A attachment/composite owner；**不**改 W10B world-step/skip/STBN 算法。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cloud-rendering`：唯一 history owner、low-res current + full-res TAAU resolve、Bayer phase/jitter 一致性、rejection/reactive mask、结构性 invalidation、emergency fallback 禁用 TAAU、Gate 可观测路径。
- `cloud-params`：TAAU/full-res TAA 模式选择与相关 blend/reactive 阈值字段；默认保持 full-res TAA 直至设备矩阵通过。

## Prerequisites and Conflicts

- 硬依赖已归档 W10A `2026-07-27-refactor-cloud-frame-output`：`CloudFrameOutput` radiance/transmittance、depth/velocity、validity、`resourceGeneration`/`contentRevision`/`discontinuityGeneration`、full-res cloud-only feature fallback、composite owner。
- 硬依赖已归档 W10B `2026-07-27-add-world-scale-cloud-raymarch`：world-step/skip/STBN（或 IGN/Halton fallback）采样基线；STBN 不得占用 Bayer pixel phase。
- **不**依赖 W9 `add-hierarchical-body-local-density-bricks` final Continue；W9 disposition 仍可为 pending。W11 可在 global-only 基线上工作。
- 不得修改主 specs 中 `cloud-frame-output` / `cloud-stochastic-sampling` 文本；若需触及 attachment 语义，记入 design 开放问题，不擅自写 delta。
- Active overlaps：若仍有 W8/W9 或其他改 `cloud-rendering`/`cloud-params` 的 change，W11 只追加 temporal 路径，不得改写其 density/brick/recipe 要求。

## Impact

- Affected specs: `cloud-rendering`、`cloud-params`
- Affected code（实施阶段，本提案不改）：`src/renderer.ts`（`cloudTaaPipeline` / `legacyTaaPipeline`、`historyTex` ping-pong、`halton`、`previousJitterX/Y`、`historyValid`）、`src/rendering/cloudFrameOutput.ts`、`src/params.ts`（`taaEnabled`/`taaBlend` 等）、可能新增 `src/rendering/` TAAU helper、`scripts/check-w11-*.mjs`、Gate 证据目录
- Consumers: full-res composite（仍由 W10A owner）、Bloom/tonemap 相对顺序保持可回退
- Default: full-res TAA 保持默认，直到目标设备矩阵 Gate 通过后再考虑默认切 TAAU
