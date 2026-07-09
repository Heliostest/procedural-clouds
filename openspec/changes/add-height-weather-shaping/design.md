## Context

参考：`MiniVerse/reference/glsl/sky_ocean_sun_buffer_a.glsl` 的 `clouds()`：

```
largeWeather = remap(tex(p*ε))
weather = largeWeather * remap(tex(p*δ))
weather *= smoothstep(0,0.5,h) * smoothstep(1,0.5,h)
cloudShape = pow(weather, 0.3 + 1.5*smoothstep(0.2,0.5,h))
den = cloudShape - 0.7*fbm(p*0.01)
den = den - 0.2*fbm(p*0.05)   // non-fast
```

heli 现状：`localCoverage` 来自单次 weather SDF 采样；垂直靠 altitude mask / cutoff / `vEnvelope` / `baseRoundness`，coverage 本身几乎不随 `h` 改变幂次响应。

## Goals / Non-Goals

- Goals：低成本改善垂直塑形与团块侵蚀；可 A/B；不拆属架构。
- Non-Goals：13.1 全量密度重建；第二张天气纹理；改光照。

## Decisions

- **Decision: 落在兼容密度链，不落属 evaluator**  
  十属（含纤维/塔/tile 叠层）都经兼容链拿基础密度。塑形放 `evalCompatibilityGenus()`，属专属公式继续叠在其后/其侧，避免十份拷贝。

- **Decision: `h` = body 实例归一化高度**  
  参考用大气层 `cloudHeight`。heli 用已有 `profileLocal`（或等价 `1-Z`）作 `h∈[0,1]`，与 `altBase/altTop` 契约一致，不用全局盒高。

- **Decision: 双尺度 weather 不新增纹理**  
  细尺度 = 现有足迹 `localCoverage`；大尺度 = 对同一 `weatherTex` 层做更低频 UV 采样，或对运输后 XZ 做 1–2 octave `noise_fbm`。优先低频 weather 采样以保持足迹作者意图；若双线性不足再退到 XZ fbm。

- **Decision: 两级 fbm 侵蚀接在高度塑形之后、既有 Voronoi 链之前或作为可混分支**  
  推荐：`densityShapeModel=1` 时用 `cloudShape` 替换/重权 STAGE1 的 `factorMacro` 输入，再跑现有 STAGE2–5；侵蚀用两次已有 `noise_fbm` 从 `cloudShape` 相减，并在 `≤0` 早退。避免再堆一套完整噪声图。

- **Decision: `densityShapeModel` 开关**  
  `0` = 现路径；`1` = 参考塑形。默认 `1`。不扩 preset；强度系数先写死参考值，不够再加 `Globals` 滑杆。

- **Decision: 光照/缓存路径**  
  密度缓存与 realtime 走同一 `evalCompatibilityGenus`，语义一致。light-march 已采样密度，不另开 `fast` 着色器变体；若打点显示侵蚀过贵，再对 light 路径只跑粗级侵蚀（可选优化，非本变更必做）。

- **Alternatives considered**  
  - 直接做 13.1：成本过高，非本小步。  
  - 只加 `pow` 不加 fbm 侵蚀：实现更小，但团块感提升有限。  
  - 每属复制公式：违背 morphology 边界。

## Risks / Trade-offs

- 与现有 `coverageThreshold` / `vEnvelope` / `edgeCurve*` 叠加可能过空或过实 → 默认校准 + `densityShapeModel=0` 回退。
- 多两次 fbm 增加 cache/realtime 成本 → 早退 + Hybrid 中位数对比，回归预算建议 ≤10% cache、≤5% cloud pass（空旷场景可因早退持平或更好）。
- 13.1 可能替换本路径 → 开关保留，删除成本低。

## Migration Plan

1. 落地开关 + 塑形/侵蚀，默认 `1`。
2. 固定场景截图 A/B，微调写死系数或补一个总强度滑杆。
3. 回退：`densityShapeModel=0`。

## Open Questions

- 大尺度项用低频 weather 采样还是 XZ fbm？（实现时先试低频 weather；足迹断裂再改 fbm。）
