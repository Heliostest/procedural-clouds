# W6 Design — Stratus + Cumulus Proof-of-Architecture

## Context

W6 是 Density Engine V2 的第一处非零密度。它不是“先迁两个属”的普通功能 Wave，而是决定是否继续 W7–W12 的架构 Gate。

两属来自相反的形态证据：

| 证据 | Stratus | Cumulus |
|---|---|---|
| CSV 外观 | 平坦、低层、近连续、结构弱 | 孤立、浓密、平底、花椰菜穹顶 |
| 中尺度 | 低幅低频 Perlin，无 Worley 膨胀 | Perlin-Worley Billow |
| 细节 | 仅 fractus 才明显 fBm 挖空 | 高频 Worley 侵蚀、curl、powder（W6 只取侵蚀） |
| Recipe 模板 | Thin Sheet + Stratiform | Flat-base Dome + Billow |
| W6 sample budget | 1 Macro + 1 Base | 1 Macro + 2 Base + 1 Detail |

W5 的共享场是信号库，不是共享最终密度链。W6 必须证明两个 evaluator 可以共享 Context、资源 ABI 与 Finalize，同时在 Vertical Profile、Topology 和 Detail 层走完全不同的静态路径。

## Goals

- 让 Recipe V2 在 Cached/Hybrid 中生成可识别的 Stratus 与 Cumulus 非零缓存。
- 验证固定 Recipe record 可以承载两个相反 family，而无需 interpreter 或 Legacy closure。
- 验证昂贵 sample 位于 recipe/support/profile 早退之后，W4 mask 真正保护 evaluator 热区。
- 保持 cache RGBA、renderer、ground shadow、Optical Profile、ping-pong 与 Producer promotion seam 不变。
- 以配对 timestamp、视觉与静态成本证据决定是否继续 W7。

## Non-Goals

- 不覆盖云种/变种、attachments、完整 Convective 或 Recipe-aware Hybrid。
- 不做异构 Body backend composition。Legacy/V2 是一个 scene cache 的全局 Producer 选择。
- 不以提高 cache resolution、atlas resolution 或 per-body resource掩盖形态问题。

## Runtime flow

```text
voxel
  → bounds check
  → W4 tile candidateMask
  → fixed loop i < activeBodyCount <= 12
      → candidate bit
      → recipe enabled + genus dispatch
      → world → transported body-local domain
      → horizontal/vertical analytic support
      → family evaluator shared samples
      → body/lifecycle/finalize
  → Legacy-compatible soft overlap + top-two genus metadata
  → exactly one RGBA16F textureStore
```

## Decisions

### Decision 1: 只启用两个静态 Recipe，不建立通用 operator graph

W6 将 `identityAndModes.y` 解释为 `enabled`。只有规范 genus ID 对应的 Stratus 与 Cumulus 为 1；其他八条保持 0。

`sampleLimits` 固定解释为：

```text
x = maxBaseSamples      // Macro + Base Atlas
y = maxDetailSamples    // Detail Atlas
z = maxOctaves          // W6 为 0，噪声已预计算
w = maxAttachments      // W6 为 0
```

| Recipe | maxBaseSamples | maxDetailSamples | 总 shared samples | warp | attachments |
|---|---:|---:|---:|---:|---:|
| Stratus | 2 | 0 | 2 | 0 | 0 |
| Cumulus | 3 | 1 | 4 | ≤1 | 0 |
| 其他八属 | 0 | 0 | 0 | 0 | 0 |

`detailAttachmentCosts` 固定解释为 `[macroCostClass, detailCostClass, attachmentCount, hybridDetailEnabled]`。W6 Stratus=`[1,0,0,0]`，Cumulus=`[1,1,0,0]`。

WGSL dispatcher 是两个编译期已知分支；不得遍历 operator 数组或按 sampleLimits 动态循环。sampleLimits 是审计上限，不是 shader 执行指令。

### Decision 2: 现有 256-byte Recipe bank 足够，无需 layout v3

W6 不改变 stride，而为现有 lanes建立具名 descriptor：

| Bank | W6 语义 |
|---|---|
| `domain0` | macro/base/detail frequency 与 seed domain |
| `domain1` | wind coordinate scale、warp strength、horizontal/vertical anisotropy |
| `vertical0` | bottom fade、top fade、thickness variation、dome falloff |
| `vertical1` | dome exponent、top cell scale、base plane softness、reserved |
| `topology0` | coverage threshold/softness、density threshold/softness |
| `topology1` | Base R、Base G、second Base、connectivity weights |
| `topology2` | family-specific bounded secondary shaping |
| `detail0` | erosion strength、height bias、detail frequency、reserved |
| `finalize0` | density multiplier、edge feather scale、max density calibration、reserved |

