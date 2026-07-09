## Context

`evalBody()` 当前先构造 `GenusEvalContext`，运行一次 `evalCompatibilityGenus(ctx)`，再把标量 `compatibilityDensity` 交给唯一 dispatcher。十个 evaluator 都是标量直通函数。上一次重构已经实测：把完整上下文传过十个分支会触发浏览器 WGSL 编译器的病态内联和初始化卡死，因此本变更不能简单恢复 `evalGenusDensity(ctx, genusIndex)`。

现有兼容链已经提供足迹、垂直剖面、Perlin/Voronoi 基础密度、平底、顶部截断和砧顶。新形态应在两个目标 evaluator 内增量重塑这份密度，而不是一次重写所有云属。

## Goals / Non-Goals

### Goals

- 让 cirrus 在正常视距下呈现可辨的细长纤维、弯钩和分叉，而不是普通薄云碎片。
- 让 cumulonimbus 中上层呈现多个相互并合的对流塔和花椰菜分瓣，同时保留平底与砧顶。
- 证明单属 evaluator 可以独立演进，并保持其他八属、下游渲染和物理风契约不变。
- 控制 WGSL 编译体积和运行成本，避免再次出现初始化卡死。

### Non-Goals

- 精确模拟冰晶微物理、浮力、潜热、湍流 LES 或真实对流单体生命周期。
- 让纤维自动读取台风/风切变场；本变更只使用云体局部坐标和现有累计平流。
- 用新形态参数表达 precipitation、virga、mammatus 或 species 状态机。

## Decisions

### D1: 只扩展两个 evaluator，兼容密度作为可回退基底

`evalCirrus()` 与 `evalCumulonimbus()` SHALL 接收 `compatibilityDensity`、世界采样位置 `pos` 和 `bodyIndex`。它们 MAY 调用一个只为目标属准备轻量输入的共享 helper，或重新调用坐标准备函数；其余八个 evaluator 继续只消费 `compatibilityDensity`。

dispatcher 仍只负责路由：cirrus/cumulonimbus case 调用扩展签名，其余 case 调用标量签名。属专属公式 MUST 位于各自 WGSL 文件，不能进入 dispatcher、`evalBody()` 或 `evalCompatibilityGenus()`。

新增强度为 0 时，两个 evaluator SHALL 原样返回 `compatibilityDensity`。这一早退必须位于任何新增噪声采样之前，使关闭能力同时恢复观感和成本。

### D2: 卷云使用局部轴向的各向异性纤维场

卷云纤维以旋转后的云体局部坐标为基础：局部 X 作为主延伸轴，局部 Z/Y 作为较高频的横向截面。低频 curl/domain warp 只弯曲采样坐标，多频解析 ridge carrier 形成多条细丝；最终纤维 mask 与兼容密度及原足迹/垂直包络组合，不能在云体和 weather footprint 外生成密度。解析载波避免为每次密度求值再次内联 Blender FBM 循环。

总体方向由既有 body rotation 决定。物理风 offset 继续在公共准备阶段平移整个形态；不得从累计 offset 反推风向，因为 t=0、重置和平静风时该方向不稳定。若未来需要随高度风切变拉丝，应由独立 flow-field proposal 提供稳定方向场。

`cirrusFiberStrength` 控制兼容密度与纤维重塑结果的混合；`cirrusFiberCurl` 控制弯曲幅度。尺度和纵横比优先从既有 `scale/detail` 与固定有界常量派生，避免为首版增加更多布局字段。

### D3: 积雨云使用高度门控的多胞元对流塔

积雨云在中上层计算低成本 3D cell/ridge 信号，将若干竖直拉长的胞元与兼容密度做有界 soft union，并用 `profileLocal` 形成从主体到塔顶的高度门控。胞元横向尺度随高度收窄或分裂，形成对流塔和花椰菜边缘；结果仍乘原 weather footprint、实例垂直区间和生命周期/密度调制。

`convectiveTowerStrength` 控制新增塔状结构的贡献；`convectiveCellScale` 控制胞元尺度。现有 `anvilStrength` 仍只负责高层水平扩张，`topCutoffSharpness` 仍负责顶部截断，`baseRoundness` 仍负责底部轮廓。新算法 MUST 与三者组合，不能复制或重新定义它们。

