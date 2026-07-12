## RENAMED Requirements

- FROM: `### Requirement: Recipe V2 独立空密度 Producer`
- TO: `### Requirement: Recipe V2 独立密度 Producer`

## MODIFIED Requirements

### Requirement: Recipe V2 独立密度 Producer

`RecipeDensityV2Adapter` SHALL 实现完整 `DensityCacheProducer` contract，并拥有独立于 Legacy 的 V2 WGSL module、explicit pipeline/bind-group layouts、Frame/Body/Recipe buffers、双 `rgba16float` 3D textures、sampled/storage views、sampler、ping-pong 状态、bindings、revisions、stats 与幂等生命周期。其 output SHALL 保持 R=密度、G=主属、B=次属、A=次属混合权重和现有 `cacheBlend` 语义。W6 compute SHALL 只为 enabled Stratus/Cumulus Recipe 生成非零密度；无云、unsupported-only 或所有 contribution 为零时 SHALL 确定性写 `vec4f(0.0)`。一次成功 encode 后 output SHALL 标为 valid，无论内容为非零或全零。

#### Scenario: 无云输入写出有效零缓存

- **WHEN** V2 对无云 frame prepare 并 encode
- **THEN** cache pass SHALL 成功、validSampleCount/contentRevision SHALL 更新、RGBA output SHALL 全部为有限零值，正常渲染 SHALL 保留天空/地面且没有云

#### Scenario: W6 双属输入生成非零缓存

- **WHEN** V2 输入合法 Stratus 或 Cumulus Body、对应 Recipe enabled 且 voxel 通过 Support/profile/topology
- **THEN** cache SHALL 写有限非负 R 和兼容 genus metadata；Cached、Hybrid、density debug 与 transmittance ground shadow SHALL 通过现有 sampled output 显示该密度

#### Scenario: 未迁移属保持有效零语义

- **WHEN** V2 输入一个或多个有效 Body 但其 genus 均不属于 Stratus/Cumulus
- **THEN** Adapter SHALL pack 有界 Body/Recipe records，compute SHALL 在 disabled dispatch 前返回零且不采样 shared fields，RGBA output SHALL 为有限零值并明确报告 unsupported Recipe

#### Scenario: 缓存消费者协议兼容

- **WHEN** active Producer 从 Legacy 切换为 W6 V2
- **THEN** Cached、Hybrid、density debug 与 transmittance ground shadow SHALL 只通过现有 `DensityCacheOutput` sampled contract消费 V2，不得要求新的 renderer cache format或私有 V2 binding

#### Scenario: Resize 与 workgroup 重建

- **WHEN** V2 active/candidate 状态下改变 density resolution 或合法 workgroup
- **THEN** Adapter SHALL 重建自身相关 resources/pipeline、递增局部 resourceGeneration、使旧 output invalid，并在重新成功编码前阻止旧 view 成为 active；shared fields SHALL 按自身 signature cadence 复用而不是随 cache resize 重建

#### Scenario: 销毁与 device loss

- **WHEN** V2 Adapter 重复销毁或设备丢失
- **THEN** 其 GPU resources SHALL 至多释放一次，pending candidate MUST NOT 被提升，后续 prepare/encode/getOutput SHALL 有限拒绝或返回 invalid 状态

### Requirement: Recipe V2 Compute 成本与依赖受限

W6 V2 cache update SHALL 继续只 dispatch 现有三维缓存网格；每个有效体素 MUST 保留全局 invocation bounds check 与恰好一次最终 RGBA16F storage write。V2 source MAY 读取 W4 Frame/Body/Recipe Support、只读 tile-body mask 与 W5 group 2 shared fields，并 SHALL 以固定 `i<activeBodyCount<=12` 循环只访问 candidate bit。recipe-enabled、genus、analytic footprint 与 vertical profile early reject MUST 位于 shared sample 前。

W6 source SHALL 只包含 Common Context、Stratus、Cumulus、静态双属 dispatch、Legacy-compatible soft overlap/top-two metadata 与 final writer。Stratus 每次通过早退的 Body evaluation SHALL 至多执行 Macro=1、Base=1；Cumulus SHALL 至多执行 Macro=1、Base=2、Detail=1 与一次无额外 sample 的 low warp。其他八属、空 tile 与 rejected Body texture samples SHALL 为零。V2 source MUST NOT 包含 Legacy evaluator/4D Voronoi/fBm、其他 genus evaluator、dynamic operator/sample loop、atomics、workgroup storage、occupied-tile compaction、indirect dispatch 或额外正常帧 compute/render pass。

W5 shared atlas/macro generation SHALL 继续只在首次 candidate warmup或自身 config/seed 失效时编码；普通 W6 cache update、Body movement、wind、mask revision、resolution 或 workgroup 变化 MUST NOT 重建 shared fields。默认 Legacy 且 V2 未请求时，全部 V2 module/pipeline/mask/shared-field/evaluator resources、CPU builders、GPU memory 和 pass count MUST 为零。

