## ADDED Requirements

### Requirement: RenderParams 取样质量字段
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展取样质量字段，至少包含 `qualityMode`（cached/hybrid/realtime 的整数枚举）、`detailFreq`（hybrid 高频细节频率）、`detailStrength`（hybrid 高频细节强度）。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且默认值（`qualityMode` 为 cached、`detailStrength` 为 0）SHALL 复现引入前观感。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。

#### Scenario: 质量字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `qualityMode`/`detailFreq`/`detailStrength` SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** 取样质量字段取默认值
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加取样质量字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响
