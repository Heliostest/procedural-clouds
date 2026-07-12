# W5 Design — 共享 GPU 场与噪声图集

## Context

W4 已经把未来的密度工作限定为 `tile mask → bounded body candidates → evaluator → one final store`，但 evaluator 需要怎样获得形态信号仍未决定。旧路径的主要风险不是某个 noise 函数本身，而是把昂贵的多 octave、4D 时间噪声放在体素×云体的内层循环。

W5 将噪声拆成两类共享资产：

```text
首次请求 Recipe V2 Cached/Hybrid
          │
          ▼
DensitySharedFields（V2 私有、全局一套）
  ├─ BaseAtlas  64³ RGBA8 ── 低/中频 billow、Worley、warp 信号
  ├─ DetailAtlas 64³ RGBA8 ─ 高频 erosion、细胞差、去相关信号
  └─ MacroField 256² RGBA8 ─ coverage/thickness/wave/cell 的 XZ 信号
          │
          ├─ W5 debug sampling（允许）
          └─ W6+ genus evaluators（W5 禁止）
```

静态场通过坐标平流产生连续时间变化：纹理内容不随帧重建，云体的采样坐标随风和时间移动。形态演化需要的低频 warp 也应作用于坐标，而不是把时间作为第四维重新计算完整噪声。

## Goals

- 把格点/细胞噪声计算移出未来 density cache 的每体素每云体热区。
- 为所有云体提供一套固定、周期、可三线性采样的共享信号。
- 用明确尺寸、格式和 8 MiB 上限约束显存；云体数不得影响 atlas allocation 数。
- 明确 atlas、macro、cache 与未来 Hybrid detail 的不同更新频率。
- 在任何非零 evaluator 落地前验证接缝、量化、平流连续性和设备兼容性。
- 保持默认 Legacy 零创建、零内存、零 pass，并维持 V2 有效空输出。

## Non-Goals

- 不决定十属最终 Recipe 公式或把共享 atlas 强制套给所有形态 family。
- 不在 W5 证明 W6 evaluator 的视觉质量或稳态性能。
- 不把动态天气布局烘焙为每云体 3D 纹理。
- 不实现 4D atlas、per-body volume、mipmap、稀疏页或 GPU 压缩。

## Decisions

### Decision 1: 默认使用三张共享纹理，资源量不随云体数增长

默认资源为：

| 资源 | 尺寸/格式 | 通道语义 | Payload |
|---|---|---|---:|
| Base Atlas | `64×64×64 rgba8unorm` | low fBm、Worley F1、F2-F1、low warp | 1,048,576 B |
| Detail Atlas | `64×64×64 rgba8unorm` | high fBm、erosion/cell、两路去相关细节 | 1,048,576 B |
| Macro Field | `256×256 rgba8unorm` | coverage、thickness、wave phase、cell layout | 262,144 B |
| 合计 | — | — | 2,359,296 B（2.25 MiB） |

资源同时带 `STORAGE_BINDING | TEXTURE_BINDING` 用途，生成后通过 sampled view 读取。不得按 Body、genus、tile 或 density cache generation 复制。Body variation 以后由 record 中的尺度、旋转、平移、seed-derived offset 与通道选择表达。

配置对象必须版本化并限制为已批准的固定规格；W5 不增加任意分辨率 GUI。所有有效资源、受控格式候选和必要临时资源的峰值估算在创建前检查，超过 8 MiB 立即使 V2 候选有限失败并保留 Legacy。

### Decision 2: `rgba8unorm` 是产品默认，浮点格式只做受控比较

三类候选的取舍：

| 格式 | 优点 | 代价/限制 | W5 决策 |
|---|---|---|---|
| `rgba8unorm` | 可打包四路信号、filterable、2.25 MiB 默认预算 | 8-bit 量化 | 产品默认 |
| `r16float` | 单通道精度较高、单纹理较小 | 四路信号需多纹理或多采样，破坏固定采样预算 | 仅单通道诊断参考 |
| `rgba16float` | 四通道高精度 | 两张 3D atlas 约 4 MiB，默认总量 4.25 MiB、带宽翻倍 | 仅受控诊断候选 |

