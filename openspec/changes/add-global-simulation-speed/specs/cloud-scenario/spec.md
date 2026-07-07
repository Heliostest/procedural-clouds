## MODIFIED Requirements

### Requirement: 播放控制

系统 SHALL 提供播放控制：播放/暂停、全局离散仿真倍率 `0×/1×/2×/4×`、loop，以及拖动 scrubber 预览任意时刻。播放时 `playhead` SHALL 按 `wallDeltaSeconds × simulationRate` 推进并受 `duration` 约束（截断或循环）；scrub 时 SHALL 直接采用拖动时刻且不乘倍率。系统 MUST NOT 再提供与全局倍率叠乘的 scenario 专用连续 speed。

#### Scenario: 暂停冻结画面
- **WHEN** scenario 处于暂停状态
- **THEN** `playhead` SHALL 不推进，画面停在当前时刻，已选全局倍率保持不变

#### Scenario: 全局倍速改变推进速度
- **WHEN** 设置全局倍率为 `2×` 或 `4×` 并播放
- **THEN** `playhead` 与场景演化 SHALL 按对应倍率加速

#### Scenario: 零倍率冻结播放头
- **WHEN** scenario 保持 playing 但全局倍率为 `0×`
- **THEN** `playhead` SHALL 不推进；切回非零倍率后从原位置继续且不补算冻结时间

#### Scenario: 拖动预览任意时刻
- **WHEN** 在任意倍率下拖动 scrubber 到某时刻
- **THEN** 渲染 SHALL 立即反映该绝对场景时刻，不对 scrub 值乘倍率

#### Scenario: Loop 使用缩放后的播放头
- **WHEN** 缩放后的 playhead 超过 duration 且 loop 开启
- **THEN** 系统 SHALL 对推进后的 playhead 执行既有循环取模，不改变全局倍率
