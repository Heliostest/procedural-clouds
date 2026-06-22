## MODIFIED Requirements

### Requirement: 分组参数结构
着色器 SHALL 以语义化分组 struct 定义云渲染参数，并通过单一顶层 `Params` 聚合，经一个 uniform binding 暴露。分组 MUST 至少包含 `RenderParams`（步进与光照）、`CloudShape`（密度场形态）、`Wind`、`SceneTime`。`CloudShape` MUST 暴露形态控制字段，至少包含 `coverageThreshold`、`edgeSharpness`、`baseRoundness`、`worleyBlend`、`detailStrength`、`altBase`、`altTop`，且各字段 SHALL 有可复现既有观感的默认值。

#### Scenario: 单一 binding 暴露聚合结构
- **WHEN** 着色器声明云参数 uniform
- **THEN** 仅存在一个 `params: Params` 绑定于既有的 `@group(0) @binding(1)`，且 bind group layout 与重构前一致

#### Scenario: 每个字段语义可定位
- **WHEN** 开发者在着色器中读取某个参数
- **THEN** 该参数 SHALL 通过命名字段访问（如 `params.shape.density`），而非裸 `vecN` 分量索引

#### Scenario: 形态字段可调制密度场
- **WHEN** 修改 `CloudShape` 的 `edgeSharpness`/`baseRoundness`/`worleyBlend`/`detailStrength`/`altBase`/`altTop`
- **THEN** `cloudDensity()` 输出 SHALL 随之改变（边缘锐度、底部曲率、细胞感↔蓬松感、细节幅度、高度带）

#### Scenario: 默认值复现既有观感
- **WHEN** 形态字段取其默认值
- **THEN** 渲染结果 SHALL 与未引入这些字段前一致，不产生突变
