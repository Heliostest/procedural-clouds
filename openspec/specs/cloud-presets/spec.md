# cloud-presets Specification

## Purpose
TBD - created by archiving change cloud-type-presets. Update Purpose after archive.
## Requirements
### Requirement: 云属预设表
系统 SHALL 提供云属预设表，覆盖 10 种云属：cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus。每个预设 MUST 给出一组 `CloudShape` 形态字段取值，数值参考 `cloud-types.md`。

#### Scenario: 预设覆盖十种云属
- **WHEN** 读取预设表
- **THEN** 表中 SHALL 含上述 10 个云属条目，每条提供完整的形态字段取值

#### Scenario: 四类形态肉眼可辨
- **WHEN** 分别应用 cumulus、stratus、cirrus、cumulonimbus 预设
- **THEN** 画面 SHALL 呈现可区分形态：cumulus 平底圆顶蓬松、stratus 均匀薄毯、cirrus 高空细丝、cumulonimbus 暗底高耸

### Requirement: 预设选择界面
GUI SHALL 提供预设下拉控件，列出全部云属，用户选择后触发应用该预设。

#### Scenario: 选择预设
- **WHEN** 用户在下拉中选择某云属
- **THEN** 系统 SHALL 以该预设为目标开始更新 `CloudShape`

### Requirement: 预设平滑过渡
切换预设时，系统 SHALL 将 `CloudShape` 形态字段从当前值平滑插值到目标预设值，而非瞬间跳变。

#### Scenario: 切换时插值过渡
- **WHEN** 从一个预设切换到另一个预设
- **THEN** 各形态字段 SHALL 在一段过渡时间内逐帧插值收敛到目标值，画面无突变跳变

