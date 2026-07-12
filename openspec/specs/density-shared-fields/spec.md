# density-shared-fields Specification

## Purpose
TBD - created by archiving change add-density-v2-shared-fields. Update Purpose after archive.
## Requirements
### Requirement: 固定且共享的 GPU Field 资源

Recipe V2 SHALL 惰性拥有全局共享的一张 Base 3D Atlas、一张 Detail 3D Atlas、一张 2D Macro Field 与一只 repeat-linear filtering sampler；这些资源 MUST 由所有 V2 Body 共用，MUST NOT 按 Body、genus、tile、cache texture 或 frame 复制。默认规格 SHALL 为 Base=`64³ rgba8unorm`、Detail=`64³ rgba8unorm`、Macro=`256² rgba8unorm`，有效 texture payload SHALL 为 2,359,296 bytes（2.25 MiB）。配置 SHALL 版本化并在创建前检查尺寸、格式、device limits 与峰值字节；所有 shared-field 有效资源、候选格式和必要临时资源的声明峰值 MUST 不超过 8 MiB。

Base RGBA SHALL 分别提供低频 fBm、Worley F1、F2-F1 与低频 warp；Detail RGBA SHALL 提供有界高频/erosion/cellular 与去相关细节；Macro RGBA SHALL 分别提供 XZ coverage、thickness、wave phase 与 cell layout 基础信号。W5 SHALL 只定义信号库，不得把这些通道解释为完整 genus density。

#### Scenario: 默认资源预算

- **WHEN** 使用 W5 默认 shared-field config 创建 Recipe V2 资源
- **THEN** 系统 SHALL 只创建两张 `64³ RGBA8` 3D atlas 和一张 `256² RGBA8` 2D macro texture，其有效 payload SHALL 为 2.25 MiB，增加 1–12 个 Body MUST NOT 增加 atlas 数量或 payload

#### Scenario: 预算或设备限制失败

- **WHEN** config、候选格式、尺寸、storage/sample usage 或 device limits 会使 shared fields 非法或声明峰值超过 8 MiB
- **THEN** V2 candidate SHALL 有限失败并保留健康 Legacy，MUST NOT 截断资源、创建 per-body fallback texture 或发布半成品 diagnostics

#### Scenario: 默认 Legacy 零资源

- **WHEN** active/requested Producer 均为 Legacy，或用户只请求无人消费 V2 cache 的 Realtime
- **THEN** shared-field texture、sampler、module、pipeline、bind group、generation pass 与 GPU bytes SHALL 全为零

### Requirement: 有界确定的周期 GPU 生成

Base/Detail Atlas 与 Macro Field SHALL 由独立 WebGPU compute generator 在 GPU 上生成，不得由 CPU 逐 texel 上传。每个 generator invocation SHALL 有全局 bounds check，并只使用固定整数 hash、周期 lattice/value/gradient noise、固定低 octave 与有界邻域；任一 3D Worley 求值 MUST 最多检查 `3×3×3=27` 个候选 cell。Generator MUST NOT 包含递归、数据相关无界循环、atomics、workgroup storage、Legacy 4D Voronoi/fBm 或 per-body dispatch。

所有格点/cell 索引 SHALL 按已声明 texture period 取模；Base、Detail 与 RGBA channels SHALL 使用确定且去相关的 seed domain。相同 config/seed/device-compatible format MUST 生成确定的字段，纹理 repeat 边界 MUST 可连续线性/三线性采样。

#### Scenario: 周期边界采样

- **WHEN** debug sampler 以连续坐标跨越任一 Base/Detail 轴或 Macro XZ 的整数周期边界
- **THEN** sampled field SHALL 连续 wrap，MUST NOT 因 hash cell 未取模、edge texel 未覆盖或 clamp addressing 出现可见断层

#### Scenario: 生成成本不乘云体数

- **WHEN** 同一 shared-field generation 下 activeBodyCount 从 1 增长到 12
- **THEN** atlas/macro texel 数、generator dispatch 数与声明资源字节 SHALL 保持不变，MUST NOT 为新增 Body 再次生成共享纹理

#### Scenario: Source 成本有界

- **WHEN** 静态审计 shared-field generator source closure
- **THEN** 所有 octave/cell 循环 SHALL 有编译期固定上限，Worley 邻域 SHALL 不超过 27，atomics、workgroup storage、per-body texture 与 Legacy noise closure SHALL 不存在

### Requirement: 共享采样 ABI 与坐标时间演化

Recipe V2 SHALL 使用独立的只读 shared-field sampling ABI：group 2 binding 0 为 filtering sampler、binding 1 为 Base `texture_3d<f32>`、binding 2 为 Detail `texture_3d<f32>`、binding 3 为 Macro `texture_2d<f32>`。Sampler SHALL 使用 repeat addressing 与 linear min/mag filtering；3D atlas SHALL 使用硬件三线性采样。

共享 sampling helper SHALL 支持 body-local normalized coordinate、有限 scale/rotation、seed-derived periodic offset、累计风平流与至多一次低频 coordinate warp。时间连续性 SHALL 优先通过连续坐标平流获得，MUST NOT 通过每帧重建 atlas 或在主路径计算完整 4D 动画噪声。W6 Stratus MAY 调用 Macro 一次与 Base 一次且不得 warp；W6 Cumulus MAY 调用 Macro 一次、Base 两次、Detail 一次并使用第一次 Base sample 的通道执行至多一次 warp。其他八属与任何早退 Body MUST 为零 shared samples。

