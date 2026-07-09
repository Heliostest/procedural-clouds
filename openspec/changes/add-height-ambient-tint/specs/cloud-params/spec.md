## ADDED Requirements

### Requirement: 高度环境光模型参数
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 暴露环境光模型选择字段 `heightAmbientModel`：`0` 表示遗留常数环境项，`1` 表示参考式高度染色。该字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值。默认值 SHALL 为 `1`；当取 `0` 时其余参数默认 MUST 复现引入本字段前的环境项观感。新增字段 MUST 满足 std140-like 对齐；若占用既有 pad 槽则 `BODY_BASE` MUST 保持与着色器一致，若扩展 `Globals` 则 `bodies` 数组基偏移 MUST 同步更新。GUI SHALL 允许运行时切换该字段。

#### Scenario: 按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `heightAmbientModel` SHALL 经命名字段写入对应偏移

#### Scenario: 默认启用新模型
- **WHEN** 参数取默认值
- **THEN** `heightAmbientModel` SHALL 为 1

#### Scenario: 关闭复现旧观感
- **WHEN** `heightAmbientModel=0` 且其余参数为引入本字段前的默认
- **THEN** 云内环境着色 SHALL 与引入前一致

#### Scenario: 布局一致
- **WHEN** 打包含 `heightAmbientModel` 的 `Globals`
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致

#### Scenario: GUI 可调
- **WHEN** 用户通过 GUI 修改 `heightAmbientModel`
- **THEN** 环境染色路径 SHALL 实时切换，无需重启
