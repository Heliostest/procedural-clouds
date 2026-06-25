## ADDED Requirements

### Requirement: Time-of-day 调色
系统 SHALL 由太阳方位角与高度角参数化太阳方向，并按太阳高度角对太阳色、环境色与背景/天空色做渐变，使低高度角呈暖暗色、高高度角呈冷亮色。背景清屏色 SHALL 与着色器天空底色保持一致。参数取默认值时着色 SHALL 复现引入前观感。

#### Scenario: 高度角驱动太阳方向
- **WHEN** 修改太阳方位角或高度角
- **THEN** 体积光照与太阳光斑方向 SHALL 随之改变

#### Scenario: 黄昏与正午色温
- **WHEN** 太阳高度角调至接近地平线
- **THEN** 太阳色/环境色/背景 SHALL 偏暖偏暗；调至天顶时 SHALL 偏白偏亮

#### Scenario: 背景与天空一致
- **WHEN** 太阳高度角变化
- **THEN** 画面背景清屏色 SHALL 与云区外天空底色一致，无明显接缝

#### Scenario: 默认值复现观感
- **WHEN** 光照参数取默认值
- **THEN** 渲染 SHALL 与引入本能力前一致，不产生突变

### Requirement: 双瓣相函数与边缘增亮
散射 SHALL 采用可调的双瓣 HG 相函数（前向瓣 + 背向瓣按混合权重组合），并 SHALL 支持 silver lining 背光银边与 Beer-powder 暗化：薄处提亮、厚处压暗。各效果强度为 0 时 SHALL 退化为基础单次散射观感。

#### Scenario: 前向散射尖峰
- **WHEN** 视线接近太阳方向
- **THEN** 云体 SHALL 呈现更强的前向透光高光

#### Scenario: 背光银边
- **WHEN** 背光观察云缘且银边强度大于 0
- **THEN** 云的边缘 SHALL 出现增亮的银边

#### Scenario: powder 暗化
- **WHEN** powder 强度大于 0
- **THEN** 云的薄区 SHALL 提亮、厚实内部 SHALL 相对压暗

### Requirement: 积雨云暗底亮顶
着色 SHALL 按采样点归一化高度与局部密度调制散射，使高密度厚云（如 cumulonimbus）呈现底部偏暗、顶部偏亮。该调制对低密度薄云 SHALL 影响轻微。

#### Scenario: 积雨云体明暗梯度
- **WHEN** 渲染一团高密度积雨云体
- **THEN** 其底部 SHALL 明显暗于顶部

#### Scenario: 薄云不受显著影响
- **WHEN** 渲染低密度薄云（如 cirrus/stratus）
- **THEN** 暗底亮顶调制 SHALL 不产生明显明暗突变

### Requirement: God rays 后处理
系统 SHALL 提供 God rays 屏幕空间后处理：以太阳屏幕投影为中心做径向模糊并与主图合成，强度可调。强度为 0 时 SHALL 旁路该后处理，不改变画面且不引入额外开销。

#### Scenario: 启用放射光束
- **WHEN** God rays 强度大于 0 且太阳在视野方向
- **THEN** 画面 SHALL 出现自太阳方向放射的光束

#### Scenario: 关闭旁路
- **WHEN** God rays 强度为 0
- **THEN** 系统 SHALL 旁路后处理，画面与未启用时一致
