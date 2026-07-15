## MODIFIED Requirements

### Requirement: Recipe V2 Compute 成本与依赖受限

W8 V2 cache update SHALL 继续只 dispatch 现有三维缓存网格；每个有效体素 MUST 保留全局 invocation bounds check 与恰好一次最终 RGBA16F storage write。V2 source MAY 读取 Frame/Body/Recipe Support、只读 tile-body mask 与 group 2 shared fields，并 SHALL 以固定 `i<activeBodyCount<=12` 循环只访问 candidate bit。recipe-enabled、topology family、analytic footprint 与 vertical support early reject MUST 位于 shared sample 前。

W8 source SHALL 只包含 Common Context、参数化 Stratiform family、Cumulus Billow、参数化 Cellular family、静态八属 dispatch、Legacy-compatible soft overlap/top-two metadata 与 final writer。四个 Stratiform genus sample 上限 SHALL 为 2；Cumulus SHALL 保持 4；三个 Cellular genus SHALL 为 3。Cumulonimbus/Cirrus、空 tile 与 rejected Body texture samples SHALL 为零。V2 source MUST NOT 包含 Legacy evaluator/4D Voronoi/fBm、Fiber/Convective evaluator、运行时 Worley 邻域、dynamic operator/sample loop、atomics、workgroup storage、occupied-tile compaction、indirect dispatch 或额外正常帧 compute/render pass。

Shared atlas/macro generation SHALL 继续只在首次 candidate warmup或自身 config/seed 失效时编码；普通 W8 cache update、Body movement、wind、mask revision、resolution 或 workgroup 变化 MUST NOT 重建 shared fields。默认 Legacy 且 V2 未请求时，全部 V2 module/pipeline/mask/shared-field/evaluator resources、CPU builders、GPU memory 和 pass count MUST 为零。

#### Scenario: Mask 不跳过最终写入

- **WHEN** W8 tile mask 对某 workgroup tile 为零
- **THEN** invocation SHALL 跳过 body/evaluator/sample 区域，但每个 bounds 内体素仍 MUST 写一次零值，MUST NOT 因 ping-pong 目标复用而保留陈旧密度

#### Scenario: 八属 Compute 静态成本

- **WHEN** 静态审计 W8 V2 cache compute 可达调用图
- **THEN** source SHALL 恰好包含 Stratiform/Cumulus/Cellular 三个 evaluator family；各 family sample-call 上限 SHALL 分别为 2/4/3，所有循环 SHALL 具有编译期上限，其他 family/Legacy/4D/interpreter/atomic source SHALL 为零

#### Scenario: Shared Generator 不进入稳态

- **WHEN** shared-field config/seed 未改变且 V2 candidate 已完成首次 warmup
- **THEN** 普通 cache update SHALL 只编码一个 V2 cache compute pass，不编码 atlas/macro generator；正常 cloud render 与 ground-shadow pass 数 SHALL 与 W7 相同

#### Scenario: 默认路径零开销

- **WHEN** active/requested Producer 均为 Legacy
- **THEN** renderer SHALL 不创建或编码任何 V2 GPU resource/pass，也不得运行 V2 mask/shared builder或 family evaluator准备，现有 density texture、cloud pass 与 ground-shadow pass 数 MUST 不变

#### Scenario: 不提前实现后续 Wave

- **WHEN** W8 完成
- **THEN** Cumulonimbus/Cirrus Recipe SHALL 继续 disabled，Fiber/Convective/variant schema/Hybrid evaluator必须由后续独立 change 批准

### Requirement: Recipe V2 独立密度 Producer

`RecipeDensityV2Adapter` SHALL 实现完整 `DensityCacheProducer` contract，并拥有独立于 Legacy 的 V2 WGSL module、explicit pipeline/bind-group layouts、Frame/Body/Recipe buffers、双 `rgba16float` 3D textures、sampled/storage views、sampler、ping-pong 状态、bindings、revisions、stats 与幂等生命周期。其 output SHALL 保持 R=密度、G=主属、B=次属、A=次属混合权重和现有 `cacheBlend` 语义。W8 compute SHALL 只为 enabled Cumulus、四个 Stratiform 与三个 Cellular Recipe 生成非零密度；无云、unsupported-only 或所有 contribution 为零时 SHALL 确定性写 `vec4f(0.0)`。一次成功 encode 后 output SHALL 标为 valid，无论内容为非零或全零。

