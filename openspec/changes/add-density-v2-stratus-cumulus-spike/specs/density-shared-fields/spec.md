## MODIFIED Requirements

### Requirement: 共享采样 ABI 与坐标时间演化

Recipe V2 SHALL 使用独立的只读 shared-field sampling ABI：group 2 binding 0 为 filtering sampler、binding 1 为 Base `texture_3d<f32>`、binding 2 为 Detail `texture_3d<f32>`、binding 3 为 Macro `texture_2d<f32>`。Sampler SHALL 使用 repeat addressing 与 linear min/mag filtering；3D atlas SHALL 使用硬件三线性采样。

共享 sampling helper SHALL 支持 body-local normalized coordinate、有限 scale/rotation、seed-derived periodic offset、累计风平流与至多一次低频 coordinate warp。时间连续性 SHALL 优先通过连续坐标平流获得，MUST NOT 通过每帧重建 atlas 或在主路径计算完整 4D 动画噪声。W6 Stratus MAY 调用 Macro 一次与 Base 一次且不得 warp；W6 Cumulus MAY 调用 Macro 一次、Base 两次、Detail 一次并使用第一次 Base sample 的通道执行至多一次 warp。其他八属与任何早退 Body MUST 为零 shared samples。

#### Scenario: 风平流不重建纹理

- **WHEN** 时间、Body 位置或累计风平流连续变化而 shared-field config/seed 不变
- **THEN** sampling coordinate MAY 连续变化，但 atlas/macro generation 与 build count SHALL 保持不变

#### Scenario: W6 双属固定采样预算

- **WHEN** W6 evaluator 对通过 cheap support/profile gate 的 Stratus 或 Cumulus Body 求值
- **THEN** Stratus shared sample call SHALL 至多为 2，Cumulus SHALL 至多为 4；sample 次数不得由动态 Recipe 数据循环扩大

#### Scenario: Disabled 与空 Support 零采样

- **WHEN** Recipe disabled、tile candidate bit 为零、analytic footprint/height profile 为零或 genus 不属于 W6 双属
- **THEN** evaluator SHALL 在调用 shared sampling helper 前返回零，MUST NOT 为诊断或统一控制流执行占位 texture sample

#### Scenario: 坐标演化连续

- **WHEN** W6 Stratus/Cumulus sampling coordinate 跨越 atlas/macro repeat 边界
- **THEN** density SHALL 连续 wrap且 shared-field build count 不变，MUST NOT 出现每帧再生成、固定世界纹理锁定或完整 4D time noise
