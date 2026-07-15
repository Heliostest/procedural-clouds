## MODIFIED Requirements

### Requirement: 十属静态 Recipe 表与有界参数 bank

系统 SHALL 建立恰好覆盖 cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus 的静态 Recipe 表，并为每个 genus 提供稳定、唯一的 genus/recipe ID、profile/topology mode、feature flags、具名参数 bank 和 `maxBaseSamples/maxDetailSamples/maxOctaves/maxAttachments` 静态成本上限。W8 SHALL 启用 Cumulus、Stratus、Stratocumulus、Altocumulus、Altostratus、Nimbostratus、Cirrostratus 与 Cirrocumulus；Cumulonimbus、Cirrus SHALL 保持 disabled 且所有采样/Octave/attachment 上限为零。表只描述预编译静态路径，不得被解释为运行时指令流。

`sampleLimits` SHALL 固定为 `[maxBaseSamples,maxDetailSamples,maxOctaves,maxAttachments]`：四个 Stratiform SHALL 均为 `[2,0,0,0]`，Cumulus SHALL 保持 `[3,1,0,0]`，三个 Cellular SHALL 均为 `[3,0,0,0]`。`detailAttachmentCosts` SHALL 固定为 `[macroCostClass,detailCostClass,attachmentCount,hybridDetailEnabled]`：四个 Stratiform 与三个 Cellular SHALL 均为 `[1,0,0,0]`，Cumulus SHALL 保持 `[1,1,0,0]`。W8 不得提高既有五属 Recipe budget。

#### Scenario: 十属表完整且稳定

- **WHEN** 构建或检查 V2 Recipe table
- **THEN** 十个规范 genus SHALL 各有且仅有一条记录，ID 与现有 genus/preset 顺序一致，缺失、重复或越界 ID MUST 使检查失败

#### Scenario: W8 启用八属

- **WHEN** W8 pack 静态 Recipe table
- **THEN** enabled genus 集合 SHALL 恰好为 `{cumulus,stratus,stratocumulus,altocumulus,altostratus,nimbostratus,cirrostratus,cirrocumulus}`，其 sample/cost lanes SHALL 等于批准值，Cumulonimbus/Cirrus 的 enabled 与四个 sample limits SHALL 全为零

#### Scenario: 无效 genus 安全归零

- **WHEN** Body 输入包含负数、非整数或超出十属范围的 genus identity
- **THEN** V2 packer SHALL 将该 Body 标为 disabled/invalid recipe，MUST NOT 越界访问 Recipe table，最终 density output SHALL 保持有限零值

#### Scenario: Cost lane 不驱动动态循环

- **WHEN** shader 读取 sampleLimits 或 detailAttachmentCosts
- **THEN** 它们 SHALL 只用于验证/诊断或固定分支一致性，MUST NOT 成为动态 sample、octave、operator、neighbor 或 attachment 循环上限

## ADDED Requirements

### Requirement: W8 Cellular Family 参数特化

W8 SHALL 在不改变 `DensityRecipeGPU` 256-byte stride、layout version 2 或现有 lane 顺序的前提下，为 Stratocumulus、Altocumulus、Cirrocumulus 提供有限 Cellular 参数特化。三者 SHALL 使用 Cellular Layer vertical profile 与 Cellular topology family。

参数只可通过既有 Macro/Base frequency、wind phase、horizontal/vertical anisotropy、profile fade/start/span、thickness variation、coverage remap、cell interior/edge/secondary weights、connectivity bias、cell contrast、ripple/wave/lens/roll strength 与 finalize lanes 区分。三个 Cellular Recipe 的 Detail Atlas、dynamic octave、attachment、Hybrid detail 与 reserved lanes MUST 为零。Placement altitude/bounds 与 absorption、phase、silver、color 等 Optical 参数 MUST NOT 写入 Density Recipe。

#### Scenario: 三属 Cellular 映射

- **WHEN** 检查 W8 Sc/Ac/Cc Recipe modes
- **THEN** 三者 SHALL 映射 Cellular Layer + Cellular topology family，Cumulus/Stratiform 的既有 mode SHALL 不变

#### Scenario: 固定三采样预算

- **WHEN** pack Sc/Ac/Cc Recipe banks
- **THEN** `sampleLimits` SHALL 为 `[3,0,0,0]`、`detailAttachmentCosts` SHALL 为 `[1,0,0,0]`，attachment/reserved lanes SHALL 为零

#### Scenario: Cell 尺度与 Profile 排序

- **WHEN** 检查默认 Sc/Ac/Cc bank 的有效 Base frequency 与 `vertical1` profile span
- **THEN** 推导的 cell 尺度 SHALL 满足 Sc 大于 Ac 大于 Cc，profile span SHALL 满足 Sc 大于 Ac 大于 Cc，且每个 span 大于零并位于 Body local height 内

#### Scenario: Connectivity 参数独立

- **WHEN** 对相同 Macro/Base probe 比较三属 connectivity 参数
- **THEN** Sc SHALL 具有最高连接响应、Ac 居中、Cc 不高于 Ac；改变 connectivity MUST NOT 隐式改变 cell frequency、profile placement或 Optical 参数

#### Scenario: Wave Hook 参数有界

- **WHEN** pack wave/ripple/lens/roll strengths
- **THEN** 所有 strength SHALL 有限并位于 descriptor 范围；Cc MAY 使用非零 ripple，Lens/Roll 默认 SHALL 为零，任一 hook MUST NOT 提高 sample/attachment budget

#### Scenario: 旧 Breakup 不复制

- **WHEN** W8 定义 Stratocumulus Cellular Recipe
- **THEN** 它 SHALL 只使用 V2 Cellular 具名参数，不得复制 Legacy `detail` 多义字段或创建独立 `add-stratocumulus-cumulus-breakup` 参数链，Cumulus Recipe SHALL 保持 W7 行为
