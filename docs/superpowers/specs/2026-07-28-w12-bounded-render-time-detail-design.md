# W12 设计：有界渲染期云细节（Bounded Render-time Detail）

- 日期：2026-07-28
- 建议 change ID：`add-bounded-render-time-cloud-detail`
- 修改 specs：`cloud-rendering`、`cloud-params`
- 新增 spec：`cloud-detail`
- 对应 roadmap：`docs/roadmap-refactor.md` §17（约 731–824 行）
- 依赖：W11 → W12；W11 Gate 现状为 `REVIEW (pending owner)`（`docs/evidence/w11-visual-qa/gate-w11.md`）。开本 change 时，W11 disposition 按 owner 决策记为 **owner-waived Continue**，处理方式对齐 W10A/W10B（`docs/evidence/w10-visual-qa/gate-w10a.md`、`gate-w10b.md`）。

本文只定设计；不含实施任务分解。

---

## 1. 问题陈述

默认 Hybrid 路径下，云外形呈明显颗粒感与体素化外壳。用户观感是「像低分辨率体素场的三线性等值面」，而非有菜花状/絮状破碎的体积云。

W10（cloud-only 输出、世界尺度步进）与 W11（时域升采样）改变的是采样调度与帧间复用，**没有**提高密度场空间分辨率，也**没有**增加渲染期细节。颗粒/体素感本来就不该被它们改善。W12 是第一个针对该问题的 wave。

---

## 2. 根因诊断（已核实）

| # | 事实 | 引用 |
| --- | --- | --- |
| 1 | 默认云盒 X/Z 各 ±80 km、高 12 km；水平/垂直均为 1000 m/世界单位；密度缓存 96³。水平 voxel ≈ 160000/96 ≈ **1667 m**，垂直 = 12000/96 = **125 m**，各向异性约 13:1。一朵积云体量约等于 1 个水平 voxel。 | `src/params.ts:532` `boxHalfExtent: 80000`；`src/params.ts:500` `cloudHeight: 12000`；`src/space.ts:9-12`；`src/params.ts:514` `cacheResolution: 96` |
| 2 | 默认 `qualityMode: 1`（Hybrid）走读缓存路径：`textureSampleLevel` 三线性。形状是相距约 1667 m 采样点之间的插值等值面，外轮廓被量化到该网格。 | `src/params.ts:527`；`shaders/cloud.wgsl:352-379` `sampleDensityTyped` |
| 3 | 既有注释已承认三线性会在 genus 上产生 “voxel-aligned shells”；当时只把 genus 改为最近邻，**密度本身的 voxel 尺度未动**。 | `shaders/cloud.wgsl:363-366` |
| 4 | 缓存之上唯一能恢复高频的路径是乘法 detail：`base * (1 + detailStrength * detailNoise)`；全局 `detailStrength` 默认 **0**。这与 per-species `detailStrength`（配方字段，约 0.3–1.3）是**不同字段**，后者不走该渲染期补偿。 | `shaders/cloud.wgsl:892-894`；`src/params.ts:529`；`src/params.ts:158-167` |
| 5 | 默认 `rayMarchSteps: 64`；步长 `(hit.tFar - tEntry) / numSteps`。盒体 160 km 宽、平视穿越几十公里 → 单步千米级；起点用 interleaved gradient noise，并可加 temporal dither 抖开一整步，靠 TAA（`taaBlend: 0.95`，每帧约 5% current）平均 → 颗粒感。 | `src/params.ts:510`；`shaders/cloud.wgsl:1259`、`1262-1270`；`src/params.ts:580` |
| 6 | W10B 世界尺度步进（`worldStepMinMeters: 100` / `worldStepMaxMeters: 250`）默认 **关闭**；蓝噪声 STBN 仅在 `worldStepEnabled` 为真时生效。 | `src/params.ts:554-557`；`src/renderer.ts:3193` |
| 7 | W5 shared fields 可用：64³ rgba8unorm base/detail atlas + 256² macro；repeat/linear sampler；世界坐标可平铺。renderer 目前直连 producer diagnostics。 | `src/density/densitySharedFieldConfig.ts:26-33`；`src/density/contracts.ts:223-233`；`src/density/densitySharedFields.ts:244-272`；`src/renderer.ts:2969` |
| 8 | `applyEdgeShaping()` 对除 cumulonimbus 外的**全部九属恒等**：仅 Cb 的 `edgeHardness`/`edgeErosionStrength` 为 0.85/0.85，其余九属（含 Cu/Sc/Ac/St/As/Ns/Ci/Cs/Cc）均为 0.0/0.0。 | `shaders/cloud.wgsl:787-806`；`src/params.ts:158-167` |

结论：体素感来自 **粗 support 缓存 + 默认关闭的渲染期细节 + 千米级固定步长**；边缘 shaping 对 Billow 目标属（Cu/Sc/Ac）当前为零贡献，不会掩盖或替代 W12 的 carve。

roadmap 对「轮廓改写职责」的上游依据：`docs/roadmap-refactor.md:989` — W9 final Stop 时 global coarse 只保存 conservative support/低频骨架，**W12 render detail 负责有界分叉/断续**。

---

## 3. Owner 决定（不可更改）

