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

### Requirement: 地面云影自适应积分
渲染管线 SHALL 提供可运行时选择的 Legacy 与 Adaptive 地面云影内联积分路径。Adaptive 路径 MUST 根据有效光路长度和当前密度质量尺度决定有上限的分段数，MUST 在每个分层区间内至多取一个抖动样本，并 MUST 在达到不透明阈值后提前结束。Legacy 与 Adaptive MUST 通过统一 `densityAt()` 获取密度，使 Cached、Hybrid、Realtime 与 edge-style 对成像、自阴影和地面云影保持一致。

#### Scenario: 长光路提高有效采样密度
- **WHEN** 地面点到云场出口的朝阳光路变长且未达到最大步数
- **THEN** Adaptive 路径 SHALL 增加分段数而不是继续使用固定 18 步

#### Scenario: 最大步数保护
- **WHEN** 低太阳角导致所需分段数超过 `groundShadowMaxSteps`
- **THEN** 积分器 SHALL 将实际采样数限制在该上限内，并保持有限输出和有效提前结束

#### Scenario: 稳定分层抖动
- **WHEN** `groundShadowJitter` 大于 0 且屏幕空间 TAA 关闭
- **THEN** 同一世界空间地面点的抖动序列 SHALL 在连续静态帧中保持稳定，不得产生逐帧闪烁

#### Scenario: 抖动关闭
- **WHEN** `groundShadowJitter` 为 0
- **THEN** Adaptive 路径 SHALL 在各分层区间使用确定性样本，不得改变分段覆盖或引入随机时间依赖

#### Scenario: Legacy 可回退
- **WHEN** `groundShadowMode` 为 legacy
- **THEN** 地面云影 SHALL 使用原固定 18 步积分，且透射率 compute 与过滤 pass MUST 被旁路

### Requirement: 地面云影透射率缓存
渲染管线 SHALL 提供与画布分辨率解耦的世界空间二维地面云影透射率缓存。缓存生成 MUST 调用地面云影自适应积分器并通过统一 `densityAt()` 取密度；主场景地面 SHALL 对有效缓存做过滤采样。系统 MUST 提供运行时旁路、无效历史保护、世界空间边界回退和有限时空过滤。

#### Scenario: 固定世界空间分辨率
- **WHEN** 画布分辨率变化而 `groundShadowMapResolution` 不变
- **THEN** 透射率 compute 的 texel 数 SHALL 保持不变，不得随画布像素数线性增长

#### Scenario: 统一积分语义
- **WHEN** `groundShadowMode` 从 adaptive 切换为 transmittance 且场景状态相同
- **THEN** 透射率纹理生成 SHALL 使用同一积分器、质量模式、edge-style 和 `shadowDarkness` 语义

#### Scenario: 历史硬失效
- **WHEN** 太阳、场景映射、质量模式、密度缓存 generation、edge generation、云体拓扑或场景时间发生不连续变化
- **THEN** 系统 MUST 在使用新缓存前将陈旧历史权重置为 0 或重建历史，不得混入不匹配状态

#### Scenario: 多云体平流更新
- **WHEN** 任一云体相对上一云影快照移动超过半个云影 texel，或多个云体使用不同平流速度
- **THEN** 系统 SHALL 刷新或降低历史权重，MUST NOT 假设单一全局 UV 平移能重投影全部云影

#### Scenario: 越界与无效回退
- **WHEN** 地面样本位于透射率纹理有效覆盖外、纹理尚未生成或功能被关闭
- **THEN** 地面着色 SHALL 回退到 Adaptive 内联积分；有效区边界 SHALL 使用连续守卫带混合，不得出现硬接缝

#### Scenario: 有限空间柔化
- **WHEN** `groundShadowFilterRadius` 大于 0
- **THEN** 系统 SHALL 以不超过配置上限的世界空间邻域柔化透射率，且 MUST 保持宏观阴影轮廓与 `shadowDarkness` 的光学厚度语义

#### Scenario: Transmittance 关闭旁路
- **WHEN** `groundShadowMode` 为 legacy 或 adaptive
- **THEN** 系统 MUST 旁路透射率 compute、历史合成与过滤 pass，并保持所选内联路径可用

### Requirement: 密度缓存附带主导云属索引
密度求值 SHALL 在对多云体求和密度时，记录贡献密度最大的云体的预设索引（主导云属），并随密度一起提供给着色：cached 模式 SHALL 把主导云属索引写入密度缓存的空闲通道；realtime 模式 SHALL 在每步求密度时一并产出该索引。密度 `r` 通道的数值 MUST NOT 因此改变，使 cached 模式密度保持像素级一致。统一取样分发入口 SHALL 同时返回密度与主导云属索引，供主 raymarch 着色按云属调制。

#### Scenario: 缓存写入主导索引
- **WHEN** 密度 compute pass 写入某体素
- **THEN** 该体素 SHALL 在密度之外附带贡献最大云体的预设索引，且密度 `r` 通道值与未引入索引前一致

#### Scenario: 取样返回云属索引
- **WHEN** 着色器经统一分发入口取密度
- **THEN** 入口 SHALL 同时返回该样本的主导云属索引

#### Scenario: realtime 模式产出索引
- **WHEN** 质量模式为 realtime
- **THEN** 每步直接求密度时 SHALL 一并确定主导云属索引，无需读缓存

