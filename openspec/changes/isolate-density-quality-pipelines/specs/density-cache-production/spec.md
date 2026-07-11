## ADDED Requirements

### Requirement: Legacy cache compute Shader 与渲染 Pipeline 隔离

`LegacyDensityAdapter` SHALL 使用独立的 cache compute source closure、`GPUShaderModule` 与 compute pipeline。该 closure MAY 复用当前 Legacy density evaluator、noise 与 genus source 以保持缓存数值，但 MUST NOT 包含 cloud render、density debug、ground-shadow 或 Cached/Hybrid/Realtime quality adapter entry，也 MUST NOT 复用任一 cloud render bundle 的 `GPUShaderModule`。未来 Recipe V2 compute source manifest MUST NOT 引用 Legacy evaluator closure。

#### Scenario: Legacy cache module 只负责编码缓存

- **WHEN** 创建 Legacy Producer 的 compute module
- **THEN** assembled source SHALL 只包含缓存写入所需 ABI、Legacy evaluator 和 cache writer entry，MUST NOT 携带 cloud render 或 ground-shadow entry

#### Scenario: 缓存数值与调度保持

- **WHEN** 独立 Legacy compute pipeline 在相同 frame input、resolution 和 workgroup 下编码
- **THEN** 双缓存 RGBA 值、dispatch 数、update-rate、wind threshold、ping-pong、`cacheBlend`、content revision 与 pass 顺序 SHALL 与 W1 基线一致

#### Scenario: V2 不继承 Legacy 调用图

- **WHEN** W3 或后续 change 建立 Recipe V2 compute source
- **THEN** 其 source manifest MUST NOT 引用 W2 标记的 Legacy evaluator/noise/genus closure；若需要共享 ABI SHALL 只引用无密度数学的 shared 片段

### Requirement: Producer 调度跟随 Active Quality Mode

Pipeline manager SHALL 在 `DensityCacheProducer.prepareFrame()` 前解析 active quality mode。传给 Producer 的 frame quality 与写入 GPU 的 effective `qualityMode` SHALL 表示 actual active bundle，而不是尚在 compiling/failed 的 requested bundle。Active 为 Cached 或 Hybrid 时 Producer SHALL 保持现有 cache scheduling；只有 active 为 Realtime 时才可跳过 cache encode。

#### Scenario: Realtime 编译期间缓存继续更新

- **WHEN** requested=Realtime、candidate=`compiling` 且 active 仍为 Cached/Hybrid
- **THEN** Legacy Producer SHALL 按 active mode 继续 update-rate/wind-trigger cache encode，画面 MUST NOT 因请求值提前停止缓存而使用陈旧 output

#### Scenario: Realtime Ready 后跳过缓存

- **WHEN** Realtime bundle 已完全 ready 并原子成为 active
- **THEN** Producer frame plan SHALL 从该帧开始跳过 cache encode，Realtime render/ground shadow SHALL 直接求密度

#### Scenario: 回退后恢复缓存语义

- **WHEN** Realtime 创建失败或用户切回 Cached/Hybrid
- **THEN** active quality SHALL 保持或恢复 Cached/Hybrid，Producer SHALL 继续使用原 update-rate、wind threshold 和 cache blend 语义，无需重建 Producer 身份
