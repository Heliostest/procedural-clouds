# density-cache-production Specification

## Purpose
定义 Cached/Hybrid 密度缓存生产的稳定接口、只读输出边界、Legacy 兼容行为、Producer 选择与安全回退，以及生命周期和可审计统计；Realtime 保持直接密度求值路径。
## Requirements
### Requirement: 最小 DensityCacheProducer 帧契约

系统 SHALL 定义独立的密度缓存 Producer contract，至少包含 producer kind、只读 frame input、`prepareFrame`、`encode`、`getOutput`、resolution/workgroup 更新、stats、device-loss 处理和幂等销毁。`prepareFrame` SHALL 决定本帧是否编码缓存并返回 `cacheBlend`/content-change plan；renderer MUST 在其后写入现有 uniform；`encode` MUST 只向调用方提供的 `GPUCommandEncoder` 追加 pass，不得自行提交队列；consumer MUST 在编码准备完成后通过 `getOutput` 取得缓存输出。

#### Scenario: 单帧按顺序编码

- **WHEN** Cached 或 Hybrid 帧需要刷新密度缓存
- **THEN** 系统 SHALL 按 `prepareFrame → uniform pack → encode → getOutput → consumers` 执行，且 cache pass SHALL 在同一 command encoder 中先于 ground shadow 与 cloud render

#### Scenario: Realtime 跳过缓存生产

- **WHEN** `qualityMode` 为 Realtime
- **THEN** Producer plan SHALL 标记不编码 cache pass，现有直接密度求值路径 SHALL 继续工作

#### Scenario: 非法调用顺序有限失败

- **WHEN** 调用方在未 prepare、同帧重复 encode、或 Producer 已 failed/destroyed 时请求编码
- **THEN** Producer MUST 拒绝该操作并提供可诊断状态，MUST NOT 编码使用陈旧或已销毁资源的 pass

### Requirement: 稳定且只读的 DensityCacheOutput

Producer SHALL 输出双 `rgba16float` 3D sampled view、采样器、三维 resolution、`cacheBlend`、`resourceGeneration`、`contentRevision`、valid sample count 与 valid 状态。通道语义 MUST 保持 R=密度、G=主云属索引、B=次云属索引、A=次云属混合权重。输出 MUST NOT 暴露 writable texture、storage view、compute pipeline 或 Producer 私有 bind group。

#### Scenario: Consumer 重建采样绑定

- **WHEN** `resourceGeneration` 因 resolution、Producer 身份或输出资源变化而递增
- **THEN** cloud render 与 ground shadow SHALL 用新的 sampled views/sampler 重建各自 bind group，MUST NOT 继续引用旧 generation

#### Scenario: 缓存内容刷新

- **WHEN** Producer 编码一次新的 cache compute pass
- **THEN** `contentRevision` SHALL 递增并使依赖密度内容的地面云影历史失效或刷新，但 `resourceGeneration` MUST NOT 仅因普通内容刷新而递增

#### Scenario: 通道与混合保持

- **WHEN** Legacy Adapter 在相同输入下写出并采样缓存
- **THEN** 两张 view 的顺序、`cacheBlend` 和 RGBA 数值语义 SHALL 与 W1 前一致

### Requirement: LegacyDensityAdapter 行为与所有权

`LegacyDensityAdapter` SHALL 成为 W1 唯一可用的缓存生产实现，并拥有 density textures、写入 index、valid count、transition/blend、wind snapshot、update-rate/voxel-motion 调度、storage binding、cache dispatch、resolution/workgroup 重建与自身 GPU 资源销毁。它 MUST 复用当前 Legacy 密度 compute 行为，不得修改 `cloudDensityTyped()`、缓存格式、默认配置、dispatch 规模或缓存更新条件。

#### Scenario: Update-rate 触发保持

- **WHEN** 帧号达到 `cacheUpdateRate` 周期且 quality mode 非 Realtime
- **THEN** Legacy Adapter SHALL 翻转写入缓存、编码一次 cache pass 并更新 transition 状态，与 W1 前时机一致

#### Scenario: 风移动触发保持

- **WHEN** 任一云体自上次缓存快照的水平位移超过当前 density voxel 尺度
- **THEN** Legacy Adapter SHALL 即使未到周期帧也刷新缓存，并在刷新后更新 wind snapshot

