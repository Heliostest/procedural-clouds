## Context

当前缓存生产并不是一个独立模块，而是散落在 `createRenderer()` 闭包中：

- `computePipeline` 同时由 renderer 创建和在 workgroup 变化时重建；
- `densityTextures`、`cacheIndex`、`cacheValidCount`、wind snapshot 和时间混合全部由 renderer 管理；
- cache compute 的 storage bind group 每次更新时由 renderer 建立；
- 主 raymarch 和地面云影分别直接用同一对 texture 建立自己的 sampled bind group；
- `cacheWillRun` 同时影响参数打包、地面云影刷新、timestamp 和 HUD stats；
- 没有统一 destroy/device-loss 边界，也没有 requested producer 与 active producer 的区分。

如果只新增一个返回现有 bind group 的薄包装，renderer 仍然知道纹理、pipeline、索引和调度细节，后续 V2 仍需修改所有调用方。W1 因此必须移动“缓存生产资源与状态”的所有权，同时保持消费者的 WGSL binding 和缓存数值不变。

## Goals / Non-Goals

### Goals

- 建立一个对 renderer 有深度的缓存生产边界，而不是类型别名。
- 让 Legacy 成为可单独创建、准备、编码、resize、统计和销毁的 Adapter。
- 让主渲染、地面云影和 debug 只依赖稳定输出契约。
- 让 V2 请求在尚未实现时安全、可见地回退 Legacy。
- 保持 Cached/Hybrid 的缓存数值、时间混合、更新条件和 pass 顺序不变。

### Non-Goals

- 不改变密度数学、shader 调用图或缓存通道。
- 不隔离三种 quality pipeline。
- 不设计 Recipe 数据、V2 record 或空间剔除。
- 不为 device loss 重建整个 renderer。
- 不证明性能等价；W0 定量基线仍未采集。

## Decisions

### Decision 1: Producer 拥有生产状态，consumer 只拥有消费绑定

建议模块结构：

```text
src/density/
├── contracts.ts
├── legacyDensityAdapter.ts
├── recipeDensityV2Adapter.ts
└── densityProducerSelector.ts
```

Producer 拥有：

- 两张 density `GPUTexture` 与 storage view；
- cache index、valid count、更新时间和 blend 状态；
- wind snapshot 与“移动超过半/一 voxel”刷新判断；
- Legacy compute pipeline 引用、storage bind group 和 dispatch；
- resolution/workgroup 变化后的生产资源重建；
- cache pass 的 `cacheRan`、sample/revision 和错误状态；
- 自己创建的所有 GPU 资源的销毁。

Consumer（renderer / ground shadow / debug）只拥有基于 `DensityCacheOutput` 创建的 sampled bind group。Consumer 可以知道公开的 texture format/channel contract，但不得知道当前写入 index、storage view、compute pipeline 或 Adapter 私有 bind group。

### Decision 2: 最小 Interface 包含 frame plan，而不是让 renderer 重新实现调度

概念 TypeScript contract：

```ts
interface DensityCacheProducer {
  readonly kind: DensityProducerKind;
  prepareFrame(input: DensityFrameInput): DensityFramePlan;
  encode(encoder: GPUCommandEncoder, context?: DensityEncodeContext): DensityEncodeResult;
  getOutput(): DensityCacheOutput;
  setResolution(resolution: number): void;
  setWorkgroup(size: readonly [number, number, number]): void;
  getStats(): DensityProducerStats;
  handleDeviceLost(reason: GPUDeviceLostInfo): void;
  destroy(): void;
}
```

`DensityFrameInput` 是只读语义输入，至少包含：

- 当前 `CloudParams` 或其缓存相关快照；
- bodies、lifecycle mods 和 wind samples；
- elapsed/scene time 与场景 revision；
- quality mode、cache update rate、smooth、resolution/workgroup 请求。

`prepareFrame()` 必须返回 `DensityFramePlan`，至少包含：

- `willEncode`；
- 当前 `cacheBlend`；
- `contentWillChange`；
- active producer 与 fallback 状态。

renderer 需要先取得 `cacheBlend` 才能写现有 Params uniform，因此顺序明确为：

```text
selector.resolve(requested producer)
→ producer.prepareFrame(input)
→ renderer 按 framePlan.cacheBlend 打包现有 uniform
→ producer.encode(commandEncoder)
→ producer.getOutput()
→ ground shadow / cloud render / debug 消费 output
```

`encode()` 只向调用方提供的 command encoder 追加 pass，不得自行 `queue.submit()`。同一帧不得重复 encode；未经过 prepare、producer 已失败/销毁或 Realtime 跳过缓存时必须返回明确状态而不是编码陈旧 pass。

### Decision 3: 输出契约保持当前 RGBA16F 双缓存协议

`DensityCacheOutput` 至少暴露：

```ts
interface DensityCacheOutput {
  format: 'rgba16float';
  resolution: readonly [number, number, number];
  sampledViews: readonly [GPUTextureView, GPUTextureView];
  sampler: GPUSampler;
  cacheBlend: number;
  resourceGeneration: number;
  contentRevision: number;
  validSampleCount: number;
  valid: boolean;
}
```

通道语义冻结为：

| 通道 | W1 语义 |
|---|---|
| R | density |
| G | dominant genus index |
| B | secondary genus index |
| A | secondary genus blend weight |

`sampledViews` 的顺序与现有 `densityTex0/1`、`cacheBlend` 语义一致。`resourceGeneration` 在 texture/sampler/producer 身份变化时递增，consumer 据此重建 bind group；`contentRevision` 在一次新 cache 内容被编码时递增，供地面云影历史失效。两者不得混成一个“每帧都变”的计数。

