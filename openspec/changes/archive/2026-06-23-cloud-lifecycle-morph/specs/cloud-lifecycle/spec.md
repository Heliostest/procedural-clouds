## ADDED Requirements

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
