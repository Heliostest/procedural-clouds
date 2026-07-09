## ADDED Requirements

### Requirement: 十属艺术向文案
系统 SHALL 为每个 `CLOUD_TYPES` 键提供艺术向文案（至少中英），描述该云属的视觉特征与调参/验收关注点。文案来源 SHALL 对齐 `procedural-clouds-threejs/cloud-types.md` 各属 `artistic` 段，并在项目文档中注明出处。文案属于参考元数据，MUST NOT 作为 GPU 密度或光照输入。

#### Scenario: 十属均有文案
- **WHEN** 遍历任一 `CLOUD_TYPES` 键
- **THEN** SHALL 返回非空的中英文艺术向文案

#### Scenario: 与 placement profile 并存
- **WHEN** 读取某云属的 genus profile 与艺术向文案
- **THEN** 二者 SHALL 可独立获取，互不覆盖 placement 数值契约
