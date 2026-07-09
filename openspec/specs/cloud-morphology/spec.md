# cloud-morphology Specification

## Purpose
TBD - created by archiving change refactor-genus-density-evaluators. Update Purpose after archive.
## Requirements
### Requirement: 十属独立密度求值入口

系统 SHALL 为 cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus 与 cirrocumulus 分别提供一个具名 WGSL 密度求值函数。单一云属 dispatcher SHALL 按云体的 genus 索引选择且只选择对应函数；dispatcher MUST NOT 包含云属专属的密度形态公式。各函数 MAY 复用共享噪声、包络、足迹采样和密度组合基础算子。

#### Scenario: 十属入口完整

- **WHEN** 构建云渲染 shader module
- **THEN** 十个规范云属 SHALL 各有且仅有一个 dispatcher case 和一个对应具名密度求值入口

#### Scenario: 云体按属路由

- **WHEN** 两个云体分别使用 cirrus 与 cumulonimbus genus
- **THEN** cirrus 云体 SHALL 仅通过 cirrus 密度入口求值，cumulonimbus 云体 SHALL 仅通过 cumulonimbus 密度入口求值

#### Scenario: 无效索引安全回退

- **WHEN** shader 收到超出十属范围的 genus 索引
- **THEN** dispatcher SHALL 使用与现有未知 preset 行为一致的 cumulus 回退，且 MUST NOT 产生 NaN、负密度或越界预设访问

### Requirement: 共享上下文与形态职责边界

系统 SHALL 在进入云属 dispatcher 前建立共享求值上下文，统一提供云体平流、旋转、实例内垂直坐标、足迹输入、预设参数与生命周期/强度调制输入。云属函数 SHALL 负责组织本属的原始凝结物密度形态并返回有限非负贡献；公共准备或收尾逻辑 MUST NOT 隐藏云属专属形态决策。上下文 MUST 保留云属函数在足迹采样前调整形态坐标的能力。

#### Scenario: 积雨云可调整上层足迹

- **WHEN** cumulonimbus 求值器应用非零砧顶扩张
- **THEN** 它 SHALL 能在采样云体足迹前调整高层水平形态坐标，而不要求其他云属执行同一扩张

#### Scenario: 公共运输语义一致

- **WHEN** 不同 genus 的云体具有相同物理平流位移
- **THEN** 各云属求值器 SHALL 接收按统一物理单位和累计相位准备的运输坐标，不得分别重新解释风速或场景时间

#### Scenario: 调试实体绕过程序化云属形态

- **WHEN** 云体使用 sphere、cube 或其他现有调试实体 shape
- **THEN** 系统 SHALL 保留实体密度求值路径，且 MUST NOT 强制其进入程序化云属 dispatcher

### Requirement: 云属形态与下游密度消费解耦

云属求值器输出 SHALL 作为单云体密度贡献返回 `cloudDensityTyped()`，由既有多云体合成和主导/次级云属跟踪统一处理。云属求值器 MUST NOT 直接执行像素着色、光照行进、后置 edge-style、密度缓存写入或地面云影积分。cached、hybrid 与 realtime 模式 SHALL 继续通过统一密度取样入口消费云属结果。

#### Scenario: 三种质量模式使用同一云属语义

- **WHEN** 同一场景依次使用 cached、hybrid 与 realtime 质量模式
- **THEN** 三种模式 SHALL 使用同一云属 dispatcher 语义生成基础密度，差异只来自既有缓存和实时细节策略

#### Scenario: 混合云属保留光照元数据

- **WHEN** 两个不同 genus 的云体在空间中重叠
- **THEN** 系统 SHALL 在合成其独立密度贡献后继续输出主导/次级 genus 及混合权重，使既有按属光照保持有效

#### Scenario: 边缘渲染保持后置

- **WHEN** 用户切换 `edgeSharpening` 或调整 edge-style
- **THEN** 变化 SHALL 继续发生在统一密度取样后的边缘塑形阶段，不得改变云属 dispatcher 的路由或调用链

### Requirement: 机械迁移保持现有观感

在没有另一个已批准云属形态变更的前提下，从单体 `evalBody()` 迁移到十属独立入口 MUST 保持相同输入下的密度结构、云体边界、形态参数语义和下游成像观感。因函数提取造成的浮点运算重排 MAY 存在不可见的数值差异，但 MUST 记录并通过固定场景 A/B 验证。

#### Scenario: 固定场景迁移对比

- **WHEN** 使用固定相机、场景时间、云体、预设和质量参数比较迁移前后结果
- **THEN** 十属的密度调试视图与正常渲染 SHALL 保持视觉等价，任何非像素级差异 MUST 有浮点重排说明且不得改变可辨轮廓

#### Scenario: 现有参数和数据无需迁移

- **WHEN** 加载迁移前保存的 CloudBody、scenario 与 preset 配置
- **THEN** 系统 SHALL 无需 schema 转换或新增默认字段即可渲染，GPU 预设与云体 buffer 布局 SHALL 保持兼容

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

### Requirement: 高积云与卷积云鱼鳞胞元尺度
系统 SHALL 在 `evalAltocumulus()` 与 `evalCirrocumulus()` 内提供由 `tileScale` 控制的重复胞元（鱼鳞）密度重塑，使高积云呈现中空规则云胞行、卷积云呈现更高频细鳞/米粒。重塑 SHALL 受云体足迹、实例垂直区间、生命周期/密度调制与统一物理平流约束。公式 MUST NOT 出现在 dispatcher、`evalCompatibilityGenus()` 或其他云属 evaluator 中。`tileScale=0` 时对应 evaluator SHALL 在新增噪声采样前返回兼容密度。

#### Scenario: 高积云鱼鳞可辨
- **WHEN** altocumulus 的 `tileScale` 大于 0
- **THEN** 正常渲染与密度调试视图 SHALL 呈现规则重复的小云胞及可辨缝隙，而非单一平滑团块

#### Scenario: 卷积云更细密
- **WHEN** 在相同足迹与相机下比较默认 cirrocumulus 与默认 altocumulus
- **THEN** cirrocumulus 的典型胞元尺度 SHALL 明显小于 altocumulus

#### Scenario: 尺度连续可调
- **WHEN** 在有效范围内调节某一目标属的 `tileScale`
- **THEN** 胞元重复频率 SHALL 连续变化，且 MUST NOT 产生 NaN、负密度或逃出足迹的孤立密度

#### Scenario: 零强度回退
- **WHEN** 两目标属 `tileScale` 均为 0
- **THEN** 密度 SHALL 与变更前固定场景视觉等价，且新增噪声路径 SHALL 不执行

#### Scenario: 非目标属隔离
- **WHEN** 渲染非 altocumulus、非 cirrocumulus 的云属
- **THEN** 其密度路径与观感 MUST NOT 因本能力改变

