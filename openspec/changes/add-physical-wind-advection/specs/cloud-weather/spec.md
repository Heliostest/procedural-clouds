## MODIFIED Requirements

### Requirement: 天气图空间查询

系统 SHALL 提供覆盖 box XZ 平面的每体天气图纹理层 `weatherMap`。纹理像素 SHALL 保持作者 placement 的静态数据；`cloudDensity()` 查询某云体层时 MUST 先从世界水平采样坐标减去该体 `advectionOffsetWorld`，再映射到天气图 UV，使足迹覆盖、`cloudType`、`densityScale` 与内部密度随同一水平风在世界坐标中运输。垂直高度带 MUST NOT 随该水平 offset 移动。天气图通道约定 SHALL 为 R=coverage、G=cloudType、B=densityScale、A=形态微变信号 morph（编码 `A=(morph+1)/2`，默认 0.5 表示无微变）。

#### Scenario: 局部覆盖度覆盖全局

- **WHEN** 天气图某位置 R 通道（coverage）与全局 coverage 不同
- **THEN** 该云体运输后的对应世界位置 SHALL 使用天气图的局部 coverage 求值，而非全局值

#### Scenario: 区域外晴空

- **WHEN** 逆向运输映射后的天气图位置 coverage 约等于 0
- **THEN** 该云体在当前世界采样位置的密度 SHALL 为 0

#### Scenario: densityScale 调制浓度

- **WHEN** 天气图 B 通道 densityScale 小于 1
- **THEN** 对应运输后世界位置的最终密度 SHALL 按 densityScale 比例衰减

#### Scenario: 足迹随世界风移动

- **WHEN** 某云体具有非零累计水平运输 offset
- **THEN** 该体天气图足迹的有效世界位置 SHALL 平移相同 offset，而纹理像素数据无需逐帧重绘

#### Scenario: A 通道默认无微变

- **WHEN** 区域未配置形态微变或位于区域外
- **THEN** A 通道 SHALL 为 0.5（morph=0），形态不受微变影响
