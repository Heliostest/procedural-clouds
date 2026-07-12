## ADDED Requirements

### Requirement: Recipe V2 固定且可检查的数据布局

系统 SHALL 为 Density Engine V2 定义独立于 Legacy `Params/BodyGPU/PresetShape` 的固定 CPU/WGSL record：`DensityFrameGPU` SHALL 为 64 bytes、`DensityBodyGPU` SHALL 为 128 bytes、`DensityRecipeGPU` SHALL 为 256 bytes，所有字段和 stride MUST 以 16-byte 对齐。系统 SHALL 维护集中、带版本的 layout descriptor，记录字段名、scalar kind、byte offset、byte size、alignment、stride、record count 与 enum range；CPU packing 与 WGSL struct declaration MUST 由同一描述符生成或通过机器可读逐字段检查保持一致。V2 layout MUST NOT 修改现有 `PARAM_OFFSETS`、`BODY_BASE` 或 Legacy preset buffer。

#### Scenario: CPU 与 WGSL layout 一致

- **WHEN** 运行 V2 layout 检查
- **THEN** 三种 record 的字段顺序、scalar kind、offset、stride、array count 与 WGSL binding `minBindingSize` SHALL 完全一致，任一错位 MUST 使检查失败

#### Scenario: Reserved 与有限值约束

- **WHEN** pack Frame、Body 或 Recipe record
- **THEN** 所有 f32 MUST 有限、u32 enum/flags MUST 在声明范围内、reserved lane MUST 写零，非法输入 MUST 被有限拒绝而非产生越界 buffer 或 NaN

#### Scenario: Legacy 布局不受影响

- **WHEN** 引入或修改 V2 record
- **THEN** Legacy `PARAMS_FLOAT_COUNT`、`BODY_BASE`、现有字段 offset、CloudBody/scenario schema 与 Optical preset layout MUST 保持不变

### Requirement: Placement、Density Recipe 与 Optical Profile 三轴正交

V2 SHALL 将云属定义拆为 Placement Profile、Density Recipe 与 Optical Profile 三条正交数据轴。`DensityBodyGPU` SHALL 只携带每体空间 placement、累计运输、生命周期/强度与 genus/recipe identity；`DensityRecipeGPU` SHALL 只携带归一化密度 profile、topology/detail/attachment/finalize 参数 bank 和静态成本上限；现有 Optical Profile SHALL 继续由缓存后的渲染阶段消费。Density Recipe MUST NOT 复制物理 altitude placement、body bounds、风状态或 absorption、phase、silver、halo、lightning 等光学系数。

#### Scenario: 同密度拓扑使用不同光学

- **WHEN** 两个 genus 共享同一未来 density topology family 但具有不同 Optical Profile
- **THEN** 它们 MAY 引用相同 Density Recipe 模式，同时通过输出 genus metadata 保持独立光学行为，density compute MUST NOT 复制或解释光学系数

#### Scenario: Placement 变化不重写静态 Recipe

- **WHEN** 用户移动、旋转、改变高度、风或生命周期状态
- **THEN** 系统 SHALL 只更新对应 Body/Frame placement payload，静态十属 Recipe buffer MUST NOT 因普通 per-body placement 变化重建

#### Scenario: Recipe 参数不承担多重旧语义

- **WHEN** 定义 topology、detail/erosion、attachment 或 finalize 参数
- **THEN** 各职责 SHALL 使用独立具名 bank，MUST NOT 复用 Legacy 单一 `detail` 字段同时控制宏观 octave、微观侵蚀与 Hybrid 成本

### Requirement: 十属静态 Recipe 表与有界参数 bank

系统 SHALL 建立恰好覆盖 cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus 的静态 Recipe 表，并为每个 genus 提供稳定、唯一的 genus/recipe ID、profile/topology mode、feature flags、具名参数 bank 和 `maxBaseSamples/maxDetailSamples/maxOctaves` 等静态成本上限。W3 中所有 Recipe SHALL 为 disabled 且所有采样/Octave 上限为零；表只描述后续静态路径，不得被解释为运行时指令流。

#### Scenario: 十属表完整且稳定

- **WHEN** 构建或检查 V2 Recipe table
- **THEN** 十个规范 genus SHALL 各有且仅有一条记录，ID 与现有 genus/preset 顺序一致，缺失、重复或越界 ID MUST 使检查失败

#### Scenario: W3 Recipe 全部禁用

- **WHEN** W3 pack 任一规范 genus 的 Recipe
- **THEN** `enabled` SHALL 为零，base/detail/Octave 上限 SHALL 为零，compute MUST NOT 因 topology mode 已填写而执行形态算子

#### Scenario: 无效 genus 安全归零

- **WHEN** Body 输入包含负数、非整数或超出十属范围的 genus identity
- **THEN** V2 packer SHALL 将该 Body 标为 disabled/invalid recipe，MUST NOT 越界访问 Recipe table，最终 density output SHALL 保持有限零值

### Requirement: Recipe 是静态分发参数而非 GPU Interpreter

V2 Recipe schema MUST NOT 提供动态长度 operator 数组、operator count 循环、函数指针、跳转表、bytecode 或任意 graph/interpreter。后续实际密度实现 SHALL 通过预编译 genus/family evaluator 和有界分支读取固定 record；任何 octave、atlas sample、attachment 或循环次数 MUST 具有编译期上限或固定 record 上限。W3 V2 source MUST NOT 引用 Legacy 4D Voronoi、4D fBm、Legacy genus evaluator 或 Legacy cache writer closure。

#### Scenario: 静态检查拒绝 interpreter

- **WHEN** 审计 W3 V2 source 与 Recipe schema
- **THEN** 不得存在按 operator count 执行的循环、bytecode/graph dispatch 或动态资源索引链，发现任一模式 MUST 使 source-closure 检查失败

#### Scenario: Legacy 密度图不进入 V2

- **WHEN** 组装 V2 compute shader module
- **THEN** source MUST NOT 包含 `cloudDensityTyped`、`evalBody`、Legacy genus dispatch、完整 4D Voronoi/fBm 或 W2 `legacy-cache` fragment

#### Scenario: 后续成本增长需要新 Wave 授权

- **WHEN** 后续 Wave 希望把任一 Recipe 的采样、Octave、attachment 或循环上限从零提高
- **THEN** 对应 OpenSpec change SHALL 明确新上限、早退位置与验证证据，W3 本身不得授权无限或未记录的成本增长
