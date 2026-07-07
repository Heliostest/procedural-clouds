## ADDED Requirements

### Requirement: 地面云影质量参数
`CloudParams` SHALL 提供地面云影执行模式、内联积分质量与二维透射率缓存控制字段，至少包含 `groundShadowMode`、`groundShadowMaxSteps`、`groundShadowStepScale`、`groundShadowJitter`、`groundShadowMapResolution`、`groundShadowMapUpdateRate`、`groundShadowHistoryWeight` 与 `groundShadowFilterRadius`。GPU 实际读取的字段 MUST 经命名 offset/pack 单一事实来源写入并保持对齐；仅用于 CPU 资源生命周期和调度的字段 MUST NOT 为方便而重复写入 GPU uniform。

#### Scenario: 阶段 1 参数按名打包
- **WHEN** 帧循环准备 Adaptive 地面云影参数
- **THEN** mode、最大步数、步长尺度与抖动强度 SHALL 经命名字段写入对齐的 GPU 参数，`bodies` 基偏移 SHALL 与 WGSL 保持一致

#### Scenario: 透射率资源参数留在 CPU
- **WHEN** map 分辨率、更新率或资源生命周期字段只由 renderer 调度读取
- **THEN** 这些字段 SHALL 保持在 CPU 侧单一事实来源，不得无语义地扩展主云 shader uniform

#### Scenario: 运行时模式切换
- **WHEN** 用户在 Legacy、Adaptive 与 Transmittance 间切换
- **THEN** 渲染 SHALL 无需重载页面即可切换路径，且未选路径的专用 pass SHALL 被旁路

#### Scenario: 参数边界
- **WHEN** 用户设置地面云影质量参数
- **THEN** 最大步数 SHALL 限制在 8–64、抖动在 0–1、历史权重在 0–0.95、过滤半径在 0–2，纹理分辨率 SHALL 限制为受支持的离散值

#### Scenario: 阶段门控默认值
- **WHEN** 阶段 1 尚未通过验收
- **THEN** 默认模式 SHALL 保持 Legacy；阶段 1 通过后 SHALL 切为 Adaptive；只有阶段 2 全部验收通过后 SHALL 切为 Transmittance

