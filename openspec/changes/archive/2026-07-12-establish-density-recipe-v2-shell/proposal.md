# Change: 建立 Density Recipe V2 的空 Compute 闭环与固定数据布局

## Why

W1 已建立 `DensityCacheProducer` seam，W2 已把 Cached、Hybrid、Realtime 与 Legacy cache compute 的 shader/pipeline 生命周期隔离；但 `RecipeDensityV2Adapter` 仍只是 `recipe-v2-not-implemented` 占位符。当前没有 V2 自有的 CPU/WGSL record、GPU buffer、compute module、双缓存资源或可验证的切换生命周期，因此 W4 的 tile mask、W5 的共享 atlas 和 W6 的双属形态 Spike 都没有稳定承载面。

W3 先建立一个数值上故意为空、结构上完整的 Recipe V2 Producer。它必须能独立创建、打包、dispatch、resize、切换和销毁，并写出与 Legacy 完全相同的 RGBA16F 缓存协议；同时把 Placement、Density Recipe 与 Optical Profile 分离为三条正交数据轴。W3 不实现任何云属密度算子，避免在数据布局尚未锁定前把新形态、tile 剔除或 noise atlas 混入基础设施。

## What Changes

- 将 `RecipeDensityV2Adapter` 从 typed-unavailable 占位符升级为惰性创建的 `DensityCacheProducer` 候选；默认 Legacy 启动时不得创建 V2 shader、pipeline、buffer、texture 或 pass。
- 建立 V2 自有 WGSL module、显式 bind-group/pipeline layout、Frame/Body/Recipe buffers、RGBA16F ping-pong 3D textures、storage bindings 和幂等资源生命周期。
- 定义固定、16-byte 对齐的 `DensityFrameGPU`、`DensityBodyGPU` 与 256-byte `DensityRecipeGPU`；字段、字节偏移、stride、枚举和保留槽位由集中描述符驱动并接受机器可读检查。
- 建立十属静态 Recipe 表。W3 只记录 genus identity、预期 topology/profile 模式、独立参数槽和固定成本上限；所有记录保持 disabled，不引入运行时 operator list、任意 graph 或 shader interpreter。
- 保持 Placement、Density Recipe、Optical Profile 正交：V2 placement buffer 只携带云体空间/运输/生命周期输入，Recipe record 不复制物理高度 placement 或光学系数，既有 Optical preset 继续由渲染阶段按缓存 genus metadata 消费。
- 新增专用空密度 compute entry：在有效体素范围内只写 `vec4f(0.0)`，不遍历 body、不读取 Recipe 参数、不采样天气/噪声/atlas，也不引用 Legacy 4D Voronoi、4D fBm、genus evaluator 或 cache writer source closure。
- V2 输出继续使用双 `rgba16float` 3D sampled views、`cacheBlend`、R=密度/G=主属/B=次属/A=次属混合权重、resource/content revision 与现有调度语义；零密度缓存仍是 valid output，不等同于 Producer failure。
- 扩展 Producer selector 的候选生命周期和 active generation。V2 首次请求时 Legacy 继续 active；候选创建并成功为当前输入编码零缓存后才原子切换，失败则保留 Legacy。
- Producer 身份切换必须驱动 Cached/Hybrid bind group 与地面云影/TAA 历史失效，不能因 Legacy 与 V2 的局部 `resourceGeneration` 数值相同而复用旧输出。
- 增加 V2 source closure、record layout、十属表、非法 genus、无云/单体零输出、resize/workgroup、切换/回退、资源销毁和 GPU 成本边界的自动与人工验收。

## Non-Goals

- 不实现 Stratiform、Billow、Cellular、Fiber、Wave/Lens、Convective、Erosion 或 Attachment 的实际密度数学。
- 不迁移任何云属到 V2；选择 V2 时所有云体都按设计输出零密度，默认 Producer 仍为 Legacy。
- 不实现 W4 tile-body mask、active-body 剔除、occupied-tile compaction、indirect dispatch 或 evaluator 调用统计。
- 不实现 W5 3D noise atlas、2D macro fields、weather field 重建或多频率资源更新。
- 不修改 Cached/Hybrid raymarch、光照、地面云影、TAA、Bloom、缓存格式、默认分辨率或默认 workgroup。
- 不实现通用 operator graph/interpreter，不允许动态长度算子数组或按记录循环执行任意操作。
- 不引入 `shader-f16`、subgroups、workgroup shared-memory 优化或新的 required WebGPU feature。
- 不删除、简化或改变 Legacy evaluator；Realtime 继续是独立可选兼容路径，不承担 W3 性能目标。

## Capabilities

### New Capabilities

- `density-recipe-schema`：Recipe V2 的固定 CPU/WGSL 数据布局、三轴职责边界、十属静态表与静态成本约束。

### Modified Capabilities

- `density-cache-production`：Recipe V2 从 unavailable 槽位升级为可惰性创建、可先行编码零缓存并原子成为 active 的独立 Producer。

## Prerequisites and Conflicts

- W1 已归档于 `openspec/changes/archive/2026-07-11-add-density-cache-producer-seam/`，基线提交为 `9aa8f60`。
- W2 已归档于 `openspec/changes/archive/2026-07-11-isolate-density-quality-pipelines/`，基线提交为 `3e5fd15`；W3 MUST 保持其 source-closure 与 bundle binding 边界。
- W0 `establish-density-v2-baseline` 已由项目所有者人工签核，但仍没有定量 GPU timing 包；W3 可以做结构性和视觉结论，不得声称 V2 已有性能收益。
- `add-height-weather-shaping` 只作为 Legacy 语义基线；W3 不把旧噪声链或同名参数复制到 V2 record。
- `add-height-ambient-tint` 属于 Optical/Lighting，W3 不把它并入 density compute。
- `add-stratocumulus-cumulus-breakup` 尚无实施任务；W3 不实现第三套 breakup，目标由后续 Cellular/Variant Wave 处理。
- W4、W5 与 W6 必须分别建立新 OpenSpec change；W3 的 reserved lanes、bind-group 扩展点和 source manifest 只是承载接口，不构成后续能力授权。

## Impact

- **代码**：预计修改 `src/density/contracts.ts`、`densityProducerSelector.ts`、`recipeDensityV2Adapter.ts`、`src/renderer.ts` 与 HUD；新增 V2 layout/packer/recipe table/pipeline factory、专用 WGSL 和静态检查脚本。
- **GPU 资源**：默认 Legacy 路径为零新增 V2 GPU 资源。首次请求 V2 后会暂时同时持有 Legacy 与 V2 双缓存；默认 `96³ × rgba16float × 2` 的 V2 输出约 13.5 MiB，必须在 stats 中报告估算字节数和峰值共存状态。
- **GPU 工作量**：V2 active 时每次缓存更新仍 dispatch 全体素网格，但每个有效体素只有边界判断和一次 `textureStore(vec4f(0))`；不得包含 body loop、texture sample、noise、atomics 或额外正常帧 pass。
- **视觉**：默认 Legacy 无视觉变化。显式选择 W3 Recipe V2 时正常视图应保留天空/地面但没有云，density debug 为零，地面云影为全透射；这属于 W3 的有意空输出，不是渲染黑屏。
- **兼容性**：`densityProducerMode` 的 Legacy/Recipe V2 数值保持不变；CloudBody、scenario、preset、Params uniform、缓存消费者和 RGBA 通道无需迁移。

## Approval Gate

本 change 只授权 W3 空 Compute、固定数据布局与安全切换。批准前不得创建 V2 GPU 资源或修改 selector；批准后也不得提前实现 W4–W6 的剔除、atlas 或云属密度算子。
