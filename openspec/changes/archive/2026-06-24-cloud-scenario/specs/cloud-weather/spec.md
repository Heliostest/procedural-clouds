## ADDED Requirements

### Requirement: 区域集由场景驱动
天气图区域集合 SHALL 支持由外部来源（场景播放器）提供任意数量的区域及其逐帧调制值，而不限于 GUI 固定的两区域。绘制 SHALL 对传入的全部区域生效，调制值缺省时按 `{1,1,0}` 处理。

#### Scenario: 多区域场景渲染
- **WHEN** 场景播放器提供超过两个区域及各自调制值
- **THEN** 天气图 SHALL 按全部区域绘制，各区域呈其当前 coverage/type/densityScale

#### Scenario: 区域数量随场景变化
- **WHEN** 切换到区域数量不同的另一场景
- **THEN** 天气图 SHALL 反映新场景的区域集合，旧区域不残留
