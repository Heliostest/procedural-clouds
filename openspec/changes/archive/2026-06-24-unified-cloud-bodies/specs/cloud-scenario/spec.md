## MODIFIED Requirements

### Requirement: 场景数据模型
系统 SHALL 提供 `Scenario` 数据模型，包含 `duration`、可选 `wind`、`bodies`（id → 云体定义：横向 `shape`/`bounds`/`feather`、垂直 `base`/`thickness`、`type`）与 `events`（关键帧数组，每条含 `t`、`bodyId`，可选 `coverage`/`densityScale`/`type`/`base`/`thickness`/`windDeg`/`windSpeed`/`ease`）。系统 SHALL 提供 JSON 的解析与导出，解析 MUST 校验必填字段并对事件按时间排序、补默认 `ease`。解析 SHALL 向后兼容旧版 `regions` 字段：见到 `regions`/`regionId` 时映射为 `bodies`/`bodyId` 并补默认垂直参数。

#### Scenario: 解析合法场景 JSON
- **WHEN** 加载一份含 duration/bodies/events 的合法 JSON
- **THEN** 系统 SHALL 构造出可播放的 `Scenario`，事件按 `t` 升序、缺省 `ease` 补为默认值

#### Scenario: 导出可往返
- **WHEN** 将一个 `Scenario` 导出为 JSON 再重新加载
- **THEN** 加载所得场景 SHALL 与原场景在播放表现上一致

#### Scenario: 非法 JSON 不崩溃
- **WHEN** 加载缺少必填字段或格式错误的 JSON
- **THEN** 系统 SHALL 保留当前场景并报告错误，不中断渲染

#### Scenario: 兼容旧版 regions
- **WHEN** 加载旧版含 `regions`/`regionId` 的场景 JSON
- **THEN** 系统 SHALL 将其映射为 `bodies`/`bodyId`（补默认 `base`/`thickness`）并正常播放

### Requirement: 场景播放器插值
`ScenarioPlayer` SHALL 按给定 `sceneTime` 为每个云体在相邻事件关键帧间插值其可变字段（`coverage`/`densityScale`，以及可选 `base`/`thickness`/`windDeg`/`windSpeed`，按 `ease` 取 linear 或 smoothstep），`type` 取前一关键帧离散值，并输出当前帧的 `CloudBody[]`。首个事件前 SHALL 采用首帧值，末个事件后 SHALL 采用末帧值。

#### Scenario: 关键帧间插值
- **WHEN** `sceneTime` 落在某云体两个事件之间且 `ease=smooth`
- **THEN** 该云体可变字段 SHALL 为两关键帧的平滑插值，而非突变

#### Scenario: 末帧后保持末态
- **WHEN** `sceneTime` 超过某云体最后一个事件的 `t`
- **THEN** 该云体 SHALL 保持该末帧值（如 coverage=0 即消散后晴空）

### Requirement: 场景启用与回退
系统 SHALL 提供场景启用开关。启用时云体集合 SHALL 由播放器驱动；禁用时 SHALL 回退到手动云体列表，画面与未启用场景时一致。

#### Scenario: 启用接管云体
- **WHEN** 启用场景并播放
- **THEN** 云体分布与演化 SHALL 由场景数据驱动，覆盖手动云体列表

#### Scenario: 禁用回退手动
- **WHEN** 关闭场景开关
- **THEN** 系统 SHALL 恢复手动云体列表，画面与未启用场景时一致
