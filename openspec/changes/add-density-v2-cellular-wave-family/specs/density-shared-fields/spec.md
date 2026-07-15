## MODIFIED Requirements

### Requirement: 共享采样 ABI 与坐标时间演化

Recipe V2 SHALL 使用独立的只读 shared-field sampling ABI：group 2 binding 0 为 filtering sampler、binding 1 为 Base `texture_3d<f32>`、binding 2 为 Detail `texture_3d<f32>`、binding 3 为 Macro `texture_2d<f32>`。Sampler SHALL 使用 repeat addressing 与 linear min/mag filtering；3D atlas SHALL 使用硬件三线性采样。

共享 sampling helper SHALL 支持 body-local normalized coordinate、有限 scale/rotation、seed-derived periodic offset、累计风平流与至多一次低频 coordinate warp。时间连续性 SHALL 优先通过连续坐标平流获得，MUST NOT 通过每帧重建 atlas 或在主路径计算完整 4D 动画噪声。四个 W7 Stratiform genus MAY 各调用 Macro 一次与 Base 一次且不得 warp；Cumulus MAY 调用 Macro 一次、Base 两次、Detail 一次并使用第一次 Base sample 的通道执行至多一次 warp；W8 Stratocumulus、Altocumulus、Cirrocumulus MAY 各调用 Macro 一次与 Base 两次，不得读取 Detail 或执行运行时 Worley 邻域。Cumulonimbus、Cirrus 与任何早退 Body MUST 为零 shared samples。

#### Scenario: W8 三 family 固定采样预算

- **WHEN** W8 evaluator 对通过 cheap support/profile/coverage gate 的 enabled Body 求值
- **THEN** Stratiform shared sample call SHALL 至多为 2、Cumulus 至多为 4、Cellular 至多为 3；sample 次数不得由动态 Recipe 数据循环扩大

#### Scenario: Disabled 与空 Support 零采样

- **WHEN** Recipe disabled、tile candidate bit 为零、analytic footprint/height/profile/coverage 为零，或 genus 属于 Cumulonimbus/Cirrus
- **THEN** evaluator SHALL 在调用对应 shared sampling helper 前返回零，MUST NOT 为诊断或统一控制流执行占位 texture sample

#### Scenario: Cellular 只读既有 Macro 与 Base

- **WHEN** Sc/Ac/Cc Cellular evaluator 产生非零候选
- **THEN** 它 SHALL 只通过既有 sampling ABI 读取一次 Macro 与两次 Base，不得创建新的 atlas/binding、读取 Detail 或在 cache pass 内重新执行 Worley 邻域

#### Scenario: 坐标演化连续

- **WHEN** 任一 W8 enabled genus sampling coordinate 跨越 atlas/macro repeat 边界或累计风平流连续变化
- **THEN** density SHALL 连续 wrap且 shared-field build count 不变，MUST NOT 出现每帧再生成、固定世界/屏幕纹理锁定或完整 4D time noise
