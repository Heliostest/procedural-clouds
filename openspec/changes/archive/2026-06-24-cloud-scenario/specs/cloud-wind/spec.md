## ADDED Requirements

### Requirement: 风随场景时间轴驱动
风向与风速 SHALL 可由场景数据驱动：场景启用时，平流所用的 `wind.dir`/`wind.speed` 取自场景的 wind 配置（随播放进度生效），覆盖 GUI 手动风设置。场景禁用时 SHALL 恢复手动风。

#### Scenario: 场景风覆盖手动风
- **WHEN** 启用含 wind 配置的场景并播放
- **THEN** 云团平流 SHALL 按场景 wind 的方向与速度漂移，而非 GUI 手动值

#### Scenario: 禁用场景恢复手动风
- **WHEN** 关闭场景开关
- **THEN** 风 SHALL 恢复由 GUI 手动控件控制
