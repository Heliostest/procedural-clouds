## MODIFIED Requirements

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

## ADDED Requirements

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
