## ADDED Requirements

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
