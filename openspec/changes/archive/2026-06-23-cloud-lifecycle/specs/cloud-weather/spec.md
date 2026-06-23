## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 天气图随时间重绘
系统 SHALL 支持逐帧以新的每区域调制值重绘并上传天气图，使 B 通道 densityScale 与 R 通道 coverage 可随 `sceneTime` 变化，而非恒定。重绘 MAY 在调制值较上帧无显著变化时跳过以省带宽。

#### Scenario: densityScale 随时间变化
- **WHEN** 区域调制值在帧间变化（如生命周期推进）
- **THEN** 天气图 B 通道 SHALL 被重写并上传，渲染密度 SHALL 随之变化

#### Scenario: 静止帧免重绘
- **WHEN** 所有区域调制值较上帧变化小于阈值
- **THEN** 系统 MAY 跳过天气图重绘与上传