TypeScript 必须为 Stratiform 与 Billow 分别提供字段语义/范围 descriptor 和 fixture；同一 lane 不得在同一 family 中承担两个旧语义。初始数值可以在批准范围内视觉校准，不需要变更 stride 或 sample limit。

### Decision 3: Common Density Context 只做坐标和廉价 Support

对 candidate Body：

1. 从 Frame volume 恢复 world position。
2. 减去 `transport.xy` 累计风平流。
3. 使用 Body quaternion 共轭把点转换到未旋转局部空间。
4. 由 `boundsXZ`、`heightDensity.xy` 和 `localScaleAndFeather` 建立 `localNormalized`、`height01` 与 feather。
5. 检查 recipe enabled、有限 half extents、horizontal analytic footprint 与 `height01`。
6. 只有 support/profile 可能非零时才创建 shared sampling coordinate。

Context 不采样纹理，不解释光学参数，不改变 W4 Support AABB。旋转、风和 edge tile 的 CPU/GPU fixture 必须使用相同 placement 事实。

### Decision 4: Stratus 是连续 Thin Sheet，不借用 Billow

Stratus 只使用：

```text
rounded sheet footprint
× Thin Sheet vertical profile
× high-coverage Macro R
× low-amplitude Macro G thickness shift
× low-frequency Base R modulation
× body coverage/density/lifecycle/finalize
```

概念公式：

```text
footprint = roundedBoxFade(localXZ, feather)
top = clamp(1 + (macro.g - 0.5) * thicknessVariation, 0.7, 1)
vertical = smoothstep(0, bottomFade, h)
         * (1 - smoothstep(top - topFade, top, h))
coverage = smoothstep(coverageThreshold - coverageSoftness,
                      coverageThreshold + coverageSoftness,
                      macro.r + bodyCoverageBias)
stratiform = clamp(1 + (base.r - 0.5) * lowAmplitude, 0, 1)
density = finalize(footprint * vertical * coverage * stratiform)
```

约束：恰好一次 Macro + 一次 Base sample；无 Detail sample、无 warp、无 Worley/cell loop、无 attachment。`fra` 不在 W6，因此不得以高频挖空制造破碎层云。

### Decision 5: Cumulus 是 Flat-base Dome + 有界 Billow

Cumulus 的 horizontal footprint 是椭圆/圆形 fade；底边是解析平面，顶边随半径形成穹顶：

```text
r = length(localXZ)
footprint = 1 - smoothstep(1 - feather, 1 + feather, r)
domeTop = clamp(1 - domeFalloff * pow(r, domeExponent), 0.25, 1)
vertical = smoothstep(0, basePlaneSoftness, h)
         * (1 - smoothstep(domeTop - topFade, domeTop, h))
```

Billow 路径：

```text
macro = sample Macro                         // 1
base0 = sample Base at advected coordinate   // 2
warp = (base0.a - 0.5) * warpStrength        // no new sample, max once
base1 = sample Base at height-scaled coord   // 3
detail = sample Detail                       // 4

billow = weighted(base0.r, base0.g, base1.r/g) + connectivityBias
solid = smoothstep(densityThreshold, densityThreshold + softness, billow)
erosion = detail.g * erosionStrength * heightBias(h)
density = finalize(footprint * vertical * macroCoverage * max(solid - erosion, 0))
```

第二 Base coordinate MAY 随高度提高 cell frequency，使顶部胞体略小；不得增加采样次数。W6 不实现 Convective Column、curl、powder 密度或云种阶段，这些留给 W10/Optical。

### Decision 6: 多体合成保持现有软重叠与 metadata

每个 enabled Body 得到非负 `dd` 后，W6 保持 Legacy 算法：

```text
total += dd
track bestD/bestGenus and secondD/secondGenus
rest = max(total - bestD, 0)
restCap = max(bestD, 0.25)
dSoft = bestD + restCap * (1 - exp(-rest / restCap))
w2 = secondD / max(bestD + secondD, 1e-4)
```

最终写 `vec4f(dSoft, bestGenus, secondGenus, w2)`。没有贡献时必须写全零。这样 Cached/Hybrid、density debug、Optical Profile 与 ground shadow 不学习 V2 私有接口。

### Decision 7: 属级 A/B 是固定场景切换，不是同缓存异构 backend

W6 提供 Stratus-only、Cumulus-only、Stratus+Cumulus overlap 的固定 manifest。每个 manifest 用现有 `densityProducerMode` 在 Legacy 与 Recipe V2 间切换，保持 camera、scene time、Body、wind、resolution、workgroup、quality 和 render params 不变。

