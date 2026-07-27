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

### Requirement: 密度缓存消费者与 Producer 隔离

Cached/Hybrid 主 raymarch、地面云影 compute 与所有 density debug 视图 SHALL 仅通过 `DensityCacheOutput` 的 sampled views、sampler、blend、resolution 和 revision 元数据消费密度缓存。它们 MUST NOT 访问 Producer 内部 texture、storage view、写入 index、compute pipeline、storage bind group 或调度状态。Realtime SHALL 保持现有直接调用密度求值并跳过 cache encode 的语义。

#### Scenario: 主渲染消费统一输出

- **WHEN** active Producer 提供 valid `DensityCacheOutput`
- **THEN** Cached/Hybrid 主 raymarch 与光照行进 SHALL 从该 output 建立的 bind group 取样，画面与 Legacy 直接绑定缓存时一致

#### Scenario: 地面云影消费统一输出

- **WHEN** ground-shadow compute 需要 Cached/Hybrid 密度
- **THEN** 它 SHALL 从同一 output 建立自己的兼容 bind group，并在 resource generation/content revision 变化时重建绑定或失效历史

#### Scenario: Debug 不旁路 Seam

- **WHEN** 用户切换任一现有 density debug view
- **THEN** debug SHALL 使用与正常 Cached/Hybrid 渲染相同的 sampled output，MUST NOT 为调试重新访问 Legacy Adapter 内部缓存

#### Scenario: Realtime 保持现有语义

- **WHEN** `qualityMode` 为 Realtime
- **THEN** 主渲染、光照行进与地面云影的现有直接密度语义 SHALL 保持，且 Producer MUST NOT 编码 cache pass

### Requirement: 密度质量模式专属 Pipeline Bundle

系统 SHALL 为 Cached、Hybrid 与 Realtime 建立相互独立的密度质量 `Pipeline Bundle`。每个 bundle SHALL 至少拥有与本模式 source closure 匹配的 cloud render pipeline、密度相关 ground-shadow compute pipeline、layout-compatible bindings 和生命周期状态。Common raymarch、light-march、ground shadow 与 density debug SHALL 只依赖同签名 `densityAtTyped()/densityAt()`；模式选择 MUST 由 active bundle 决定，而非在一个共享 shader module 中通过 uniform 分发完整密度调用图。

Cached source closure SHALL 只包含双缓存采样及必要 edge shaping；Hybrid SHALL 只增加现有有界微观细节入口，并 MUST NOT 在空缓存区域生成主体。Cached 与 Hybrid assembled source MUST NOT 静态包含 `cloudDensityTyped()`、`evalBody()`、十属 dispatcher 或完整 Legacy noise/evaluator graph。Realtime SHALL 在独立 source/module/pipeline 中保留当前直接密度求值。Post、Bloom、TAA、line、axis 和 ground-shadow resolve/filter MAY 继续共享。

#### Scenario: Cached closure 不携带完整 evaluator

- **WHEN** 组装或静态审计 Cached cloud/ground-shadow source
- **THEN** source SHALL 只通过 `DensityCacheOutput` 采样密度，MUST NOT 包含或引用完整 Legacy/Realtime evaluator graph

#### Scenario: Hybrid 只补有界细节

- **WHEN** active bundle 为 Hybrid 且缓存基底密度大于现有阈值
- **THEN** pipeline SHALL 使用现有 bounded detail 调制缓存基底；当缓存为空时 MUST 返回空密度，且 source MUST NOT 引入完整 body/genus evaluator

#### Scenario: Realtime 独立直接求值

- **WHEN** active bundle 为 Realtime
- **THEN** 主 raymarch、light-march、density debug 与密度相关 ground shadow SHALL 使用独立 Realtime module 的直接密度 evaluator，MUST NOT 消费 Cached/Hybrid density bind group

#### Scenario: 同一 active bundle 覆盖所有密度消费者

- **WHEN** active quality mode 发生切换
- **THEN** 主画面、自阴影、density debug 和 transmittance ground shadow SHALL 同时使用目标 bundle，不得让不同消费者停留在不同 quality source closure