| # | 决定 | 含义 |
| --- | --- | --- |
| O1 | 视觉靶子 = **carve** | 团块本身被雕出结构（菜花状、絮状破碎、层次变多）；采用上游按密度全域 remap，而非等值面窄带贴皮。 |
| O2 | 光照密度 = **rough** | main ray 用 `finalDensity`；`lightMarchDepth()` 与 ground shadow 用 `roughDensity`（不含最高频）。自阴影细节留给 W13 BSM。理由：每有效主样本调一次 `lightMarchDepth()`（内含 `lightMarchSteps: 8`，`src/params.ts:511`），每步再采密度，细节成本约 ×9。 |
| O3 | `worldStepEnabled` **默认开启**纳入 W12 | 同一 Gate 内重采基线；W10A/W10B/W11 既有 evidence 基线作废。 |
| O4 | **膨胀 + 纯减法侵蚀**（dilate-then-erode） | 与上游 `remapClamped` 一致；结构可长出，且始终是减法、有界易证。 |
| O5 | 首轮只覆盖 **Billow 系** | Cu/Sc/Ac 拿完整预算并校准；Stratiform/Cellular 极弱预算保持现有外观；Fiber（Ci）与 Convective（Cb）幅度 0，等 W15/W16。 |

流程事实：开 W12 时将 W11 Gate disposition 记为 owner-waived，与 W10A/W10B 一致。

---

## 4. 方案对比

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A（采纳）** | 单次 `remapClamped(dilated, lo, 1)`：增益膨胀 + 噪声抬低端阈值 | 一次 threshold；`support==0 ⇒ final==0` 构造保证；单调性易证；对齐 three-geospatial `sampleMedia` |
| B（放弃） | 两阶段显式膨胀再减法：`dilated - erosion` 或两次 threshold | 对同一密度两次 threshold，冲突 roadmap §17.4；减法需 clamp 负密度；单调性难证 |
| **C（Billow 可选）** | turbulence/curl 位移采样坐标后再做 A | 在 roadmap §17.3 Billow「1 detail + 可选 1 warp」预算内；不单独作为主密度路径 |

选定：**A 为核心**；Billow 可选叠加 **C 的 warp**（预算内）。放弃 B。

上游形态对应：

- `remapClamped`：`../../three-geospatial/packages/core/src/shaders/math.glsl:78-91`
- shape 段单次 remap：`../../three-geospatial/packages/clouds/src/shaders/clouds.glsl:143-145`
- detail 混成后再 remap：同文件 `:151-162`
- TURBULENCE 位移：同文件 `:134-141`；curl 实现：`../../three-geospatial/packages/clouds/src/shaders/turbulence.frag:26-50`
- HP 侧 `DensityRemap` 抬低端：`../../HPVolumeCloud/VolumetricClouds.hlsl:365-368`；混合：`:515-595`；底淡：`:523-531`

不照搬 four-layer 云层上限、全局 weather 语义、Unity 绑定；不新建第三套噪声纹理（§17.1）。

---

## 5. `DensityDetailResources` 只读 consumer 契约

新建 `src/rendering/densityDetailResources.ts`，从 `DensitySharedFieldDiagnostics`（`src/density/contracts.ts:223-233`）收窄为只读接口：

| 字段 | 用途 |
| --- | --- |
| `available` | atlas 是否可用 |
| `reason` | unavailable 时的明确原因 |
| `layoutVersion` | bind group layout 契约版本 |
| `generation` | atlas 重建代号 |
| `format` | 纹理格式 |
| `atlasDimension` / `macroDimension` | 尺寸 |
| `sampler` / `baseView` / `detailView` / `macroView` | 只读采样资源 |

**禁止**暴露：storage view、generator pipeline、writable bind group。

`src/renderer.ts:2969` 直连 `densityProducerSelector.getActive().getSharedFieldDiagnostics()` 改为走本契约（对齐 §17.1）。

Legacy producer 或 atlas unavailable：`available=false`，detail 幅度强制 0。

**有意收窄（相对 §17.1）**：不使用解析 noise 兜底。§17.1 允许「解析 noise / 关闭 detail」两种 fallback；本设计只保留关闭 detail。理由：解析噪声会产生第二套未经校准的外观，破坏 Gate 可比性与 Recipe 预算语义。

`generation` 变化时触发 TAAU 整屏失效，接入 W11 既有路径，机制对齐 `DensityCacheOutput.hierarchical.allocationGeneration`（`src/renderer.ts:2551-2560`：generation 变化 → `historyValid = false` + `markDiscontinuity()`）。

资源本体仍由 W5 生成（`src/density/densitySharedFields.ts:244-272` 创建时未设 `mipLevelCount`，无 mip 链）。

---

## 6. 密度数学（核心）

```
support = sampleDensityTyped(pos)              // 或 sampleHierarchicalDensityTyped；support 语义不变（§6.4）
if support.x <= 0 → 早退，final = 0
dilated = min(support.x * dilateGain, 1.0)     // dilateGain >= 1
erosion = sampleDetailField(advectedCoord, fade)
lo      = max((1.0 - erosion) * erosionAmount, hardeningLo)
final   = remapClamped(dilated, lo, 1.0)
```

其中 `remapClamped(v, lo, hi) = clamp((v - lo) / (hi - lo), 0, 1)`，新增到 shader。

### 6.1 有界性论证

膨胀用**增益**而非下移阈值：