#### Scenario: 普通帧不伪造更新

- **WHEN** 本帧既未达到 update-rate，也无 wind threshold、resize 或强制失效
- **THEN** Adapter MUST NOT 编码 cache pass、翻转写入 index或递增 content revision

#### Scenario: Workgroup 与 resolution 变化

- **WHEN** cache workgroup 或 resolution 请求变化
- **THEN** Adapter SHALL 按当前约束重建所需生产资源、使旧 output generation 失效，并保持默认值与 W1 前一致

### Requirement: Producer 选择与安全回退

系统 SHALL 提供 requested/active Producer 分离的 selector，并以 Legacy 作为默认、创建失败和候选预热失败时的安全回退。Recipe V2 SHALL 由 async lazy factory 创建：默认 Legacy 启动且从未请求 V2 时，V2 lifecycle SHALL 保持 `idle`，MUST NOT 创建 shader、pipeline、buffer、texture、bind group 或 dispatch。首次请求 V2 后 requested SHALL 立即可见，而 active SHALL 在候选 `creating/warming` 期间保持当前健康 Legacy。候选只有在 pipeline/resources 创建完成、使用当前 frame input 成功编码一次输出、`DensityCacheOutput` 合同有效后才可原子成为 active；失败 MUST 保留 Legacy 并记录稳定原因。

Selector SHALL 为 active Producer 身份维护单调递增的 `activeGeneration` 或等价 identity epoch。Consumer binding/history key MUST 同时包含 active Producer identity 与该 Producer 的局部 `resourceGeneration`；Legacy 与 V2 的局部 generation 数值相同不得导致旧 sampled views 被复用。切回长期 inactive 的 Producer 前 SHALL 使用当前 frame input 强制刷新目标 output。

#### Scenario: 默认 Legacy 不创建 V2 资源

- **WHEN** 应用以默认参数启动且用户从未请求 Recipe V2
- **THEN** requested/active SHALL 均为 Legacy，V2 SHALL 保持 idle 且 GPU object/pass 数为零，现有 Cached/Hybrid 画面和缓存调度 SHALL 不变

#### Scenario: 首次请求期间继续使用 Legacy

- **WHEN** requested=Recipe V2 且候选仍在 async creating 或尚未编码当前场景 output
- **THEN** active SHALL 保持健康 Legacy，Legacy cache/画面 SHALL 继续工作，HUD MUST NOT 把候选误报为 active

#### Scenario: 零缓存预热后原子切换

- **WHEN** V2 候选成功为当前 frame input 编码兼容零缓存且 output contract valid
- **THEN** selector SHALL 递增 activeGeneration 并原子切换 active=Recipe V2，Cached/Hybrid consumers SHALL 在同一 pass 顺序中读取新 output

#### Scenario: 失败切换不发布半成品

- **WHEN** V2 module/pipeline/binding 创建、record validation、prepare 或候选 encode 在发布前失败
- **THEN** selector MUST NOT 发布候选 output或销毁健康 Legacy，MUST 保持/回退 Legacy 并记录结构化 failure reason

#### Scenario: Producer generation 不碰撞

- **WHEN** Legacy 与 V2 的局部 `resourceGeneration` 恰好相同但 active Producer 发生变化
- **THEN** activeGeneration SHALL 改变，cloud render、ground shadow 和 debug sampled bindings MUST 重建，依赖密度的 history MUST 失效

#### Scenario: 切回目标先刷新

- **WHEN** 用户从 V2 切回长期未 active 的 Legacy 或再次切到已有 V2
- **THEN** 目标 Producer SHALL 先用当前 frame input 强制刷新或证明 output 当前有效，再成为 active，MUST NOT 显示陈旧场景缓存

#### Scenario: Realtime 不生产无人消费的 V2 缓存

- **WHEN** requested Producer 为 Recipe V2 而 active quality 为 Realtime
- **THEN** requested 状态 SHALL 可见，但 selector MUST NOT 为当前无人消费的 cache 编码 V2 pass；候选可保持 idle，直到 active quality 回到 Cached/Hybrid

#### Scenario: 非活动 Producer 接收最新资源配置

- **WHEN** 用户改变 density resolution 或 workgroup 后再请求另一个 Producer
- **THEN** selector SHALL 在 promotion 前把最新配置同步给目标 Producer，MUST NOT 因 inactive Adapter 保留旧尺寸而发布不匹配 output

