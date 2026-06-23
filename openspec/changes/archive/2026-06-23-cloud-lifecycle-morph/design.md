## Context

阶段 5 后 `evalRegionMod(env, t)` 输出 `{ coverageMul, densityScale }`，CPU 端 `paintRegions` 把它们写进 `weatherMap` 的 R/B 通道，shader `cloudDensity()` 采样后调制密度。`weatherMap` 通道：R=coverage、G=type、B=densityScale、A=区域 id（实际恒写 0，未使用）。shader 内 `detailStrength` 缩放细胞噪声细节量（`stage3v = stage2 + v2mapped * detailStrength`），`worleyBlend` 在蓬松（Perlin FBM）与细胞（Voronoi）路径间 `mix`（值越大越偏细胞 = 边缘破碎/侵蚀感）。

阶段 5 可选项要把「形态」也纳入演化：成长期增 detail、消散期增侵蚀。A 通道空闲，正好承载形态微变信号。

## Goals / Non-Goals

**Goals:**
- 生命周期输出形态微变信号，随 grow/decay 阶段区分。
- grow 段渐增 `detailStrength`，decay 段渐增 `worleyBlend`（边缘侵蚀）。
- 默认关闭（`morphStrength=0`）时画面与现状完全一致。

**Non-Goals:**
- 不改密度包络逻辑（coverage/densityScale 不变）。
- 不引入新纹理/绑定（复用 A 通道）。
- 不做按云属差异化的形态曲线（统一一条 morph 信号）。

## Decisions

### D1：单通道有符号 morph 信号
A 通道 8bit 仅 [0,1]，承载有符号 `morph ∈ [-1,1]`：编码 `A = (morph+1)/2`、解码 `morph = A*2-1`。语义：
- `t < birth` 或 `t ≥ death`：morph=0。
- `birth→grow`：morph `0 → +1`（与 phase 同步上升）。
- mature（`grow→decay`）：morph=+1。
- `decay→death`：morph `+1 → -1`（前半细节淡出、后半边缘侵蚀）。

shader：`detailBoost = max(morph, 0)`、`erosion = max(-morph, 0)`。成长与 mature 段 detailBoost>0 增细节；decay 后半 erosion>0 增侵蚀。两效果时间上自然衔接（decay 前半 detail 退、后半侵蚀起）。

- 备选：用两个独立量（grow 强度、decay 强度）。否决——单通道放不下两值；时间上 grow 与 decay 互斥，单有符号信号足够。
- 备选：A 通道存离散阶段枚举。否决——无法平滑插值，会突变。

### D2：默认 A=0.5（morph=0）保证向后兼容
非生命周期区域、无形态微变、天气图禁用回退路径，A 一律写 0.5（morph=0），shader detailBoost=erosion=0，形态不变。`morphStrength` 默认 0，即使有生命周期也不改形态，纯密度演化（= 现状）。

- 风险：现 `paintRegions` A 写 0（=morph -1，恒侵蚀）。必须改默认写 0.5，否则现状被破坏 → 列为必改项。

### D3：morphStrength 为全局强度旋钮
shader：`detailStrength_eff = detailStrength * (1 + morphStrength * detailBoost)`、`worleyBlend_eff = clamp01(worleyBlend + morphStrength * erosion)`。`morphStrength=0` 关闭；建议 GUI 范围 [0,1]，默认 0。

- detail 用乘性（按比例增强，避免低 detail 预设被压没）；worleyBlend 用加性（向细胞端推进，clamp01 防溢出）。

### D4：morph 求值复用包络阶段
`evalRegionMod` 已知 `env` 与 `t`，直接判定阶段算 morph：grow 段用 `smoothstep(birth,grow,t)`（与 phase 一致）、decay 段用 `1 - 2*smoothstep(decay,death,t)`。mature 段 +1。无 env 返回 morph=0。

## Risks / Trade-offs

- [A 通道 8bit 量化致 morph 阶梯] → linear 采样平滑；morph 为缓变信号，阶梯不可见。
- [detail 乘性增强在 cumulonimbus 等高 detail 预设上过冲] → morphStrength 上限 1 + 实测调参；必要时 clamp detailStrength_eff。
- [decay 前半 detail 退、后半侵蚀起的衔接感] → smoothstep 过渡；可调 morph 曲线（如侵蚀提前介入）作为后续微调。
- [改 A 默认值牵动现状] → 默认 0.5 + morphStrength 默认 0，双保险；构建后实跑对比关闭态。

## Open Questions

- erosion 是否也轻微降低 `edgeSharpness`（更柔的破碎边）？倾向先只动 worleyBlend，观察后再定。
- morph 是否按区域可单独开关而非全局 morphStrength？倾向先全局，简单；按区域留待阶段 6 场景化。