Producer 不公开 `GPUTexture`、storage view、storage bind group 或 compute pipeline，避免 consumer 获得写权限或依赖实现布局。

### Decision 4: Legacy Adapter 是行为搬迁，不是 shader 重写

W1 允许 Legacy Adapter 复用当前合并 `cloud.wgsl` 创建的 compute pipeline 和现有 scene inputs。W2 才负责拆 shader module/pipeline。Legacy 私有 construction context 可以接收 device、pipeline、params/weather/preset bindings 和 timestamp instrumentation，但这些不是 `DensityCacheOutput`，也不得被 consumer 访问。

必须保持：

- `qualityMode !== realtime` 才允许 cache pass；
- update-rate 或 wind motion 超阈值触发更新；
- cache index 翻转和 valid-count 时机；
- transition duration、smooth 与 blend 数值；
- dispatch workgroup 计算；
- cache 更新同帧先于 ground shadow 和 cloud render；
- resolution/workgroup 变化后的重建和 history invalidation；
- `rgba16float` 写入值及 genus 通道不变。

不得为了“接口更干净”在 W1 改写 `cloudDensityTyped()`、改变 bind group 编号或拆分 shader source。

### Decision 5: Producer selector 与 quality mode 正交

两个选择轴：

```text
densityProducerMode: Legacy / Recipe V2
qualityMode: Cached / Hybrid / Realtime
```

- Legacy + Cached/Hybrid：由 Legacy Adapter 生产缓存。
- Recipe V2 + Cached/Hybrid：W1 中 V2 unavailable，selector 保持/切回 Legacy。
- 任意 Producer request + Realtime：继续使用当前直接密度求值并跳过 cache encode；W1 不创建 Realtime Producer。

`densityProducerMode` 是 CPU-only 参数，不写入 `Globals` uniform，也不占用 `PARAM_OFFSETS`。UI/HUD 必须区分 requested 与 active，避免“用户选了 V2”被误认为 V2 已运行。

### Decision 6: V2 槽位是 typed unavailable，不是空 GPU pipeline

`RecipeDensityV2Adapter` 在 W1 只提供创建结果/能力状态：

```text
available = false
reason = recipe-v2-not-implemented
```

它不得创建 shader module、pipeline、buffer、texture 或 dispatch 空 compute。Selector 请求 V2 时先验证 availability；只有拿到 valid output 后才能原子切换 active producer。失败时保持 Legacy output，不销毁健康的 Legacy Adapter。

### Decision 7: 失败、device loss 与销毁语义显式化

- Adapter 创建失败：返回结构化 error；selector 回退 Legacy。
- V2 prepare/encode 失败：不得发布半初始化 output；丢弃该次切换并记录 fallback。
- Legacy 失败：标记 producer unavailable，由 renderer 显示诊断；不得假装产生有效缓存。
- device loss：所有 producer 标记 invalid，停止编码并释放可释放的 JS/GPU 引用；完整 device/renderer 重建不在 W1。
- `destroy()` 必须幂等；销毁后 `prepareFrame/encode/getOutput` 不得继续返回看似有效的资源。
- producer 切换前，旧 output 的 consumer bind group 必须失效；只有新 output 已验证后才能销毁不再需要的旧资源。W1 中 Legacy 常驻，因此 V2 请求失败不会造成资源抖动。

### Decision 8: 统计区分 requested、active 与实际 cache pass

`DensityProducerStats` 至少包含：

- requested/active producer；
- availability 与 fallback reason；
- cache ran、cache sample/content revision；
- resolution、workgroup、active body count；
- resource generation；
- create/rebuild CPU timing；
- 已有 cache GPU timing（可用时）或 unavailable reason。

W1 不把 CPU timing 填入 GPU timing，也不因 W0 owner waiver 声称性能等价。

## Risks / Trade-offs

- **Interface 过宽**：直接传全部 `CloudParams` 易把未来 V2 与旧 schema 绑定。W1 先用只读 frame input 保持迁移可行，W3 再定义 V2 record；consumer output 必须保持窄。
- **Interface 过薄**：若调度仍留在 renderer，Seam 没有深度。通过移动 ping-pong、wind threshold、blend 和 dispatch 所有权避免。
- **合并 shader 限制抽离**：Legacy 暂时仍依赖同一 shader module和 scene bindings；将其标记为 Adapter 私有 construction context，由 W2 继续拆分。
- **bind group 重建遗漏**：使用 `resourceGeneration` 作为唯一重建触发，并覆盖主 render 与 ground shadow 两个 consumer。
- **切换时历史污染**：使用 `contentRevision/resourceGeneration` 触发地面云影与相关历史硬失效。
- **无性能数字**：本 Wave 只做结构、画面和调度核对；性能结论延迟到实际采集 timing 后。

## Migration Plan

1. 先建立 contracts 与输出通道常量，不改 renderer 行为。
2. 抽出 Legacy 资源、调度和 encode；保持 renderer 仍只激活 Legacy。
3. 将主 render、ground shadow、debug 的采样绑定改为从 output 创建。
4. 加入 selector、V2 unavailable 槽位和 CPU-only GUI 参数；默认 Legacy。
5. 补齐 stats、destroy/device-loss 状态和 fallback 诊断。
6. 完成静态、typecheck/build、调度与人工视觉核对后，才可标记 W1 完成。

回滚时删除 selector/contracts 并把 Legacy Adapter 内容移回 renderer；缓存格式、shader 和数据 schema 无需迁移。

## Open Questions

- 无。V2 Frame Record、独立 V2 pipeline 和 Recipe 数据布局属于 W3；Cached/Hybrid/Realtime shader 隔离属于 W2。
