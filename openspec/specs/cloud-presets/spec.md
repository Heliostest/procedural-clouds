# cloud-presets Specification

## Purpose
TBD - created by archiving change cloud-type-presets. Update Purpose after archive.
## Requirements
### Requirement: 云属预设表
系统 SHALL 提供云属预设表，覆盖 10 种云属：cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus。每个预设 MUST 给出完整的云属形态字段取值，并至少包含 `anvilStrength`、`topCutoffSharpness` 与 `baseRoundness`。这些形态字段 SHALL 只参与原始密度场构造，MUST NOT 依赖或读取 edge-style 参数与边缘锐化总开关。

#### Scenario: 预设覆盖十种云属
- **WHEN** 读取预设表
- **THEN** 表中 SHALL 含上述 10 个云属条目，每条提供完整的形态字段取值

#### Scenario: 四类形态肉眼可辨
- **WHEN** 分别应用 cumulus、stratus、cirrus、cumulonimbus 预设
- **THEN** 画面 SHALL 呈现可区分形态：cumulus 平底圆顶蓬松、stratus 均匀薄毯、cirrus 高空细丝、cumulonimbus 暗底高耸并具有可辨砧顶

#### Scenario: 积雨云形态独立于边缘渲染
- **WHEN** cumulonimbus 的 `anvilStrength` 与 `topCutoffSharpness` 大于 0 且边缘锐化总开关关闭
- **THEN** 原始密度场 SHALL 继续包含砧顶扩张和顶部轮廓，只有后置边缘过渡变柔

#### Scenario: 非积雨云默认无砧顶扩张
- **WHEN** 使用默认非 cumulonimbus 云属预设
- **THEN** `anvilStrength` SHALL 为 0，除非该云属规范另有明确的高层扩张需求

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

### Requirement: 云体内部垂直剖面
预设字段 `altBase/altTop` SHALL 只表示云体实例自身 `[base, base+thickness]` 内的相对密度带。shader SHALL 先计算 body-local Y，再应用 `altBase/altTop` 包络与 preset `altitude` 塑形；这些形态计算 MUST NOT 再以全局盒高区分高/中/低云，也 MUST NOT 被 edge-style 或 `edgeSharpening` 开关旁路。

#### Scenario: 同一预设适配不同实例高度
- **WHEN** 两朵同 genus 云体具有不同米制 base/thickness 但使用相同 preset
- **THEN** 二者 SHALL 在各自实例区间内应用相同的相对垂直剖面

#### Scenario: 边缘开关不移除内部剖面
- **WHEN** 关闭 edgeSharpening
- **THEN** `altBase/altTop` 对原始密度的限制 SHALL 继续生效

### Requirement: 绝对 placement 与相对形态分离
genus profile SHALL 负责默认 base/thickness/bounds；preset SHALL 负责形态与光照。`altBase/altTop` MUST NOT 再通过 0.3/0.6/0.65 等起点编码中云或高云的绝对层级。迁移基线 SHALL 为十属 `[0,1]`，后续非全区间值必须有云体内部形态理由和 A/B 记录。

#### Scenario: 高云位置不由 altBase 编码
- **WHEN** 使用 cirrus preset 且其 body profile 默认 base 为 7000 m
- **THEN** 高空位置 SHALL 来自 body placement，`altBase` 不得再次把密度推到实例顶部 35%

#### Scenario: preset GUI 不混入实例 placement
- **WHEN** 用户编辑 genus preset
- **THEN** preset 页面 SHALL 不包含实例 base/thickness 或场景 cloudHeight 编辑项