诊断比较必须记录：可创建/可写/可线性采样、有效字节、生成时间（timestamp 可用时）、接缝误差、直方图/量化带和视觉切片。不得把候选格式变成普通用户运行时开关；默认路径在不同设备上保持 `rgba8unorm`。若默认格式的 storage/sample pipeline 创建失败，整个 V2 候选失败并安全保留 Legacy。

### Decision 3: 生成数学有界、确定、周期

Atlas compute 的每个 texel 只允许：

- 有限整数 hash 与周期 lattice/value/gradient noise；
- 固定且较低的 octave 数；
- 每次 Worley 最多检查当前 cell 周围 `3×3×3=27` 个候选；
- 固定数量算术，不使用递归、数据相关无界循环、atomics 或 workgroup storage。

生成坐标和 hash cell 均按纹理周期取模。Base 与 Detail 使用不同固定 seed domain，四个 channel 也必须去相关。Macro 只依赖 XZ，四个 channel 以不同低频和 seed 生成，但保持同一 `256²` 周期。

预计算成本约为常数：两张 `64³` atlas 共 524,288 texels，一张 `256²` macro 共 65,536 texels。即便 Worley 使用 27 邻域，这一成本也只在创建/显式失效时支付，不乘以 cache resolution、activeBodyCount 或帧数。

### Decision 4: 时间变化靠坐标平流，不靠每帧重建或完整 4D noise

共享采样 helper 定义：

```text
world position
  → body-local normalized coordinate
  → scale/rotation/seed offset
  → + accumulatedWind * frequency
  → + optional low-frequency warp (最多一次)
  → fract/repeat coordinate
  → hardware linear/trilinear sample
```

Atlas 本身静态。`addressMode=repeat` 与 `mag/minFilter=linear` 提供空间连续性；采样坐标连续移动提供时间连续性。W5 debug 可以动画化上述坐标以检查锁纹、方块和边界，但正常 cache entry 不调用 helper。

后续 evaluator 必须按 family 选择信号，而不是每种云都走同样数量的采样：Stratiform 可以只取 macro + 1–2 次 atlas，Billow 2–4 次，Cellular 2–3 次，Fiber 最多 2 次，Convective base 4–6 次；这些只是 W6+ 的预算上限来源，W5 不提高任何 Recipe budget。

### Decision 5: 四类工作使用不同 cadence

| 工作 | W5 cadence |
|---|---|
| Base/Detail atlas generation | 首次 V2 创建；仅 atlas format/dimension/seed 变化时重建 |
| Macro generation | 首次 V2 创建；仅 macro dimension/seed/config 变化时重建；连续动画优先坐标平流 |
| Density cache | 保留现有 Cached/Hybrid update-rate、风阈值和强制失效调度 |
| Hybrid detail | 未来渲染帧采样共享 Detail Atlas；W5 不生成、不调度该路径 |

普通 `prepareFrame/encode` 若 shared-field signature 未变，不得生成 atlas/macro pass。移动 Body、风变化、cache ping-pong 和 mask revision 均不得改变 shared-field generation。

### Decision 6: 共享场由 V2 Adapter 私有所有，采用独立 Bind Group 2

V2 density pipeline 预留只读 sampling ABI：

```text
group(2) binding(0): filtering sampler
group(2) binding(1): texture_3d<f32> Base Atlas
group(2) binding(2): texture_3d<f32> Detail Atlas
group(2) binding(3): texture_2d<f32> Macro Field
```

生成 pipeline 使用独立显式 storage layouts。`DensityCacheOutput` 仍只暴露 RGBA16F cache sampled views/sampler；shared storage views、compute pipelines 和 bind groups 不得进入该接口。

诊断使用单独的只读 `DensitySharedFieldDiagnostics`，只暴露 sampled views、sampler、generation 和描述信息，并只在 V2 debug mode 请求时由惰性 fullscreen debug pipeline 消费。Legacy 返回不可用诊断；普通 cloud render 和 ground shadow 不得依赖该对象。

