# cloud-weather Specification

## Purpose
TBD - created by archiving change spatial-weather-map. Update Purpose after archive.
## Requirements
### Requirement: 天气图空间查询
系统 SHALL 提供覆盖 box XZ 平面的天气图纹理 `weatherMap`，`cloudDensity()` MUST 按采样位置的**未平流世界水平坐标**从天气图查询局部 `coverage`、`cloudType`、`densityScale`，并以局部值覆盖对应全局参数。区域 SHALL 锚定于 box 固定位置，不随风平流漂移；风仅驱动云内部细节。天气图通道约定 SHALL 为 R=coverage、G=cloudType、B=densityScale、A=区域 id。

#### Scenario: 局部覆盖度覆盖全局
- **WHEN** 天气图某位置 R 通道（coverage）与全局 coverage 不同
- **THEN** 该位置的密度场 SHALL 使用天气图的局部 coverage 求值，而非全局值

#### Scenario: 区域外晴空
- **WHEN** 采样位置的天气图 coverage 约等于 0
- **THEN** 该位置密度 SHALL 为 0（无云）

#### Scenario: densityScale 调制浓度
- **WHEN** 天气图 B 通道 densityScale 小于 1
- **THEN** 该位置最终密度 SHALL 按 densityScale 比例衰减

#### Scenario: 区域不随风漂移消失
- **WHEN** 设置非零风速并长时间推进 `sceneTime`
- **THEN** 区域位置 SHALL 保持固定，box 内 SHALL 持续有云覆盖，不因平流飘出天气图而消失

### Requirement: 按类型索引混合预设形态
天气图 G 通道解码出的云类型索引 SHALL 用于在候选云属预设的形态参数间插值（`mix`），以决定该位置的 `CloudShape` 形态。实现 MUST NOT 对全部预设做穷举分支，候选预设数 SHALL 限制在相邻的至多 3 个。

#### Scenario: 不同区域呈不同云属
- **WHEN** 天气图区域 A 的 type 索引指向 cumulus、区域 B 指向 cirrus
- **THEN** 区域 A 渲染 SHALL 呈 cumulus 形态、区域 B SHALL 呈 cirrus 形态

#### Scenario: 类型在相邻预设间平滑
- **WHEN** type 索引落在两个相邻预设之间
- **THEN** 该位置形态参数 SHALL 为这两个预设的插值，而非突变

### Requirement: 区域绘制 API
系统 SHALL 提供 Region API，接受 `{ shape: rect|circle, bounds, type, coverage, feather }` 描述，以软笔刷将区域写入天气图，边缘按 `feather` 羽化过渡。Region SHALL 可附带可选生命周期配置 `lifecycle`；绘制时 SHALL 接受每区域的调制值 `{ coverageMul, densityScale }`（默认 `{1, 1}`），R 通道写入 `coverage * coverageMul`、B 通道写入编码后的 `densityScale`。

#### Scenario: 绘制矩形与圆形区域
- **WHEN** 提交一个 rect 区域与一个 circle 区域
- **THEN** 天气图 SHALL 在对应位置写入各自的 coverage/type，区域外保持晴空

#### Scenario: 边缘羽化过渡
- **WHEN** 区域 `feather` 大于 0
- **THEN** 区域边缘的 coverage SHALL 由内向外平滑衰减，渲染结果无硬边

#### Scenario: 调制值默认不改变现状
- **WHEN** 绘制时未传入调制值（或调制值为 `{1, 1}`）
- **THEN** 天气图写入 SHALL 与无生命周期时一致（coverage 原值、densityScale=1）

### Requirement: 天气图启用开关
系统 SHALL 提供天气图启用开关。开启时按天气图分区域渲染；关闭时 `cloudDensity()` MUST 忽略天气图，全 box 按全局 `coverage` 与当前 `CloudShape`/预设渲染。

#### Scenario: 关闭回退全局渲染
- **WHEN** 关闭天气图开关
- **THEN** 全 box SHALL 按全局 coverage 与当前预设形态渲染整片云，与分区域无关

#### Scenario: 开启分区域渲染
- **WHEN** 开启天气图开关
- **THEN** 渲染 SHALL 按天气图区域分布（区域内有云、区域外晴空）

### Requirement: 天气图随时间重绘
系统 SHALL 支持逐帧以新的每区域调制值重绘并上传天气图，使 B 通道 densityScale 与 R 通道 coverage 可随 `sceneTime` 变化，而非恒定。重绘 MAY 在调制值较上帧无显著变化时跳过以省带宽。

#### Scenario: densityScale 随时间变化
- **WHEN** 区域调制值在帧间变化（如生命周期推进）
- **THEN** 天气图 B 通道 SHALL 被重写并上传，渲染密度 SHALL 随之变化

#### Scenario: 静止帧免重绘
- **WHEN** 所有区域调制值较上帧变化小于阈值
- **THEN** 系统 MAY 跳过天气图重绘与上传

