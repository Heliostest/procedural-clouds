## ADDED Requirements

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
