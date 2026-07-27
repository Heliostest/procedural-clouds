## ADDED Requirements

### Requirement: Temporal Upscale 质量参数字段

`CloudParams` / 等价参数聚合 SHALL 暴露 temporal quality 控制，至少区分：关闭 temporal、full-resolution TAA、TAAU 4×4。既有 `taaEnabled` 与 `taaBlend` SHALL 继续可用；新增字段（如 `temporalQuality` 或等价枚举）MUST 经单一事实来源定义，MUST NOT 出现裸下标散落赋值。默认值 SHALL 使系统保持 full-resolution TAA（或关闭 TAAU），直到目标设备矩阵 Gate 通过后再由项目所有者决定是否改默认。TAAU 相关 reactive/disocclusion 阈值若暴露为参数，MUST 命名清晰且默认不引入未校准的激进 current blend；若不写入 GPU uniform，则可作为 CPU-only 字段，但 HUD/诊断 MUST 仍能读取有效值。文档与 GUI 标签 MUST NOT 把 TAAU 的 1/16 raymarched texel 误标为“1/4 像素”。

#### Scenario: 默认可回退 full-res TAA

- **WHEN** 使用引入本字段后的默认参数
- **THEN** temporal quality SHALL 为 full-resolution TAA（TAAU 关闭），画面路径与 W11 前 full-res cloud-only + TAA 语义一致

#### Scenario: 可切换 TAAU

- **WHEN** 用户选择 TAAU 4×4 且 `CloudFrameOutput` 可用
- **THEN** 参数聚合 SHALL 使渲染选择 TAAU 路径，且 MUST NOT 同时要求旧 TAA 作为第二 history owner

#### Scenario: Emergency 下参数不强制 TAAU

- **WHEN** 仅 legacy combined emergency fallback 可用
- **THEN** 即使 UI 请求 TAAU，系统 MUST 拒绝启用 TAAU，并在诊断中报告禁用原因

#### Scenario: 打包无裸下标

- **WHEN** 帧循环准备 temporal 相关参数
- **THEN** 新字段 SHALL 经命名字段或集中 offset 常量写入，MUST NOT 使用散落裸下标赋值
