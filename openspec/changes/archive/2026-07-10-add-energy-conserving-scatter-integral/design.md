## Context

`fs` 主步进当前：

```
step_trans = exp(-d * baseStep * extinction)   // σ·Δt 正确用于透射
scattering = shadow * phase * (1 - exp(-d))    // 与 Δt / extinction 无关
color += T * (1 - step_trans) * litColor
```

`litColor` 含 `scattering * sunIntensity` 等。问题：`(1-exp(-d))` 不随步长缩放，而权重 `(1-step_trans)` 随 `baseStep` 变，调步数时云亮度漂移。参考 `skyRay`（Seb Hillaire 形式）与 roadmap 13.2：

```
σ = d * extinction
ΔT = 1 - exp(-σ·Δt)
color += T * ΔT * (L / max(σ, ε))
T *= exp(-σ·Δt)
```

其中 `L` 为该步入射散射辐射（含 shadow、phase、powder、高度、银边等），单位与现有 `litColor` 对齐后除以 `σ`。

## Goals / Non-Goals

### Goals

- 主步进散射累加步长无关（固定场景下调 `rayMarchSteps` 观感稳定）。
- GUI 可关回旧路径做 A/B。
- 默认开启；默认参数经人眼校准后不劣于改前。

### Non-Goals

- Cone light march、Hillaire N-octave MS 形式化、关闭 powder（仍属 13.2 后续）。
- 改 `lightMarchDepth` / `sunVisibility` / 地面云影积分。
- 改密度、weather、TAA、Bloom、aerial 公式。

## Decisions

### D1: 公式落地位置

只改 `fs` 命中分支内 `color += …` 与 `scattering`/`litColor` 组装。透射率行保持 `exp(-σ·Δt)`。`cloudDepth` 权重继续用 `T*(1-step_trans)`（与光学权重一致，不改语义）。

推荐实现（Frostbite，`σ_s≈σ`）：

```
let sigma = d * extinction;
let step_trans = exp(-sigma * baseStep);
let w = T * (1.0 - step_trans);
// energy ON: sunPart 不含 (1-exp(-d))
// energy OFF: sunPart *= (1-exp(-d))  // 旧路径
color += w * litColor;  // litColor 含 sun*sunPart + ambient + SSS/银边/闪电
T *= step_trans;
```

银边/SSS：能量路径去掉内层 `*T`（只经外层 `w`）；旧路径保留双 `T` 以像素回归。

### D2: 开关占新槽（offset 55 已被 `msModel` 占用）

`energyConservingScatter`（0/1）写入 `Globals` offset **56**；补 pad 至 60 floats，`BODY_BASE` **56→60**。默认 `1`（开）。关时 MUST 逐像素复现本变更前累加式。

### D3: 校准策略

开启后亮度可能系统性偏移（旧式 `(1-exp(-d))` 与 `1/σ` 量纲不同）。实现后固定相机/云体，对比开关 0/1，优先调全局 `sunIntensity`，必要时微调 powder / `typeLightingBlend` 相关默认；per-preset 仅在全局不够时动。校准结果写入 tasks。

### D4: 数值稳定

`σ→0` 时 `w = T*(1-e^{-σΔt}) → 0`，无除法，天然稳定。

## Risks / Trade-offs

- 默认观感突变 → 开关 + 校准；关路径保留至验收通过。
- 银边/SSS 含 `transmittance` 因子时与积分外层 `T` 可能双重衰减 → 实现时核对现有银边/SSS 是否已乘 `T`；若已乘，积分内不再乘外层 `T` 于该子项，或把银边留在积分外按旧式叠加（优先保持银边观感，在 tasks 记选择）。
- 与后续 MS octave 叠加时需再校准（roadmap ★校准2）→ 本变更文档注明依赖。

## Migration Plan

- 无数据迁移。
- 回退：`energyConservingScatter=0` 或还原 shader 分支。

## Open Questions

- 无。银边/SSS 与外层 `T` 的具体拆分实现期按 D4 旁注选定并记入 tasks。