1. `support.x == 0` ⇒ `dilated == 0` ⇒ `remapClamped(0, lo, 1) == 0`（因 `0 <= lo`）。故 **Support leak 在构造上不可能**，无需额外边界检查证明「空 support 不变正」。
2. `erosion ∈ [0,1]`、`erosionAmount ∈ [0,1]` ⇒ `(1-erosion)*erosionAmount ∈ [0, erosionAmount]`；再与 `hardeningLo` 取 max 后，`lo ∈ [hardeningLo, max(hardeningLo, erosionAmount)]`，且 `lo ∈ [0,1]`（`hardeningLo` 由配方钳到 `[0,1)`，并保证 `lo < 1` 以免除零；若 `lo ≥ 1` 则 `final = 0`）。
3. `final = remapClamped(dilated, lo, 1) ≤ dilated`（`lo ≥ 0` 时成立）；且 `final` 对 `support`（从而对 `dilated`）单调非减。
4. 三线性场在 body 边缘渐变；乘 `dilateGain>1` 把等值面外推，噪声才有可雕余量（O1 carve）。`dilateGain==1` 时不外推，仅弱侵蚀（Stratiform/Cellular）。

### 6.2 与既有路径的关系

- 乘法 detail 与随后的 `applyEdgeShaping` 在**三处**密度组合点被本 stage **取代**（§17.2 目标；调用点清单与共享约束见 §6.4）；全局驱动参数处置见 §10.1。
- `applyEdgeShaping()`（`shaders/cloud.wgsl:787-806`）吸收进同一次 remap：Cb 的 hardening 表达为 `hardeningLo`，**禁止**第二次 threshold（§17.4）。
- **已知偏离**：Cb 由 `smoothstep(thr-w, thr+w, ·)` 变为线性 remap。首轮固定  
  `hardeningLo = blendedEdgeHardness * max(edgeHardnessThreshold, 0)`  
  （`blendedEdgeHardness` 来自 `blendedEdgeStyle()`，`shaders/cloud.wgsl:264`；阈值默认 0.05，`src/params.ts:538`）。Cb：`0.85 * 0.05 = 0.0425`。非 Cb hardness=0 ⇒ `hardeningLo=0`。该偏离交 W16 校准，不在本 Gate 验收。
- 九属中非 Cb 的 edgeStyle 已为 0（§2 事实 8），吸收后对 Cu/Sc/Ac 首轮无行为突变。

### 6.3 三层密度语义（相对 §17.2 的落地名）

| 名称 | 定义 | 用途 |
| --- | --- | --- |
| `supportDensity` | `sampleDensityTyped` 或 `sampleHierarchicalDensityTyped` 的密度通道 | 早退、缓存 / brick 主体 |
| `roughDensity` | support 经 dilate + 可选低频 shaping，**跳过**最高频 detail 采样 | light march、ground shadow |
| `finalDensity` | 完整 dilate-erode remap | main ray；按 debugView 可选 |

roadmap §17.2 中的 `edgeBand` 窄带语义被 O1 carve **替换**为全域 remap；有界性仍由增益膨胀 + 纯减法保证，不依赖 edgeBand 防 leak。

Hybrid（`qualityMode==1`）启用 bounded detail；Cached 继续只显示 coarse/bricks 主体（§17.2）。`edgeSharpening=false` 继续作为总回退；默认是否开启仅在 W12 Gate 通过后决定（§17.4）。

### 6.4 三处调用点、hierarchical 路径与单一 stage 定义

今日乘法 detail + edge shaping 的密度组合**不是**只在 `shaders/cloud.wgsl` 一处：

| # | 位置 | 角色 |
| --- | --- | --- |
| 1 | `shaders/cloud.wgsl:892-894`（`densityAtTyped` 内；随后 `:895` 调 `applyEdgeShaping`） | 主 shader 内嵌的 Hybrid 密度组合 |
| 2 | `src/rendering/densityShaderSources.ts:116-122`（`hybridQualityAdapter`） | TypeScript 内嵌 WGSL：**global / 缓存**路径的完整密度组合副本；自调 `detailNoise(pos)`（`:119`）与 `applyEdgeShaping`（`:121`） |
| 3 | `src/rendering/densityShaderSources.ts:335-341`（`hierarchicalHybridQualityAdapter`） | TypeScript 内嵌 WGSL：**hierarchical brick**路径的完整密度组合副本；自调 `detailNoise(pos)`（`:338`）与 `applyEdgeShaping`（`:340`）；support 来自 `sampleHierarchicalDensityTyped`（`:335`） |

另：`densityShaderSources.ts:57` 的 `CLOUD_DETAIL_START = 'fn detailNoise('` 只是 shader 源**切片边界标记**，不是密度逻辑（处置见 §10.1）。

**约束（硬）**：新 dilate-erode stage 的 WGSL **函数体只允许在代码库中存在一处定义**；上表三处调用点都只调用该函数，**不得**各写一份实现。否则 global 与 hierarchical 路径会在细节语义上漂移，Cached/Hybrid 隔离断言也会失效。

**Hierarchical brick 路径**：`sampleHierarchicalDensityTyped` 的密度通道同样作为 `supportDensity` 进入**同一** stage。§6.1 的有界性（`support == 0 ⇒ final == 0`）对该路径同样成立——它也是先取 support 再 remap。complete / incomplete brick、overflow、gutter、coarse fallback 等 support 语义属 **W9 既有行为**，W12 **不改变**它们，只在其输出之上做 dilate-erode remap。brick 路径最易误用 atlas allocation coordinate 作 detail 相位——**禁止**（§7 / §17.4）；detail 坐标仍只用世界米制 + 风平流（§7）。

