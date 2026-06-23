## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 天气图启用开关
系统 SHALL 提供天气图启用开关。开启时按天气图分区域渲染；关闭时 `cloudDensity()` MUST 忽略天气图，全 box 按全局 `coverage` 与当前 `CloudShape`/预设渲染。

#### Scenario: 关闭回退全局渲染
- **WHEN** 关闭天气图开关
- **THEN** 全 box SHALL 按全局 coverage 与当前预设形态渲染整片云，与分区域无关

#### Scenario: 开启分区域渲染
- **WHEN** 开启天气图开关
- **THEN** 渲染 SHALL 按天气图区域分布（区域内有云、区域外晴空）
