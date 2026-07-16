## ADDED Requirements

### Requirement: CPU-only Recipe V2 存储模式选择

`CloudParams` SHALL提供CPU-only `densityStorageMode` request，至少包含global-only与hierarchical，默认global-only。该字段 SHALL只驱动Recipe V2 storage candidate与renderer quality/storage bundle选择，MUST NOT写入`PARAM_OFFSETS`、Params uniform、WGSL `Globals`、scenario、preset或Recipe record。系统 SHALL同时暴露requested storage、active storage、lifecycle与fallback reason。

`densityStorageMode` MUST与`densityProducerMode`及Cached/Hybrid/Realtime `qualityMode`正交：Producer决定Legacy/Recipe V2，storage决定Recipe V2 cache的global-only/hierarchical representation，quality决定缓存消费或Realtime直接求值。Legacy或Realtime active时hierarchical request MAY保持可见，但 MUST NOT创建或编码无人消费的brick资源。

#### Scenario: 默认值不改变运行路径

- **WHEN** 使用默认`densityProducerMode=Legacy`与`densityStorageMode=global-only`
- **THEN** requested/active Producer与storage SHALL保持Legacy/global-only，现有Params布局、Cached/Hybrid画面、GPU资源与缓存调度 SHALL不变

#### Scenario: Hierarchical请求可见回退

- **WHEN** Recipe V2 active且`densityStorageMode`请求hierarchical但candidate尚未ready或创建失败
- **THEN** UI/HUD SHALL显示requested=hierarchical、active=global-only、lifecycle与reason，MUST NOT把request误报为active

#### Scenario: 选择字段不进入GPU与持久化布局

- **WHEN** CPU切换`densityStorageMode`
- **THEN** `PARAMS_FLOAT_COUNT`、`BODY_BASE`、现有offset、WGSL `Globals`、scenario JSON、preset与`DensityRecipeGPU` stride MUST不变

#### Scenario: 三个选择轴正交

- **WHEN** 在同一Recipe V2 storage request下切换Cached、Hybrid或Realtime，或在同一quality下切换Producer/storage
- **THEN** 系统 SHALL分别解析producer、storage与quality active状态，MUST NOT合并为单一枚举或让requested值提前驱动GPU路径

#### Scenario: Realtime不创建Brick资源

- **WHEN** requested storage为hierarchical但active quality为Realtime
- **THEN** requested状态 MAY保留，hierarchical candidate SHALL保持idle或停止消费，brick texture/buffer/pass MUST为零直到active quality回到Cached/Hybrid