### Requirement: 异步创建、惰性 Realtime 与原子回退

系统 SHALL 分离 requested 与 active quality mode，并为各 bundle 暴露 `idle`、`compiling`、`ready`、`failed`、`destroyed` 生命周期。Cached 与 Hybrid SHALL 通过异步 pipeline creation 在 renderer 启动阶段准备；Cached 为最低可用回退。Realtime 初始 SHALL 为 `idle`，只有首次请求 Realtime 后才可组装其完整 source 并创建 `GPUShaderModule`、pipeline 与模式 bindings。候选 bundle 只有在所有必需 pipeline/bindings ready 后才可原子成为 active；compiling 或 failed 时 MUST 保留健康的当前 Cached/Hybrid bundle。

#### Scenario: 默认 Hybrid 启动不创建 Realtime

- **WHEN** 应用使用默认 Hybrid 启动且用户从未请求 Realtime
- **THEN** Cached/Hybrid SHALL 可用，Realtime lifecycle SHALL 保持 `idle/not-requested`，且 MUST NOT 创建 Realtime GPU shader module、render pipeline 或 ground-shadow pipeline

#### Scenario: Realtime 首次请求期间保持健康画面

- **WHEN** requested=Realtime 且候选 bundle 仍在 `compiling`
- **THEN** active SHALL 保持先前健康 Cached/Hybrid，画面和密度消费者 SHALL 继续使用该 active bundle，HUD SHALL 不得把 Realtime 报为 active

#### Scenario: 候选创建失败安全回退

- **WHEN** Hybrid 或 Realtime shader/pipeline 创建或 binding 验证失败
- **THEN** 系统 SHALL 保留健康 Cached bundle或先前 active bundle，记录稳定 failure reason，MUST NOT 发布半初始化 pipeline 或悬空 binding

#### Scenario: Ready bundle 复用

- **WHEN** 用户再次切换到已 ready 的 quality mode
- **THEN** 系统 SHALL 复用缓存的 bundle 并原子切换，MUST NOT 重复编译相同 pipeline

#### Scenario: 销毁期间候选完成

- **WHEN** renderer 已销毁而异步候选创建随后完成
- **THEN** 系统 MUST 丢弃该候选并阻止其成为 active；重复销毁 SHALL 幂等

### Requirement: 密度 Pipeline 生命周期可审计

`RenderStats` 与运行时 HUD SHALL 同时提供 requested/active quality、各 bundle lifecycle、active bundle identity/generation、shader module creation CPU time、render/ground-shadow async pipeline creation latency 与 failure reason。CPU creation latency MUST NOT 写入 timestamp-query 的 cloud/cache/shadow GPU timing；未请求的 Realtime SHALL 显示 `idle/not-requested`，不得标记为失败。

#### Scenario: 请求值与运行值分开显示

- **WHEN** requested quality 尚未 ready 或已失败
- **THEN** stats/HUD SHALL 显示 requested、实际 active、lifecycle 与 reason，MUST NOT 只显示 `CloudParams.qualityMode`

#### Scenario: Timing 类型不混淆

- **WHEN** pipeline async creation 有 CPU elapsed time 而 timestamp query 不可用
- **THEN** creation latency SHALL 可见，但 cloud/cache/shadow GPU timing SHALL 保持 unavailable，MUST NOT 复用 CPU 数值

#### Scenario: 切换不增加渲染工作量

- **WHEN** Cached/Hybrid bundle 隔离完成且质量参数与 W1 相同
- **THEN** 系统 MUST NOT 因架构拆分增加 density texture 数、cloud render pass 数、ground-shadow pass 数或 raymarch/light-march 上限

### Requirement: Full-resolution Cloud-only Composite