### Decision 7: 候选预热是原子发布的一部分

首次请求 V2 Cached/Hybrid 时：

```text
create config/resources/pipelines
  → encode Base+Detail generation
  → encode Macro generation
  → encode W4 zero-cache pass
  → submit
  → validate output/resource state
  → atomic promote active=Recipe V2
```

生成与零缓存可处于同一 command encoder，但 pass 分离并有明确 label。创建、预算、编码或绑定失败时，候选不得发布任何 sampled output/diagnostics，健康 Legacy 继续 active。Realtime-only 请求仍不创建无人消费的 V2 cache 或 shared fields。

### Decision 8: W5 的正常 density entry 仍然零采样、零 evaluator

W5 可以在独立 generator/debug shader 中使用 `textureSample*`，并可在 V2 cache source 中声明 group 2 ABI；但 cache compute entry 的可达调用图必须保持：

```text
bounds → tile mask gate (empty future region) → textureStore(vec4f(0))
```

静态 guard 需要区分 generator/debug source 与 density cache source，不能把 W5 允许的预计算误判为 evaluator，也不能因为新增 binding 就提前允许 W6。正常 V2 Cached/Hybrid 继续为空场景。

## Failure and fallback behavior

- 配置非有限、尺寸超限、资源预算超限或 device limits 不满足：V2 candidate `failed`，Legacy 保持 active。
- shader/pipeline 创建失败或预热 encode 失败：销毁候选 shared fields，禁止 promotion。
- debug pipeline 失败：正常 V2 空缓存可以继续，但诊断标记 unavailable；不得影响 Legacy 或 cloud renderer。
- device loss/destroy：shared textures、views、sampler、pipelines 与 diagnostics 至多销毁一次，output/diagnostics 失效。

## Evidence strategy

### Automated

- 配置和字节预算 fixtures：默认恰为 2.25 MiB，候选格式与 8 MiB gate 正确。
- source closure：生成器循环有界且周期；cache entry 无 texture sample/evaluator/Legacy noise；无 per-body texture allocation。
- lifecycle fixtures：Legacy/Realtime-only 零创建；首次 V2 创建一次；普通帧不重建；seed/config 变化只重建相应资源；失败不 promotion。
- packing/binding fixtures：group 2 ABI 固定，`DensityCacheOutput` 不暴露私有资源。

### Manual WebGPU

- Base/Detail 多个 Z slice 与 Macro RGBA 通道可见，无明显固定边界或整块重复。
- repeat seam、慢速/快速平流连续；诊断切片跨周期移动不闪断。
- RGBA8 与浮点诊断候选比较记录量化/带宽/兼容性，默认选择有依据。
- V2 Cached/Hybrid 正常视图仍为空；Legacy Cached/Hybrid 与 Realtime 不变。

## Risks and mitigations

- **RGBA8 量化形成层带**：通道范围预整形，debug 直方图/切片比较；只有证据不足时才由后续 change 修改默认格式。
- **64³ 周期可见**：多频率、channel decorrelation、per-body transform/offset 与坐标 warp；不通过增大 per-body texture 掩盖。
- **一次预计算卡顿**：只在异步候选 warmup，记录 CPU create 与可用 GPU timing；Legacy 在 promotion 前持续显示。
- **共享纹理导致十属同质化**：atlas 只是信号库，family evaluator 决定 profile/topology/sample combination；W5 不建立单一共享密度链。
- **Debug 泄漏私有写资源**：诊断只读、独立接口、惰性 pipeline，不改变 `DensityCacheOutput`。

## Open questions deferred to later Waves

- W6 确定 Stratus/Cumulus 的真实通道组合、频率和 sample budget。
- W7–W9 决定 Cellular/Fiber/Convective 是否需要新增共享 channel，而不是假定三张纹理适合全部十属。
- W10 才决定 Hybrid detail 的最终采样与光学耦合。
- 默认 atlas 尺寸/格式若需变化，必须依据 W6 非零 evaluator 的质量与 timestamp 证据另行提案。
