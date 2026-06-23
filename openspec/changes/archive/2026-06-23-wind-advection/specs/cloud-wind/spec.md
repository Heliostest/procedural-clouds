## ADDED Requirements

### Requirement: 风向平流位移
系统 SHALL 提供风的平流位移：密度场按 `wind.dir * wind.speed * sceneTime` 对水平采样坐标做域偏移，使云团整体沿风向水平漂移。垂直结构（高度掩膜、顶部截断、falloff）MUST NOT 随平流移动。

#### Scenario: 云团整体随风漂移
- **WHEN** 设置非零 `wind.dir` 与 `wind.speed` 并随时间推进
- **THEN** 云团 SHALL 沿风向水平移动，而非仅就地形变

#### Scenario: 风速为零时静止
- **WHEN** `wind.speed = 0`
- **THEN** 密度场水平位置 SHALL 不随 `sceneTime` 漂移

### Requirement: 平流与形变解耦
噪声 W 轴形变时间 SHALL 由 `wind.morphRate * sceneTime` 驱动，与平流位移所用的 `wind.speed` 相互独立。

#### Scenario: 形变独立于位移
- **WHEN** 固定 `wind.speed`、单独增大 `wind.morphRate`
- **THEN** 云团位移速度 SHALL 不变，而边缘细节形变速率 SHALL 加快

#### Scenario: 无形变时位移仍生效
- **WHEN** `wind.morphRate = 0` 且 `wind.speed > 0`
- **THEN** 云团 SHALL 整体漂移且内部细节不闪烁形变

### Requirement: 平流边界环绕
平流导致采样坐标超出包围盒水平范围时，系统 SHALL 以周期性环绕处理，使云从对侧重新进入，且长时间运行不产生空区或可见硬接缝。

#### Scenario: 长时间漂移无空区
- **WHEN** 持续平流使云飘出原始 box 水平范围
- **THEN** box 内 SHALL 持续有云覆盖，不出现因飘出导致的空白区
