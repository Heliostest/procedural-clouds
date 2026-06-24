# cloud-body Specification

## Purpose
TBD - created by archiving change unified-cloud-bodies. Update Purpose after archive.
## Requirements
### Requirement: 统一云体模型
系统 SHALL 提供统一的 `CloudBody` 模型描述天空中每一团云，单个云体 SHALL 同时包含横向范围（`shape`/`bounds`/`feather`）、垂直位置（`base`/`thickness` 归一化高度带）、云属（`type` 预设）、强度（`coverage`/`densityScale`）、风（`dir`/`speed`/`morphRate`）与可选演化包络（`lifecycle`）。手动编辑与场景播放 SHALL 共用此模型。

#### Scenario: 一团云由单一云体描述
- **WHEN** 定义一个云体，设置其横向范围、高度带、云属与强度
- **THEN** 渲染 SHALL 在该横向范围与高度带内按该云属呈现一团云

#### Scenario: 云体携带独立风与演化
- **WHEN** 某云体设置独立风与 lifecycle 包络
- **THEN** 该云体 SHALL 按自身风漂移、按自身包络随时间生成/增厚/消散，互不影响其他云体

### Requirement: 云体增删改
系统 SHALL 支持运行时增删改云体：新增任意数量云体、删除指定云体、修改任一云体的全部字段，渲染 SHALL 实时反映变更。系统 SHALL 设上限 `MAX_BODIES`，超出 SHALL 被忽略且不致崩溃。

#### Scenario: 新增云体
- **WHEN** 通过界面新增一个指定高度/范围/类型的云体
- **THEN** 渲染 SHALL 出现对应的一团云

#### Scenario: 修改云体实时生效
- **WHEN** 修改某云体的高度带、范围、类型或强度
- **THEN** 渲染 SHALL 实时反映修改后的形态与位置

#### Scenario: 删除云体
- **WHEN** 删除某云体
- **THEN** 该云体对应的云 SHALL 从画面消失，其余云体不受影响

### Requirement: 云体密度合成
`cloudDensity()` SHALL 遍历全部活跃云体并累加各体贡献。每体 SHALL 由其归一化形状轮廓（含羽化）给出横向覆盖，由其 `base/thickness` 做垂直门控，由其风做平流，由其 `type` 取预设形态。未启用、形状轮廓为 0 或高度带外的云体 SHALL 不贡献密度。

#### Scenario: 多云体叠加
- **WHEN** 多个云体在不同位置/高度共存
- **THEN** 渲染 SHALL 同时呈现各云体，各自位于其范围与高度带

#### Scenario: 空轮廓不产生云
- **WHEN** 采样位置落在某云体横向轮廓之外
- **THEN** 该云体在此位置 SHALL 不贡献密度

### Requirement: 形状与强度分离表达
云体的横向轮廓 SHALL 以归一化形状图（每体一层）表达，仅在云体几何（`shape`/`bounds`/`feather`）变化时重绘；云体的 `coverage`/`densityScale`/`type` 与演化调制 SHALL 以每体标量参数表达并可每帧低开销更新，不要求重绘形状图。

#### Scenario: 演化不重绘形状
- **WHEN** 某云体仅 `coverage`/`densityScale` 随 lifecycle 或场景变化而几何不变
- **THEN** 系统 SHALL 仅更新该体标量参数，而不重绘其形状图

#### Scenario: 几何变化才重绘
- **WHEN** 某云体的范围或羽化被修改
- **THEN** 系统 SHALL 重绘该体形状图层

