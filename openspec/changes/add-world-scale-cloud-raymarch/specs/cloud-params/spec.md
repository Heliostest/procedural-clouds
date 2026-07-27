## ADDED Requirements

### Requirement: World-step 与 Stochastic 参数字段

`RenderParams` / 等价 CPU 参数聚合 SHALL 暴露 world-step 与 stochastic 控制字段，至少包含：`worldStepEnabled`、`worldStepMaxIterations`、`worldStepMinMeters`、`worldStepMaxMeters`、`worldStepMaxRayDistanceMeters`、`worldStepPerspectiveScale`、`worldStepSupportSkipping`、`worldStepCandidateSkipping`、stochastic 请求开关与 `stbnFrozenSlice`。旧 `rayMarchSteps` 在迁移期 SHALL 映射为 `worldStepMaxIterations`（或等价 max primary iterations），GUI MAY 标记 deprecated。字段 MUST 经单一事实来源打包，默认值 SHALL 使 world-step/STBN 可关闭并回到 W10A fixed-step 基线。

#### Scenario: 按名打包 world-step

- **WHEN** 帧循环准备参数数据
- **THEN** world-step 米制与开关字段 SHALL 经命名字段写入对应偏移，MUST NOT 使用裸下标散落赋值

#### Scenario: 默认可回退

- **WHEN** world-step 与 stochastic 取关闭/回退默认
- **THEN** 渲染采样 SHALL 等价于 W10A fixed-step + IGN/Halton 基线语义
