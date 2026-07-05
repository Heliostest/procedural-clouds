## 0. Approval gate

- [x] 0.1 用户确认 morphology / edge-style 两个参数域及四象限验收语义
- [x] 0.2 用户确认 `topCutoffSharpness` 命名、per-genus edge-style 策略与 cumulonimbus 默认硬度处理

> 未完成 0.1–0.2 前不得修改实现代码。当前代码是触发本次修订的耦合基线，不视为修订提案已实现。

## 1. Parameter model

- [x] 1.1 在预设模型中增加 `anvilStrength`、`topCutoffSharpness`、`edgeErosionStrength`
- [x] 1.2 将预设字段按 morphology / edge-style 语义分组，同时保持现有六个 `vec4` GPU 布局
- [x] 1.3 增加 CPU/GPU 布局断言，确认 `p5.x/y/z/w` 映射一致

## 2. Shader responsibility split

- [x] 2.1 新增 `presetMorphology()` 与 `presetEdgeStyle()`，移除含混的 `shapeHardness`
- [x] 2.2 `evalBody()` 仅使用 `anvilStrength`、`topCutoffSharpness`、`baseRoundness` 构造宏观密度
- [x] 2.3 `applyEdgeShaping()` 仅使用 edge-style 与全局边缘参数执行传递和解析侵蚀
- [x] 2.4 保证 `edgeSharpening=false` 只旁路后置边缘阶段，不改变密度缓存或积雨云结构

## 3. GUI and documentation

- [x] 3.1 将参数拆入“云属形态”和“边缘渲染”GUI 分组并补齐中英文说明
- [x] 3.2 明确标识形态调整会使缓存失效，边缘调整无需重建缓存
- [x] 3.3 修订 `docs/roadmap-v2.md` 阶段 10 的问题定义、实施记录和验收标准

## 4. Verification

- [x] 4.1 `npm run typecheck` 通过
- [x] 4.2 `npm run build` 通过
- [x] 4.3 `openspec validate sharpen-cloud-edges --strict --no-interactive` 与全量严格校验通过
- [x] 4.4 浏览器完成 morphology 开/关 × edge-style 开/关四象限截图或等价可复核证据
- [x] 4.5 cached、hybrid、realtime 三种模式均满足解耦语义，主行进、光照行进和地面云影一致
- [x] 4.6 记录后置边缘阶段开启/关闭的 GPU 成本，并复查阶梯条纹与银边回归

验证记录（2026-07-05）：898×1908、Hybrid、64+8 步、单积雨云、动画冻结于 t=0。四象限均可独立切换：关闭 edge-style 时砧顶/顶部截断保持，清零 morphology 时开启 edge-style 不会生成砧顶。形态开启时 edge-style 关闭/开启的 cloud pass 约 2.01/2.36ms，增量约 0.35ms；cache pass 约 0.50/0.49ms。Cached、Hybrid、Realtime 均可运行，页面无 WGSL 编译错误或控制台 warning/error；Realtime 在该分辨率约 455ms，仅用于正确性验证。`npm run typecheck`、`npm run build`、单变更和全量 OpenSpec 严格校验全部通过。
