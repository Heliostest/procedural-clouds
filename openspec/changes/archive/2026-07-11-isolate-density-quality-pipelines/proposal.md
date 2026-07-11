# Change: 隔离 Cached、Hybrid 与 Realtime 密度质量 Pipeline

## Why

W1 已把 Cached/Hybrid 密度缓存生产移入 `DensityCacheProducer`，但当前 `src/renderer.ts` 仍把 `noise.wgsl`、完整十属 evaluator、缓存采样、Hybrid 细节、Realtime 直接求值、主 raymarch、地面云影和 Legacy cache compute 拼进同一个 `GPUShaderModule`。`qualityMode` 只是 uniform 运行时分支，因此 Cached/Hybrid 的可达调用图仍静态携带完整 Realtime 密度链，Legacy cache compute 也继续借用 renderer 的共享 shader module。

在开始 W3 的 V2 compute/data layout 前，必须先把质量模式的 shader 闭包、pipeline、bind group 和失败生命周期隔离。否则 V2 即使拥有独立 Producer，仍会被迫接入 Legacy 的巨型渲染模块，无法证明 Cached/Hybrid 已摆脱 Realtime 调用图，也无法让昂贵 Realtime pipeline 真正按需创建。

## What Changes

- 将当前 WGSL 按职责拆成共享 ABI/光学渲染、缓存采样、受限 Hybrid 细节、Legacy 完整密度 evaluator、Legacy cache writer 和质量模式入口等源码片段，并通过显式 source manifest 组装。
- 建立 Cached、Hybrid、Realtime 三个 `DensityQualityPipelineBundle`；每个 bundle 拥有与本模式匹配的 cloud render、密度相关 ground-shadow compute、layout 与 bind group 生命周期。
- Cached source closure 只包含缓存采样；Hybrid 只在缓存基底上增加现有有界细节；二者不得静态包含 `evalBody()`、`cloudDensityTyped()`、十属 dispatcher 或完整 Legacy noise/evaluator 图。
- Realtime 保留当前直接密度语义，但 source、`GPUShaderModule` 和 pipelines 独立，并仅在用户请求 Realtime 时异步创建。
- 将 Legacy cache compute 移到独立 shader module/pipeline factory；允许复用当前 Legacy evaluator 源片段，但不得再复用 cloud render 的 `GPUShaderModule`，也不得把该源片段提供给未来 Recipe V2 compute。
- 增加 requested/active quality mode、pipeline lifecycle、异步创建耗时与失败原因；候选 bundle 完全 ready 后才原子切换，创建期间或失败时保留健康的 Cached/Hybrid bundle。
- 让 Producer 调度使用 active quality mode：Realtime 尚在编译而 active 仍为 Cached/Hybrid 时继续更新缓存；只有 active 真正切到 Realtime 后才跳过 cache encode。
- 增加静态 source-closure 检查、资源切换检查以及 Cached/Hybrid 视觉 A/B；W2 不改变任何密度、光照、步数、缓存格式或默认参数。

## Impact

- Affected specs: `cloud-rendering`、`density-cache-production`
- Affected code: `src/renderer.ts`、`src/density/legacyDensityAdapter.ts`、新增质量 pipeline manager/source manifest 模块、`shaders/cloud.wgsl` 及拆出的 WGSL 片段、`src/main.ts` HUD、`package.json` 与静态检查脚本
- Baseline: W1 归档提交 `9aa8f60`；Cached/Hybrid 视觉和缓存调度以已签核的 W1 6.4/6.5 为准
- Compatibility: 无场景/preset schema 破坏；`qualityMode` 的用户取值保持 Cached=0、Hybrid=1、Realtime=2，但运行时新增 requested/active 状态以表达异步创建与回退
- Performance scope: W2 只建立结构和可测量生命周期，不宣称 steady-state GPU 加速；不得增加 density texture、raymarch pass 或地面云影 pass 数量

## Approval Gate

本 change 只创建 W2 设计与实施契约。批准前不得拆 shader 或创建新 pipeline；W3 Recipe V2 compute、record layout、tile mask、noise atlas 和密度数学不属于本 change。