当 `CloudFrameOutput` 可用时，渲染管线 SHALL 先积分云介质到 cloud-only 附件，再由 full-resolution composite 唯一执行 `cloudRadiance + T * background`。天空/地面解析背景 MUST NOT 写入 cloud temporal history 颜色；gizmo/axis/debug line SHALL 在 cloud temporal resolve 之后叠加。Bloom、tonemap 与既有 full-resolution TAA resolve 的相对顺序 MUST 保持可回退，且 MUST NOT 对 cloud-only radiance 与最终 LDR 输出重复 tonemap。

#### Scenario: History 不含天空地面

- **WHEN** cloud-frame 路径 active 且 TAA 启用
- **THEN** 进入 cloud temporal history 的颜色 SHALL 来自 cloud-only 积分结果，MUST NOT 烘焙天空、地面或 debug line

#### Scenario: Composite 唯一合成

- **WHEN** full-resolution composite 执行
- **THEN** 最终场景色 SHALL 按 `cloudRadiance + T * background` 合成一次，MUST NOT 在 cloud current 内提前完成等价合成后再次按 opacity 混合

### Requirement: Cloud-frame Feature-off 与 Emergency Fallback 路由

系统 SHALL 区分：(1) 显式 feature-off 的旧 combined 基线；(2) `CloudFrameOutput` full-res cloud-only + temporal resolve 的 W11 feature-off 真值路径；(3) MRT/capability 失败时的 legacy combined emergency fallback。Emergency fallback MUST 禁用依赖 `CloudFrameOutput` 的 W11/TAAU 输入，不得把 combined 输出伪装成 cloud-only attachment。

#### Scenario: Feature-off 基线

- **WHEN** 用户关闭 cloud-frame 功能
- **THEN** 系统 SHALL 使用 combined-feature-off 基线路径，并在诊断中报告该 active path

#### Scenario: Emergency 禁用 W11 输入

- **WHEN** 仅 emergency combined fallback 可用
- **THEN** 系统 MUST NOT 向 TAAU/W11 消费者提供伪装的 `CloudFrameOutput`

### Requirement: 世界尺度主 Raymarch 与保守 Skip

主云 raymarch SHALL 支持 world-step 模式：以米制 min/max step 与 max ray distance 驱动沿射线推进，`maxPrimaryIterations` 仅作安全上限。主循环顺序 SHALL 为：ray/AABB → 公开 Body Support 保守 hard reject → 可选 valid/complete candidate 保守 hard reject → step envelope →（可选）envelope 内 coarse hint → 推进/命中细化 → `densityAtTyped` → 既有 lighting/integration → transmittance 早停。global coarse 单点采样 MUST NOT 单独判空或放大超出已证明 envelope 的步长。W10B 全部关闭时 MUST 精确回到 W10A fixed-step + IGN/Halton full-resolution 基线。

#### Scenario: World-step 激活

- **WHEN** `worldStepEnabled` 且路径就绪
- **THEN** 诊断 SHALL 报告 `worldStepActive=true`，并提供平均/最大世界步长与 primary iterations 计数

#### Scenario: Support hard reject 保守

- **WHEN** 公开 Body Support 证明射线区间为空
- **THEN** 系统 MAY hard reject 该区间；false-negative（拒绝实心区间）MUST 为 0（由 fixture 约束）

#### Scenario: Feature-off 回退 fixed-step

- **WHEN** world-step 关闭
- **THEN** primary iterations SHALL 回到固定步数基线，平均世界步长诊断可为 0

### Requirement: Raymarch 子功能独立开关

world-step、Support skip、candidate skip、coarse hint 与 STBN SHALL 可独立开关。关闭单项 MUST 回到其下层基线；candidate invalid、global-only、Legacy 或 W9 hierarchical inactive 时 MUST NOT 触碰无效 candidate buffer。

#### Scenario: 单独关闭 Support skip

- **WHEN** world-step 启用但 Support skipping 关闭
- **THEN** 系统 SHALL 保持 world-step，且诊断报告 `worldStepSupportSkipping=false`

#### Scenario: Candidate 不可用时不读取

- **WHEN** active storage 为 global-only 或 candidate invalid
- **THEN** 系统 MUST NOT 依赖 candidate buffer 做 hard reject

