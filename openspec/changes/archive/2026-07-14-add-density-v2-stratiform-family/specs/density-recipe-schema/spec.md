## MODIFIED Requirements

### Requirement: 十属静态 Recipe 表与有界参数 bank

系统 SHALL 建立恰好覆盖 cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus 的静态 Recipe 表，并为每个 genus 提供稳定、唯一的 genus/recipe ID、profile/topology mode、feature flags、具名参数 bank 和 `maxBaseSamples/maxDetailSamples/maxOctaves/maxAttachments` 静态成本上限。W7 SHALL 启用 Cumulus、Stratus、Cirrostratus、Altostratus 与 Nimbostratus；Stratocumulus、Cumulonimbus、Altocumulus、Cirrus、Cirrocumulus SHALL 保持 disabled 且所有采样/Octave/attachment 上限为零。表只描述预编译静态路径，不得被解释为运行时指令流。

`sampleLimits` SHALL 固定为 `[maxBaseSamples,maxDetailSamples,maxOctaves,maxAttachments]`：Stratus、Cirrostratus、Altostratus、Nimbostratus SHALL 均为 `[2,0,0,0]`，Cumulus SHALL 保持 `[3,1,0,0]`。`detailAttachmentCosts` SHALL 固定为 `[macroCostClass,detailCostClass,attachmentCount,hybridDetailEnabled]`：四个 Stratiform SHALL 均为 `[1,0,0,0]`，Cumulus SHALL 保持 `[1,1,0,0]`。W7 不得提高其他 Recipe budget。

#### Scenario: 十属表完整且稳定

- **WHEN** 构建或检查 V2 Recipe table
- **THEN** 十个规范 genus SHALL 各有且仅有一条记录，ID 与现有 genus/preset 顺序一致，缺失、重复或越界 ID MUST 使检查失败

#### Scenario: W7 启用五属

- **WHEN** W7 pack 静态 Recipe table
- **THEN** enabled genus 集合 SHALL 恰好为 `{cumulus,stratus,altostratus,nimbostratus,cirrostratus}`，其 sample/cost lanes SHALL 等于批准值，其他五条的 enabled 与四个 sample limits SHALL 全为零

#### Scenario: 无效 genus 安全归零

- **WHEN** Body 输入包含负数、非整数或超出十属范围的 genus identity
- **THEN** V2 packer SHALL 将该 Body 标为 disabled/invalid recipe，MUST NOT 越界访问 Recipe table，最终 density output SHALL 保持有限零值

#### Scenario: Cost lane 不驱动动态循环

- **WHEN** shader 读取 sampleLimits 或 detailAttachmentCosts
- **THEN** 它们 SHALL 只用于验证/诊断或固定分支一致性，MUST NOT 成为动态 sample、octave、operator 或 attachment 循环上限

## ADDED Requirements

### Requirement: W7 Stratiform Family 参数特化

W7 SHALL 在不改变 `DensityRecipeGPU` 256-byte stride、layout version 2 或现有 lane 顺序的前提下，为四个 Stratiform Recipe 提供有限参数特化。Stratus 与 Cirrostratus SHALL 使用 Thin Sheet vertical profile；Altostratus 与 Nimbostratus SHALL 使用 Soft Layer vertical profile；四者 topology family SHALL 为 Stratiform。

参数只可通过现有 Macro/Base frequency、wind phase、horizontal-vs-vertical anisotropy、bottom/top fade、thickness variation、coverage remap、low-amplitude Base modulation 与 finalize density lanes 区分。四属的 Detail、warp、octave、attachment、Hybrid detail 与 reserved lanes MUST 为零。Placement altitude/bounds 与 halo、sun disc、absorption、base darkening 等 Optical 参数 MUST NOT 写入 Density Recipe。

四属 bank MUST 为 `vertical1.xy` 提供位于 Body local height 内的非零 `profileStart/profileSpan`。Macro 与 Base frequency/anisotropy 的组合 MUST 使固定 Body 横跨属级最低共享场坐标范围；coverage remap 与 Base amplitude MUST 通过 low/high probe 证明不是常数或全饱和。该校准不得通过增加 sample 数或提高全局 cache resolution 达成。

#### Scenario: Thin Sheet 与 Soft Layer 映射

- **WHEN** 检查 W7 四个 Stratiform Recipe modes
- **THEN** Stratus/Cirrostratus SHALL 映射 Thin Sheet，Altostratus/Nimbostratus SHALL 映射 Soft Layer，四者 SHALL 共享 Stratiform topology family

#### Scenario: 四属参数有限且职责单一

- **WHEN** pack Cs/As/Ns/St Recipe banks
- **THEN** 所有使用 lane SHALL 位于声明范围，未使用/attachment/reserved lane SHALL 为零，任一参数 MUST NOT 同时承担 density topology 与 optical/placement 语义

#### Scenario: 共享场跨度与 profile 有效

- **WHEN** 检查默认 St/Cs/As/Ns bank 的 Body-normalized Macro/Base 坐标跨度与 `vertical1.xy`
- **THEN** 每属 SHALL 满足批准的最低坐标跨度，profile span SHALL 大于零且 `profileStart+profileSpan<=1`；固定 low/high probe SHALL 同时包含非饱和与填充响应

#### Scenario: Nimbostratus 附件保持关闭

- **WHEN** W7 pack Nimbostratus
- **THEN** 主体 MAY 使用更高 coverage/density 与 Soft Layer，但 fractus、scud、virga、precipitation curtain 的 attachment count/sample budget SHALL 为零
