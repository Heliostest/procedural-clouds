# cloud-rendering Specification

## Purpose
TBD - created by archiving change realtime-density-quality. Update Purpose after archive.
## Requirements
### Requirement: 密度取样质量模式
渲染管线 SHALL 提供可运行时切换的密度取样质量模式，至少包含：cached（读低分辨率 3D 缓存 + 时间混合）、hybrid（缓存基底叠加实时高频细节）、realtime（每步直接调用 `cloudDensity()`、完全跳过缓存）。片元主 raymarch 与光照行进 MUST 经单一取样分发入口取得密度，使三种模式行为一致地作用于成像与阴影。

#### Scenario: cached 模式复现现状
- **WHEN** 质量模式为 cached（默认）
- **THEN** 密度取样 SHALL 等价于引入本特性前的缓存采样，画面与之像素级一致

#### Scenario: realtime 模式跳过缓存
- **WHEN** 质量模式为 realtime
- **THEN** raymarch 每步 SHALL 直接调用 `cloudDensity()` 求密度，清晰度上限 SHALL 取决于行进步数而非缓存分辨率，且密度缓存 compute pass SHALL 被跳过

#### Scenario: hybrid 模式补高频细节
- **WHEN** 质量模式为 hybrid 且细节强度大于 0
- **THEN** 在缓存基底存在（密度高于阈值）处 SHALL 按细节频率/强度叠加高频扰动，使边缘较 cached 更锐，且 MUST NOT 在空区凭空生成密度

#### Scenario: 取样入口统一
- **WHEN** 着色器在主 raymarch 或光照行进中取密度
- **THEN** 二者 SHALL 经同一分发入口取值，质量模式切换 SHALL 同时影响成像与自阴影

