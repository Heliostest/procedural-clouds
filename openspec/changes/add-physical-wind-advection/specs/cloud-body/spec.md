## MODIFIED Requirements

### Requirement: 统一云体模型

系统 SHALL 提供统一的 `CloudBody` 模型描述天空中每一团云，单个云体 SHALL 同时包含米制横向范围（`shape`/`bounds`/`feather`）、米制垂直位置（`base`/`thickness`，相对 scene-ground datum）、云属（`type` 预设）、强度（`coverage`/`densityScale`）、物理风（`windDeg`/`windSpeedMps`/`morphRate`）、placement lock 与可选演化包络（`lifecycle`）。`windSpeedMps` SHALL 以 m/s 表示；`morphRate` SHALL 保持独立的形变速率语义。手动编辑与场景播放 SHALL 共用此模型，placement 与平流位移在渲染前 SHALL 通过 `cloud-physical-units` 映射到 render world units。

#### Scenario: 一团云由单一云体描述

- **WHEN** 定义一个云体，设置其横向范围、高度带、云属与强度
- **THEN** 渲染 SHALL 在由米制 placement 映射得到的横向范围与高度区间内按该云属呈现一团云

#### Scenario: 云体携带独立物理风与演化

- **WHEN** 某云体设置独立 `windSpeedMps`、风向与 lifecycle 包络
- **THEN** 该云体的密度结构 SHALL 按自身物理风累计平流、按自身包络随时间生成/增厚/消散，互不影响其他云体

#### Scenario: 世界运输不改写作者 placement

- **WHEN** 某云体累计非零风位移
- **THEN** 其渲染足迹与密度 SHALL 在世界 XZ 中移动，而原始 `bounds`、`feather`、`base`、`thickness` 与 `placementLocked` SHALL 保持不变
