## Context

当前实现只有一个巨型 `shaderSource`：

```text
noise.wgsl
+ cloud.wgsl
+ genus/common.wgsl
+ 10 个 genus evaluator
+ genus/dispatch.wgsl
        ↓
一个 GPUShaderModule
        ├── cloud render pipeline（fs）
        ├── ground-shadow compute pipeline（csGroundShadow）
        └── Legacy cache compute pipeline（cs，经 factory 传给 Adapter）
```

`densityAtTyped()` 读取 uniform `qualityMode` 后动态选择：

- Realtime：调用 `cloudDensityTyped()`，遍历最多 12 个云体并进入完整 genus/noise 图；
- Cached：采样双 `rgba16float` 3D cache；
- Hybrid：采样 cache 后调用 `detailNoise()`。

W1 已让 renderer 只通过 `DensityCacheOutput` 消费缓存，但 `LegacyDensityAdapter` 的 compute pipeline 仍由 renderer 使用同一 `GPUShaderModule` 创建。消费者资源所有权已经隔离，shader/pipeline 编译闭包尚未隔离。

W2 是纯架构 Wave：把当前数值语义机械迁移到清晰的源码闭包和 pipeline 生命周期中，为 W3 独立 V2 compute 腾出边界。它不能借拆分之机修改密度、光照、缓存或默认观感。

## Goals / Non-Goals

### Goals

- 让 Cached/Hybrid 的实际组装 WGSL 不再包含完整 Realtime/Legacy evaluator 调用图。
- 让 Legacy cache compute、三种 cloud quality render/ground-shadow pipeline 分属明确的 module 与生命周期。
- 让 Realtime shader module 和 pipeline 真正惰性、异步、可失败且不破坏当前 Cached/Hybrid 画面。
- 保持统一 `densityAtTyped()/densityAt()` 语义接口，使 raymarch、light-march、ground shadow 和 density debug 在同一 active mode 下取样一致。
- 明确 requested quality 与 active quality，使 Producer 调度、GPU uniform、HUD 和实际 pipeline 一致。
- 用静态 source-closure 检查证明隔离，而不是依赖驱动是否碰巧做 dead-code elimination。

### Non-Goals

- 不实现 Recipe V2 shader、record、pipeline、mask、atlas 或任何新密度算子。
- 不修改 `cloudDensityTyped()`、`evalBody()`、`detailNoise()`、edge shaping、光照、raymarch/light-march 步数或地面云影积分数学。
- 不改变 `DensityCacheOutput` 的双 `rgba16float` 格式、RGBA 通道或时间混合。
- 不优化 Realtime 性能，也不把 Realtime 纳入 W2 性能退出条件。
- 不新增 pipeline cache 持久化、subgroup、shader-f16、indirect dispatch 或 workgroup 算法。
- 不拆 post、Bloom、TAA、line、axis、ground-shadow resolve/filter 等与密度质量无关的 pipeline。

## Decisions

### Decision 1: 使用显式 source manifest，而不是一个运行时分支 shader

WGSL 没有项目内模块导入机制，因此 TypeScript 侧 SHALL 以显式、可静态审计的 manifest 组装不同 source closure。概念片段如下，实际文件名可在实施时微调，但职责和依赖方向不得合并回巨型源：

```text
shared ABI / bindings / math
├── cache sampling
├── bounded Hybrid detail
├── common cloud optics + raymarch + debug entry
├── density-dependent ground-shadow entry
└── Legacy evaluator
    ├── noise primitives
    ├── morphology / active height-weather semantics
    ├── genus evaluators + dispatch
    └── cloudDensityTyped / evalBody

quality adapters（都提供相同 densityAtTyped/densityAt 签名）
├── Cached adapter  = cache sampling
├── Hybrid adapter  = cache sampling + bounded detail
└── Realtime adapter = Legacy evaluator direct call

producer entry
└── Legacy cache writer = Legacy evaluator + cs writer
```

组装矩阵：

