## ADDED Requirements

### Requirement: 密度塑形模型参数
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 暴露密度塑形模型选择字段 `densityShapeModel`：`0` 表示遗留兼容密度链，`1` 表示参考式高度–天气塑形。该字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值。默认值 SHALL 为 `1`；当取 `0` 时其余参数默认 MUST 复现引入本字段前的密度观感。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。GUI SHALL 允许运行时切换该字段。

#### Scenario: 按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `densityShapeModel` SHALL 经命名字段写入对应偏移

#### Scenario: 默认启用新塑形
- **WHEN** 参数取默认值
- **THEN** `densityShapeModel` SHALL 为 1

#### Scenario: 旧模型复现观感
- **WHEN** `densityShapeModel=0` 且其余参数为引入本字段前的默认
- **THEN** 密度与正常渲染 SHALL 与引入前一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加 `densityShapeModel` 后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致

#### Scenario: GUI 可切换
- **WHEN** 用户通过 GUI 修改 `densityShapeModel`
- **THEN** 密度塑形路径 SHALL 实时切换，无需重启
