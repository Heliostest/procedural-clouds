## ADDED Requirements

### Requirement: 卷云方向性纤维形态

系统 SHALL 在 `evalCirrus()` 内提供可调的各向异性纤维密度，使 cirrus 沿云体局部主轴形成细长、弯曲且可分叉的丝缕。纤维形态 SHALL 受原云体足迹、实例垂直区间、生命周期/密度调制和统一物理平流约束；MUST NOT 在 dispatcher、公共兼容密度链或其他云属 evaluator 中实现。

#### Scenario: 卷云纤维可辨

- **WHEN** cirrus preset 的 `cirrusFiberStrength` 大于 0
- **THEN** 正常渲染和密度调试视图 SHALL 呈现明显长于横向宽度的连续丝缕，并具有由 `cirrusFiberCurl` 控制的弯曲或钩状变化

#### Scenario: 云体旋转控制纤维方向

- **WHEN** 只旋转 cirrus 云体且保持时间、位置和形态参数不变
- **THEN** 纤维总体方向 SHALL 随云体局部轴旋转，密度结构 MUST NOT 从累计平流 offset 反推不稳定风向

#### Scenario: 物理风平移完整纤维

- **WHEN** cirrus 云体按现有物理风累计位移推进、暂停、重置或 scrub
- **THEN** 整体纤维结构 SHALL 使用统一运输坐标连续移动，不得出现内部纤维与足迹分离或额外相位跳变

### Requirement: 积雨云对流塔与花椰菜形态

系统 SHALL 在 `evalCumulonimbus()` 内提供高度门控的多胞元对流塔密度，使 cumulonimbus 中上层形成竖直隆起、相互并合的塔体和花椰菜状分瓣。新增密度 SHALL 保持在既有 weather footprint、实例垂直区间与有限非负密度契约内，并 SHALL 与既有平底、顶部截断和砧顶形态组合。

#### Scenario: 对流塔轮廓可辨

- **WHEN** cumulonimbus preset 的 `convectiveTowerStrength` 大于 0
- **THEN** 正常渲染和密度调试视图 SHALL 在中上层显示多个竖直发展的隆起，而不是只有单一平滑圆顶

#### Scenario: 胞元尺度控制花椰菜分瓣

- **WHEN** 在有效范围内调整 `convectiveCellScale`
- **THEN** 花椰菜分瓣的典型尺度 SHALL 连续变化，且 MUST NOT 产生 NaN、负密度或逃出云体足迹的孤立密度

#### Scenario: 砧顶和云底职责保持独立

- **WHEN** 分别调整 `convectiveTowerStrength`、`anvilStrength`、`topCutoffSharpness` 与 `baseRoundness`
- **THEN** 对流塔 SHALL 控制中上层隆起，砧顶 SHALL 控制高层水平扩张，顶部截断与云底 SHALL 保持各自既有职责且可独立关闭

### Requirement: 新形态零强度兼容与属隔离

新增形态 SHALL 只改变 cirrus 与 cumulonimbus。`cirrusFiberStrength=0` 或 `convectiveTowerStrength=0` 时，对应 evaluator SHALL 在任何新增噪声采样前返回兼容密度；其他八个云属 MUST 保持既有函数、形态参数语义和下游结果。

#### Scenario: 零强度恢复兼容路径

- **WHEN** 两个目标云属的新增强度均为 0
- **THEN** 它们 SHALL 与变更前固定场景保持视觉等价，并且新增噪声路径 SHALL 不执行

#### Scenario: 非目标云属不受影响

- **WHEN** 渲染 cumulus、stratus、stratocumulus、altocumulus、altostratus、nimbostratus、cirrostratus 或 cirrocumulus
- **THEN** dispatcher SHALL 继续调用原标量 evaluator，新增形态参数和公式 MUST NOT 改变其密度、genus metadata 或性能路径

#### Scenario: 三质量模式共享形态语义

- **WHEN** 同一目标云体依次使用 Cached、Hybrid 与 Realtime
- **THEN** 三种模式 SHALL 表示相同的纤维或对流塔基础形态，差异只可来自既有缓存分辨率和实时细节策略
