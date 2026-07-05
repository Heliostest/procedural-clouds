## MODIFIED Requirements

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
