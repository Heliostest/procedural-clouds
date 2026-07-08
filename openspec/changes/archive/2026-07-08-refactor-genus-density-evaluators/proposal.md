# Change: Refactor cloud density into per-genus WGSL evaluators

## Why

当前十个云属共用 `evalBody()` 中的一条通用 Perlin/Voronoi 密度链，云属差异主要来自参数。继续在这条链中加入卷云纤维、积云对流塔、积雨云顶部结构等专属形态，会让分支、参数和回归面持续扩大，也难以单独验证某一云属。

项目的云属集合固定为 WMO 十属，适合用一个显式 dispatcher 将每个云属路由到独立 WGSL 密度函数。这样每条链短、性能边界明确、视觉回归可以按云属隔离，同时仍可共享 Perlin、Voronoi、Curl、包络和密度组合等底层算子。

## What Changes

- 为十个现有云属建立一一对应的 WGSL 密度求值入口，并由单一 dispatcher 按云属索引选择。
- 将云体公共准备步骤、噪声函数和密度组合函数保留为共享基础算子；云属函数负责组织自身形态链，不复制底层噪声实现。
- 先执行机械迁移：各云属入口复现当前通用密度链，不在本变更中重新标定视觉参数或引入新形态。
- 保持 `cloudDensityTyped()`、多云体合成、主导/次级云属元数据、三种质量模式、后置边缘塑形和光照积分的既有下游契约。
- 增加十属 dispatcher 完整性、运行时 WGSL 编译、质量模式一致性、视觉基线和 GPU 成本验证。
- 明确后续扩展边界：卷云纤维、花椰菜对流塔等由相应云属函数演进；雨幡/降水场和台风/风切变场必须另立能力与提案。

## Impact

- Affected specs:
  - new `cloud-morphology`
  - existing `cloud-presets` and `cloud-rendering` contracts remain behaviorally unchanged
- Affected code after approval:
  - `shaders/cloud.wgsl`
  - `shaders/noise.wgsl`
  - new per-genus WGSL source files under `shaders/genus/`
  - `src/renderer.ts` or a focused shader-source assembly module
  - verification scripts/docs as required
- Compatibility:
  - no `CloudBody` or scenario schema change
  - no preset field or GPU buffer layout change
  - no density cache format, quality-mode or lighting contract change
- Coordination:
  - implementation overlaps `add-physical-wind-advection` and `per-preset-lighting` in `shaders/cloud.wgsl`; implementation MUST start from their completed state or explicitly rebase their final contracts before editing
- Approval status: proposal only; implementation MUST NOT begin until the user approves this change
