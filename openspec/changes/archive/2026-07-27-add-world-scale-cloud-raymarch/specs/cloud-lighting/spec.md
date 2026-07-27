## MODIFIED Requirements

### Requirement: 能量守恒散射步进积分

主体积 raymarch 命中云密度时，系统 SHALL 用与消光一致的解析步进累加散射：`σ = density * extinction`，`Δt` 为该步长，透射 `T *= exp(-σ·Δt)`，散射权重 `w = T * (1 - exp(-σ·Δt))`。在 fixed-step 模式下，`Δt` 来自既有均匀步进；在 world-step 模式下，`Δt` MUST 来自米制步长经场景比例换算后的当前射线步进，MUST NOT 使用未换算米值。能量守恒路径下，太阳散射辐射 MUST NOT 再乘遗留的 `(1 - exp(-density))` 密度假因子，而使 `color += w * L`，其中 `L` 为该步经 shadow、相函数、powder、高度明暗、银边、SSS 与闪电等既有调制后的入射散射辐射（等价于 Frostbite/Hillaire 在 `σ_s≈σ` 时的 `(1-e^{-σΔt})·(σ_s Li)/σ`）。该积分 MUST NOT 改变密度取样入口语义、`lightMarchDepth`/`sunVisibility` 或地面云影路径，也 MUST NOT 改变 W10A cloud-only attachment 语义。

#### Scenario: 步长无关亮度

- **WHEN** 固定相机与云体，仅将 `rayMarchSteps` / max primary iterations 在常用档（如 48 与 32）间切换且能量守恒积分开启、world-step 关闭
- **THEN** 云体整体亮度与对比度漂移 SHALL 明显小于关闭该积分时的同对比

#### Scenario: World-step Δt 进入积分

- **WHEN** world-step 启用且某步命中云密度
- **THEN** 该步能量守恒积分使用的 `Δt` SHALL 等于该步已换算的 render-space 步长

#### Scenario: 透射与积分一致

- **WHEN** 单步光学厚度 `σ·Δt` 增大
- **THEN** 该步透射乘子 SHALL 为 `exp(-σ·Δt)`，且散射权重因子 SHALL 为 `1 - exp(-σ·Δt)`

#### Scenario: 无遗留密度假因子

- **WHEN** 能量守恒积分开启
- **THEN** 太阳散射项 MUST NOT 乘以 `(1 - exp(-density))`；关闭时 MUST 保留该乘子以复现旧路径