#### Scenario: Mask 不跳过最终写入

- **WHEN** W6 tile mask 对某 workgroup tile 为零
- **THEN** invocation SHALL 跳过 body/evaluator/sample 区域，但每个 bounds 内体素仍 MUST 写一次零值，MUST NOT 因 ping-pong 目标复用而保留陈旧密度

#### Scenario: 双属 Compute 静态成本

- **WHEN** 静态审计 W6 V2 cache compute 可达调用图
- **THEN** source SHALL 恰好包含两个 genus evaluator；Stratus/Cumulus sample-call 上限 SHALL 分别为 2/4，所有循环 SHALL 具有编译期 12-body 上限，其他 genus/Legacy/4D/interpreter/atomic source SHALL 为零

#### Scenario: Shared Generator 不进入稳态

- **WHEN** shared-field config/seed 未改变且 V2 candidate 已完成首次 warmup
- **THEN** 普通 cache update SHALL 只编码一个 V2 cache compute pass，不编码 atlas/macro generator；正常 cloud render 与 ground-shadow pass 数 SHALL 与 W5 相同

#### Scenario: 默认路径零开销

- **WHEN** active/requested Producer 均为 Legacy
- **THEN** renderer SHALL 不创建或编码任何 V2 GPU resource/pass，也不得运行 V2 mask/shared builder或双属 evaluator准备，现有 density texture、cloud pass 与 ground-shadow pass 数 MUST 不变

#### Scenario: 不提前实现后续 Wave

- **WHEN** W6 完成
- **THEN** Altostratus/Cirrostratus/Nimbostratus/Stratocumulus/Altocumulus/Cirrocumulus/Cirrus/Cumulonimbus Recipe SHALL 继续 disabled，W7+ family/variant/Hybrid evaluator 必须由后续独立 change 和 W6 Continue Gate批准

### Requirement: Tile Mask 有界退化与可审计统计

W6 SHALL 继续将 mask 基础预算限制为最多 262,144 tiles、1 MiB payload 和 3,145,728 次 CPU tile-body tests，并同时检查 WebGPU `maxStorageBufferBindingSize` 与 `maxBufferSize`。任一限制不满足时，Adapter SHALL 使用最小合法 dummy buffer 并退化为 dense active-prefix，不得分配目标巨型 mask、拒绝合法 Producer 或改变双属 evaluator 数值语义。

Stats/HUD SHALL 报告 mask enabled/fallback reason、grid/tile/mask bytes、empty/occupied tiles、candidate sum/average/max、dense/masked tile-body pairs、考虑 edge tile 后的 dense/masked voxel-body upper bound、culled ratio、mask generation/revision 与 rebuild CPU timing/count/reason。W6 SHALL 额外报告 enabled evaluator genera、Stratus/Cumulus 静态 sample limits、unsupported Body count 与 cache timestamp。原 W4 `evaluatorCalls=0` 字段 MUST 被替换为明确的 `actualEvaluatorCalls=unavailable`（或等价 nullable contract）和 `evaluatorCallUpperBound`；无 GPU counter 时 MUST NOT 把 candidate/voxel-body upper bound 表述为实际 evaluator 调用数。

#### Scenario: 极端小 Workgroup 安全退化

- **WHEN** `256³` resolution 配合 `1×1×1` workgroup 导致 tile count 或 buffer/CPU tests 超预算
- **THEN** mask SHALL 标记为 `disabled-budget` 或具体 device-limit reason，Adapter SHALL 继续产生与 dense active-prefix 一致的有效双属 output，MUST NOT 尝试分配 16,777,216-entry mask

#### Scenario: 普通无更新帧不重建

- **WHEN** 本帧 V2 cache plan 不编码，或 resolution/workgroup/volume/active Body Support signature 均未改变
- **THEN** CPU mask builder MUST NOT 重新遍历全部 tile-body pairs，mask revision 与 rebuild count SHALL 保持不变

#### Scenario: Upper Bound 不冒充实际调用

- **WHEN** W6 报告 masked voxel-body upper bound 或静态 sample upper bound
- **THEN** HUD/Gate report SHALL 将 actual evaluator calls 标为 unavailable并使用真实 cache timestamp 评估性能，MUST NOT 以理论上限声称实际调用数或 GPU 加速

#### Scenario: 双属 Gate 统计可区分

- **WHEN** 运行固定 Stratus/Cumulus A/B manifest
- **THEN** stats SHALL 能区分 active Producer、enabled evaluator genus、cache sample ID、W5 generator sample、pipeline create与 steady cache timing，MUST NOT 把一次性预计算混入 cache median/p90
