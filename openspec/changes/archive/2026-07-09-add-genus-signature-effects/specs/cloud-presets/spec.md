## MODIFIED Requirements

### Requirement: 云属预设表
系统 SHALL 提供云属预设表，覆盖 10 种云属：cumulus、stratus、stratocumulus、cumulonimbus、altocumulus、altostratus、nimbostratus、cirrus、cirrostratus、cirrocumulus。每个预设 MUST 给出完整的云属形态字段取值，并至少包含 `anvilStrength`、`topCutoffSharpness`、`baseRoundness`、`cirrusFiberStrength`、`cirrusFiberCurl`、`convectiveTowerStrength` 与 `convectiveCellScale`。这些形态字段 SHALL 只参与原始密度场构造，MUST NOT 依赖或读取 edge-style 参数与边缘锐化总开关。四个形态增强字段 SHALL 存储在第七个 preset `vec4`：`p6.x/y/z/w` 分别对应 `cirrusFiberStrength/cirrusFiberCurl/convectiveTowerStrength/convectiveCellScale`。每个预设 MUST 额外给出光照特效强度 `sunDiscVisible`、`haloEffect`、`internalLightning`（范围 `[0,1]`），存储在第八个 preset `vec4`：`p7.x/y/z` 分别对应三项，`p7.w` 保留为 0。默认值：altostratus 的 `sunDiscVisible > 0`，cirrostratus 的 `haloEffect > 0`，cumulonimbus 的 `internalLightning > 0`；其余云属三项均为 0。

#### Scenario: 预设覆盖十种云属
- **WHEN** 读取预设表
- **THEN** 表中 SHALL 含上述 10 个云属条目，每条提供完整的形态字段与三项特效强度取值

#### Scenario: 四类形态肉眼可辨
- **WHEN** 分别应用 cumulus、stratus、cirrus、cumulonimbus 预设
- **THEN** 画面 SHALL 呈现可区分形态：cumulus 平底圆顶蓬松、stratus 均匀薄毯、cirrus 高空弯曲细丝、cumulonimbus 暗底高耸并具有可辨对流塔与砧顶

#### Scenario: 积雨云形态独立于边缘渲染
- **WHEN** cumulonimbus 的 `anvilStrength`、`topCutoffSharpness` 与 `convectiveTowerStrength` 大于 0 且边缘锐化总开关关闭
- **THEN** 原始密度场 SHALL 继续包含对流塔、砧顶扩张和顶部轮廓，只有后置边缘过渡变柔

#### Scenario: 非目标云属默认无专属增强
- **WHEN** 使用默认非 cirrus、非 cumulonimbus 云属预设
- **THEN** 四个形态增强字段 SHALL 为 0，且 `anvilStrength` SHALL 为 0，除非该云属规范另有明确的专属形态需求

#### Scenario: 三属特效默认开启
- **WHEN** 分别应用默认 altostratus、cirrostratus、cumulonimbus 预设
- **THEN** 对应的 `sunDiscVisible`、`haloEffect`、`internalLightning` SHALL 各自大于 0，且其余两项目标外属的对应强度为 0

#### Scenario: 第八个预设向量布局一致
- **WHEN** CPU 打包十属预设并由 WGSL 读取
- **THEN** 每属 SHALL 使用 8 个 `vec4`，且 p7 四分量的 CPU offset、buffer byte size 与 WGSL accessor MUST 完全一致
