# Change: 主步进散射改为能量守恒解析积分

## Why

`fs` 主循环当前用 `scattering = shadow * phase * (1 - exp(-d))` 再乘 `w = T*(1-step_trans)` 累加，散射项与消光步长解耦，调 `rayMarchSteps` / `baseStep` 时亮度会漂。`MiniVerse/reference` 的 `skyRay` 与 roadmap 阶段 13.2 均要求用 `S = (1-exp(-σ·Δt))·L/σ` 做步长无关积分。

## What Changes

- `shaders/cloud.wgsl` `fs`：把每步散射累加改为能量守恒解析积分；`σ = d * extinction`，`Δt = baseStep`，入射辐射 `L` 仍由 `shadow`、相函数、powder、高度明暗、银边、SSS、闪电等既有调制组成。
- 透射率更新保持 `T *= exp(-σ·Δt)`，与积分公式一致。
- 新增可关闭开关（默认开）：关时复现引入前 ad hoc 乘子路径，便于 A/B。
- `Globals` 扩至 60 floats（offset 56=`energyConservingScatter`），`BODY_BASE` 56→60（55 已被 `msModel` 占用）。
- 默认参数下人眼重校准 `sunIntensity` / powder / per-preset 光照，避免整体过亮或过暗。

## Impact

- Affected specs: `cloud-lighting`、`cloud-params`
- Affected code: `shaders/cloud.wgsl`、`src/params.ts`、`src/gui.ts`、`src/i18n.ts`、`src/renderer.ts`（pack）
- 不改密度场、light march、TAA、Bloom、大气 LUT
- 为阶段 13.2 其余项（cone MS、Hillaire octave）铺路，本变更只落地解析积分
