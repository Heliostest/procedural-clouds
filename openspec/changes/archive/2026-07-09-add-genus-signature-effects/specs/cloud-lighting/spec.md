## ADDED Requirements

### Requirement: Altostratus 朦胧日盘
当样本或像素合成的主导云属为 altostratus 且 `sunDiscVisible > 0` 时，系统 SHALL 在背景太阳光斑上降低锐度，并按最终云透过率调制其可见度，使薄云后呈现朦胧日盘、厚云仍遮挡。`sunDiscVisible == 0` 或 `typeLightingBlend == 0` 时 SHALL 旁路，复现引入前太阳光斑行为。

#### Scenario: 薄云透出日盘
- **WHEN** 主导云属为 altostratus、`sunDiscVisible > 0`，且视线穿过薄云（高透过率）朝向太阳
- **THEN** 太阳位置 SHALL 呈现比默认更柔和、仍可见的日盘

#### Scenario: 厚云遮挡
- **WHEN** 同上但云光学厚度使最终透过率接近 0
- **THEN** 日盘 SHALL 被遮挡，不穿透厚云

#### Scenario: 关闭旁路
- **WHEN** `sunDiscVisible == 0` 或 `typeLightingBlend == 0`
- **THEN** 太阳光斑 SHALL 与引入本能力前一致

### Requirement: Cirrostratus 22° 日晕
当主导云属为 cirrostratus 且 `haloEffect > 0` 时，系统 SHALL 在背景天空上于太阳角距约 22° 处叠加可调亮环。太阳低于地平线、`haloEffect == 0` 或 `typeLightingBlend == 0` 时 SHALL 旁路。亮环 MUST NOT 写入云内散射项以免厚云内部发白。

#### Scenario: 可见日晕环
- **WHEN** 主导云属为 cirrostratus、`haloEffect > 0` 且太阳在地平线以上
- **THEN** 太阳周围约 22° 处 SHALL 出现可辨亮环

#### Scenario: 夜间旁路
- **WHEN** 太阳方向高度角低于地平线
- **THEN** 日晕 SHALL 不绘制

#### Scenario: 关闭旁路
- **WHEN** `haloEffect == 0` 或 `typeLightingBlend == 0`
- **THEN** 天空背景 SHALL 与引入本能力前一致

### Requirement: Cumulonimbus 内部闪光
当主导云属为 cumulonimbus 且 `internalLightning > 0` 时，系统 SHALL 在体积散射累加中叠加由仿真 `sceneTime` 驱动的稀疏暖色闪光脉冲，强度随局部密度权重衰减。`internalLightning == 0` 或 `typeLightingBlend == 0` 时 SHALL 旁路。仿真速度为 `0×` 时闪光相位 SHALL 冻结。

#### Scenario: 可见内部闪光
- **WHEN** 主导云属为 cumulonimbus、`internalLightning > 0` 且仿真时间前进
- **THEN** 云体内部 SHALL 间歇出现暖色增亮脉冲

#### Scenario: 冻结
- **WHEN** 仿真速度为 `0×`
- **THEN** 闪光相位 SHALL 保持不变

#### Scenario: 关闭旁路
- **WHEN** `internalLightning == 0` 或 `typeLightingBlend == 0`
- **THEN** 散射着色 SHALL 与引入本能力前一致
