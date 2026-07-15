# Change: 将 Density V2 扩展为 Cellular / Wave 家族

## Why

W7 已使 Cumulus 与四个 Stratiform genus 在 Recipe V2 中产生非零密度，但 Stratocumulus、Altocumulus 与 Cirrocumulus 仍明确 unsupported。三者在气象形态上都由层状排列的云块或云粒构成，主要差异是 cell 尺度、连接度、层厚与波纹强度；继续为每属复制独立 shader 会违背 V2 以具名 family kernel 配合静态 Recipe 参数化的架构目标。

W8 需要证明现有共享 Base Atlas 的有界 Worley 信号足以支撑从低空大块高连接的 Stratocumulus，到中层中尺度 Altocumulus，再到高空细粒薄层 Cirrocumulus，同时不恢复 Legacy 完整 4D Voronoi 链、不新增每云体纹理或动态 operator interpreter。

## What Changes

- 新增一个预编译、参数化的 Cellular family evaluator，并在 Recipe V2 中启用 Stratocumulus、Altocumulus 与 Cirrocumulus；enabled genus 集合从五属扩展为八属。
- 三个 Cellular Recipe 均固定为一次 Macro + 两次 Base Atlas sample，共最多 3 次 shared sample；Detail、动态 octave、attachment 与额外邻域循环保持为零。
- 用 cell frequency、secondary scale、connectivity、coverage remap、vertical profile、ripple 与 finalize 参数区分三属：Sc 大 cell/高连接/厚，Ac 中 cell/中连接，Cc 小 cell/薄/强 ripple。
- 增加无额外纹理采样的静态 Wave/Lens/Roll hook；强度为零时必须在相关三角函数或形态组合前早退。W8 只使用有限的属级默认 ripple，不开放运行时 variant graph。
- 保持现有 `DensityRecipeGPU` layout version 2、256-byte stride、三张共享场纹理、RGBA16F 缓存协议、tile mask、top-two metadata 与正常帧 pass 数不变。
- 将旧 `add-stratocumulus-cumulus-breakup` 的 Stratocumulus 差异化目标吸收到 Cellular Recipe；不复制旧共享链参数，也不在 W8 修改 Cumulus Billow。
- 增加 Sc/Ac/Cc single、cellular scale、overlap 与 wave/ripple 固定 Legacy/V2 cases，以及 W8 Gate report。

## Non-Goals

- 不实现 Cirrus Fiber、Cumulonimbus Convective 或 Recipe-aware Hybrid；它们分别属于 W9–W11。
- 不实现 lenticularis、castellanus、floccus、stratiformis、volutus 的完整云种/变种系统，不扩展 scenario/import schema。
- 不实现 turret、roll attachment、precipitation、virga、mamma、fractus 或 Cumulus breakup。
- 不增加新的 atlas、texture、buffer class、bind group、compute pass、workgroup storage、atomics、compaction 或 indirect dispatch。
- 不在 cache compute 中执行完整 4D Voronoi/fBm、运行时 3D 邻域搜索或动态 sample/operator loop。
- 不提高默认 `96³` cache resolution 掩盖 cell 尺度、重复或薄层连续性问题。

## Capabilities

### New Capabilities

无。W8 扩展现有 Recipe V2 evaluator、schema 与 cache producer 能力。

### Modified Capabilities

- `density-v2-evaluators`：新增 Cellular family、八属静态分发、解析 Wave/Ripple hook 与 W8 Gate。
- `density-recipe-schema`：启用 Sc/Ac/Cc，并固化 Cellular 参数语义、Support 与采样预算。
- `density-shared-fields`：允许 Sc/Ac/Cc 复用既有 Macro/Base sampling ABI，并把 Cb/Ci 保持为零采样。
- `density-cache-production`：V2 source closure 从 Stratiform + Billow 扩展为 Stratiform + Billow + Cellular，并增加 W8 诊断和固定 manifests。

## Prerequisites and Conflicts

- 依赖已归档 W7 `2026-07-14-add-density-v2-stratiform-family` 与归档提交 `d1923b6`。
- W7 归档中仍保留未采集的完整手工矩阵与精确 timestamp 项；W8 不把这些空缺改写为 pass，也不继承任何未经记录的性能结论。
- `add-height-weather-shaping` 继续只作为 Legacy 行为基线；W8 不把其参数链复制进 V2。
- 当前不存在可实施的 `add-stratocumulus-cumulus-breakup` change；W8 只吸收其 Sc/Ac/Cc 差异化目标，不修改 Cumulus 或制造第三套 breakup。
- W8 必须单独获得批准后才能实施；本提案不授权代码变更。

## Impact

- **代码**：预计增加 Cellular WGSL family、三个 Recipe banks、CPU mirror/source fixtures、W8 manifests、HUD/Gate diagnostics。
- **GPU 稳态**：仍为一个 full-grid cache compute pass和每有效体素一次最终 RGBA16F store；每个通过早退的 Cellular Body 最多 Macro=1、Base=2。
- **GPU 资源**：不增加资源类别或持久内存；复用 W5 Base/Macro，W8 Cellular 不读取 Detail Atlas。
- **视觉**：Recipe V2 Cached/Hybrid 将显示 Cu/St/Cs/As/Ns/Sc/Ac/Cc；Cirrus 与 Cumulonimbus 继续明确 unsupported。
- **兼容**：Legacy 十属、Realtime、cache format、selector、quality pipelines、Optical Profile、ground shadow 与 post 不变。
- **文档**：W8 完成后更新 `docs/roadmap-refactor.md`，但未采集的视觉或性能证据不得记为通过。
