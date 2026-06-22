## Context

阶段 1 后参数布局（f32 偏移）：`CloudShape` 位于 idx 8 起，当前已用 8..16（density, coverage, altitude, scale, detail, lowAltDensity, factorShaper, factorDetail, cloudHeight），其后 17/18/19 为 pad。`Wind` 在 idx 20，`SceneTime` 在 24。新增形态字段需挤进 CloudShape 区段并重排后续偏移。

`noise.wgsl` 已提供 `noise_fbm(p, detail, roughness, lacunarity, normalize)` 与 `perlin_noise_4d`，可直接用于 `worleyBlend` 的「蓬松感」一侧，无需新增噪声函数。

`cloudDensity()` 现有 5 阶段：高度掩膜 → 宏 Voronoi → 中 Voronoi → 顶部截断 → falloff。新字段需以**最小侵入**接入，且默认值要能复现当前观感（保证未选预设时画面不突变）。

## Goals / Non-Goals

**Goals:**
- `CloudShape` 暴露 coverageThreshold/edgeSharpness/baseRoundness/worleyBlend/detailStrength/altBase/altTop。
- `cloudDensity()` 用新字段调制：边缘锐度、底部曲率、细胞感↔蓬松感、高度带。
- 10 种云属预设表，GUI 下拉切换并平滑插值过渡。
- 四类（cumulus/stratus/cirrus/cumulonimbus）肉眼可辨。

**Non-Goals:**
- 不做空间分布（天气图，阶段 4）——预设仍是全局生效。
- 不做光照分化（absorption/phase/silverLining 等 lighting 字段，归阶段 8）。
- 不做多层共存（阶段 7）、不做风平流（阶段 3）。
- 不实现 anvilSpread/directional/curl/halo 等高级形态特效（仅取密度可表达子集）。

## Decisions

### D1：CloudShape 字段扩展与偏移重排
在 CloudShape 段追加 7 个 f32。CloudShape 当前占 12 槽（48 字节，含 3 pad），扩到需 16 槽（64 字节）。新布局重新推导偏移：
- render @0（8 槽）
- shape @32（idx 8，16 槽 → 64 字节）：density8, coverage9, altitude10, scale11, detail12, lowAltDensity13, factorShaper14, factorDetail15, cloudHeight16, coverageThreshold17, edgeSharpness18, baseRoundness19, worleyBlend20, detailStrength21, altBase22, altTop23
- wind @96（idx 24）
- time @112（idx 28，8 槽）
- 总 = 48 槽（192 字节）

`PARAM_OFFSETS` 与 WGSL 字段顺序同步更新，仍为单一事实来源。

- 备选：新开 `CloudShapeExt` 子结构。否决——徒增嵌套，直接扩 CloudShape 更简单。

### D2：新字段以可关闭方式接入 cloudDensity
- `edgeSharpness`：对 stage2/stage3 的 mapped 结果做 `pow(clamp01(x), mix(1.0, K, edgeSharpness))` 或 smoothstep 收窄过渡带；`edgeSharpness=0` 时退化为原线性。
- `baseRoundness`：stage1 高度掩膜的底部曲率，对 `altMaskRamp` 的输入 `Z` 做幂曲线 `pow(Z, mix(1.0, 平底指数, baseRoundness))`。
- `worleyBlend`：`finalShaped` 的密度结构在「Voronoi 结果」与「`noise_fbm` 结果」之间 `mix(fbmDensity, voronoiDensity, worleyBlend)`，0=蓬松、1=细胞。
- `detailStrength`：调制 stage3 中观 Voronoi 贡献幅度（与现有 detail 协同，detail 控频率/锐度，detailStrength 控幅度）。
- `altBase/altTop`：把现有基于 `altitude` 的高度带替换为 `[altBase, altTop]` 归一化区间约束 falloff 与 cutoff。
- 默认值选取使其复现阶段 1 观感（coverageThreshold≈0、edgeSharpness≈0、baseRoundness≈0、worleyBlend≈1 对应现有 Voronoi 主导、altBase/Top 覆盖现有范围）。

### D3：预设插值过渡在 CPU 侧
`CLOUD_PRESETS[name]` 为纯数值表。切换时记录 `transitionFrom`（当前形态快照）、`transitionTo`（目标预设）、`transitionT∈[0,1]`，frame 循环按时长（如 1.2s）推进 `transitionT`，对每个形态字段 `lerp` 后写入 `params`。GUI 下拉 onChange 仅触发过渡起点。

- 备选：GPU 内插值。否决——形态量是 uniform，CPU 插值最直接，且复用 `packParams`。

### D4：缓存兼容
形态过渡期间密度场逐帧变化，依赖现有 ping-pong + `cacheBlend` 时间插值平滑，无需新机制；过渡时长 > 缓存更新间隔即可避免跳变。

## Risks / Trade-offs

- [新字段默认值未能复现阶段 1 观感 → 切换/初始即突变] → 默认值按「等价于当前硬编码常量」标定，重构后空选预设时与阶段 1 对比验证。
- [偏移重排错位] → 更新后逐字段核对 WGSL 与 `PARAM_OFFSETS`，`vite build` + 实跑确认。
- [worleyBlend 引入 fbm 采样增加 compute 成本] → 仅在 compute 阶段（96³ 缓存）求值，帧率影响有限；必要时 worleyBlend 极值跳过另一侧采样。
- [10 预设数值需手工标定] → 以 cloud-types.md 为基准取形态相关子集，先保证四类可辨，其余迭代微调。

## Open Questions

- 高度带 `altBase/altTop` 是否本阶段就接管 `altitude`，还是与现有 `altitude` 并存过渡？倾向并存：保留 `altitude` 兼容，新字段默认覆盖全域，逐步迁移。