#### Scenario: 无云输入写出有效零缓存

- **WHEN** V2 对无云 frame prepare 并 encode
- **THEN** cache pass SHALL 成功、validSampleCount/contentRevision SHALL 更新、RGBA output SHALL 全部为有限零值，正常渲染 SHALL 保留天空/地面且没有云

#### Scenario: W8 八属输入生成非零缓存

- **WHEN** V2 输入合法 Cumulus、Stratiform 或 Cellular Body、对应 Recipe enabled 且 voxel 通过 Support/profile/topology
- **THEN** cache SHALL 写有限非负 R 和兼容 genus metadata；Cached、Hybrid、density debug 与 transmittance ground shadow SHALL 通过现有 sampled output 显示该密度

#### Scenario: 未迁移属保持有效零语义

- **WHEN** V2 输入一个或多个有效 Body 但其 genus 均属于 Cumulonimbus/Cirrus
- **THEN** Adapter SHALL pack 有界 Body/Recipe records，compute SHALL 在 disabled dispatch 前返回零且不采样 shared fields，RGBA output SHALL 为有限零值并明确报告 unsupported Recipe

#### Scenario: 缓存消费者协议兼容

- **WHEN** active Producer 从 Legacy 切换为 W8 V2
- **THEN** Cached、Hybrid、density debug 与 transmittance ground shadow SHALL 只通过现有 `DensityCacheOutput` sampled contract 消费 V2，不得要求新的 renderer cache format或私有 V2 binding

#### Scenario: Resize 与 workgroup 重建

- **WHEN** V2 active/candidate 状态下改变 density resolution 或合法 workgroup
- **THEN** Adapter SHALL 重建自身相关 resources/pipeline、递增局部 resourceGeneration、使旧 output invalid，并在重新成功编码前阻止旧 view 成为 active；shared fields SHALL 按自身 signature cadence 复用而不是随 cache resize 重建

#### Scenario: 销毁与 device loss

- **WHEN** V2 Adapter 重复销毁或设备丢失
- **THEN** 其 GPU resources SHALL 至多释放一次，pending candidate MUST NOT 被提升，后续 prepare/encode/getOutput SHALL 有限拒绝或返回 invalid 状态

## ADDED Requirements

### Requirement: W8 Cellular / Wave 诊断与固定 Manifests

Stats/HUD SHALL 报告 W8 enabled genera、unsupported genera、Sc/Ac/Cc 静态 sample limits、wave/ripple/lens/roll strengths、unsupported Body count、tile candidate/voxel-body upper bound、`actualEvaluatorCalls=unavailable`、cache sample ID、timestamp availability、shared generator状态、pipeline/source size 与资源字节。理论 upper bound MUST NOT 被表述为实际调用数或实测加速。

系统 SHALL 提供 Sc/Ac/Cc single、cellular-scale、cellular-overlap 与 wave-ripple 固定 Legacy/V2 cases，保持 camera、scene time、Body、wind、resolution、workgroup、quality 与 render params 一致。Cached normal SHALL 是 cache timing 主样本；Hybrid 与 raw density-debug SHALL 是视觉/协议证据，不得混入 cache Gate median。

#### Scenario: A/B Producer 对齐

- **WHEN** 运行任一 W8 Legacy/V2 配对 case
- **THEN** harness SHALL 等待 requested/active Producer 与 case 一致并排除 pipeline/shared warmup，producer 失败 SHALL 使 case invalid 而不是静默采集 fallback

#### Scenario: Timestamp 样本分类

- **WHEN** cacheSampleId 产生新有效 timestamp
- **THEN** harness SHALL 采集对应 cacheMs；timestamp 不可用、样本不足或项目所有者豁免 SHALL 分别记录 unresolved/owner-waived，MUST NOT 写为 pass

#### Scenario: Cellular 资源预算

- **WHEN** 比较 W7 与 W8 steady normal frame
- **THEN** W8 SHALL 不增加 persistent texture/buffer class、bind group index或正常 frame pass，source/Recipe record增长 SHALL 单独报告

#### Scenario: 历史证据不升级

- **WHEN** W8 report引用 W7 归档中的未采集手工矩阵或 timestamp 项
- **THEN** 它们 SHALL 保持原始 unresolved/not-collected/owner-waived 分类，MUST NOT 因 W8 创建或通过而被改写为 pass
