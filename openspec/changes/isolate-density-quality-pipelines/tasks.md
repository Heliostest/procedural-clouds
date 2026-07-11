## 0. Approval and baseline gate

- [x] 0.1 用户批准本 proposal、design 与两个 spec delta（2026-07-12）
- [x] 0.2 记录 W2 源基线为 W1 归档提交 `9aa8f60`，并确认 Cached/Hybrid 视觉基线已由项目所有者签核
- [x] 0.3 确认工作区不存在未提交的重叠 WGSL 修改；`add-height-weather-shaping` 与 `add-height-ambient-tint` 当前语义按 design Decision 9 原样搬迁
- [x] 0.4 确认 W2 不实现 Recipe V2、record layout、tile mask、noise atlas、密度数学或新的视觉参数

## 1. Source graph and contracts

- [ ] 1.1 盘点 `shaderSource` 中 shared ABI、cache sampling、Hybrid detail、Legacy evaluator、common render、ground shadow 与 cache writer 的符号依赖，形成显式 source manifest；单独提交
- [ ] 1.2 定义 `DensityQualityKind`、bundle lifecycle、bundle bindings、requested/active selection 与 per-bundle stats contract；不得修改 `CloudParams.qualityMode` 的 0/1/2 schema
- [ ] 1.3 增加 source-closure 静态检查：Cached/Hybrid 禁止 `cloudDensityTyped`、`evalBody`、genus dispatch/完整 Legacy evaluator，Future Recipe V2 manifest 禁止 Legacy evaluator

## 2. Shared WGSL extraction

- [ ] 2.1 抽出 shared Params/Body/Preset ABI、基础数学与通用 bindings；所有 CPU/WGSL offset 和 bind group 语义保持一致
- [ ] 2.2 抽出 common cloud optics、raymarch、light-march 和 density debug source；它们只依赖统一 `densityAtTyped()/densityAt()` 签名；单独提交
- [ ] 2.3 抽出 cache sampling adapter 与现有 bounded Hybrid detail adapter；Cached 不含 detail，Hybrid 只在非空 cache 基底上执行现有细节
- [ ] 2.4 抽出 Legacy evaluator source closure；函数体、十属顺序、active 高度/天气塑形、噪声与合并语义不得改变

## 3. Legacy cache compute isolation

- [ ] 3.1 建立 `Legacy evaluator + cache writer` 专属 shader source/module，不包含 cloud render、ground-shadow 或 quality adapter entry
- [ ] 3.2 将 Legacy compute pipeline 改为 Adapter 私有异步 factory/初始化，不再接收 renderer 共享 `GPUShaderModule`；单独提交
- [ ] 3.3 保持 workgroup constants、scene/storage bindings、dispatch 数、update-rate、wind threshold、ping-pong、revision 与 timestamp pass 顺序不变
- [ ] 3.4 记录 Legacy module/pipeline 创建 latency 与结构化失败原因；不得写入 cache GPU timing

## 4. Cached and Hybrid bundles

- [ ] 4.1 建立 Cached source closure 与 bundle：只含 cache sampling、edge shaping、common render/debug 和密度相关 ground-shadow entry
- [ ] 4.2 建立 Hybrid source closure 与 bundle：在 Cached closure 上只增加现有 bounded detail；不得引用完整 Legacy evaluator；单独提交
- [ ] 4.3 使用 async pipeline creation 创建 Cached/Hybrid cloud render 与 ground-shadow pipelines；Cached 为必需，Hybrid 失败时可回退 Cached
- [ ] 4.4 Bundle 分别拥有 layout-compatible bind group builders；Cached/Hybrid 只消费同一 `DensityCacheOutput`

## 5. Lazy Realtime bundle and atomic selection

- [ ] 5.1 建立独立 Realtime source closure/bundle，复用 Legacy evaluator 源片段和 common render，但不消费 density cache bind group
- [ ] 5.2 启动时保持 Realtime lifecycle=`idle`，不得组装完整 source 或创建 Realtime GPU module/pipeline/bindings
- [ ] 5.3 首次请求 Realtime 时异步创建；candidate 完全 ready 后原子切换，compiling/failed 时保留健康 Cached/Hybrid；单独提交
- [ ] 5.4 ready bundle 在后续模式切换中缓存复用；销毁 renderer 时取消/丢弃候选结果并幂等释放 bundle 自建资源

## 6. Active-mode frame integration

- [ ] 6.1 每帧在 `Producer.prepareFrame()` 前解析 requested/active quality；effective GPU uniform 和 Producer frame input 使用 active quality
- [ ] 6.2 requested=Realtime 但 compiling/failed 且 active=Cached/Hybrid 时继续 cache encode；只有 active=Realtime 后跳过 Producer encode
- [ ] 6.3 active bundle 或 density output generation 变化时重建匹配 bindings，并硬失效 ground-shadow/TAA 等不兼容历史；不得留下悬空引用
- [ ] 6.4 主 raymarch、light-march、所有 density debug 与 transmittance ground shadow 同时使用 active bundle，不得出现跨模式混合

## 7. Diagnostics and HUD

- [ ] 7.1 扩展 `RenderStats`：requested/active quality、各 bundle lifecycle、active generation、创建 latency 与 failure reason
- [ ] 7.2 HUD 同时显示 requested/active/lifecycle/reason；不得继续只显示 `params.qualityMode`
- [ ] 7.3 明确 creation CPU latency、timestamp-query GPU pass timing 与 `not-requested` 状态；不得用 CPU 数值伪装 GPU timing

## 8. Automated validation

- [ ] 8.1 新增并运行 `npm run test:pipeline-isolation`（或同义脚本），验证 source manifest、forbidden symbols、mode entry 与 Future V2 禁止边界
- [ ] 8.2 运行 `npm run test:genus-dispatch`，确认十属 evaluator 映射与顺序未变
- [ ] 8.3 运行 `npm run typecheck` 与 `npm run build`
- [ ] 8.4 静态核对 Cached/Hybrid assembled source 不含完整 Realtime/Legacy evaluator，Realtime 未请求时无 GPU module/pipeline 创建调用
- [ ] 8.5 代码分析确认没有增加 density texture、cloud/ground-shadow pass 数、raymarch/light-march 上限或 cache dispatch 数

## 9. Manual acceptance and handoff

- [ ] 9.1 固定 camera/time/weather/body placement，对 Cached 与 Hybrid 的 Normal、全部 density debug 和 ground shadow 与 W1 基线做 A/B，无明显视觉差异
- [ ] 9.2 默认 Hybrid 启动时确认 requested=active=Hybrid；模拟 Hybrid 创建失败时确认 active=Cached 且画面/原因正常
- [ ] 9.3 请求 Realtime，确认 idle→compiling→ready 状态、切换期间 cache 不停更、ready 后直接密度路径正确；不做 Realtime 性能承诺
- [ ] 9.4 往返切换 Cached/Hybrid/Realtime 并改变 density resolution，确认 bind groups/history 无悬空引用、验证错误或 NaN
- [ ] 9.5 记录各 bundle source closure、首次创建 latency、复用切换和失败诊断；不把结果表述为 W2 steady-state 加速证明
- [ ] 9.6 运行 `openspec validate isolate-density-quality-pipelines --strict --no-interactive`
- [ ] 9.7 W2 完成前不创建或实施 W3 V2 compute/data-layout change
