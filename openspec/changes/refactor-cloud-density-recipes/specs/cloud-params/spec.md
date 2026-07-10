## ADDED Requirements

### Requirement: 密度 Recipe 模型切换

`RenderParams` SHALL 暴露全局密度 Recipe 模型选择：`0` 表示十属全局 LegacyPuffy 回退，`1` 表示读取每属 Density Recipe。字段 MUST 经 `packParams` 的命名 offset 单一事实来源写入，并在 GUI 中可运行时切换。Recipe 模式下未迁移属 MAY 由其静态 Recipe 继续选择 LegacyPuffy。

#### Scenario: 全局 Legacy A/B

- **WHEN** 用户将模型设为 0
- **THEN** 所有云属 SHALL 使用 LegacyPuffy 基线，无需重启或重建场景

#### Scenario: Recipe 模式逐属生效

- **WHEN** 用户将模型设为 1 且只有部分云属 Recipe 已迁移
- **THEN** 已迁移属 SHALL 使用新 Recipe，未迁移属 SHALL 使用各自 LegacyPuffy 回退

#### Scenario: 参数布局一致

- **WHEN** 新增或移动模型选择字段
- **THEN** CPU offset、uniform buffer size、WGSL Globals 与 bodies 基偏移 MUST 保持一致并由静态检查验证

