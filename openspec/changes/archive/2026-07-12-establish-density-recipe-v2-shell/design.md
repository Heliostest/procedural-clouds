## Context

当前 Producer 结构如下：

```text
renderer
  → DensityProducerSelector
      ├─ LegacyDensityAdapter：唯一可用 Producer
      └─ RecipeDensityV2Adapter：unavailable 占位符
  → DensityCacheOutput
  → Cached / Hybrid quality bundles
```

W1 已把缓存资源、ping-pong、调度和 output 所有权移入 Producer；W2 已把 Legacy cache compute 与三种 quality pipeline 的 shader closure 分离。W3 的问题不是“先写哪一种云”，而是建立一条完全不引用 Legacy 密度数学、又能通过现有 output seam 被 Cached/Hybrid 安全消费的 V2 GPU 路径。

当前缓存覆盖整个 `boxMin() → getBoxMax()` 场景级体积，而不是单云体私有体素域。W3 保持这一外部契约：CloudBody 仍是参数化生成器，V2 仍写一对合并后的场景级 3D cache。是否通过 W4 tile mask 减少空域/候选 body 工作，不在 W3 改变存储范围。

## Goals / Non-Goals

### Goals

- V2 可独立创建、prepare、encode、输出、resize、workgroup rebuild、device-loss 和 destroy。
- CPU/WGSL record 使用固定、显式、可检查的 offset/stride，避免复用 Legacy `Params/BodyGPU/PresetShape`。
- 三条数据轴职责明确：Placement 决定云体在哪里，Density Recipe 决定以后如何形成密度，Optical Profile 决定缓存之后如何成像。
- V2 只写合法零密度，并通过现有 RGBA16F output 被 Cached/Hybrid、density debug 和 transmittance ground shadow 消费。
- 默认 Legacy 启动没有 V2 编译、内存或 dispatch 成本；V2 请求、创建、预热、激活、失败与回退可诊断。
- 为 W4/W5/W6 留出稳定扩展点，同时禁止这些能力偷跑进 W3。

### Non-Goals

- 不证明形态质量或性能提升。
- 不把十属 Recipe 表解释成运行时指令流。
- 不读取 CSV 中的 `128³/32³` 描述来分配额外纹理。
- 不改变全局 cache domain，不建立 per-body 3D texture。
- 不改变 Optical preset、lighting 或 Hybrid detail。

## Decisions

### Decision 1: V2 是惰性异步 Producer，而不是启动时常驻的第二套缓存

默认 `densityProducerMode=Legacy` 时：

```text
V2 lifecycle = idle
V2 shader/pipeline/buffers/textures = 不存在
V2 GPU passes = 0
```

首次请求 Recipe V2 后，selector 调用 async factory 创建 V2 module、pipeline 和自有资源。创建期间 requested=Recipe V2、active=Legacy；Legacy 继续按当前 active quality 更新缓存。候选创建失败时进入 failed 并保留 Legacy。

Producer request 与 quality mode 继续正交。若 active quality 为 Realtime，V2 request 只更新 requested/HUD，不得为了一个当前无人消费的 cache 启动候选 dispatch；factory 可保持 idle，直到 active quality 回到 Cached/Hybrid。若 V2 已 active 后切到 Realtime，其 cache 可暂停；回到 Cached/Hybrid 前必须用当前输入刷新。

异步创建完成只表示 pipeline/resources ready，不表示当前场景 output ready。V2 必须用当前 `DensityFrameInput` prepare，并成功把零密度 pass 编码进调用方 command encoder；只有该 pass 位于所有消费者之前、`DensityCacheOutput.valid=true` 且资源合同通过验证后，selector 才能提升 V2。切换帧可以使用同一 command encoder 的 pass 顺序保证“先写 V2 cache，后由 Cached/Hybrid/ground shadow 读取”。

候选 encode 在附加 pass 前被拒绝时，renderer SHALL 继续编码当前 Legacy plan；不得发布半初始化 V2 bind group。Pipeline/bind-group 创建应使用 error scope 或等价结构化失败边界，尽量把异步 WebGPU 验证错误阻挡在 promotion 之前。

### Decision 2: Placement、Density Recipe、Optical Profile 保持三轴正交

```text
CloudBody + wind + lifecycle
  → DensityBodyGPU（Placement/transport only）

Genus density descriptor
  → DensityRecipeGPU（shape modes/parameters/budgets only）

Existing preset/lighting table
  → Optical Profile（render only）
```

- `DensityBodyGPU` 可以携带 footprint、base/top、旋转、尺度、coverage、density scale、lifecycle scale、累计风位移、morph time、genus/recipe identity。
- `DensityRecipeGPU` 可以携带归一化 vertical profile 形状、topology/detail/attachment 参数和静态成本限制；MUST NOT 复制物理 altitude placement、body bounds、风状态、absorption、phase、silver、halo 或 lightning。
- Optical Profile 不绑定到 W3 V2 compute。V2 只把 genus metadata 写进现有 G/B/A 通道；后续渲染继续通过现有 preset table 决定光学行为。

