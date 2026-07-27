# cloud-stochastic-sampling Specification

## Purpose
TBD - created by archiving change add-world-scale-cloud-raymarch. Update Purpose after archive.
## Requirements
### Requirement: STBN 资源与确定性 Fallback

系统 SHALL 提供固定预算的 STBN 纹理资源（3D 或 2D-array），按 `pixel + frameSlice` 扰动主步进与局部光照采样序列。资源来源、尺寸、格式与生成/导入脚本 MUST 可复现。STBN 未支持、加载失败或 debug deterministic 模式时，系统 SHALL 回退现有 IGN/Halton，且 MUST NOT 使 renderer 初始化失败或改变 pipeline contract。STBN MUST NOT 占用或改变 W11 的 4×4 Bayer pixel/projection phase。

#### Scenario: STBN 可用

- **WHEN** STBN 资源加载成功且 stochastic sampling 请求启用
- **THEN** 诊断 SHALL 报告 `stochasticSamplingActive=stbn`，并可冻结 frame slice 供 A/B

#### Scenario: 缺失时回退

- **WHEN** STBN 不可用或请求关闭 stochastic sampling
- **THEN** 系统 SHALL 使用 IGN/Halton，初始化 MUST 成功，且 MUST NOT 改变 cloud-frame attachment 契约
