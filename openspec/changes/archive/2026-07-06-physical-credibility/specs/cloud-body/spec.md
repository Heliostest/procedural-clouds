## ADDED Requirements

### Requirement: 云体 placement 锁定
`CloudBody` SHALL 包含 `placementLocked: boolean`。手动修改 `base`、`thickness`、`bounds` 或 `feather` SHALL 将其设为 true；系统 SHALL 提供应用 genus 默认 placement 的显式操作。

#### Scenario: 手动编辑后锁定
- **WHEN** 用户通过 GUI 或 gizmo 修改任一 placement 字段
- **THEN** 该云体 `placementLocked` SHALL 变为 true

## MODIFIED Requirements

### Requirement: 统一云体模型
系统 SHALL 提供统一的 `CloudBody` 模型描述天空中每一团云，单个云体 SHALL 同时包含米制横向范围（`shape`/`bounds`/`feather`）、米制垂直位置（`base`/`thickness`，相对 scene-ground datum）、云属（`type` 预设）、强度（`coverage`/`densityScale`）、风（`windDeg`/`windSpeed`/`morphRate`）、placement lock 与可选演化包络（`lifecycle`）。手动编辑与场景播放 SHALL 共用此模型，渲染前 SHALL 通过 `cloud-physical-units` 映射到 render world units。

#### Scenario: 一团云由单一云体描述
- **WHEN** 定义一个云体，设置其横向范围、高度带、云属与强度
- **THEN** 渲染 SHALL 在由米制 placement 映射得到的横向范围与高度区间内按该云属呈现一团云

#### Scenario: 云体携带独立风与演化
- **WHEN** 某云体设置独立风与 lifecycle 包络
- **THEN** 该云体 SHALL 按现有风语义漂移、按自身包络随时间生成/增厚/消散，互不影响其他云体

