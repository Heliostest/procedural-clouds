## ADDED Requirements

### Requirement: RenderParams 光照与画质字段
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展光照与画质字段，至少包含太阳方位角、太阳高度角、双瓣相函数的前向/背向项与混合权重、silver lining 强度、powder 强度、God rays 强度。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且各字段 SHALL 有可复现引入前观感的默认值。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。

#### Scenario: 光照字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** 太阳方位/高度角、相函数权重与各画质强度 SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** 光照与画质字段取默认值
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加光照字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响