#### Scenario: 风平流不重建纹理

- **WHEN** 时间、Body 位置或累计风平流连续变化而 shared-field config/seed 不变
- **THEN** sampling coordinate MAY 连续变化，但 atlas/macro generation 与 build count SHALL 保持不变

#### Scenario: W6 双属固定采样预算

- **WHEN** W6 evaluator 对通过 cheap support/profile gate 的 Stratus 或 Cumulus Body 求值
- **THEN** Stratus shared sample call SHALL 至多为 2，Cumulus SHALL 至多为 4；sample 次数不得由动态 Recipe 数据循环扩大

#### Scenario: Disabled 与空 Support 零采样

- **WHEN** Recipe disabled、tile candidate bit 为零、analytic footprint/height profile 为零或 genus 不属于 W6 双属
- **THEN** evaluator SHALL 在调用 shared sampling helper 前返回零，MUST NOT 为诊断或统一控制流执行占位 texture sample

#### Scenario: 坐标演化连续

- **WHEN** W6 Stratus/Cumulus sampling coordinate 跨越 atlas/macro repeat 边界
- **THEN** density SHALL 连续 wrap且 shared-field build count 不变，MUST NOT 出现每帧再生成、固定世界纹理锁定或完整 4D time noise

### Requirement: 分离的生成频率与原子生命周期

Base/Detail Atlas SHALL 只在首次 Cached/Hybrid V2 candidate 创建或 atlas format/dimension/seed signature 改变时生成；Macro SHALL 只在首次创建或 macro dimension/seed/config signature 改变时生成。普通 cache schedule、Body movement、wind、mask revision、cache ping-pong 与 debug phase MUST NOT 触发任一 generator。Density cache SHALL 继续使用现有 update-rate/风阈值调度；未来 Hybrid detail MAY 每渲染帧采样静态 Detail Atlas，但 W5 MUST NOT 创建或调度该路径。

首次 V2 warmup SHALL 按 shared atlas generation、macro generation、W4 zero-cache generation 的顺序编码并在成功后原子 promotion。任一 shared-field 创建、预算、pipeline、binding 或 encode 失败 MUST 阻止 candidate promotion并清理候选资源。destroy/device loss SHALL 使 shared diagnostics invalid 并至多释放每个资源一次。

#### Scenario: 普通帧不重新生成

- **WHEN** V2 已 ready 且本帧只有 cache update、风平流、Body/Support 或 tile-mask 内容变化
- **THEN** shared-field generator pass count、generation 与 build count SHALL 不变

#### Scenario: 独立 Signature 失效

- **WHEN** 仅 Macro signature 变化而 atlas signature 不变
- **THEN** 系统 SHALL 只重建 Macro，Base/Detail generation MUST 保持不变；反向变化亦 SHALL 避免无关 Macro 重建

#### Scenario: Warmup 失败保留 Legacy

- **WHEN** shared-field 生成或其后零 cache warmup 在 promotion 前失败
- **THEN** selector SHALL 保持 active=Legacy、记录稳定 failure reason并禁止发布 candidate sampled views 或 diagnostics

### Requirement: 格式证据与只读调试视图

W5 产品默认 shared-field format SHALL 为 `rgba8unorm`。系统 SHALL 以受控诊断比较 `rgba8unorm`、`r16float` 与 `rgba16float` 的可创建/可 storage-write/可 filter-sample 状态、有效字节、可用 GPU generation timing、周期 seam、量化分布与视觉 slice；`r16float` SHALL 仅作为单通道参考，`rgba16float` SHALL 仅作为四通道高精度候选。普通产品 GUI MUST NOT 提供改变默认 atlas format 的运行时开关。

V2 SHALL 提供惰性的只读 shared-field diagnostics，至少包含 Base/Detail Z slice、Macro RGBA channel、phase/seam overlay、format/dimensions/estimated bytes、generation、build count/reason/timing 与 unavailable reason。Diagnostics MAY 暴露 sampled views/sampler，MUST NOT 暴露 storage view、writable texture、compute pipeline/bind group，也 MUST NOT 进入 `DensityCacheOutput` 或成为正常 cloud render/ground-shadow 的依赖。

#### Scenario: 调试视图不污染缓存契约

- **WHEN** 用户选择 Base、Detail 或 Macro debug view
- **THEN** 惰性 debug pipeline MAY 读取只读 shared views，但 `DensityCacheOutput` 字段、RGBA16F channel 语义与 cloud/ground-shadow cache bindings SHALL 不变

#### Scenario: Timestamp 不可用

- **WHEN** 设备不支持可用的 timestamp query 或 query range 不可安全分配
- **THEN** atlas/macro GPU timing SHALL 标记 unavailable，MUST NOT 使用 CPU create/build encode timing 冒充 GPU timing

#### Scenario: 量化证据不冒充形态性能

- **WHEN** W5 完成格式、切片与平流比较
- **THEN** 证据 MAY 支持默认格式选择，但 MUST NOT 声称 W6 非零 genus evaluator 的质量、采样预算或稳态 GPU 加速已被验证