### Requirement: Producer 生命周期与可审计统计

Producer SHALL 暴露 requested/active kind、availability、fallback reason、cache-ran、content revision、resource generation、resolution/workgroup、active body count、create/rebuild CPU timing，以及可用时的 cache GPU timing。CPU timing MUST NOT 填入 GPU timing。`destroy()` MUST 幂等；device loss 或销毁后 Producer MUST 标记 output invalid 并停止编码。

#### Scenario: 重复销毁安全

- **WHEN** Producer 被调用 `destroy()` 一次或多次
- **THEN** 其创建的 GPU 资源 SHALL 至多释放一次，后续调用 MUST NOT 抛出资源重复销毁错误或返回 valid output

#### Scenario: Device loss

- **WHEN** WebGPU device 进入 lost 状态
- **THEN** Producer SHALL 停止编码、将 output/availability 标为 invalid 并记录 loss reason；完整 device 重建 MAY 留给后续 change

#### Scenario: Timing 类型不混淆

- **WHEN** timestamp query 不可用但存在 CPU create/rebuild timing
- **THEN** GPU cache timing SHALL 标为 unavailable，MUST NOT 使用 CPU 数值替代

### Requirement: Legacy cache compute Shader 与渲染 Pipeline 隔离

`LegacyDensityAdapter` SHALL 使用独立的 cache compute source closure、`GPUShaderModule` 与 compute pipeline。该 closure MAY 复用当前 Legacy density evaluator、noise 与 genus source 以保持缓存数值，但 MUST NOT 包含 cloud render、density debug、ground-shadow 或 Cached/Hybrid/Realtime quality adapter entry，也 MUST NOT 复用任一 cloud render bundle 的 `GPUShaderModule`。未来 Recipe V2 compute source manifest MUST NOT 引用 Legacy evaluator closure。

#### Scenario: Legacy cache module 只负责编码缓存

- **WHEN** 创建 Legacy Producer 的 compute module
- **THEN** assembled source SHALL 只包含缓存写入所需 ABI、Legacy evaluator 和 cache writer entry，MUST NOT 携带 cloud render 或 ground-shadow entry

#### Scenario: 缓存数值与调度保持

- **WHEN** 独立 Legacy compute pipeline 在相同 frame input、resolution 和 workgroup 下编码
- **THEN** 双缓存 RGBA 值、dispatch 数、update-rate、wind threshold、ping-pong、`cacheBlend`、content revision 与 pass 顺序 SHALL 与 W1 基线一致

#### Scenario: V2 不继承 Legacy 调用图

- **WHEN** W3 或后续 change 建立 Recipe V2 compute source
- **THEN** 其 source manifest MUST NOT 引用 W2 标记的 Legacy evaluator/noise/genus closure；若需要共享 ABI SHALL 只引用无密度数学的 shared 片段

### Requirement: Producer 调度跟随 Active Quality Mode

Pipeline manager SHALL 在 `DensityCacheProducer.prepareFrame()` 前解析 active quality mode。传给 Producer 的 frame quality 与写入 GPU 的 effective `qualityMode` SHALL 表示 actual active bundle，而不是尚在 compiling/failed 的 requested bundle。Active 为 Cached 或 Hybrid 时 Producer SHALL 保持现有 cache scheduling；只有 active 为 Realtime 时才可跳过 cache encode。

#### Scenario: Realtime 编译期间缓存继续更新

- **WHEN** requested=Realtime、candidate=`compiling` 且 active 仍为 Cached/Hybrid
- **THEN** Legacy Producer SHALL 按 active mode 继续 update-rate/wind-trigger cache encode，画面 MUST NOT 因请求值提前停止缓存而使用陈旧 output

#### Scenario: Realtime Ready 后跳过缓存

- **WHEN** Realtime bundle 已完全 ready 并原子成为 active
- **THEN** Producer frame plan SHALL 从该帧开始跳过 cache encode，Realtime render/ground shadow SHALL 直接求密度

#### Scenario: 回退后恢复缓存语义

- **WHEN** Realtime 创建失败或用户切回 Cached/Hybrid
- **THEN** active quality SHALL 保持或恢复 Cached/Hybrid，Producer SHALL 继续使用原 update-rate、wind threshold 和 cache blend 语义，无需重建 Producer 身份

