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

系统 SHALL 提供 requested/active Producer 分离的 selector。Legacy MUST 为默认和 W1 唯一 active Producer。`RecipeDensityV2Adapter` 在 W1 MUST 报告 unavailable 且不得创建 shader、pipeline、buffer、texture 或 dispatch。请求 V2 时，selector MUST 保持或回退健康 Legacy，并记录稳定的 fallback reason；只有候选 Producer 已创建且能提供 valid output 后，才可原子切换 active Producer。

#### Scenario: 默认 Legacy

- **WHEN** 应用以默认参数启动
- **THEN** requested 与 active Producer SHALL 均为 Legacy，缓存行为与 W1 前一致

#### Scenario: 请求未实现 V2

- **WHEN** 用户请求 Recipe V2 Producer
- **THEN** requested SHALL 为 Recipe V2，active SHALL 保持 Legacy，fallback reason SHALL 表示 V2 尚未实现，且画面继续使用健康 Legacy output

#### Scenario: 失败切换不发布半成品

- **WHEN** 候选 Producer 创建、prepare 或首次 output 验证失败
- **THEN** selector MUST NOT 发布候选 output或销毁健康 Legacy，MUST 原子回退并记录原因

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
