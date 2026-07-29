## MODIFIED Requirements

### Requirement: RenderParams 取样质量字段

`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展取样质量字段，至少包含 `qualityMode`（cached/hybrid/realtime 的整数枚举）、`detailFreq`（Hybrid render-time detail 的波长缩放）与 `detailStrength`（Hybrid erosion 的全局乘子）。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且默认值 SHALL 为 `qualityMode=hybrid`、`detailStrength=1`、`detailFreq=1.0`，以启用 W12 的有界 detail。`detailStrength=0` SHALL 完全关闭 W12 detail；非零值 SHALL 令 `effectiveErosionAmount=min(familyErosionAmount*detailStrength,1)`。`detailFreq` SHALL 令 `wavelengthMeters=baseWavelengthMeters/detailFreq`，不再驱动乘法 Perlin detail。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。此外 `RenderParams` SHALL 包含全局 `typeLightingBlend`（0~1），用于在「全局光照观感」与「按云属光照」之间插值；其默认值 SHALL 使按云属光照生效，取值为 0 时 SHALL 复现引入本字段前的全局光照观感。

W12 SHALL 同时将 `worldStepEnabled` 默认切换为 true、`worldStepMinMeters` 切换为 120、`worldStepMaxIterations` 切换为 512、`detailStrength` 切换为 1、`detailFreq` 切换为 1.0。world-step-off 仍可作为旧 W11 对照，但 detail-off 的真回退 SHALL 是 world-step-on 的 120/512 W12 基线。旧场景的 `detailStrength=0` 保持关闭含义；旧的非零 detail 参数按新 erosion/wavelength 语义解释。W12 基线证据 MUST 重采，既有 W10A/W10B/W11 基线不得作为新默认的通过证据。

#### Scenario: 质量字段按名打包

- **WHEN** 帧循环准备参数数据
- **THEN** `qualityMode`/`detailFreq`/`detailStrength` SHALL 经命名字段写入对应偏移

#### Scenario: 按云属混合字段按名打包

- **WHEN** 帧循环准备参数数据
- **THEN** `typeLightingBlend` SHALL 经命名字段写入对应偏移

#### Scenario: 混合为零复现全局观感

- **WHEN** `typeLightingBlend` 取 0
- **THEN** 着色结果 SHALL 与引入按云属光照前的全局光照一致

#### Scenario: 扩展不破坏体数组布局

- **WHEN** `Globals` 增加取样质量字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响

#### Scenario: Detail-off 新基线

- **WHEN** `detailStrength` 取 0 且 world-step 使用默认值
- **THEN** W12 dilation、erosion、warp 和 atlas sampling SHALL 全部关闭，渲染 SHALL 回退到 world-step-on 120/512 基线

#### Scenario: Nyquist 安全参数

- **WHEN** 用户提高 `detailFreq` 使当前 world step 大于半波长
- **THEN** renderer SHALL 将 detail 幅度归零而非产生远景高频闪烁

### Requirement: World-step 与 Stochastic 参数字段

`RenderParams` / 等价 CPU 参数聚合 SHALL 暴露 world-step 与 stochastic 控制字段，至少包含：`worldStepEnabled`、`worldStepMaxIterations`、`worldStepMinMeters`、`worldStepMaxMeters`、`worldStepMaxRayDistanceMeters`、`worldStepPerspectiveScale`、`worldStepSupportSkipping`、`worldStepCandidateSkipping`、stochastic 请求开关与 `stbnFrozenSlice`。旧 `rayMarchSteps` 在迁移期 SHALL 映射为 `worldStepMaxIterations`（或等价 max primary iterations），GUI MAY 标记 deprecated。字段 MUST 经单一事实来源打包。W12 默认值 SHALL 为 `worldStepEnabled=true`、`worldStepMinMeters=120`、`worldStepMaxIterations=512`、`detailStrength=1`、`detailFreq=1.0`；stochastic 其余请求/冻结字段保持既有语义。world-step-off SHALL 仅作为旧 W11 解释性对照，不得被称为 W12 默认或 detail-off 回退。

#### Scenario: 按名打包 world-step

- **WHEN** 帧循环准备参数数据
- **THEN** world-step 米制与开关字段 SHALL 经命名字段写入对应偏移，MUST NOT 使用裸下标散落赋值

#### Scenario: W12 默认启用

- **WHEN** 使用 W12 默认参数
- **THEN** world-step SHALL 以 120 m min step 和 512 max iterations active；detailStrength SHALL 为 1，detailFreq SHALL 为 1.0，且不得回退到 W10A fixed-step 默认
