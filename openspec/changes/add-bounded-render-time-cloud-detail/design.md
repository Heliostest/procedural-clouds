# Design: 有界渲染期云细节（W12）

## Context

96³ 缓存使默认 160 km 云盒水平 voxel 约 1667 m、垂直 125 m；Hybrid 三线性缓存、`detailStrength=0` 与固定 64 步共同造成体素化。W12 只在现有 support 上增加 render-time carve，不改变 W9 的 support 或资源生产职责。

## Owner Decisions

1. O1：目标是全域 carve，不是等值面窄带贴皮。
2. O2：main ray 使用 `finalDensity`；`lightMarchDepth()` 和 ground shadow 使用 `roughDensity`，最高频自阴影留给 W13。
3. O3：`worldStepEnabled` 默认开启，并在同一 W12 Gate 重采基线。
4. O4：使用 gain dilation 后的纯减法 erosion，单次 `remapClamped`。
5. O5：首轮仅 Billow 完整校准；Stratiform/Cellular 极弱，Fiber/Convective detail 幅度为零，分别留给 W15/W16。

## Resource Contract

`DensityDetailResources` 是从 Shared Field diagnostics 收窄的只读 consumer contract：`available`、`reason`、`layoutVersion`、`generation`、`format`、`atlasDimension`、`macroDimension`、`sampler`、`baseView`、`detailView`、`macroView`。禁止 storage view、generator pipeline、writable bind group。renderer 不再直连 producer diagnostics；每个 Hybrid layout 都绑定真实或 dummy read-only sampler/Base/Detail。Legacy 或 unavailable 强制 detail 幅度零，不建立第二套 atlas，也不使用解析 noise fallback。generation 变化使 `historyValid=false` 且触发 W11 discontinuity；连续 content revision/风平流不整屏失效。

## Density Stage

唯一 WGSL 函数体由主 shader、global Hybrid adapter、hierarchical Hybrid adapter 调用：

```text
support = sampleDensityTyped(...) or sampleHierarchicalDensityTyped(...)
if support <= 0: return 0
dilated = min(support * dilateGain, 1)
erosion = sampleDetailField(advectedCoord, fade)
lo = max((1 - erosion) * erosionAmount, hardeningLo)
final = remapClamped(dilated, lo, 1)
```

`supportDensity` 保留既有 coarse/brick 语义；`roughDensity` 是 support 经 dilation 与 hardening、跳过最高频采样的结果；`finalDensity` 是完整 remap。`support==0` 时早退，`lo` 在 `[0,1)`，`final<=dilated` 且对 support 单调非减，因此不产生 Support leak、负密度或 NaN。Hybrid 的三处旧乘法 `detailNoise()` 与随后的 edge call 被替换；Cached、Realtime、hierarchical Cached 保留既有 edge shaping。Cb hardening 进入同一次线性 remap，禁止第二次 threshold。

main ray 请求 final；light march、legacy/adaptive ground shadow 请求 rough；debug 可选择层级。light-march source closure 不得包含 detail sample。`edgeSharpening=false` 是总回退；有效 W12 detail 还要求 `detailStrength>0`、可用资源与 active world-step。

## Coordinates, Budget, and Sampling

坐标为世界米制位置减 `dominantWindPhase()` 的 X/Z 平流；水平/垂直各用相应 meters-per-world-unit。禁止相机相关坐标、cache voxel index、brick allocation coordinate。Billow 基波长 300 m、warp 波长 1200 m；warp 使用 Base.A，erosion 使用 Detail.B，Macro 不采样且不新增第三套纹理。

| Family | Genus | Gain | Erosion | Atlas budget |
| --- | --- | ---: | ---: | --- |
| Billow | Cu/Sc/Ac | 1.8 | 0.55 | 1 detail + 1 optional warp，默认 warp 开启 |
| Stratiform | St/As/Ns/Cs | 1.0 | 0.08 | 1 detail |
| Cellular/Wave | Cc | 1.0 | 0.12 | 1 detail |
| Fiber | Ci | 1.0 | 0 | 0 |
| Convective | Cb | 1.0 | 0 | 0；仅既有 hardening |

主/次 genus 按 metadata 权重连续混合参数；不得双完整采样后无界相加。distance fade 连续衰减；无 mip 时若 `worldStepMeters(distance) > wavelength * 0.5`，detail 强制为零。300 m 在 120 m min step、64 km 处约 143 m，维持约 2.1–2.5 samples/wavelength，远景闪烁仍须 Gate 验证。

## Parameter Migration and Defaults

不新增全局字段。`detailStrength` 从乘法噪声幅度改为 `min(familyErosionAmount * detailStrength, 1)`；`detailFreq` 从 Perlin 频率改为 `baseWavelengthMeters / detailFreq` 的波长缩放。旧 `detailStrength=0` 仍关闭 detail。五项默认切换为 world step on、120 m、512 iterations、strength 1、freq 1；world-step-off 仅为旧 W11 对照，detail-off + world-step-on 才是回退真值。120/512 能在无 skip 时覆盖 64 km；512 为硬上限，最坏主循环预算相对 384 上升约 33%。

## Debug, Validation, and Gate

debug 18 显示 erosion，19 显示 `final-rough`；二者只在 composite 后叠加到 `sceneView`，不写 history/attachments 且不触发 history reset。机器检查覆盖只读契约、单一定义/单调性、family sample budget、light-rough 隔离及既有 pipeline isolation。

Gate 固定 Bloom/曝光/tonemap，采集 raw density、normal、edge-only、detail frequency、wind motion、TAAU 收敛与 debug 18/19。必须证明 Cu/Sc/Ac 的真实结构改善、无 leak/NaN/seam/phase jump/硬切/薄层断裂，分别报告 main ray/local light/ground shadow 与 iteration distribution；BSM 为 not-applicable。global-only + bounded detail 必须可工作。

## Risks and Boundaries

风险包括临界 Nyquist、512 iteration ceiling、Billow 粘连、Cb smoothstep 到线性 remap 的偏离、atlas unavailable、远景闪烁、detail 误入 light march 与 debug 污染 history。W12 不改 cache resolution、太阳默认值、BSM、Fiber/Convective 专属细节或解析 fallback。roadmap §17.1–§17.6 分别由 contract、三层密度、budget、边缘/坐标限制、Gate 和上游 `remapClamped`/turbulence 参考落实。
