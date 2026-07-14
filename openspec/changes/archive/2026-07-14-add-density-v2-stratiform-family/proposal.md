# Change: 将 Density V2 扩展为完整 Stratiform 家族

## Why

W6 已用 Stratus 与 Cumulus 证明同一 DensityCacheProducer seam、共享 Atlas、保守 tile mask 和固定 Recipe record 可以承载两种相反拓扑，并由项目所有者批准继续。下一步不应立即迁移所有剩余云属，而应先验证同一廉价 Stratiform family kernel 能否通过参数化表达四种连续幕层：低空薄层 Stratus、高空极薄 Cirrostratus、中层柔和 Altostratus 与厚重 Nimbostratus。

这四属在数学上共同需要连续低频层场，而不是团块 Worley、Cellular、Fiber 或 Convective 链。W7 的价值在于证明 Recipe 真能复用“具名家族算子”而不是复制四份近似 shader；同时保持 Placement 与 Optical 正交，使 Cirrostratus halo、Altostratus sun disc、Nimbostratus 暗底/吸收继续由渲染阶段处理。

## What Changes

- 将 W6 Stratus-only evaluator 泛化为一个预编译、参数化的 Stratiform family evaluator；Stratus 保持 Thin Sheet、ABI 与采样预算回归，但允许修正经固定 benchmark 证明已饱和的 W6 bank 数值。
- 在 Recipe V2 中启用 Cirrostratus、Altostratus 与 Nimbostratus；保留 Cumulus 与 Stratus，总 enabled genus 集合变为五属。
- Thin Sheet profile 服务 Stratus/Cirrostratus；Soft Layer profile 服务 Altostratus/Nimbostratus。
- 四个 Stratiform Recipe 均保持固定成本：一次 Macro + 一次 Base，共最多 2 次 shared sample；Detail、warp、octave、attachment 与 Hybrid-specific detail 均为零。
- 通过 frequency、horizontal-vs-vertical anisotropy、bottom/top fade、thickness variation、coverage remap、low-amplitude modulation 与 density finalize 区分四属，不增加 record stride 或新纹理。
- 静态 dispatcher 以 enabled Recipe + topology family 路由一个 Stratiform kernel；Cumulus 继续使用 W6 Billow kernel，其他五属继续 disabled/零采样。
- 保持 Legacy-compatible soft overlap 与 RGBA metadata，使四属重叠时 Optical Profile 仍按主/次 genus 工作。
- 增加四属 single、family stack/overlap、Legacy/V2、Cached/Hybrid、normal/density-debug 固定验证入口和 W7 Gate report。
- 将 W6 benchmark 修正提交 `9a8d33a` 作为 timestamp collection 基线；不以 FPS 代替 cache timestamp，也不把项目所有者豁免伪装成性能 pass。

## Non-Goals

- 不实现 Stratocumulus、Altocumulus、Cirrocumulus、Cirrus 或 Cumulonimbus V2 evaluator。
- 不实现 Stratus fractus、Nimbostratus 底部 fractus/scud、virga、precipitation curtain 或任何降水输运。
- 不把 Cirrostratus halo、Altostratus sun disc、Nimbostratus absorption/base darkening 写入 density compute。
- 不增加 Detail Atlas sample、4D noise、动态 octave、domain warp、attachment、per-body texture、atomics、workgroup storage、compaction 或 indirect dispatch。
- 不实现 Recipe-aware Hybrid；W7 Cached/Hybrid 继续消费同一中尺度 cache，W11 才处理属级微观细节。
- 不改变 Realtime 完整 Legacy 路径，不删除 Legacy Producer，也不切换默认 Producer。
- 不提高默认 `96³` cache resolution 来掩盖薄层连续性问题。

## Capabilities

### New Capabilities

无。W7 扩展现有 Recipe V2 evaluator、schema 与 cache producer 能力。

### Modified Capabilities

- `density-v2-evaluators`：新增参数化 Stratiform family、五属静态分发与 W7 继续门。
- `density-recipe-schema`：启用五属集合并固化四个 Stratiform Recipe 的 profile 与预算。
- `density-cache-production`：V2 source closure 从双属扩展为 Cumulus + 四属 Stratiform，并增加家族诊断与 manifests。

## Prerequisites and Conflicts

- 依赖已归档 W6 `2026-07-12-add-density-v2-stratus-cumulus-spike` 与归档提交 `5615a71`。
- 依赖 benchmark/timestamp 收集修正 `9a8d33a`；该修正改善证据采集，不被视为 raymarch 性能优化。
- W6 精确 median/p90 未采集，由项目所有者显式豁免；W7 SHALL 保留 `pass/fail/unresolved/owner-waived` 区分。
- `add-height-weather-shaping` 继续作为 Legacy 视觉基线，不进入 V2 source closure。
- `add-height-ambient-tint` 与现有 optical preset 继续独立；W7 不修改 lighting 参数。
- `add-stratocumulus-cumulus-breakup` 属于未来 W8 Cellular/Wave，不在 W7 吸收或实现。

## Impact

- **代码**：预计泛化 `density-v2-stratus.wgsl` 为 family kernel，增加 Soft Layer profile、三个 Recipe banks、静态 source/budget fixtures、W7 manifests、HUD/gate diagnostics。
- **GPU 稳态**：仍为一个 full-grid cache compute pass、每有效体素一次最终 RGBA16F store；每个通过早退的 Stratiform Body 最多 2 次 shared sample。
- **GPU 资源**：不增加 texture、buffer class、bind group 或 pass；继续复用 W5 的 Base/Detail/Macro 资源，其中 W7 Stratiform 不读取 Detail。
- **视觉**：Recipe V2 Cached/Hybrid 将显示 St/Cs/As/Ns 与 Cumulus；其他五属在 V2 下保持明确 unsupported，Legacy 十属仍完整。
- **兼容**：cache format、metadata、ping-pong、selector、quality pipelines、ground shadow 与 post 不变。
- **文档**：W7 完成后更新 roadmap 状态；不会宣称未采集的性能或视觉矩阵已通过。