---

## 7. 坐标与相位

- 频率按**物理米**定义，绕开 1667:125 各向异性：  
  `detailCoord = (pos - windOffset) * metersPerWorldUnit / wavelengthMeters`  
  （水平/垂直分别取 `horizontalMetersPerWorldUnit` / `verticalMetersPerWorldUnit`，默认均为 1000，`src/space.ts:9-12`。）
- 风平流相位复用 `dominantWindPhase()`（`shaders/cloud.wgsl:758-778`），供新 detail stage 的 advected 坐标使用（不再经 `detailNoise`）。
- **禁止**使用：相机相关量、cache voxel index、atlas allocation coordinate（后者会在 W9 LOD 重分配时改变纹理相位，§17.4）。
- Billow 初值：base 波长 **300 m**；warp 波长 **1200 m**。Cu/Sc/Ac **首轮默认启用** 1 次 warp（计入预算上限）；可用参数关闭，关闭后该属 atlas 采样数降为 1。warp 用 Base Atlas A 通道（低频 warp，`shaders/density-shared-atlas.wgsl:113-118`）位移 detail 采样坐标，对应 curl 位移思路（`turbulence.frag:26-50`），落在 §17.3 Billow「1 detail + 可选 1 warp」内。

---

## 8. Nyquist 保护 / 距离衰减

W5 atlas 创建未设 `mipLevelCount`（`src/density/densitySharedFields.ts:244-250`），**不走 mip 选择**。

改为：

1. 按距离平滑衰减 detail 幅度（连续，禁止远景高频闪烁，§17.2）。
2. 硬规则（机器可检查）：当 `worldStepMeters(d) > wavelength * 0.5` 时 detail 幅度强制归零。

300 m 波长 ⇒ 要求步长 ≤ 150 m。W12 默认 `worldStepMinMeters: 120`（§11.3）：`d=64000` 时 `step ≈ 143.0 m ≤ 150`，全程不触发硬归零。不用继续留 100：100 m 虽 Nyquist 余量更大（64 km 处 step≈119.2 m），但走满 64 km 约需 **585** 步，超出 `RAYMARCH_MAX_STEPS=512`（§11.2）。这是 **O3 与本 Nyquist 规则的互为前提**：不开世界尺度步进则固定 64 步千米级步长无法稳定重建 300 m 结构；开世界步进才使 300 m detail 可采样。

---

## 9. rough / final 分离

- 单一入口：`densityAtTyped(pos, wantFinal)`；`wantFinal=false` 跳过 detail 采样。
- 绑定：main ray → final；`lightMarchDepth()` → rough；ground shadow（`legacyGroundShadow` / `integrateGroundShadow` 内 `densityAt`，`shaders/cloud.wgsl:981-1060`）→ rough；density debug 按 `debugView` 选择。
- 机器可检查：`lightMarchDepth` 的 shader source closure 内不得出现 detail 采样函数名。

---

## 10. 首轮 Recipe detail budget

以下为**初值**；Gate 前校准 Cu/Sc/Ac。

| Family | 属 | dilateGain | erosionAmount | atlas 采样数 |
| --- | --- | --- | --- | --- |
| Billow | Cu / Sc / Ac | 1.8 | 0.55 | 1 + 可选 1 warp |
| Stratiform | St / As / Ns / Cs | 1.0 | 0.08 | 1 |
| Cellular/Wave | Cc | 1.0 | 0.12 | 1 |
| Fiber | Ci | 1.0 | 0 | 0（W15） |
| Convective | Cb | 1.0 | 0 | 0（W16） |

自洽说明：

- `dilateGain=1.0` 表示**不膨胀**；`erosionAmount` 极小（0.08/0.12）⇒ 仅轻微抬低端，轮廓接近现有 Cached/Hybrid 外观（O5「极弱预算」）。
- Fiber：`erosionAmount=0`、0 次 atlas、`hardeningLo=0` ⇒ `final == support`（gain=1）。
- Convective（Cb）：`erosionAmount=0`、0 次 atlas，但 `hardeningLo` **仍**由既有 `edgeStyle.edgeHardness`（0.85）映射进同一次 remap（§6.2 已知偏离）。此处「幅度 0」专指 **detail/erosion 幅度与 atlas 采样**，不含 hardeningLo。
- 非 Cb：`hardeningLo = 0`（与 §2 事实 8 的 edgeStyle=0 一致）。
- 主次 genus 交叠：按 metadata 权重混合 detail 参数（§17.3）；允许 dominant-only fast path，但 equal-overlap 必须平滑过渡、无 genus 闪变。禁止两属各采完整细节再无界相加。

Atlas 通道绑定（常量，Gate 校准不改通道、不改采样次数上限；只调 `dilateGain` / `erosionAmount` / 波长 / warp 开关）：

