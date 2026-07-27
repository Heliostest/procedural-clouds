# cloud-frame-output Specification

## Purpose
TBD - created by archiving change refactor-cloud-frame-output. Update Purpose after archive.
## Requirements
### Requirement: CloudFrameOutput 版本化 MRT 契约

系统 SHALL 提供版本化的 full-resolution `CloudFrameOutput`，至少包含 `radianceTransmittance` 与 `depthVelocity` 两个 `rgba16float` 渲染附件（实现可另含 composite 用 `backgroundRadiance`）。`radianceTransmittance` 的 RGB SHALL 为线性 HDR 云散射辐亮度，A SHALL 为透射率 `T`；空像素 clear value MUST 为 `(0,0,0,1)`，consumer MUST NOT 将 A 解释为 opacity。`depthVelocity` SHALL 携带透射率加权代表深度、屏幕速度与 validity；无云像素 MUST 标记 invalid，不得以假深度伪装有效云。系统 SHALL 分别维护 `resourceGeneration`、`contentRevision` 与 `discontinuityGeneration`。

#### Scenario: 透射率 clear 与语义

- **WHEN** cloud-only current pass 清除 `radianceTransmittance`
- **THEN** clear value SHALL 为 `(0,0,0,1)`，且 A 通道语义为透射率 `T`

#### Scenario: 无云像素 validity

- **WHEN** 像素无有效云积分
- **THEN** `depthVelocity` SHALL 标记 invalid，MUST NOT 发布伪装有效的代表深度供 temporal 消费

#### Scenario: 三代独立递增

- **WHEN** 发生纹理重分配、成功写入或结构性 discontinuity（如 camera cut）
- **THEN** 对应的 `resourceGeneration` / `contentRevision` / `discontinuityGeneration` SHALL 按各自语义更新，不得混用单一计数器

### Requirement: CloudFrameOutput 生命周期与诊断

`CloudFrameOutput` 资源所有者 SHALL 支持 resize 原子替换、幂等销毁，并在运行时诊断中暴露 active path、fallback reason、attachment/history 字节与 GPU validation 错误列表。MRT/pipeline 创建失败时 MUST 进入明确的 legacy combined emergency fallback，且 MUST NOT 将该 fallback 伪装为 valid `CloudFrameOutput`。

#### Scenario: Resize 不保留陈旧 view

- **WHEN** 画布尺寸变化触发重分配
- **THEN** 系统 SHALL 提升 `resourceGeneration` 并丢弃旧 texture/view，不得让 consumer 继续采样陈旧附件

#### Scenario: Emergency fallback 可审计

- **WHEN** cloud-frame 路径不可用
- **THEN** 诊断 SHALL 报告非 `cloud-frame` 的 active path 与稳定 fallback reason，且 MUST NOT 声称 `CloudFrameOutput` 有效
