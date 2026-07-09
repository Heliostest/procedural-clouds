## Context

`fs` 已用 `pow(max(sunTheta), 64) * skyC.sun` 画锐利太阳光斑，再与 raymarch 结果按 `transmittance` 合成。厚云会挡住光斑，但薄 altostratus 不会呈现「水样日盘」；cirrostratus 无 22° 冰晶晕；cumulonimbus 无内部闪光。三项均属屏幕/散射层特效，不碰密度缓存。

`p4.w` 目前未写入（`sssStrength` 占 `p4.z`）。为避免与未来字段争用，本变更一次扩完整 `p7`，三项强度放 `p7.xyz`，`p7.w` 保留为 0。

## Goals / Non-Goals

### Goals

- altostratus：透过薄云可见朦胧日盘。
- cirrostratus：太阳周围约 22° 可辨亮环。
- cumulonimbus：稀疏、短暂的内部暖色闪光。
- 强度 0 时零分支旁路，观感与成本与改前一致。

### Non-Goals

- Bruneton 大气 LUT、物理日晕 BRDF、闪电几何/音效。
- 改密度、形态、edge-style 或质量模式语义。

## Decisions

### D1: 特效挂在着色层，不进密度

三项只改 `fs` 背景与散射累加。密度、cache、ground-shadow、genus evaluator 不变。

### D2: 强度来自主导云属 preset，经 `typeLightingBlend` 门控

从当前样本（或像素最终合成所用）的主导属读 `sunDiscVisible` / `haloEffect` / `internalLightning`。`typeLightingBlend == 0` 时三项贡献为 0，与「回退全局光照」契约一致。

日盘与日晕作用在背景：用整条视线最终 `transmittance` 与路径上累计的主导属权重（已有 `dt.y/z/w` soft-union metadata；若像素未命中云，则按视线与云层交域内最大覆盖属，或在无云时不启用）。实现优先：有云命中时用深度加权主导属；无云命中时日晕仍可按场景中是否存在 cirrostratus body 的全局开关简化——首版采用「像素最终合成前，取 raymarch 累计的主导属索引；若 `depthW==0` 则日晕/日盘强度取 0」，避免无云像素误加晕。对「几乎全透明的 As/Cs」：raymarch 仍会积累极小 `depthW` 与属索引，日盘/日晕可出现。

### D3: 日盘 = 透过率调制既有太阳光斑

不另画几何。将 `finalSky` 中太阳项改为：

`sunDisc = pow(max(sunTheta), mix(64, 16, sunDiscAmt)) * skyC.sun * mix(0.8, 1.2, sunDiscAmt)`

合成时背景太阳贡献再乘 `mix(1.0, soft(transmittance), sunDiscAmt)`，使薄云后日盘仍可见且边缘发糊（降低 power），厚云 `transmittance→0` 仍全遮。`sunDiscAmt = sunDiscVisible * typeLightingBlend`。

### D4: 日晕 = 角距高斯环

`angle = acos(clamp(sunTheta, -1, 1))`，中心 `22°`（`0.383972 rad`），半宽约 `1.5°`，`halo = exp(-((angle-halo0)/width)^2) * haloEffect * typeLightingBlend * skyC.sun`。只加在天空/背景项，不乘进云内散射，避免厚云内部发白。太阳低于地平线（`sunDir.y < 0`）时旁路。

### D5: 闪光 = sceneTime 脉冲 × 局部密度

`pulse = pow(max(sin(sceneTime * ω + hash(bodySeed)), 0), k)`，稀疏（高 k），乘 `internalLightning * typeLightingBlend * densW`，以暖色（偏 `skyC.sun` 或固定暖白）加到 `litColor`。`ω` 与 `k` 为有界常量；`0×` 仿真下 `sceneTime` 冻结则闪光定格。不引入新全局 uniform，除非调参需要——首版常量写死，仅 preset 强度可调。

### D6: preset 布局扩 p7

- `p7.x = sunDiscVisible`
- `p7.y = haloEffect`
- `p7.z = internalLightning`
- `p7.w = 0`（保留）

`PRESET_VEC4_COUNT` 7→8；CPU pack、byte size、WGSL `PresetShape`、accessor、布局断言同步。默认：`altostratus.sunDiscVisible > 0`，`cirrostratus.haloEffect > 0`，`cumulonimbus.internalLightning > 0`；其余为 0。精确默认值实现时 A/B 校准并记入 tasks。

不占用 `p4.w`，避免与光照 vec4 语义混杂；不改 p5/p6。

## Risks / Trade-offs

- 日晕在无云像素不显示（D2）→ 稀薄全天空 Cs 可能偏弱；若验收不够，可后续加「场景存在 Cs body」全局兜底，本变更不做。
- 闪光哈希若按像素会闪噪 → 用 body/主导属稳定种子 + 低频时间，避免屏幕空间噪声。
- preset buffer 增大 → 一次整 vec4，有断言；scenario 不受影响。

## Migration Plan

- 无数据迁移。旧运行时无 p7 时由新默认填充。
- 回退：三强度置 0，或回滚本变更。

## Open Questions

- 无。默认强度数值实现期校准。