| Source closure | Cache sampling | Hybrid detail | Legacy evaluator/genus/noise | Common render/optics | Ground-shadow entry | Cache writer |
| --- | --- | --- | --- | --- | --- | --- |
| Cached bundle | 是 | 否 | **否** | 是 | 是 | 否 |
| Hybrid bundle | 是 | 是 | **否** | 是 | 是 | 否 |
| Realtime bundle | 否 | 否 | 是 | 是 | 是 | 否 |
| Legacy cache compute | 否 | 否 | 是 | 否 | 否 | 是 |
| Future Recipe V2 compute | 由 W3 决定 | 由 W3 决定 | **禁止** | 否 | 否 | 由 W3 决定 |

单一 shader module + `qualityMode` uniform、单一 module + 多 entry point、或只用 pipeline override constant 都被拒绝：这些方案仍让 Cached/Hybrid module 静态携带完整 evaluator，无法形成可验证的架构边界。

### Decision 2: 每种模式拥有一个 DensityQualityPipelineBundle

概念 contract：

```ts
type DensityQualityKind = 'cached' | 'hybrid' | 'realtime';
type PipelineLifecycle = 'idle' | 'compiling' | 'ready' | 'failed' | 'destroyed';

interface DensityQualityPipelineBundle {
  readonly kind: DensityQualityKind;
  readonly cloudPipeline: GPURenderPipeline;
  readonly groundShadowPipeline: GPUComputePipeline;
  createBindings(input: QualityPipelineBindingInput): QualityPipelineBindings;
  destroy(): void;
}
```

`cloudPipeline` 覆盖主 raymarch、light-march 和 density debug。`groundShadowPipeline` 只指当前依赖 `densityAt()` 的 transmittance compute；resolve/filter pipeline 保持共享。Post、Bloom、TAA、line 和 axis pipeline 也继续共享。

Bundle 拥有与自身 pipeline layout 匹配的 bind group/builders。renderer 不得假设三种 bundle 的 auto layout 兼容，也不得把 Cached/Hybrid 的 cache bind group 绑定到 Realtime pipeline。Pipeline 本身无显式 GPU `destroy()`；W2 的 `destroy()` 负责清除 JS 引用、丢弃候选、销毁 bundle 自建的 buffer/texture（如有）并阻止后续使用。

### Decision 3: Cached 与 Hybrid 是启动必需能力，Realtime 是惰性能力

项目默认 `qualityMode=Hybrid`，同时需要 Cached 作为可靠回退。因此：

1. `createRenderer()` SHALL 使用 `createShaderModule()` + `createRenderPipelineAsync()` / `createComputePipelineAsync()` 创建 Cached 与 Hybrid bundle；
2. Cached 是最低可用 bundle，创建失败时 renderer 创建失败并返回明确原因；
3. Hybrid 创建失败时 renderer 可用 Cached 完成启动，并把 requested=Hybrid、active=Cached、failure reason 暴露到 stats/HUD；
4. Realtime 初始状态为 `idle`，启动时不得组装 Realtime 完整 source、创建其 `GPUShaderModule`、pipeline 或模式专属 bind group；
5. 首次请求 Realtime 时才进入 `compiling`，异步创建完成且 bindings 可验证后原子切换；
6. ready bundle 在后续切换中缓存复用，避免反复编译和资源抖动。

异步 API 的 elapsed time 是 pipeline 创建等待时间，不是 GPU pass timing；统计字段必须明确标为 CPU/creation latency。

### Decision 4: requested 与 active quality mode 分离

`CloudParams.qualityMode` 保持用户请求值，不改变现有 0/1/2 schema。Pipeline manager 每帧先解析：

```text
requested quality
→ ensure/request candidate bundle
→ resolve active healthy bundle
→ build effective frame quality
→ Producer.prepareFrame(active quality)
→ pack GPU uniform(active quality)
→ Producer.encode（仅 active Cached/Hybrid）
→ active bundle render / ground shadow / debug
```

