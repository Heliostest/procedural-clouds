## ADDED Requirements

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
