## ADDED Requirements

### Requirement: HDR Bloom 后处理
渲染管线 SHALL 提供 HDR 域 Bloom 后处理：对 TAA 输出（或等价场景纹理）按亮度阈值提取高亮，经双滤波或 Kawase 金字塔模糊后在 tonemap 之前叠加到场景色。算法 MUST NOT 使用屏幕空间径向采样（shadertoy 式）。Bloom SHALL 可运行时开关；关闭时 MUST 旁路全部 Bloom pass，画面与未启用时一致。

#### Scenario: 启用柔和光晕
- **WHEN** Bloom 已启用且 `bloomAmount` 大于 0
- **THEN** 太阳与受光云缘 SHALL 出现柔和扩散光晕

#### Scenario: 关闭旁路
- **WHEN** Bloom 未启用或 `bloomAmount` 为 0
- **THEN** 系统 SHALL 旁路 Bloom pass，画面与引入本能力前一致

#### Scenario: 无方向条纹
- **WHEN** Bloom 已启用
- **THEN** 光晕 SHALL 各向同性扩散，MUST NOT 出现明显方向性条纹或条带

#### Scenario: 主体不被糊化
- **WHEN** Bloom 以默认推荐参数启用
- **THEN** 云体主体轮廓 SHALL 保持清晰，光晕主要出现在高亮区域边缘

#### Scenario: tonemap 前叠加
- **WHEN** 后处理链执行 Bloom
- **THEN** Bloom 叠加 SHALL 发生在 tonemap 与 gamma 之前（HDR 域）