当 requested=Realtime 但候选仍 compiling 或 failed 时：

- active 保持先前健康 Cached/Hybrid；
- Legacy Producer 继续按 active mode 更新 cache；
- GPU uniform 中用于其他质量语义的 `qualityMode` 使用 active 值；
- HUD 同时显示 requested、active、lifecycle 和 reason，不能把请求值当作正在运行的 pipeline。

只有 active=Realtime 后 Producer 才跳过 cache encode。这样不会出现“Realtime 还没准备好，但请求值已让 cache 停更”的陈旧缓存帧。

### Decision 5: 三种模式保持同一取样函数 ABI，但不共享运行时 dispatcher

每个 source closure SHALL 定义同签名的 `densityAtTyped(pos) -> vec4f` 与 `densityAt(pos) -> f32`：

- Cached 实现只采样 `DensityCacheOutput` 并执行现有 edge shaping；
- Hybrid 实现只在非空 cache 基底上执行现有 `detailNoise()`，保持零区不生新主体；
- Realtime 实现直接调用现有 `cloudDensityTyped()` 并执行相同 edge shaping。

Common raymarch、light-march、ground shadow 和 debug 源只依赖该 ABI，不读取 `qualityMode` 来分发密度。模式由选中的 pipeline bundle 决定。

### Decision 6: Legacy cache compute 使用独立 GPUShaderModule

`LegacyDensityAdapter` 不再接收由 renderer 共享大 module 派生的 pipeline。W2 SHALL 提供异步 factory 或等价初始化步骤，由 Adapter 私有地创建：

```text
Legacy evaluator closure + cache writer entry
→ dedicated GPUShaderModule
→ dedicated compute pipeline
→ LegacyDensityAdapter
```

该 module 可以包含生成缓存必需的完整 Legacy evaluator、十属 dispatch 和 noise，但不得包含 cloud render、ground-shadow、post 或 quality adapter entry。其输出、workgroup override、dispatch 数、cache scheduling 和 bind group 语义保持 W1 不变。

Recipe V2 槽位继续 unavailable。Source manifest SHALL 明确禁止未来 V2 compute 引用 Legacy evaluator closure，防止 W3 以“先跑起来”为由重新拼回旧完整图。

### Decision 7: resourceGeneration 驱动 Cached/Hybrid bindings，bundle identity 驱动 layout 切换

Cached/Hybrid 仍只通过 `DensityCacheOutput` 创建 sampled bind group：

- output `resourceGeneration` 变化：为当前 Cached/Hybrid bundle 重建 cache binding；
- active bundle identity 变化：使用目标 bundle 自己的 layout 重建/选择全部模式相关 bindings；
- Realtime bundle：不消费或持有 `DensityCacheOutput` bind group；
- ground-shadow history：在 active quality、bundle identity 或 output generation 不连续变化时硬失效；
- 候选 bundle 完全 ready 前不得销毁或覆盖当前 bundle/bindings。

W2 不新增 density texture。Cached 与 Hybrid 共享 active Producer 的同一个双缓存 output，仅 pipeline/bind group 对象分开。

### Decision 8: 统计按 bundle 分项，失败保持可诊断

`RenderStats` SHALL 增加：

- requested/active quality kind；
- Cached/Hybrid/Realtime 各自 lifecycle；
- shader module creation CPU time；
- render/ground-shadow pipeline async creation latency；
- ready/failure reason；
- active bundle generation 或稳定 identity。

统计不得把 shader/pipeline CPU latency 写入 `cloudMs`、`cacheMs`、`shadowMs` 等 timestamp-query GPU timing。Realtime 从未请求时 reason 使用稳定的 `not-requested`/`idle`，而不是 failure。

### Decision 9: W2 只搬迁已批准语义，并显式协调 active changes

