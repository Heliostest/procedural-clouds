## ADDED Requirements

### Requirement: Bloom 后处理参数
顶层参数结构 SHALL 扩展 Bloom 后处理字段，至少包含 `bloomEnabled`（bool）、`bloomThreshold`（亮度阈值）、`bloomAmount`（叠加强度）。字段 MUST 经既有 `packParams` 或 post uniform 的单一事实来源写入，MUST NOT 出现裸下标赋值。默认值（Bloom 关闭或强度为 0）SHALL 复现引入前观感。

#### Scenario: 参数按名打包
- **WHEN** 帧循环准备 post uniform 或等价参数 buffer
- **THEN** `bloomEnabled`/`bloomThreshold`/`bloomAmount` SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** Bloom 参数取默认值（关闭或强度 0）
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: GUI 可调
- **WHEN** 用户通过 GUI 修改 Bloom 开关、阈值或强度
- **THEN** 后处理 SHALL 实时响应，无需重启
