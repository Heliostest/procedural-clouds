## MODIFIED Requirements

### Requirement: 天气图空间查询
系统 SHALL 提供覆盖 box XZ 平面的天气图纹理 `weatherMap`，`cloudDensity()` MUST 按采样位置的**未平流世界水平坐标**从天气图查询局部 `coverage`、`cloudType`、`densityScale`，并以局部值覆盖对应全局参数。区域 SHALL 锚定于 box 固定位置，不随风平流漂移；风仅驱动云内部细节。天气图通道约定 SHALL 为 R=coverage、G=cloudType、B=densityScale、A=形态微变信号 morph（编码 `A=(morph+1)/2`，默认 0.5 表示无微变）。

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

#### Scenario: A 通道默认无微变
- **WHEN** 区域未配置形态微变或位于区域外
- **THEN** A 通道 SHALL 为 0.5（morph=0），形态不受微变影响

### Requirement: 区域绘制 API
系统 SHALL 提供 Region API，接受 `{ shape: rect|circle, bounds, type, coverage, feather }` 描述，以软笔刷将区域写入天气图，边缘按 `feather` 羽化过渡。Region SHALL 可附带可选生命周期配置 `lifecycle`；绘制时 SHALL 接受每区域的调制值 `{ coverageMul, densityScale, morph }`（默认 `{1, 1, 0}`），R 通道写入 `coverage * coverageMul`、B 通道写入编码后的 `densityScale`、A 通道写入编码后的 `morph`。

#### Scenario: 绘制矩形与圆形区域
- **WHEN** 提交一个 rect 区域与一个 circle 区域
- **THEN** 天气图 SHALL 在对应位置写入各自的 coverage/type，区域外保持晴空

#### Scenario: 边缘羽化过渡
- **WHEN** 区域 `feather` 大于 0
- **THEN** 区域边缘的 coverage SHALL 由内向外平滑衰减，渲染结果无硬边

#### Scenario: 调制值默认不改变现状
- **WHEN** 绘制时未传入调制值（或调制值为 `{1, 1, 0}`）
- **THEN** 天气图写入 SHALL 与无生命周期时一致（coverage 原值、densityScale=1、A=0.5）