| 用途 | 纹理 | 通道 | 生成定义 |
| --- | --- | --- | --- |
| Billow / Stratiform / Cellular 侵蚀场 | Detail Atlas | **B**（cell edge） | `shaders/density-shared-atlas.wgsl:123-128`：`(F2-F1)*1.75` |
| Billow warp 位移 | Base Atlas | **A**（低频 warp） | 同文件 `:113-118`：`baseWarp` |
| Macro | 本轮不采 | — | 预算外；不为 W12 增加第 3 次采样 |

`erosion` 取 Detail.B 经 `fade` 后钳到 `[0,1]`。Stratiform/Cellular 与 Billow 共用 B 通道，仅靠更小的 `erosionAmount` 区分强度。

### 10.1 全局 `detailStrength` / `detailFreq` 语义重定义

乘法 detail 被 §6.2 取代后，驱动它的两个**全局**参数仍保留 GUI 控件，**不新增字段**；语义重定义为新 stage 的全局调制。注意：`src/params.ts:158-167` 的 per-species `detailStrength`（0.3–1.3）是**配方字段**，与全局同名参数无关，本小节只谈全局。

| 参数 | 旧语义 | 新语义 | 默认 | GUI 范围 |
| --- | --- | --- | --- | --- |
| `detailStrength` | 乘法 detail 幅度（`src/params.ts:529` 现为 0） | 全局 erosion 乘子：`effectiveErosionAmount = min(familyErosionAmount * detailStrength, 1.0)`（乘积钳回 `[0,1]`，保全 §6.1） | **0 → 1** | 0.0–4.0（`src/gui.ts:641`，不变） |
| `detailFreq` | 喂给 `detailNoise()` 的频率（`:528` 现为 2.5） | 波长缩放：`wavelengthMeters = baseWavelengthMeters / detailFreq`；`baseWavelengthMeters` 取 §7 Billow 初值 300 m（warp 1200 m 同比） | **2.5 → 1.0** | 0.5–16.0（`src/gui.ts:640`，不变） |

取值含义：

- `detailStrength = 0`：完全关闭 detail（= §13 的 detail off 回退档）。
- `detailStrength = 1`：使用 §10 family 初值。
- `detailStrength > 1`：放大 erosion，乘积超过 1 时钳到 1.0（§6.1 有界性仍成立）。

默认必须改为 1：否则 Hybrid 默认仍关闭 detail，达不到 §17.2 / §6.3「Hybrid 启用 bounded detail」的目的。

`detailFreq` 默认必须改为 1.0 的 Nyquist 推理：

- 若保留 2.5：`wavelength = 300 / 2.5 = 120 m` ⇒ §8 要求 `worldStepMeters(d) ≤ 60 m`。
- 默认 `worldStepMinMeters`（当前 100，W12 改 120，§11.3）仍 > 60 ⇒ 硬规则使 detail **全程归零**，W12 在默认配置下无效。
- 改为 1.0 后波长保持 300 m，与 §8 / §11.3「64 km 内步长 ≤ 143.0 m ≤ 150 m」一致。
- 用户把 `detailFreq` 调高时，§8 会自动把 detail 幅度归零：参数安全，但高值无效；GUI 上视为「越高越早失效」。

`detailNoise()` 处置（三处密度组合见 §6.4）：

| 位置 | 现状 | 本 change |
| --- | --- | --- |
| `shaders/cloud.wgsl:780-785` | 定义；用 `params.g.detailFreq` + Perlin 4D | **移除**；`detailFreq` 不再喂给它 |
| `shaders/cloud.wgsl:892-894` | 主 shader Hybrid 密度组合中的乘法 detail（`:895` 接 `applyEdgeShaping`） | 改为调用唯一 dilate-erode stage；不再调用 `detailNoise` / `applyEdgeShaping` |
| `src/rendering/densityShaderSources.ts:57` | `CLOUD_DETAIL_START`——仅切片边界常量，非密度逻辑 | 边界标记改挂新 stage 入口名 |
| `src/rendering/densityShaderSources.ts:116-122` | **独立**密度组合实现（global / `sampleDensityTyped`）；`:119` `detailNoise`、`:121` `applyEdgeShaping` | 改为调用同一 stage；删除本副本内的乘法 detail 与 edge shaping 调用 |
| `src/rendering/densityShaderSources.ts:335-341` | **独立**密度组合实现（hierarchical / `sampleHierarchicalDensityTyped`）；`:338` `detailNoise`、`:340` `applyEdgeShaping` | 同上；support 语义仍由 W9 brick 采样决定（§6.4） |
| `scripts/check-density-pipeline-isolation.mjs:57-58`、`:85-86` | 用 `fn detailNoise(` 作 Hybrid/Cached 边界断言 | 边界标记与断言改挂新入口；Cached 仍不得含 detail 采样 |

默认值变更属 §11.1「默认值切换」（五项：`worldStepEnabled` / `worldStepMinMeters` / `worldStepMaxIterations` / `detailStrength` / `detailFreq`），在 W12 Gate 内重采基线。`cloud-params` spec delta 记为**语义变更而非新增字段**。迁移口径：旧场景 `detailStrength == 0` 仍表示关闭；旧值非 0 按新语义解释（erosion 乘子 / 波长缩放），不再是乘法 Perlin 幅度/频率。

---

## 11. 默认值切换与步数风险

### 11.1 默认切换

