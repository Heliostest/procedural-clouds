# cloud-scenario Specification

## Purpose
TBD - created by archiving change cloud-scenario. Update Purpose after archive.
## Requirements
### Requirement: 场景数据模型
系统 SHALL 提供 `Scenario` 数据模型，包含 `duration`、`wind`、`regions`（id → 几何/类型/羽化）与 `events`（关键帧数组，每条含 `t`、`regionId`，可选 `coverage`/`densityScale`/`type`/`ease`）。系统 SHALL 提供 JSON 的解析与导出，解析 MUST 校验必填字段并对事件按时间排序、补默认 `ease`。

#### Scenario: 解析合法场景 JSON
- **WHEN** 加载一份含 duration/wind/regions/events 的合法 JSON
- **THEN** 系统 SHALL 构造出可播放的 `Scenario`，事件按 `t` 升序、缺省 `ease` 补为默认值

#### Scenario: 导出可往返
- **WHEN** 将一个 `Scenario` 导出为 JSON 再重新加载
- **THEN** 加载所得场景 SHALL 与原场景在播放表现上一致

#### Scenario: 非法 JSON 不崩溃
- **WHEN** 加载缺少必填字段或格式错误的 JSON
- **THEN** 系统 SHALL 保留当前场景并报告错误，不中断渲染

### Requirement: 场景播放器插值
`ScenarioPlayer` SHALL 按给定 `sceneTime` 为每个区域在相邻事件关键帧间插值 `coverage` 与 `densityScale`（按 `ease` 取 linear 或 smoothstep），并输出当前帧的区域集合与每区域调制值。首个事件前 SHALL 采用首帧值，末个事件后 SHALL 采用末帧值。

#### Scenario: 关键帧间插值
- **WHEN** `sceneTime` 落在某区域两个事件之间且 `ease=smooth`
- **THEN** 该区域 `coverage`/`densityScale` SHALL 为两关键帧的平滑插值，而非突变

#### Scenario: 末帧后保持末态
- **WHEN** `sceneTime` 超过某区域最后一个事件的 `t`
- **THEN** 该区域 SHALL 保持该末帧值（如 coverage=0 即消散后晴空）

### Requirement: 播放控制
系统 SHALL 提供播放控制：播放/暂停、倍速、以及拖动 scrubber 预览任意时刻。播放时 `playhead` SHALL 按 `deltaTime × speed` 推进并受 `duration` 约束（截断或循环）；scrub 时 SHALL 直接采用拖动时刻。

#### Scenario: 暂停冻结画面
- **WHEN** 处于暂停状态
- **THEN** `playhead` SHALL 不推进，画面停在当前时刻

#### Scenario: 倍速改变推进速度
- **WHEN** 设置 speed 大于 1 并播放
- **THEN** `playhead` 推进速度 SHALL 按倍速加快，演化相应加速

#### Scenario: 拖动预览任意时刻
- **WHEN** 拖动 scrubber 到某时刻
- **THEN** 渲染 SHALL 立即反映该时刻的场景状态

### Requirement: 场景启用与回退
系统 SHALL 提供场景启用开关。启用时区域集合与风 SHALL 由播放器驱动；禁用时 SHALL 回退到手动区域/生命周期/风路径，画面与未引入场景时一致。

#### Scenario: 启用接管区域与风
- **WHEN** 启用场景并播放
- **THEN** 天气图区域分布与风 SHALL 由场景数据驱动，覆盖手动设置

#### Scenario: 禁用回退手动
- **WHEN** 关闭场景开关
- **THEN** 系统 SHALL 恢复手动区域/生命周期/风，画面与未启用场景时一致

