# Change: 增加卷云纤维与积雨云对流塔形态

## Why

十个云属已经拥有独立 WGSL 密度入口，但当前入口仍全部返回同一条兼容密度链，因此云属差异主要来自参数：卷云仍接近薄而破碎的普通体积云，缺少沿单一方向延伸、弯曲的冰晶纤维；积雨云虽然已有砧顶和顶部截断，却缺少由多个上升气流单体组成的塔状隆起与花椰菜轮廓。

这两个现象都属于云体内部的凝结物密度，应分别落在 `evalCirrus()` 与 `evalCumulonimbus()`，是验证“每属一个 WGSL 函数”扩展边界的第一批形态能力。

## What Changes

- `evalCirrus()` 增加沿云体局部主轴排列的各向异性纤维密度，并用低成本 curl/domain warp 形成弯钩和丝缕分叉；云体旋转控制总体走向，物理风继续只负责平流。
- `evalCumulonimbus()` 增加高度相关的对流塔/胞元密度，对中上层轮廓做多尺度隆起和花椰菜分瓣，同时保留既有平底、顶部截断和砧顶扩张。
- 在 preset morphology 中新增 `cirrusFiberStrength`、`cirrusFiberCurl`、`convectiveTowerStrength`、`convectiveCellScale`，并把 GPU preset 布局从 6 个扩为 7 个 `vec4`；非目标云属四项默认均为 0。
- dispatcher 保持唯一属路由点，但只向两个目标 evaluator 传入 `pos/bodyIndex` 等最小输入；不得再次把完整 `GenusEvalContext` 复制进十个分支，也不得把新形态放回 `evalCompatibilityGenus()`。
- 增加零强度回归、两属固定场景 A/B、三质量模式、WGSL 初始化、缓存/实时性能和其他八属隔离验证。

## Non-Goals

- 不实现雨幡、降水拖尾、乳状云或内部闪电。
- 不实现台风螺旋雨带、涡旋拉伸、垂直风切变或流体模拟。
- 不新增 species/variant 字段，不改变 CloudBody 或 scenario JSON schema。
- 不改变光照、edge-style、密度缓存格式、物理风累计平流或 genus metadata 合成语义。
- 不在本变更中重写其余八个云属的兼容密度入口。

## Capabilities

### Modified Capabilities

- `cloud-morphology`：增加 cirrus 方向性纤维与 cumulonimbus 对流塔/花椰菜形态，并约束属内实现与零强度回退。
- `cloud-presets`：增加四个形态参数和第七个 preset `vec4` 的 CPU/GPU 布局契约。

## Prerequisites and Conflicts

- 基于已归档的 `refactor-genus-density-evaluators`；实现 MUST 保持单 dispatcher 和十属具名入口。
- active change `add-global-simulation-speed` 不修改 preset GPU 布局，但共享 `morphTime` 的时间语义；本变更 MUST 使用其统一仿真时间，不得重新引入 wall-time 动画。
- `anvilStrength`、`topCutoffSharpness`、`baseRoundness` 与 edge-style 已有契约继续有效；对流塔只能与这些形态组合，不能接管或旁路它们。

## Impact

- **代码**：`src/params.ts`、`src/gui.ts`、`src/i18n.ts`、`shaders/cloud.wgsl`、`shaders/genus/common.wgsl`、`shaders/genus/dispatch.wgsl`、`shaders/genus/cirrus.wgsl`、`shaders/genus/cumulonimbus.wgsl` 和验证脚本。
- **规格**：修改 `cloud-morphology` 与 `cloud-presets`。
- **内部布局**：preset storage buffer 每属由 24 增至 28 floats；这是内部 GPU 布局变更，不影响保存的 CloudBody/scenario 数据。
- **观感**：cirrus 与 cumulonimbus 默认形态有意改变；其余八属和两项目标属在新增强度为 0 时 MUST 保持现状。
- **回退**：四个新增 morphology 强度/尺度恢复为 0，并将两个 evaluator 返回兼容密度，即可恢复原观感。

- Approval status: proposal only; implementation MUST NOT begin until the user approves this change.
