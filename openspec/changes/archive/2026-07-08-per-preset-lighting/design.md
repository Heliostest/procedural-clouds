## Context

`fs` 主 raymarch 经 `densityAt(pos)` 取密度：cached 模式读 `densityTex0/1`（仅 `r` 通道，`cs` 写 `vec4f(d,0,0,1)`），realtime 模式直接 `cloudDensity(pos)`（对 `MAX_BODIES` 求和 `evalBody`）。着色时全局：`phase = mix(1, dualHG(sunTheta), 0.6)` 每像素一次；`step_trans = exp(-d*stepSize)`；silver 用 `params.g.silverIntensity`；暗底用固定 `heightLight`。预设经 `presets: array<PresetShape,10>`（`@group(0)@binding(4)`）按类型索引取**形态**，光照字段不存在。

## Goals / Non-Goals

**Goals:**
- 每云属独立光照：吸收、双瓣相函数前后向、银边、暗底、SSS，来源于预设表。
- 缓存与 realtime 两路径均能按云属着色。
- 全局 blend 可回退到现全局观感（默认开启按云属）。

**Non-Goals:**
- 不改密度 `r` 通道数值（cached 密度像素级一致）。
- 不做重叠云属的连续混合（采用主导云属，见 D2 取舍）。
- 不改 God rays / time-of-day / 形态字段。

## Decisions

### D1：预设光照字段（取自 cloud-types.md）
每预设新增 `absorptionCoeff/phaseForward/phaseBack/silverLining/baseDarkening/sssStrength`：

```
cumulus       .045 .6  -.2  .4   .35  .3
stratus       .06  .3  -.1  .1   .15  .15
stratocumulus .05  .4  -.2  .25  .25  .25
cumulonimbus  .1   .7  -.3  .6   .6   .2
altocumulus   .035 .4  -.2  .3   .2   .35
altostratus   .02  .5   0   .1   .1   .5
nimbostratus  .09  .2   0   .05  .5   .1
cirrus        .008 .8   0   .5   .05  .7
cirrostratus  .005 .85  0   .2   .0   .8
cirrocumulus  .01  .7   0   .3   .1   .6
```

字段从 13 增至 19 → 每预设 5 个 vec4（`p0..p4`，`PRESET_FLOAT_COUNT = 10*20`）。`packPresetArray` 写 `p4 = (absorptionCoeff, phaseForward, phaseBack, silverLining)`、`p3.yzw = (baseDarkening, sssStrength, _)`（或顺延，按实现对齐为准，保持单一事实来源）。

### D2：主导云属索引随密度入缓存
`evalBody` 仍返回标量密度；`cloudDensity()` 改为在求和时跟踪贡献最大的云体，返回 `(totalDensity, dominantPresetIndex)`。`cs` 写 `textureStore(..., vec4f(d, f32(idx), 0, 1))`（`g` 通道存索引）。`sampleDensity`/`densityAt` 一并返回索引（cached 取最近样本的 `g`，避免线性插值污染索引——用 `textureLoad` 或就近读；本阶段 cached 用 `textureSampleLevel` 的 `g` 四舍五入近似，边界过渡可接受）。

**取舍**：重叠区只取主导云属，不做光照参数连续混合 → 交界处光质有硬切换，但多体本就少重叠，且视觉可接受；连续混合需占用更多通道或额外 pass，留后续。

### D3：吸收按云属
消光改 `step_trans = exp(-d * stepSize * mix(1.0, absorptionCoeff*K, blend))`（`K` 为标定常数，使 cumulus 的 .045 在默认下接近现观感）。卷云低吸收 → 通透；积雨云高吸收 → 厚重暗实。

### D4：每样本双瓣相函数
将 `phase` 从「每像素一次」改为「按主导云属每样本计算」：`phaseAt = mix(globalPhase, mix(hg(cosTheta,phaseBack), hg(cosTheta,phaseForward), params.g.hgBlend), blend)`。卷云强前向（.8）→ 逆光通透高光。

### D5：银边/暗底/SSS 按云属
- 银边：现 `silverIntensity * pow(clamp01(sunTheta),4)` 的强度项乘以预设 `silverLining`（再乘 `blend` 插值）。
- 暗底：`heightLight` 的底部压暗幅度由预设 `baseDarkening` 驱动（cumulonimbus .6 显著、cirrus .05 几乎无）。
- SSS：背光透射项 `+= sunColor * sssStrength * pow(max(-sunTheta,0),2) * transmittance`，卷/层云高 SSS 呈透光感。

### D6：全局 blend 回退
`typeLightingBlend ∈ [0,1]`：0 → 上述各 `mix` 取全局分支，画面回到 `lighting-quality` 观感；1（默认）→ 完全按云属。作为兼容与对比开关。

## Risks / Trade-offs

- [缓存 `g` 通道索引经线性采样被插值] → 就近读或四舍五入；交界 1~2 体素过渡可接受。
- [新增预设 vec4 槽位破坏 std140] → 严格 16 字节对齐，`PRESET_FLOAT_COUNT` 同步，build 后比对默认观感。
- [每样本相函数增成本] → 仅一次 `hg`×2，开销小；blend=0 时分支可短路。
- [标定常数 K 选取] → 以 cumulus 在 blend 默认下不偏离现观感为准，必要时记录于注释。

## Open Questions

- 重叠云属是否需要连续光照混合？本阶段否（主导云属），如交界明显再引入双通道权重。
- `sssStrength` 是否与 powder 叠加过亮？默认值偏保守，验收时按云属微调。