- `src/params.ts`：`worldStepEnabled: false → true`（`:554`）。
- `src/params.ts`：`worldStepMinMeters: 100 → 120`（`:556`）；依据见 §11.3。
- `src/params.ts`：`worldStepMaxIterations: 384 → 512`（`:555`）；依据见 §11.3。
- `src/params.ts`：`detailStrength: 0 → 1`（`:529`）；`detailFreq: 2.5 → 1.0`（`:528`）——语义见 §10.1。
- W10A/W10B/W11 既有 evidence 基线作废，在 W12 Gate 内重采。

### 11.2 步数估计（当前默认 100/384 下的截断）

公式（`shaders/cloud.wgsl:567-572`）：

```
step(d) = clamp(minStep * (1 + perspective * d * 0.001), minStep, maxStep)
```

代入**当前**默认：`minStep=100`、`maxStep=250`、`perspective=0.003`（`src/params.ts:555-559`）：

```
step(d) = clamp(100 + 0.0003 * d, 100, 250)
```

在 `worldStepMaxRayDistanceMeters=64000` 内：

- `d=0` → step = 100 m  
- `d=64000` → step = 100 + 19.2 = **119.2 m**（远未触达 max 250；触达 max 需 d≈500 km）

走满 64 km 的迭代次数（连续近似）：

```
N = ∫_0^64000 dd / (100 + 0.0003 d)
  = (1/0.0003) * ln(119.2/100)
  ≈ 3333.33 * ln(1.192)
  ≈ 585
```

粗算对照：若全程按 120 m 计，64000/120 ≈ **533**；按平均步长 (100+119.2)/2 ≈ 109.6 m，64000/109.6 ≈ **584**。与积分一致落在 **约 530–590**。

当前 `worldStepMaxIterations: 384`（`src/params.ts:555`）**< 585**，因此在无 skipping、且保持 minStep=100 时走满 64 km **会截断**远处云。

#### 硬天花板：仅调 maxIterations 到不了 64 km

shader 侧把世界步进迭代预算钳在 `RAYMARCH_MAX_STEPS`：

| 引用 | 内容 |
| --- | --- |
| `shaders/cloud.wgsl:121` | `const RAYMARCH_MAX_STEPS = 512u;` |
| `shaders/cloud.wgsl:1261` | `iterBudget = select(numSteps, i32(clamp(params.march.controls.y, 1.0, f32(RAYMARCH_MAX_STEPS))), worldMarch);` |
| `shaders/cloud.wgsl:1295` | 主循环 `for (var i = 0u; i < RAYMARCH_MAX_STEPS; i++)` |

GUI 控件 `worldStepMaxIterations` 范围为 **32–512**（`src/gui.ts:598`），上限与硬天花板对齐，**不能**调到 585。

反解可达距离（`minStep=100` 不变：`N = (1/0.0003) * ln((100 + 0.0003 d)/100)` ⇒ `d = (100/0.0003) * (e^{0.0003 N} - 1)`；全程 step < 250，公式成立）：

| 迭代上限 | 无 skipping 可达距离（minStep=100） |
| --- | --- |
| 384（当前默认） | `d ≈ 333333 × (e^{0.1152} - 1) ≈ **40700 m**（约 40.7 km）` |
| 512（硬天花板） | `d ≈ 333333 × (e^{0.1536} - 1) ≈ **55300 m**（约 55.3 km）` |

结论：在 **minStep=100 不变**时，即使把 `worldStepMaxIterations` 调到 512，仍覆盖不了 64 km；「只调 maxIterations」最多把截断点从约 40.7 km 提到约 55.3 km，**不是**出路。

若固守 minStep=100 / maxIterations=384，备选（三选一或组合）及代价：

| 出路 | 做法 | 代价 |
| --- | --- | --- |
| A. 依赖 skipping | 不改任何默认值；靠 `worldStepSupportSkipping` / candidate skipping 减少空区步进 | 远距正确性完全取决于跳过效率；**必须** Gate 实测触顶率，不得假定 |
| B. 降 `worldStepMaxRayDistanceMeters` | 使上限距离落在 384 步可达范围内：`d_384 ≈ 40700` ⇒ 默认 64000 → **约 40700 m** | 远处云直接不渲染，出现明确距离截止 |
| C. 提高 `worldStepMinMeters` | 300 m 波长下 §8 要求步长 ≤ 150 m ⇒ `minStep` 上限 **150 m**。此时 `step(d) = 150 + 0.00045 d`，`d = (150/0.00045) * (e^{0.00045 N} - 1)`；N=384 ⇒ **约 62900 m** | 步长变粗；`minStep=150` 时 `d>0` 后 `step(d) > 150`，§8 几乎全屏归零 detail（陷阱） |

W12 **不**把默认策略压在出路 A 上。采纳 §11.3：在出路 C 方向取 `minStep=120`（严格小于 150），并同步把 `maxIterations` 提到 512，使无 skipping 也能走满 64 km。

### 11.3 解掉截断风险的默认参数组

关键：`minStep = 150 m` 是陷阱。§8 硬规则在 `worldStepMeters(d) > wavelength * 0.5`（300 m ⇒ 150 m）时归零 detail；而

```
step(d) = minStep * (1 + 3e-6 * d)
```

（由 `worldStepPerspectiveScale = 0.003` 与公式中 `* 0.001` 得来）。`minStep=150` 时只要 `d>0` 就有 `step>150`，detail 几乎全屏归零。故 minStep 必须**严格小于** 150，并给透视增长留余量。

