## ADDED Requirements

### Requirement: CPU-only 密度 Producer 选择

`CloudParams` SHALL 提供 CPU-only `densityProducerMode`，至少包含 Legacy 与 Recipe V2 request，默认 Legacy。该字段 SHALL 只驱动 Producer selector，MUST NOT 写入 `PARAM_OFFSETS`、Params uniform 或 WGSL `Globals`。系统 SHALL 同时暴露 requested producer、active producer 与 fallback reason；`densityProducerMode` MUST 与 Cached/Hybrid/Realtime `qualityMode` 正交。

#### Scenario: 默认值不改变运行路径

- **WHEN** 使用默认 `densityProducerMode`
- **THEN** requested/active Producer SHALL 为 Legacy，现有 Params uniform 布局、Cached/Hybrid 画面和缓存调度 SHALL 不变

#### Scenario: V2 request 可见回退

- **WHEN** `densityProducerMode` 请求 Recipe V2 而 V2 尚不可用
- **THEN** UI/HUD SHALL 显示 requested=Recipe V2、active=Legacy 和 fallback reason，MUST NOT 把请求值误报为实际运行值

#### Scenario: 选择字段不进入 GPU 布局

- **WHEN** CPU 切换 `densityProducerMode`
- **THEN** `PARAMS_FLOAT_COUNT`、`BODY_BASE`、现有字段 offset 与 WGSL `Globals` MUST NOT 因该字段变化

#### Scenario: 与质量模式正交

- **WHEN** 在同一 producer request 下切换 Cached、Hybrid 或 Realtime
- **THEN** producer selector SHALL 只决定缓存生产者；quality mode SHALL 继续决定缓存消费或直接密度求值，不得把两个选择轴合并为单一枚举
