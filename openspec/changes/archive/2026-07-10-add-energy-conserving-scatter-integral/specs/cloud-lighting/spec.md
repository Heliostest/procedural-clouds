## ADDED Requirements

### Requirement: 能量守恒散射步进积分
主体积 raymarch 命中云密度时，系统 SHALL 用与消光一致的解析步进累加散射：`σ = density * extinction`，`Δt` 为该步长，透射 `T *= exp(-σ·Δt)`，散射权重 `w = T * (1 - exp(-σ·Δt))`。能量守恒路径下，太阳散射辐射 MUST NOT 再乘遗留的 `(1 - exp(-density))` 密度假因子，而使 `color += w * L`，其中 `L` 为该步经 shadow、相函数、powder、高度明暗、银边、SSS 与闪电等既有调制后的入射散射辐射（等价于 Frostbite/Hillaire 在 `σ_s≈σ` 时的 `(1-e^{-σΔt})·(σ_s Li)/σ`）。该积分 MUST NOT 改变密度取样、`lightMarchDepth`/`sunVisibility` 或地面云影路径。

#### Scenario: 步长无关亮度
- **WHEN** 固定相机与云体，仅将 `rayMarchSteps` 在常用档（如 48 与 32）间切换且能量守恒积分开启
- **THEN** 云体整体亮度与对比度漂移 SHALL 明显小于关闭该积分时的同对比

#### Scenario: 透射与积分一致
- **WHEN** 单步光学厚度 `σ·Δt` 增大
- **THEN** 该步透射乘子 SHALL 为 `exp(-σ·Δt)`，且散射权重因子 SHALL 为 `1 - exp(-σ·Δt)`

#### Scenario: 无遗留密度假因子
- **WHEN** 能量守恒积分开启
- **THEN** 太阳散射项 MUST NOT 乘以 `(1 - exp(-density))`；关闭时 MUST 保留该乘子以复现旧路径

### Requirement: 能量守恒积分可关闭回退
系统 SHALL 提供运行时开关（默认开启）在能量守恒解析积分与引入本能力前的 ad hoc 散射乘子路径之间切换。关闭时 MUST 复现引入前主步进累加语义，供 A/B 与回归。

#### Scenario: 默认开启
- **WHEN** 参数取默认值
- **THEN** 能量守恒散射积分 SHALL 启用

#### Scenario: 关闭复现旧路径
- **WHEN** 该开关关闭
- **THEN** 主步进散射累加 SHALL 使用引入本能力前的 `(1-exp(-d))` 乘子路径，且不引入额外后处理差异
