## MODIFIED Requirements

### Requirement: Time-of-day 调色
系统 SHALL 由太阳方位角与高度角参数化太阳方向，并按太阳高度角对太阳色、环境色、背景/天空色与阴影色做分段渐变。关键色结点高度角 MUST 为 `[-15,-6,0,5,12,25,45,90]` 度。系统 SHALL 提供与 `procedural-clouds-threejs/cloud-types.md`「Artistic Color Palettes by Time of Day」对齐的艺术色板关键色，并 SHALL 提供 `todPaletteBlend`（0~1）：取 0 时 MUST 使用变更前遗留关键色并复现引入艺术色板前观感，取 1 时 MUST 使用艺术色板。背景清屏色 SHALL 与着色器天空底色保持一致。dawn 与 sunset 在仅有高度角时共用 0° 结点。

#### Scenario: 高度角驱动太阳方向
- **WHEN** 修改太阳方位角或高度角
- **THEN** 体积光照与太阳光斑方向 SHALL 随之改变

#### Scenario: 黄昏与正午色温
- **WHEN** 太阳高度角调至接近地平线且 `todPaletteBlend` 接近 1
- **THEN** 太阳色/阴影色/天空 SHALL 呈现艺术色板中的暖亮面与冷/紫阴影倾向；调至天顶时 SHALL 偏白偏亮蓝

#### Scenario: 背景与天空一致
- **WHEN** 太阳高度角变化
- **THEN** 画面背景清屏色 SHALL 与云区外天空底色一致，无明显接缝

#### Scenario: 色板可回退
- **WHEN** `todPaletteBlend` 取 0
- **THEN** TOD 着色 SHALL 复现引入艺术色板前的遗留关键色观感

#### Scenario: 默认启用艺术色板
- **WHEN** 参数取默认值
- **THEN** `todPaletteBlend` SHALL 为 1，昼夜色温以艺术色板为准
