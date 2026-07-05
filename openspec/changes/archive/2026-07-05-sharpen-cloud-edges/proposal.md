# Change: Separate cumulonimbus morphology from edge rendering

## Why

当前阶段 10 实现把同一个 `edgeHardness` 同时用于 `evalBody()` 的积雨云砧顶、顶部截断、底部包络，以及 raymarch 取样阶段的密度传递和解析侵蚀。结果是关闭边缘锐化时，积雨云结构也随之消失；调整边缘表现会意外改变云属形态。

积雨云结构属于密度场生成，边缘硬化属于密度场生成后的渲染响应。两者必须成为可独立控制、可独立回退、可正交验收的参数域。

## What Changes

- 把阶段 10 拆为两个独立能力域：
  - **云属形态**：`anvilStrength`、`topCutoffSharpness` 与既有 `baseRoundness`，只参与 `evalBody()` 和密度缓存生成。
  - **边缘渲染**：`edgeHardness`、`edgeErosionStrength`、全局阈值与总开关，只参与统一 raymarch 取样入口的后置密度响应。
- 保留每云属的边缘风格默认值，以支持混合云属场景，但边缘风格不得再驱动任何几何包络、砧顶足迹或云底曲线。
- 在 CPU 预设模型与 WGSL 访问器中分别暴露 morphology 与 edge-style 语义；GPU 预设缓冲可继续复用现有 `p5` 空余分量，避免无必要的布局扩容。
- GUI 分成“云属形态”和“边缘渲染”两组；两组参数可实时独立调节。
- 用四象限 A/B 验收替代原来的单一总开关验收：结构开/关 × 边缘开/关。
- 修正回退定义：关闭 `edgeSharpening` 只恢复软边传递，不再撤销积雨云砧顶；要完整复现阶段 10 前形态，必须同时把新增形态参数设为 0。

## Impact

- Affected specs:
  - modified `cloud-presets`（云属形态参数与独立性）
  - new `cloud-edge-shaping`（后置边缘渲染）
- Affected code after approval: `src/params.ts`, `src/gui.ts`, `src/i18n.ts`, `shaders/cloud.wgsl`
- Affected docs after approval: `docs/roadmap-v2.md`
- Compatibility: 现有 `p5.x` 可继续保存 per-genus `edgeHardness`；`p5.y/z/w` 可分别保存 `anvilStrength`、`topCutoffSharpness`、`edgeErosionStrength`
- Approval status: approved by the user and implemented; verification results are recorded in `tasks.md` and `docs/roadmap-v2.md`