取 `minStep = 120`：

```
d = 64000 → step = 120 * (1 + 3e-6 * 64000) = 120 * 1.192 = 143.0 m ≤ 150 m
```

故 detail 在整个 64 km 内全程存活，Nyquist 硬规则不触发归零。

所需迭代（连续近似）：

```
N = ln(1 + 3e-6 * 64000) / (120 * 3e-6)
  = ln(1.192) / 3.6e-4
  ≈ 488
```

`488 ≤ 512`（`RAYMARCH_MAX_STEPS`，`shaders/cloud.wgsl:121`），且 512 落在 GUI `worldStepMaxIterations` 的 32–512 范围内（`src/gui.ts:598`）。

不用继续留 `minStep=100`：同式 `N = ln(1.192) / (100 * 3e-6) ≈ 585 > 512`，超出硬上限（与 §11.2 一致）。100 m 的 Nyquist 余量更大，但迭代预算装不下。

| 参数 | 当前默认 | W12 默认 | 依据 |
| --- | --- | --- | --- |
| `worldStepMinMeters` | 100 | **120** | 使 64 km 处步长 143.0 m ≤ 150 m Nyquist 阈值，同时把所需迭代压到 512 以内 |
| `worldStepMaxIterations` | 384 | **512** | 488 步需求 > 384；512 是 shader 硬上限，也是 GUI 上限 |
| Billow base 波长 | — | 300 m | §7 初值，决定 150 m 的 Nyquist 阈值 |

有效重建能力属**临界够用**而非宽裕：步长 120–143 m 对 300 m 波长约为 **2.1–2.5 采样/波长**（300/143 ≈ 2.1，300/120 = 2.5），仅略高于 Nyquist 的 2.0。必须在 Gate 看远景闪烁，不得写成「已安全」。

代价：迭代上限 384 → 512，最坏主循环迭代数约 **+33%**。每个有效主样本仍触发 `lightMarchDepth()`（内含 `lightMarchSteps: 8`，§O2 / `src/params.ts:511`），故最坏成本上升须在 §13 成本报告中单独列出 **main ray 迭代数分布**，不能只报总时间。

本参数组在无 skipping、不砍可视距离的前提下覆盖满 64 km 截断。残余风险见 §14。

---

## 12. Debug 视图与机器检查

### 12.1 Debug 视图

| View | 内容 | 模式约束 |
| --- | --- | --- |
| 18 | erosion 场可视化 | 非破坏叠加：composite 之后写 `sceneView`，不写 history；切换不触发整屏失效 |
| 19 | `final − rough` 差值 | 同上 |

教训来源：W11 Implementation Decisions 第 8 条——时域可视化不得写入被观测的 history（`openspec/changes/add-temporal-cloud-upscaling/design.md` Implementation Decisions §8）；debug-16/17 已修复为叠加 pass。W12 的 18/19 **必须**复用同一模式。

### 12.2 检查脚本

| 脚本 | 断言 |
| --- | --- |
| `scripts/check-w12-detail-contract.mjs` | consumer contract 不暴露 storage view / pipeline / writable bind group；存在 `layoutVersion` 与 `generation` |
| `scripts/check-w12-density-monotonic.mjs` | shader source：`support <= 0` 早退；表达 `final <= dilated`；erosion 只进入低端阈值（不进入增益侧）；**且**新 dilate-erode stage 的 WGSL 函数体（`fn <stageName>(` … 匹配的闭合 `}`）在 `shaders/` + `src/` 全文仅出现 **一次定义**，同时 `shaders/cloud.wgsl` 的 Hybrid `densityAtTyped`、`densityShaderSources.ts` 的 `hybridQualityAdapter` 与 `hierarchicalHybridQualityAdapter` 三处均调用该函数名（§6.4） |
| `scripts/check-w12-sample-budget.mjs` | 每 family atlas 采样次数上限（§10 表）；source closure 计数 |
| `scripts/check-w12-light-rough.mjs` | `lightMarchDepth` 闭包内无 detail 采样函数名 |

---

## 13. 退出条件与证据

按 roadmap §17.5 展开，并明确以下判定口径：

| 项 | 要求 |
| --- | --- |
| 视觉（owner） | Cu/Sc/Ac 轮廓与内部微结构相对 Cached/global-only **有明确改善**，且**不是**单纯对比度提升 |
| 成本 | 分别报告 main ray / local light / ground shadow 增量；另单独列出 **main ray 迭代数分布**（§11.3：最坏约 +33%，且有效样本仍触发 `lightMarchDepth`）；W13 未实现 ⇒ BSM 成本标记 **not-applicable** |
| 回退基线 | detail off 必须精确回退到**新基线**：`detail off + worldStep on`（因 O3；worldStep 取 §11.3 的 120/512）。另保留 `worldStep off` 的 A/B 对照条，用于解释相对旧 W11 包的差异，但不作为 detail 回退真值 |
| 缺陷零容忍 | 无 Support leak / 负密度 / NaN / brick seam / 主次属硬切 / 薄层断裂；另含 §17.5 的 camera lock、LOD phase jump |
| 证据类型 | raw density、normal、edge-only、detail-frequency、wind motion、TAAU 收敛；debug 18/19 |
| 机器检查 | §12.2 四脚本 + family sample 上限 |
| W9 Stop 场景 | global-only + bounded detail 仍可独立工作（§17.5 末条；呼应 `:989`） |

