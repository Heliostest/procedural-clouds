## MODIFIED Requirements

### Requirement: 十属静态 Recipe 表与有界参数 bank

系统 SHALL 建立恰好覆盖 cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus 的静态 Recipe 表，并为每个 genus 提供稳定、唯一的 genus/recipe ID、profile/topology mode、feature flags、具名参数 bank 和 `maxBaseSamples/maxDetailSamples/maxOctaves/maxAttachments` 静态成本上限。W6 SHALL 只启用 Stratus 与 Cumulus；其他八属 SHALL 保持 disabled 且所有采样/Octave/attachment 上限为零。表只描述预编译静态路径，不得被解释为运行时指令流。

`sampleLimits` SHALL 固定为 `[maxBaseSamples,maxDetailSamples,maxOctaves,maxAttachments]`：Stratus SHALL 为 `[2,0,0,0]`，Cumulus SHALL 为 `[3,1,0,0]`。`detailAttachmentCosts` SHALL 固定为 `[macroCostClass,detailCostClass,attachmentCount,hybridDetailEnabled]`：Stratus SHALL 为 `[1,0,0,0]`，Cumulus SHALL 为 `[1,1,0,0]`。W6 不得提高其他 Recipe budget。

#### Scenario: 十属表完整且稳定

- **WHEN** 构建或检查 V2 Recipe table
- **THEN** 十个规范 genus SHALL 各有且仅有一条记录，ID 与现有 genus/preset 顺序一致，缺失、重复或越界 ID MUST 使检查失败

#### Scenario: W6 只启用双属

- **WHEN** W6 pack 静态 Recipe table
- **THEN** enabled genus 集合 SHALL 恰好为 `{stratus,cumulus}`，其 sample/cost lanes SHALL 等于批准值，其他八条的 enabled 与四个 sample limits SHALL 全为零

#### Scenario: 无效 genus 安全归零

- **WHEN** Body 输入包含负数、非整数或超出十属范围的 genus identity
- **THEN** V2 packer SHALL 将该 Body 标为 disabled/invalid recipe，MUST NOT 越界访问 Recipe table，最终 density output SHALL 保持有限零值

#### Scenario: Cost lane 不驱动动态循环

- **WHEN** shader 读取 sampleLimits 或 detailAttachmentCosts
- **THEN** 它们 SHALL 只用于验证/诊断或固定分支一致性，MUST NOT 成为动态 sample、octave、operator 或 attachment 循环上限

## ADDED Requirements

### Requirement: W6 Stratiform 与 Billow 具名参数语义

W6 SHALL 在不改变 `DensityRecipeGPU` 256-byte stride/layout version 2 的前提下，为 `domain0/domain1/vertical0/vertical1/topology0/topology1/topology2/detail0/finalize0` 提供按 Stratiform/Billow family 区分的机器可读具名 descriptor。每个 descriptor SHALL 定义 lane component、参数名、有限最小/最大值、默认值和消费 evaluator；CPU packing fixtures 与 WGSL accessor/constants MUST 对这些语义保持一致。

Stratiform descriptor SHALL 只包含 Macro/Base frequency、Thin Sheet fades/thickness variation、coverage remap、low-amplitude topology 与 finalize；Billow descriptor SHALL 包含 Macro/Base/Detail frequency、一次 warp strength、Flat-base Dome、Billow weights/threshold、height-biased erosion 与 finalize。W6 MUST NOT 使用 attachment lanes或把同一参数同时解释为 topology octave、erosion strength 与 Hybrid detail cost。

#### Scenario: 参数在批准范围内

- **WHEN** pack W6 Stratus/Cumulus Recipe
- **THEN** 每个具名 f32 SHALL 有限且位于 descriptor 范围内，reserved 与未使用 family lanes SHALL 写零，越界值 MUST 使 fixture/packing 失败

#### Scenario: Family 语义不串用

- **WHEN** 静态审计 Stratus evaluator
- **THEN** 它 SHALL 不读取 Billow-only warp/second-base/detail erosion 参数；Cumulus SHALL 不把 Stratiform low-amplitude lane 作为动态 octave 或 Hybrid detail 开关

#### Scenario: Placement 与 Optical 继续正交

- **WHEN** 调整 W6 Recipe profile/topology 参数
- **THEN** Recipe buffer MUST NOT 新增 altitude placement、Body bounds、wind state、absorption、phase、silver、powder 或其他 Optical 参数