十属 CPU 描述可通过一个组合索引关联 `placementProfileId / densityRecipeId / opticalProfileId`，但三套 payload 必须分别拥有类型和上传边界，不能再次形成一个巨型“万能 preset”。

### Decision 3: 使用三个固定 record，所有 stride 为 16-byte 的整数倍

W3 冻结以下最小布局：

| Record | 固定大小 | 用途 |
| --- | ---: | --- |
| `DensityFrameGPU` | 64 bytes / 4 lanes | volume min/extent、时间/尺度、resolution、active count、frame flags |
| `DensityBodyGPU` | 128 bytes / 8 lanes | per-body placement、transport、强度、IDs 与保留槽 |
| `DensityRecipeGPU` | 256 bytes / 16 lanes | static modes、参数 bank、成本上限与保留槽 |

`DensityRecipeGPU` 的 16 个 lane：

| Lane | 类型 | W3 职责 |
| ---: | --- | --- |
| 0 | `vec4u` | genusId、enabled/feature flags、vertical mode、topology family |
| 1 | `vec4u` | detail mode、attachment mode、macro/detail cost class |
| 2 | `vec4u` | max base samples、max detail samples、max octaves、reserved limit |
| 3–4 | `vec4f` | domain transform banks，W3 只校验有限范围 |
| 5 | `vec4f` | macro support bank |
| 6–7 | `vec4f` | normalized vertical-profile banks |
| 8–10 | `vec4f` | topology parameter banks |
| 11–12 | `vec4f` | detail/erosion banks；不复用 Legacy 单一 `detail` |
| 13 | `vec4f` | attachment bank |
| 14 | `vec4f` | finalize/remap bank |
| 15 | `vec4f` | 保留扩展槽，W3 必须写零 |

这些 lane 是有界静态参数 bank，不是 operator array。后续静态 genus evaluator 可以按具名字段读取其中一部分；不得以 `for operatorCount` 解释任意操作。未来若确实无法在固定 record 内表达某一 Wave，必须新提案修改 layout version，不能暗中改变 stride。

### Decision 4: 集中 layout descriptor 同时驱动 CPU packing 与 WGSL declaration

V2 SHALL 建立单一 layout descriptor，至少记录：record version、field/lane name、scalar kind、byte offset、byte size、alignment、stride、count 和 enum range。CPU packer使用同一描述符写入 `ArrayBuffer` 的 `Float32Array/Uint32Array` view；WGSL struct/prefix 由该描述符生成或接受逐字段机器对照，避免手写两份偏移表后只靠目测同步。

检查至少覆盖：

- 每个字段 offset 与 scalar kind；
- record stride 和 16-byte alignment；
- `MAX_BODIES=12`、Recipe count=10；
- 所有 CPU 数值有限，u32 enum/flags 在范围内；
- reserved lane 为零；
- buffer byte size 等于 `stride × count`；
- WGSL struct 顺序、array stride 与 bind-group minBindingSize；
- layout version 改变时旧断言必须失败。

W3 不修改现有 `PARAM_OFFSETS`、`BODY_BASE` 或 Legacy `PresetShape`，也不把 V2 record 塞入主 `Params` uniform。

### Decision 5: V2 使用专用 WGSL source 和显式 pipeline layout

概念资源布局：

```text
group 0 / read-only inputs
  binding 0: DensityFrameGPU uniform
  binding 1: DensityBodyGPU read-only storage
  binding 2: DensityRecipeGPU read-only storage

group 1 / output
  binding 0: rgba16float storage texture 3D
```

W3 使用显式 `GPUBindGroupLayout`/`GPUPipelineLayout`，使空 shader 即使暂未读取 Body/Recipe buffer，也能验证未来输入资源的固定合同。W4/W5 的 tile mask、macro field 和 atlas 必须使用新 group 或已预留的明确 binding，并由各自提案修改；不得预先绑定不存在的纹理。

空 compute entry 只允许：

```wgsl
gid bounds check
textureStore(output, gid, vec4f(0.0))
```

禁止 body loop、Recipe loop、weather/atlas sample、noise、atomics、workgroup storage、Legacy helper 或额外 pass。Workgroup override 与 dispatch 计算沿用当前 Producer contract；W3 只验证 device limits，不寻找最优 workgroup。

### Decision 6: Output、ping-pong 与调度保持 Producer seam 兼容

V2 自有两张 `rgba16float` 3D texture，保持：

| Channel | W3 V2 值 |
| --- | --- |
| R density | `0.0` |
| G dominant genus | `0.0` |
| B secondary genus | `0.0` |
| A secondary blend | `0.0` |

零密度是有效内容：一次成功 encode 后 `validSampleCount/contentRevision` 递增、output valid；它不应触发 fallback。Cache update rate、wind threshold、ping-pong、transition/cacheBlend、resolution/workgroup 和同帧 pass 顺序保持与 seam 一致。实现可以抽取纯调度状态机供两个 Adapter 复用，但不得改变 Legacy 行为。

无云、一个有效 body、多个 body 和无效 genus 输入在 W3 都必须写相同有限零值。CPU packer对无效 genus 将 body 标为 disabled/invalid recipe，不得越界访问十属表；即使未来 evaluator 尚未启用，也要形成稳定的安全语义。

