## 0. Approval and scope gate

- [x] 0.1 用户批准本 proposal、design 与三个 spec delta
- [x] 0.2 确认 W0 owner waiver 提交为 `1c62d25`，只放行架构工作，不代表已有定量性能基线
- [x] 0.3 确认 W1 不实现 V2 shader/Recipe、pipeline 隔离、tile mask、noise atlas 或任何密度数学变化

## 1. Contracts and module boundary

- [x] 1.1 新建 `src/density/contracts.ts`，定义 producer kind、frame input/plan、encode context/result、cache output、stats、availability 与生命周期状态；单独提交
- [x] 1.2 固化 `rgba16float` 双缓存与 R/G/B/A 通道契约；output 只暴露 sampled views/sampler，不暴露 writable texture、storage view、pipeline 或私有 bind group
- [x] 1.3 明确 `prepareFrame → uniform pack → encode → getOutput → consumers` 的单帧调用约束，以及未 prepare、重复 encode、destroyed/failed 状态的有限失败行为

## 2. LegacyDensityAdapter extraction

- [x] 2.1 将 density textures、cache index/valid count、transition timing、wind snapshot 与 update-rate/voxel-motion 调度移入 `LegacyDensityAdapter`；单独提交
- [x] 2.2 将 Legacy cache compute dispatch、storage bind group 与 pass instrumentation 移入 Adapter；保持当前 pipeline、binding、dispatch 和 pass 顺序；单独提交
- [x] 2.3 将 resolution/workgroup 更新、resource generation、content revision 和相关资源重建移入 Adapter；不得改变默认值
- [x] 2.4 将 cacheRan、active body、resolution/workgroup、create/rebuild timing 与 cache timing 映射到 `DensityProducerStats`

## 3. Consumer isolation

- [x] 3.1 主 cloud render 只用 `DensityCacheOutput` 创建 sampled bind group，不再访问 Adapter 内部 density texture/index/pipeline
- [x] 3.2 ground-shadow compute 只用同一 output 创建 sampled bind group，并以 resource generation/content revision 驱动历史失效；单独提交
- [x] 3.3 Normal 与所有 density debug 视图继续经现有 `densityAtTyped()/densityAt()` 消费同一 sampled output，不改 WGSL 数值语义
- [x] 3.4 静态审查 `renderer.ts`：除 contracts 允许的 output 字段外，不保留直接 density producer 内部资源访问

## 4. Selector, V2 slot, and runtime status

- [x] 4.1 新增 `RecipeDensityV2Adapter` typed unavailable 槽位；不得创建任何 V2 GPU 资源，reason 固定可诊断
- [x] 4.2 新增 selector：默认 Legacy；请求 V2 时若 unavailable/创建失败，原子回退 Legacy 且不销毁健康 Legacy output；单独提交
- [x] 4.3 `CloudParams`、GUI 与 i18n 增加 CPU-only `densityProducerMode`；不得写入 `PARAM_OFFSETS`/WGSL `Globals`
- [x] 4.4 HUD/`RenderStats` 同时显示 requested producer、active producer 和 fallback reason；不得只显示用户请求值
- [x] 4.5 Realtime 下跳过 Producer encode，继续使用现有直接密度路径；不得创建单独 Realtime Producer

## 5. Resource lifecycle and failure handling

- [x] 5.1 为 Producer 和 Renderer 增加幂等 `destroy()`，释放本模块创建的 texture/buffer/query/bindings 引用并阻止销毁后继续使用
- [x] 5.2 监听/传递 `device.lost`：Producer 标为 invalid、停止编码并记录原因；完整 renderer/device 自动重建留待独立 change
- [x] 5.3 覆盖 resolution、workgroup、producer request 与 fallback 切换，确认 consumer bind group 不引用旧 generation，且无健康 Legacy 资源被失败 V2 请求破坏

## 6. Validation and handoff

- [x] 6.1 运行 `npm run typecheck` 与 `npm run build`
- [x] 6.2 运行 `npm run test:genus-dispatch`，确认十属 evaluator 和现有 density shader 语义未改
- [x] 6.3 代码分析确认 Legacy Cached/Hybrid 的 update-rate、wind threshold、ping-pong index、cacheBlend、dispatch 数与 pass 顺序保持一致
- [ ] 6.4 人工 A/B：Legacy + Cached/Hybrid 的 Normal 与 density debug 无明显视觉差异；当前自动验证环境无 WebGPU adapter，等待项目所有者在实际 WebGPU 页面签核
- [ ] 6.5 请求 Recipe V2，确认 UI/HUD 显示 requested=V2、active=Legacy、reason=not implemented，画面仍由 Legacy 正常输出；代码路径与 HUD 已完成，等待实际 WebGPU 页面签核
- [x] 6.6 静态验证 Realtime 基础兼容：`qualityMode=2` 时 plan 跳过 cache encode 并保留现有直接密度路径；不做性能验收
- [x] 6.7 运行 `openspec validate add-density-cache-producer-seam --strict --no-interactive`
- [x] 6.8 W1 完成前不创建或实施 W2 pipeline isolation change
