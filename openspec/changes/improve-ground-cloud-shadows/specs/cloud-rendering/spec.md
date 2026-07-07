## ADDED Requirements

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