### Decision 7: Producer 身份与局部资源 generation 分开

Legacy 与 V2 都可能从 `resourceGeneration=1` 开始。仅比较局部 generation 会让 renderer 在 Producer 切换时错误复用旧 sampled views。W3 SHALL 在 `DensityProducerSelection` 中增加单调递增的 `activeGeneration`（或等价全局 identity epoch）：

```text
consumer binding key = active producer generation + output resourceGeneration
```

promotion、回退、切回以及目标 Producer resize 都必须重建 Cached/Hybrid density bind groups，并硬失效依赖密度的 ground-shadow/TAA history。普通 content update 只递增 `contentRevision`，不得伪造 Producer identity 变化。

目标 Producer 在切换前必须使用当前 frame input 强制刷新一次，避免恢复长期未 active 的旧缓存。Legacy 仍是默认和创建失败回退；W3 不要求在 V2 active 期间持续后台更新 Legacy。

Selector/renderer SHALL 保存最新 requested resolution/workgroup，并在创建或恢复候选前同步到目标 Producer；不能只修改当前 active Adapter 后让另一个 Adapter 以旧尺寸被提升。

### Decision 8: 十属 Recipe 表描述未来路径，但 W3 全部 disabled

静态表必须恰好覆盖十个规范 genus，并为每个 genus 提供稳定 ID 与预期 topology family，例如 Stratiform、Cellular、Fiber、Billow/Convective。该分类只用于检查表完整性和为后续 Wave 预留路由；`enabled=0`，shader 不执行 dispatcher。

每条记录必须携带固定成本上限，例如 `maxBaseSamples/maxDetailSamples/maxOctaves`。W3 的有效上限均为零；后续 Wave 只能在新提案批准的预算内启用。记录不得包含函数指针、变长数组、operator count 或跳转字节码。

### Decision 9: W3 的性能结论只描述成本结构，不宣称加速

默认 Legacy 路径：

- V2 module/pipeline creation = 0；
- V2 buffer/texture bytes = 0；
- V2 dispatch = 0。

V2 active 更新帧：

```text
ceil(resX/wgX) × ceil(resY/wgY) × ceil(resZ/wgZ)
→ 每个有效体素 1 次 storage write
→ 0 body attempts
→ 0 texture samples
→ 0 noise calls
```

默认 `96³` 双 RGBA16F output 约为：

```text
96 × 96 × 96 × 8 bytes × 2 = 13.5 MiB
```

V2 stats SHALL 报告 source length、creation/rebuild CPU latency、output bytes、record bytes、dispatch dimensions、active body count、candidate/active lifecycle 与 cache GPU timing（仅 timestamp-query 可用时）。首次候选创建/切换成本不得混入 steady-state 性能声明。W3 不设置“比 Legacy 快多少”的通过线。

## Risks / Trade-offs

- **固定 record 过早冻结**：256-byte Recipe record 用具名参数 bank 和一个 reserved lane换取后续空间；任何 stride/version 变化必须显式提案和迁移检查。
- **空输出被误认为黑屏 bug**：HUD 显示 `Recipe V2 / W3 empty-density`；正常视图必须仍有天空/地面，只有云密度和云影为空。
- **候选切换时资源峰值**：V2 惰性分配，默认无成本；候选期间 Legacy/V2 双缓存共存并在 stats 报告。格式压缩和长期驻留策略留给 W11，创建失败安全回退。
- **auto layout 再次产生隐藏依赖**：V2 使用显式 layout，静态检查 source 中的所有 `@group/@binding` 与 descriptor 一致。
- **调度抽取影响 Legacy**：若复用 scheduler，Legacy 固定场景、cacheRan、blend、revision 与 W1 行为必须先保持；否则 V2 先独立实现，避免借 W3 重构 Legacy 数值路径。
- **V2 source 偷带 Legacy graph**：专用文件和 closure guard 禁止 Legacy evaluator/noise/genus 标记，且不从 `densityShaderSources.ts` 的 Legacy fragment 组装。
- **Producer generation 碰撞**：通过 selector active epoch 与局部 output generation 组成复合 key。

## Migration Plan

1. 先定义 V2 lifecycle、selection generation 与 layout descriptors，不创建 GPU 资源。
2. 增加 packer、十属 disabled table 和机器检查。
3. 建立专用空 WGSL、显式 layouts 与 async pipeline factory。
4. 实现 V2 Adapter 的资源、调度、output、resize/workgroup、stats、device-loss 和 destroy。
5. 让 selector 支持 lazy candidate、当前帧预热、promotion/fallback 和 active generation。
6. 将 renderer 的 consumer binding/history key 扩展为 Producer identity + output generation。
7. 加入 HUD/诊断、自动检查和人工 WebGPU 验收；默认保持 Legacy。

回滚时删除 V2 factory/layout/adapter 实现并恢复 typed-unavailable candidate；Legacy、quality bundles、Params、CloudBody、preset 与缓存消费者无需回滚。

## Open Questions

无。Tile mask layout 属于 W4；atlas/macro field bindings 属于 W5；首批实际 Recipe 参数与形态公式属于 W6。
