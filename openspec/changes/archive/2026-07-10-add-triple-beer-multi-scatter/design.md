## Context

参考：`MiniVerse/reference/glsl/sky_ocean_sun_buffer_a.glsl` 的 `lightRay`（非 fast）：

```
scatterAmount = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu))
beersLaw = exp(-τ) + 0.5*scatterAmount*exp(-0.1*τ) + scatterAmount*0.4*exp(-0.02*τ)
return beersLaw * phase * mix(0.05 + 1.5*pow(min(1, dC*8.5), 0.3+5.5*h), 1.0, clamp(τ*0.4, 0, 1))
```

heli 现状：`sunVisibility(τ) = (e^{-τ·sdk} + 0.6·e^{-τ·sdk·0.33} + 0.35·e^{-τ·sdk·0.1}) / 1.95`，与 `μ`、局部密度、高度无关。

## Goals / Non-Goals

- Goals：廉价提升厚云透光与朝阳分层；可 A/B；不增 light-march 成本。
- Non-Goals：商业级 MS（cone + Hillaire）；改密度场；换相位为 Mie fit。

## Decisions

- **Decision: 改可见度合成，不改步进**  
  仍用 `lightMarchDepth` 得光学厚度 `τ`，只替换 `sunVisibility` 合成。参考里 `stepL*lighRayDen` 对应 heli 的 `τ`（已含步长累加）；`shadowDarkness` 继续作为 `τ` 总倍率，保持现有调参语义。

- **Decision: `μ` 用主射线 `sunTheta`**  
  参考在 `skyRay` 入口算一次 `phaseFunction`/`mu` 传给 `lightRay`。heli 主循环已有 `sunTheta`；每样本可见度用同一 `μ`，与参考一致且零额外开销。

- **Decision: 密度/高度调制放在散射乘子，不塞进可见度**  
  参考最后一项依赖 `dC`（局部密度）与 `cloudHeight`。heli 用盒内 `zN` 与样本 `d` 近似；作为 `scattering` 额外乘子，便于单独开关/调参。

- **Decision: `msModel` 开关**  
  `0` = 旧三 octave；`1` = 三指数 Beer。默认 `1`。旧路径公式与归一化常数保持不变。

- **Decision: powder 默认**  
  新路径默认时将 `powderStrength` 默认降为 0（或显著降低），GUI 保留滑杆。与 roadmap「MS 做对后减弱 powder」一致。

- **Alternatives considered**  
  - 直接上 13.2 Hillaire：成本高、需 cone，不适合本小步。  
  - 只改系数、不加 `μ`：收益小，丢掉参考核心。  
  - 搬 `numericalMieFit`：与已有 CS 前向叶重叠，本变更不做。

## Risks / Trade-offs

- 与现有 `heightLight` / `baseDark` / powder 叠加可能过亮或过暗 → 默认减弱 powder + GUI 可调 `msScatterScale`（可选，映射参考里 0.5/0.4 总倍率）。
- 参考 `cloudHeight` 是大气层归一化高度；heli 用 body 盒 `zN`，语义近似非物理 → 可接受的 demo 折中。
- 13.2 落地后可能废弃本路径 → 开关保留旧路径，删除成本低。

## Migration Plan

1. 落地新公式 + `msModel`。
2. 默认 `msModel=1`、powder 默认下调；截图 A/B 校准 `shadowDarkness`。
3. 回退：`msModel=0` 即旧观感。

## Open Questions

- 是否暴露 `msScatterScale` 滑杆，或先写死参考系数仅留 `msModel`？（建议先只留 `msModel`，不够再加。）