- `add-height-weather-shaping`：当前 Legacy evaluator 的最终高度/天气语义作为整体移动；W2 不复制、重命名或调参其数学链。
- `add-height-ambient-tint`：当前光学/环境染色进入 common render closure，三种 bundle 使用同一份源片段，避免三份实现漂移。
- `add-stratocumulus-cumulus-breakup`：W2 不引入第三套 breakup，也不实现其尚未形成的 proposal。

开始实施前必须记录源基线提交并确认没有未提交的重叠 WGSL 修改。若 active change 在 W2 实施期间继续修改同一源，先把语义变更合入共同源片段，再继续机械拆分；不得在 W2 提交中混入新的视觉参数。

## Performance and WebGPU Cost Model

W2 的预期收益是缩小静态编译闭包和消除不必要的 Realtime 启动创建，不是减少每帧 raymarch 次数：

- Cached/Hybrid cloud 与 ground-shadow pipeline 不再解析/编译完整十属 evaluator；
- Legacy Producer 仍需编译一次完整 evaluator 来生成缓存，这是 W2 期间的必要成本；
- Realtime 完整 render closure 在未选择时没有 GPU module/pipeline 创建成本；
- Cached/Hybrid 切换复用已创建 bundle，不重复编译；
- 不增加 dispatch、render pass、density texture 或缓存分辨率；
- Pipeline objects 常驻会增加少量驱动对象内存，用于换取无切换抖动和可靠回退；W2 记录但不制定跨设备内存门槛。

不能仅用 `shaderSource.length` 或同步 API 返回时间声称优化。证据至少区分 source closure、shader module CPU creation、async pipeline creation latency、首次请求与复用切换；steady-state GPU timing只用于确认没有明显回归。

## Risks / Trade-offs

- **WGSL 片段拆分后声明顺序/依赖遗漏**：用显式 manifest、编译信息和静态 source-closure 测试固定依赖。
- **三份 quality adapter 发生语义漂移**：只让 adapter 实现窄 `densityAtTyped/densityAt`，raymarch/lighting/debug 保持单一 common source。
- **Auto layout 不兼容导致切换错误**：bundle 自己创建 bindings，禁止跨 bundle 复用；用 bundle identity + output generation 失效。
- **异步 Realtime 请求导致请求值与实际画面不一致**：requested/active 分离，active mode 同时驱动 Producer、uniform、render 和 HUD。
- **Hybrid 启动失败影响默认模式**：Cached 为最低回退，Hybrid failure 可见但不破坏 renderer。
- **Legacy evaluator 仍在两个 source closure 中出现**：这是 Realtime 与 Legacy cache 的必要重复组装；二者使用同一源片段，避免数学复制，但拥有独立 GPU modules。
- **拆分本身引入视觉差异**：每个搬迁提交不改函数体；用同场景 Normal/density debug/ground shadow A/B 签核。

## Migration Plan

1. 建立 source manifest 与静态 dependency/forbidden-symbol 检查，先描述当前源图。
2. 抽出 shared ABI、common render/optics 和窄 `densityAt` adapter；保持当前 pipeline 暂时可运行。
3. 建立独立 Legacy cache compute source/module，并让 Adapter 异步 factory 接管创建。
4. 建立 Cached bundle，切换默认回退到该 bundle并完成 bind group/history 验证。
5. 建立 Hybrid bundle，保持默认 Hybrid 画面和现有有界细节。
6. 加入 pipeline manager、requested/active 状态和统计；Cached/Hybrid 启动异步创建。
7. 建立惰性 Realtime bundle，验证首次创建、失败回退、复用切换和销毁。
8. 删除旧巨型 `shaderModule` 对密度质量 pipeline/Legacy cache 的共享；保留无关 pipeline。
9. 完成静态、typecheck/build、视觉与基础 Realtime 验收后才归档 W2。

回滚时可恢复 W1 的单 module 组装和 `qualityMode` runtime dispatcher；Producer seam、缓存 output 与参数 schema 无需回滚。

## Open Questions

无。W3 的 V2 Frame Record、compute entry、bind group/data layout 及资源预算不在 W2 决策范围内。
