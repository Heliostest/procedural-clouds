# cloud-weather Specification

## Purpose
TBD - created by archiving change spatial-weather-map. Update Purpose after archive.
## Requirements
### Requirement: 天气图空间查询
系统 SHALL 提供覆盖 box XZ 平面的天气图纹理 `weatherMap`，`cloudDensity()` MUST 按采样位置的水平坐标从天气图查询局部 `coverage`、`cloudType`、`densityScale`，并以局部值覆盖对应全局参数。天气图通道约定 SHALL 为 R=coverage、G=cloudType、B=densityScale、A=区域 id。

#### Scenario: 局部覆盖度覆盖全局
- **WHEN** 天气图某位置 R 通道（coverage）与全局 coverage 不同
- **THEN** 该位置的密度场 SHALL 使用天气图的局部 coverage 求值，而非全局值

#### Scenario: 区域外晴空
- **WHEN** 采样位置的天气图 coverage 约等于 0
- **THEN** 该位置密度 SHALL 为 0（无云）

#### Scenario: densityScale 调制浓度
- **WHEN** 天气图 B 通道 densityScale 小于 1
- **THEN** 该位置最终密度 SHALL 按 densityScale 比例衰减

### Requirement: 按类型索引混合预设形态
天气图 G 通道解码出的云类型索引 SHALL 用于在候选云属预设的形态参数间插值（`mix`），以决定该位置的 `CloudShape` 形态。实现 MUST NOT 对全部预设做穷举分支，候选预设数 SHALL 限制在相邻的至多 3 个。

#### Scenario: 不同区域呈不同云属
- **WHEN** 天气图区域 A 的 type 索引指向 cumulus、区域 B 指向 cirrus
- **THEN** 区域 A 渲染 SHALL 呈 cumulus 形态、区域 B SHALL 呈 cirrus 形态

#### Scenario: 类型在相邻预设间平滑
- **WHEN** type 索引落在两个相邻预设之间
- **THEN** 该位置形态参数 SHALL 为这两个预设的插值，而非突变

### Requirement: 区域绘制 API
系统 SHALL 提供 Region API，接受 `{ shape: rect|circle, bounds, type, coverage, feather }` 描述，以软笔刷将区域写入天气图，边缘按 `feather` 羽化过渡。

#### Scenario: 绘制矩形与圆形区域
- **WHEN** 提交一个 rect 区域与一个 circle 区域
- **THEN** 天气图 SHALL 在对应位置写入各自的 coverage/type，区域外保持晴空

#### Scenario: 边缘羽化过渡
- **WHEN** 区域 `feather` 大于 0
- **THEN** 区域边缘的 coverage SHALL 由内向外平滑衰减，渲染结果无硬边

