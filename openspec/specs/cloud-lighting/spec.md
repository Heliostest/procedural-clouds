# cloud-lighting Specification

## Purpose
TBD - created by archiving change lighting-quality. Update Purpose after archive.
## Requirements
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

### Requirement: 按云属调制光照
着色 SHALL 按当前样本的主导云属索引查预设光照字段，对吸收消光、双瓣相函数（前向/背向瓣）、silver lining 银边、暗底亮顶幅度与 SSS 背光透射分别调制，使不同云属在相同时刻、相同太阳条件下呈现不同的光质。`lighting-quality` 引入的全局光照强度 SHALL 保留为总倍率。系统 SHALL 提供全局 `typeLightingBlend` 在「全局光照观感」与「按云属光照」之间插值，取 0 时着色 SHALL 复现按云属调制前的全局观感。

#### Scenario: 卷云通透强前向
- **WHEN** 渲染主导云属为 cirrus/cirrostratus 的样本
- **THEN** 其消光 SHALL 明显低于积云类、前向散射高光 SHALL 更强，整体呈通透感

#### Scenario: 积雨云暗底亮顶且银边强
- **WHEN** 渲染主导云属为 cumulonimbus 的高密度云体
- **THEN** 其底部压暗与背光银边 SHALL 明显强于其他云属

#### Scenario: 积云亮顶暗底
- **WHEN** 渲染主导云属为 cumulus 的样本
- **THEN** 顶部 SHALL 较亮、底部 SHALL 有可见灰影

#### Scenario: 混合为零回退全局
- **WHEN** `typeLightingBlend` 取 0
- **THEN** 各云属着色 SHALL 收敛为同一组全局光照，画面与引入本能力前一致

#### Scenario: 每样本相函数
- **WHEN** 着色取样本的主导云属相函数前向/背向项
- **THEN** 双瓣 HG SHALL 按该云属逐样本计算，而非全图统一单一相函数

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