### D4: 新增一个完整 preset vec4

GPU preset 布局由 6 个扩为 7 个 `vec4`。新 `p6` 固定映射：

- `p6.x = cirrusFiberStrength`
- `p6.y = cirrusFiberCurl`
- `p6.z = convectiveTowerStrength`
- `p6.w = convectiveCellScale`

CPU `PRESET_VEC4_COUNT`、float/byte size、packing、WGSL `PresetShape`/morphology accessor 与布局断言必须同步更新。十个 preset 都必须显式填写四项；只有 cirrus 的前两项和 cumulonimbus 的后两项默认非零。参数规范化范围为 `[0,1]`，精确默认值在固定场景 A/B 后校准并记录。

不复用 `p5`，因为其四个分量已有 edge/morphology 稳定契约；也不把参数塞入 BodyGPU reserved 字段，因为这些是 genus preset，而不是每体动态状态。

### D5: 形态保持在统一密度与缓存契约上游

两个 evaluator 仍只返回单云体有限非负密度。多体 soft union、主导/次级 genus metadata、cached/hybrid/realtime 入口、self-shadow、edge-style、地面云影和按属光照均沿现有路径消费结果。

Cached、Hybrid 与 Realtime MUST 表示相同的基础形态；允许的差异仅来自既有缓存分辨率和实时细节策略。不得为了性能在某质量模式完全关闭纤维或对流塔而造成属语义变化。

### D6: 以编译健康和性能预算约束噪声复杂度

首版每个目标 evaluator 的新增噪声调用保持有界，不引入循环次数随参数变化的算法。实现必须先做最小 shader compile spike，再完成视觉调参。

验收目标：

- 浏览器初始化无 WGSL validation error、长时间 compile stall 或 device loss；
- 其他八属默认场景 GPU 中位数回归不超过 3%；
- 目标属 Hybrid 稳态 cloud pass 保持项目 1080p `4–6 ms` 预算；
- 目标属 cache rebuild 与 Realtime 增量分别记录，若相对基线超过 25% 与 20%，必须优化或在归档记录中给出经用户接受的理由。

## Risks / Trade-offs

- 各向异性纤维在低分辨率 density cache 中可能被抹平。缓解：先选择不低于体素 Nyquist 的横向频率，再比较 Cached 与 Realtime；不能仅靠无限提高 cache 分辨率。
- 对流胞元的正密度 union 可能让云体膨胀过度。缓解：强制 weather footprint、垂直门控和非负有限 clamp，并用正常/密度调试双视图校准。
- 新增 p6 会扩大 preset buffer。缓解：一次增加完整 vec4，保留明确布局断言；不改变 scenario 或 body schema。
- 两套新增噪声会增大 shader。缓解：复用现有 noise primitives、零强度早退、最小输入 dispatcher，并把编译时健康列为阻断验收。
- 只用 body rotation 定向不等同真实高空风切变。缓解：明确这是可控艺术方向；稳定 flow field 后再单独组合。

## Migration Plan

1. 冻结一组 cirrus 与一组 cumulonimbus 的相机、云体、时间、旋转和三质量模式基线，记录 GPU timing。
2. 扩展 preset 类型、p6 packing/WGSL accessor 和布局验证；全部新增强度先为 0，证明十属观感不变。
3. 让 dispatcher 只为两个目标属传最小输入，完成浏览器 WGSL compile spike。
4. 先实现 cirrus 纤维，再实现 cumulonimbus 对流塔；每一步独立做强度 0/1 A/B 和性能记录。
5. 校准目标 preset 默认值，验证三质量模式、物理平流、body rotation、光照/edge/ground-shadow 下游契约。
6. 更新 roadmap/术语和验收记录，通过严格 OpenSpec 后归档。

回退按两级执行：先把四项默认值设为 0；若仍有编译或布局问题，再恢复 6-vec4 packing 和两个标量直通 evaluator。没有持久化数据迁移。

## Open Questions

- cirrus 首版是否需要一个显式纤维纵横比参数，还是由 `scale/detail` 派生已足够？默认先派生，只有固定场景无法同时兼顾粗细与数量时才扩展参数。
- cumulonimbus 对流塔是否需要按生命周期强度自动增强？本提案默认只随现有 morph time 动画，不新增生命周期到形态强度的映射。