Bloom / 曝光 / tonemap 在截图比较中固定，不得用后处理掩盖密度差异（§17.4）。W12 **不修改**最终 sun intensity/phase 默认值；银边与侵蚀边缘的光照再校准属 W13 前工作（§17.4）。

Gate 额外必查：§11.3 默认下远景闪烁（2.1–2.5 采样/波长）；触顶率仍记（硬上限 512 无余量）；成本报告含 main ray 迭代数分布。

---

## 14. 风险清单

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 世界步进迭代预算不足（§11.2 / §11.3） | 当前默认 100/384 下远处云会截断；仅调 maxIterations 到 512 仍不够 64 km（minStep=100 时约 55.3 km） | 已有自洽默认参数组覆盖满 64 km（§11.3：`minStep=120`、`maxIterations=512`）。残余：(a) 2.1–2.5 采样/波长属临界，远景闪烁仍须 Gate 实测；(b) 512 是硬上限，若后续把波长调小或 `maxRayDistance` 调大，将再次无参数可调，只能依赖 skipping 或降低可视距离 |
| O3 作废旧基线 | 无法直接对比旧 W10/W11 截图 | Gate 内重采；保留 worldStep off 对照 |
| atlas unavailable | detail 全关 | `available=false` 幅度 0；无解析 noise 第二外观 |
| Billow dilateGain=1.8 过度膨胀 | 团块粘连 / 填缝 | Gate 校准 Cu/Sc/Ac；erosionAmount 联调 |
| equal-overlap 参数混合 | genus 闪变 | 权重混合 + 禁止双完整采样相加；equal-overlap 用例 |
| Cb smoothstep→线性 remap | Cb 外观偏离 | 本轮幅度 0；记录偏离，交 W16 |
| 无 mip + 远景 | 闪烁 | 距离衰减 + Nyquist 硬归零 |
| detail 误入 light march | ×9 成本与噪声阴影 | rough 路径 + `check-w12-light-rough.mjs` |
| debug 写入 history | 自证伪（W11 教训） | 18/19 强制非破坏叠加 |
| brick/LOD 相位 | seam / 跳变 | 禁用 allocation 坐标；detail 后仍查 seam |
| 三处密度组合副本（§6.4） | global 与 hierarchical 路径细节语义漂移；Cached/Hybrid 隔离断言失效 | 单一 stage 定义（§6.4 硬约束）+ `check-w12-density-monotonic.mjs` 机器检查 + `check-density-pipeline-isolation.mjs` 边界标记同步更新 |

---

## 15. 与 roadmap §17 对应关系

| roadmap 小节 | 本设计落点 |
| --- | --- |
| 17.1 复用 W5、不建第三套纹理 | §5 契约；有意收窄为「关闭 detail」唯一 fallback |
| 17.2 三层密度语义、替换乘法 detail | §6、§6.4、§9、§10.1；carve 替换 edgeBand 窄带，有界性改由增益证明；三处调用点共享单一 stage；全局 `detailStrength`/`detailFreq` 语义重定义 |
| 17.3 Recipe detail budget | §10；主次属混合规则；§10.1 全局乘子/波长缩放 |
| 17.4 边缘合并、坐标禁则、后处理固定 | §6.2、§6.4、§7、§13；brick 路径重申禁用 allocation 坐标 |
| 17.5 退出条件 | §13 |
| 17.6 上游参考 | §4 引用表；数学对齐 `clouds.glsl:143-145` 与 `math.glsl:78-91`；warp 对齐 `turbulence.frag:26-50` |
| `:989`（W15 章，W9 Stop 句） | §2 结论；§13 W9 Stop 场景 |

补充上游资源契约参照（不照搬尺寸）：`cloudShape.frag:41-77`、`cloudShapeDetail.frag:41-55`、`constants.ts:1-9`、`Procedural3DTexture.ts:54-86`。

---

## 16. 范围边界

**本 change 内：**

- `DensityDetailResources` 契约与 renderer 接入点替换
- Hybrid 密度 stage：dilate-erode remap、米制坐标、Nyquist/距离衰减、rough/final（单一函数体定义，§6.4）
- `densityShaderSources.ts` 两份内嵌密度组合副本（global `hybridQualityAdapter` 与 hierarchical `hierarchicalHybridQualityAdapter`）同步改为调用同一 stage（§6.4 / §10.1）
- Billow 完整预算 + Stratiform/Cellular 极弱预算；Ci/Cb 幅度 0
- 全局 `detailStrength` / `detailFreq` 语义重定义与默认值变更（§10.1；`cloud-params` delta）
- 移除 `detailNoise()` 及其三处密度路径调用（§10.1）
- `worldStepEnabled` 默认 true；`worldStepMinMeters` 100→120；`worldStepMaxIterations` 384→512（§11.1 / §11.3）与 Gate 重基线
- debug 18/19 与四个 check 脚本（含 §6.4 单一 stage 定义断言）
- specs：`cloud-rendering`、`cloud-params`、新增 `cloud-detail`

**明确不在本 change：**

- W13 BSM / 银边默认值修改
- W15 Fiber / W16 Convective 专属细节
- 提高 96³ 缓存分辨率或新建第三套噪声纹理
- 解析 noise fallback
- 实施任务分解（另文 writing-plans）