### Requirement: Recipe V2 独立空密度 Producer

`RecipeDensityV2Adapter` SHALL 实现完整 `DensityCacheProducer` contract，并拥有独立于 Legacy 的 V2 WGSL module、explicit pipeline/bind-group layouts、Frame/Body/Recipe buffers、双 `rgba16float` 3D textures、sampled/storage views、sampler、ping-pong 状态、bindings、revisions、stats 与幂等生命周期。其 output SHALL 保持 R=密度、G=主属、B=次属、A=次属混合权重和现有 `cacheBlend` 语义。W3 compute 对每个有效体素 SHALL 只写 `vec4f(0.0)`；零密度 output 在一次成功 encode 后 SHALL 标为 valid，而不是 unavailable/failure。

#### Scenario: 无云输入写出有效零缓存

- **WHEN** V2 对无云 frame prepare 并 encode
- **THEN** cache pass SHALL 成功、validSampleCount/contentRevision SHALL 更新、RGBA output SHALL 全部为有限零值，正常渲染 SHALL 保留天空/地面且没有云

#### Scenario: 单体输入仍保持 W3 空语义

- **WHEN** V2 输入一个或多个有效云体但所有 W3 Recipe disabled
- **THEN** Adapter SHALL pack 有界 Body/Recipe records，但 compute SHALL 不遍历 body 或执行形态算子，RGBA output SHALL 仍为有限零值

#### Scenario: 缓存消费者协议兼容

- **WHEN** active Producer 从 Legacy 切换为 V2
- **THEN** Cached、Hybrid、density debug 与 transmittance ground shadow SHALL 只通过现有 `DensityCacheOutput` sampled contract 消费 V2，不得要求新的 renderer cache format或私有 V2 binding

#### Scenario: Resize 与 workgroup 重建

- **WHEN** V2 active/candidate 状态下改变 density resolution 或合法 workgroup
- **THEN** Adapter SHALL 重建自身相关 resources/pipeline、递增局部 resourceGeneration、使旧 output invalid，并在重新成功编码前阻止旧 view 成为 active

#### Scenario: 销毁与 device loss

- **WHEN** V2 Adapter 重复销毁或设备丢失
- **THEN** 其 GPU resources SHALL 至多释放一次，pending candidate MUST NOT 被提升，后续 prepare/encode/getOutput SHALL 有限拒绝或返回 invalid 状态

### Requirement: W3 V2 Compute 成本与依赖受限

W3 V2 cache update SHALL 只 dispatch 现有三维缓存网格；每个有效体素 MUST 只有全局 invocation bounds check 与一次 RGBA16F storage write。V2 source MUST NOT 包含 body/Recipe evaluator loop、weather/atlas/noise texture sample、Legacy 4D Voronoi/fBm、atomics、workgroup storage、occupied-tile compaction、indirect dispatch 或额外正常帧 compute/render pass。默认 Legacy 且 V2 未请求时，V2 的 module/pipeline creation、GPU memory 和 pass count MUST 为零。

#### Scenario: 空 Compute 静态成本

- **WHEN** 静态审计 W3 V2 compute entry
- **THEN** source SHALL 只有 bounds check 与零值 textureStore，body attempts、noise calls、texture samples、atomics 和额外 entry SHALL 为零

#### Scenario: 默认路径零开销

- **WHEN** active/requested Producer 均为 Legacy
- **THEN** renderer SHALL 不创建或编码任何 V2 GPU resource/pass，现有 density texture、cloud pass 与 ground-shadow pass 数 MUST 不变

#### Scenario: V2 资源成本可审计

- **WHEN** V2 candidate 或 active Producer 已分配资源
- **THEN** stats SHALL 报告 record bytes、双缓存 output bytes、dispatch dimensions、source length、creation/rebuild CPU latency 与可用时的 cache GPU timing，MUST NOT 把首次创建成本表述为 steady-state 加速

#### Scenario: 不提前实现后续 Wave

- **WHEN** W3 完成
- **THEN** V2 source/resources MUST NOT 包含 W4 tile mask、W5 atlas/macro fields 或 W6 genus density evaluator；这些能力必须由后续独立 change 批准
