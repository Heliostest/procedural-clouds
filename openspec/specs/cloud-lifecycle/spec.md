# cloud-lifecycle Specification

## Purpose
TBD - created by archiving change cloud-lifecycle. Update Purpose after archive.
## Requirements
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

### Requirement: 形态随阶段微变
生命周期除调制密度外，SHALL 额外输出形态微变信号 `morph ∈ [-1, 1]`：`birth→grow` 段 morph 由 0 升至 +1、mature 段恒为 +1、`decay→death` 段由 +1 降至 -1、区间外为 0。系统 SHALL 提供全局强度 `morphStrength`：成长（morph 正值）SHALL 增强 `detailStrength`、消散（morph 负值）SHALL 增强 `worleyBlend`（边缘侵蚀）。`morphStrength` 为 0 时形态 SHALL 完全不随阶段变化。

#### Scenario: 成长期细节渐增
- **WHEN** `morphStrength` 大于 0 且区域处于 `birth→grow` 或 mature 段
- **THEN** 该区域 `detailStrength` SHALL 较基准增强，云细节随成长增多

#### Scenario: 消散期边缘侵蚀
- **WHEN** `morphStrength` 大于 0 且区域处于 `decay→death` 后段（morph 为负）
- **THEN** 该区域 `worleyBlend` SHALL 较基准增大，边缘呈破碎/侵蚀

#### Scenario: 关闭时形态不变
- **WHEN** `morphStrength` 为 0
- **THEN** 区域形态参数 SHALL 与无形态微变时一致，仅密度随生命周期变化

