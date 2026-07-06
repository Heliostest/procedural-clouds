## ADDED Requirements

### Requirement: 米到渲染单位比例
`CloudParams` SHALL 包含 `verticalMetersPerWorldUnit` 与 `horizontalMetersPerWorldUnit`，两者必须为正，默认均为 1000。旧 `altitudeScale`/`horizontalScale` SHALL 在兼容期映射到新字段或经迁移删除，不能与新字段同时独立缩放。

#### Scenario: 默认比例
- **WHEN** 首次加载新版默认参数
- **THEN** 垂直与水平比例 SHALL 均为 1000 m/world-unit

#### Scenario: 非法比例被拒绝
- **WHEN** 用户输入 0、负数或非有限比例
- **THEN** 系统 SHALL 拒绝该值并保留上一个合法比例

### Requirement: 物理约束 CPU 开关
`CloudParams` SHALL 包含 `enforcePhysicalPlacement: boolean`，默认 false。该开关 SHALL 仅控制 CPU placement 校验，不得为了该逻辑扩展 GPU uniform；GPU 只接收约束后的转换结果。

#### Scenario: 默认不强制
- **WHEN** 首次加载应用
- **THEN** `enforcePhysicalPlacement` SHALL 为 false

#### Scenario: GUI 切换立即生效
- **WHEN** 用户开启物理约束并编辑越界 placement
- **THEN** CPU SHALL 立即按 `cloud-genus-profile` 规则修正并刷新渲染数据

### Requirement: 默认米制场景边界
`createDefaultParams()` 中 `cloudHeight` SHALL 为 12000 m、`boxHalfExtent` SHALL 为 16000 m，并经空间比例映射为紧凑渲染盒。GUI 与 glossary SHALL 显示米制语义。

#### Scenario: 默认层顶容纳积雨云
- **WHEN** 使用默认参数新增 cumulonimbus
- **THEN** profile 默认顶部 SHALL 不被 `cloudHeight` 截断

