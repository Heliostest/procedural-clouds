## ADDED Requirements

### Requirement: 生命周期包络求值
系统 SHALL 提供生命周期包络，按五个关键时刻 `birth → grow → mature → decay → death`（秒，相对 `sceneTime`）定义随时间的 `phase ∈ [0,1]`。求值 MUST 满足：`t < birth` 时 phase=0；`birth→grow` 段 phase 由 0 平滑升至 1；`grow→decay` 段 phase 恒为 1；`decay→death` 段 phase 由 1 平滑降至 0；`t ≥ death` 时 phase=0。

#### Scenario: 出现前为晴空
- **WHEN** 当前 `sceneTime` 小于区域 `birth`
- **THEN** 该区域 phase SHALL 为 0，渲染为晴空（无云）

#### Scenario: 增厚到最浓
- **WHEN** `sceneTime` 处于 `grow` 与 `decay` 之间（mature 段）
- **THEN** 该区域 phase SHALL 为 1，密度达到该区域的 peak

#### Scenario: 消失后为晴空
- **WHEN** 当前 `sceneTime` 大于等于区域 `death`
- **THEN** 该区域 phase SHALL 为 0，渲染恢复为晴空

### Requirement: phase 调制覆盖度与浓度
系统 SHALL 由 phase 调制区域的 coverage 与 densityScale：`coverageMul = phase`、`densityScale = phase * peakDensity`。出现（phase 0→1）SHALL 同时淡入 coverage 与 densityScale；消失（phase 1→0）SHALL 淡出至 coverage=0；加重/减淡 SHALL 通过设置 mature 段的 `peakDensity`（目标 densityScale）实现。

#### Scenario: 出现淡入
- **WHEN** phase 从 0 增至 1
- **THEN** 该区域 coverage 与密度 SHALL 由无到有平滑淡入，而非突现

#### Scenario: 消失淡出
- **WHEN** phase 从 1 降至 0
- **THEN** 该区域密度 SHALL 平滑衰减，末态 coverage SHALL 为 0

#### Scenario: 通过 peakDensity 加重或减淡
- **WHEN** 两个区域 peakDensity 不同且均处于 mature 段
- **THEN** peakDensity 较大的区域 SHALL 呈更浓密度，较小者 SHALL 偏淡

### Requirement: 逐帧驱动与向后兼容
系统 SHALL 每帧按 `sceneTime` 求各区域 phase 并据此重绘天气图。未配置生命周期的区域 SHALL 按 phase 恒为 1 处理，行为与无生命周期时一致。

#### Scenario: 随时间自动演化
- **WHEN** `sceneTime` 持续推进且区域配置了生命周期
- **THEN** 该区域 SHALL 按包络自动经历出现 → 增厚 → 维持 → 变淡 → 消失，无需逐帧手动干预

#### Scenario: 无配置区域保持恒定
- **WHEN** 某区域未配置生命周期
- **THEN** 该区域 coverage 与 densityScale SHALL 保持恒定，不随时间变化