不允许某个 Body 由 Legacy、另一个 Body 由 V2 后再合并两个 cache；那会引入第三个 composite Producer、额外纹理/pass 和不同时间历史，不属于 W6。其他八属的正常使用继续选择 Legacy；若用户在 V2 中加载它们，输出零且 HUD 明确标为 unsupported Recipe。

### Decision 8: Cache timing Gate 排除一次性预计算

每个 A/B case：

- 固定 `96³`、`8×8×4`、Cached；Hybrid 只做视觉/协议回归，不作为 cache Gate 主样本。
- 每个 backend 至少 5 次 cache warmup，再采集至少 30 次有效 cache timestamp。
- 单独报告 W5 atlas/macro generation、pipeline create CPU、steady cache median/p90、cloud pass median、资源字节和 sample budget。
- 不把未运行 cache 的帧、debug view、pipeline compiling、generator pass 或 CPU timing混入 cache GPU 分布。

继续 W7 的性能阈值：

| Case | Gate |
|---|---|
| Stratus single + multi | V2 cache median ≤ Legacy 的 0.80；V2 p90 ≤ Legacy 的 1.00 |
| Cumulus single + multi | V2 cache median ≤ Legacy 的 1.10；V2 p90 ≤ Legacy 的 1.20 |

若 timestamp query 不可用或样本不足，性能 Gate 为 `unresolved`，不得声称通过；W7 必须等待可比设备证据或由新的 OpenSpec change 修改 Gate。

### Decision 9: 不用 GPU atomics 伪造 evaluator 计数

W6 不为计数增加 atomics/pass。HUD 报告：

- tile candidate 与 voxel-body upper bound；
- enabled evaluator genera；
- 静态 per-family sample limit；
- `actualEvaluatorCalls=unavailable`；
- cache GPU timestamp。

原 W4 `evaluatorCalls=0` 必须改名/升级为 upper-bound 口径，不能在非零 evaluator 落地后继续显示 0，也不能把 upper bound冒充实际调用数。

## Gate

只有以下全部满足才能归档 W6 并创建 W7：

1. Stratus 在正常视图和 density debug 中是连续低幅薄层，没有明显团块/Worley 颗粒；单体与多体性能达到阈值。
2. Cumulus 具有可辨识的平底、穹顶和中尺度 Billow；单体与多体性能达到阈值。
3. Stratus+Cumulus overlap 的 R/G/B/A 有限，主次属与权重稳定，Optical Profile/ground shadow 正常。
4. mask on/off 在容差内一致；旋转、快速风、scene edge 无 Support 外密度、缺块、NaN/Inf 或 atlas 周期锁定。
5. 正常稳态只有一个 cache compute pass；无 per-body texture、Legacy evaluator、4D noise、atomics、interpreter 或额外 genus source。
6. 所有八个 unsupported Recipe 仍 disabled/零预算；Legacy 十属与 Realtime 路由无回归。

任一关键项失败，W6 状态为 Stop/Review：保留 W1 Seam 与 Legacy，分析是 atlas、profile、Recipe bank、cache resolution 还是调度假设失败；不得创建 W7 来“边迁移边修”。

## Evidence strategy

### Automated

- Recipe layout/semantic/sample-budget fixtures。
- CPU mirror 数学 fixtures：sheet continuity、flat base/dome、finite output、support containment、soft overlap与 metadata。
- WGSL source closure：两个 evaluator、固定 sample-call 数、分发早于 sample、无禁用依赖。
- mask on/off deterministic volume fixture；unsupported genus zero fixture。
- 原有 W2–W5 isolation/layout/tile/shared-field/ten-genus regression。

### Manual WebGPU

- 三个固定 manifest 的 Legacy/V2、正常/density debug、Cached/Hybrid 对比。
- 切片/周期、旋转/风/边界、多体重叠和云影。
- 同设备配对 timestamp 与 Gate 报告。

## Risks and mitigations

- **Stratus 在 96³ 垂直分辨率下断层**：优先调整 profile/scene thickness；不得默认提高全局 cache resolution。若仍失败，Stop Gate并重审非均匀 cache。
- **Cumulus 像贴图噪声或重复**：使用 per-body seed offset、第二 Base 高度尺度与一次低频 warp；不得恢复 4D chain。
- **Atlas RGBA8 量化暴露**：记录 density debug；格式变化必须依据 W6 证据另提 change。
- **不同 Body overlap 过密**：保持 Legacy soft saturation，不用简单加法或 max 偷换缓存语义。
- **性能 Gate 被一次性生成污染**：generator、pipeline creation 和 steady cache分别计时。

## Deferred

- W7 扩展完整 Stratiform 四属和 Stratus fractus。
- W8 实现 Cellular/Wave。
- W10 正式完成 Cumulus variants、Convective Column 与 Cumulonimbus。
- W11 才实现 Recipe-aware Hybrid detail、workgroup/format 最终决策。
