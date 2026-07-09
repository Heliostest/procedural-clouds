## ADDED Requirements

### Requirement: 预设编辑器展示艺术向文案
预设编辑器在选中某一云属时 SHALL 展示该云属的艺术向说明文案（随界面语言切换中/英）。该文案 MUST 来自项目内十属艺术向单一事实来源，MUST NOT 写入 GPU uniform，也 MUST NOT 改变密度或光照计算结果。

#### Scenario: 切换云属更新文案
- **WHEN** 用户在预设编辑器中选中另一云属
- **THEN** 展示的艺术向文案 SHALL 切换为该云属条目

#### Scenario: 语言切换
- **WHEN** 界面语言在中/英之间切换
- **THEN** 艺术向文案 SHALL 使用对应语言文本

#### Scenario: 不影响渲染
- **WHEN** 仅存在或展示艺术向文案
- **THEN** 渲染结果 SHALL 与无该文案时一致
