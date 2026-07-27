## ADDED Requirements

### Requirement: Full-resolution Cloud-only Composite

当 `CloudFrameOutput` 可用时，渲染管线 SHALL 先积分云介质到 cloud-only 附件，再由 full-resolution composite 唯一执行 `cloudRadiance + T * background`。天空/地面解析背景 MUST NOT 写入 cloud temporal history 颜色；gizmo/axis/debug line SHALL 在 cloud temporal resolve 之后叠加。Bloom、tonemap 与既有 full-resolution TAA resolve 的相对顺序 MUST 保持可回退，且 MUST NOT 对 cloud-only radiance 与最终 LDR 输出重复 tonemap。

#### Scenario: History 不含天空地面

- **WHEN** cloud-frame 路径 active 且 TAA 启用
- **THEN** 进入 cloud temporal history 的颜色 SHALL 来自 cloud-only 积分结果，MUST NOT 烘焙天空、地面或 debug line

#### Scenario: Composite 唯一合成

- **WHEN** full-resolution composite 执行
- **THEN** 最终场景色 SHALL 按 `cloudRadiance + T * background` 合成一次，MUST NOT 在 cloud current 内提前完成等价合成后再次按 opacity 混合

### Requirement: Cloud-frame Feature-off 与 Emergency Fallback 路由

系统 SHALL 区分：(1) 显式 feature-off 的旧 combined 基线；(2) `CloudFrameOutput` full-res cloud-only + temporal resolve 的 W11 feature-off 真值路径；(3) MRT/capability 失败时的 legacy combined emergency fallback。Emergency fallback MUST 禁用依赖 `CloudFrameOutput` 的 W11/TAAU 输入，不得把 combined 输出伪装成 cloud-only attachment。

#### Scenario: Feature-off 基线

- **WHEN** 用户关闭 cloud-frame 功能
- **THEN** 系统 SHALL 使用 combined-feature-off 基线路径，并在诊断中报告该 active path

#### Scenario: Emergency 禁用 W11 输入

- **WHEN** 仅 emergency combined fallback 可用
- **THEN** 系统 MUST NOT 向 TAAU/W11 消费者提供伪装的 `CloudFrameOutput`
