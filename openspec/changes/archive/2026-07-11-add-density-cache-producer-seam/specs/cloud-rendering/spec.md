## ADDED Requirements

### Requirement: 密度缓存消费者与 Producer 隔离

Cached/Hybrid 主 raymarch、地面云影 compute 与所有 density debug 视图 SHALL 仅通过 `DensityCacheOutput` 的 sampled views、sampler、blend、resolution 和 revision 元数据消费密度缓存。它们 MUST NOT 访问 Producer 内部 texture、storage view、写入 index、compute pipeline、storage bind group 或调度状态。Realtime SHALL 保持现有直接调用密度求值并跳过 cache encode 的语义。

#### Scenario: 主渲染消费统一输出

- **WHEN** active Producer 提供 valid `DensityCacheOutput`
- **THEN** Cached/Hybrid 主 raymarch 与光照行进 SHALL 从该 output 建立的 bind group 取样，画面与 Legacy 直接绑定缓存时一致

#### Scenario: 地面云影消费统一输出

- **WHEN** ground-shadow compute 需要 Cached/Hybrid 密度
- **THEN** 它 SHALL 从同一 output 建立自己的兼容 bind group，并在 resource generation/content revision 变化时重建绑定或失效历史

#### Scenario: Debug 不旁路 Seam

- **WHEN** 用户切换任一现有 density debug view
- **THEN** debug SHALL 使用与正常 Cached/Hybrid 渲染相同的 sampled output，MUST NOT 为调试重新访问 Legacy Adapter 内部缓存

#### Scenario: Realtime 保持现有语义

- **WHEN** `qualityMode` 为 Realtime
- **THEN** 主渲染、光照行进与地面云影的现有直接密度语义 SHALL 保持，且 Producer MUST NOT 编码 cache pass
