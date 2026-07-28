# W11 Visual QA Summary

| Item | Value |
| --- | --- |
| Aggregate rows | **64 PASS / 0 FAIL / 11 UNABLE / 16 OBSERVATION** |
| Screenshots (local, gitignored) | 126 — `screenshot-manifest.json` |
| Visual Gate | **UNABLE** |
| Performance Gate | **UNABLE**（稳态 median/p90 已采 ≠ Gate 通过） |
| Gate report | `gate-w11.md` — **REVIEW (pending owner)**；Formal Continue: **NO** |
| Owner disposition | 未决 |
| Runtime provenance | HEAD `6121d434`；`runtimeSourceMatchesHead=false`；gitDirty=true；**src/shaders 未提交** — 本批 timing **不可**作干净 revision 的 Gate 数据 |

## 判定口径（与 W10 一致）

| 状态 | 含义 |
| --- | --- |
| **PASS** | 自动化合同或可在 harness 内复现的硬检查通过 |
| **FAIL** | 上述硬检查失败 |
| **UNABLE** | 当前 harness / HEAD API 无法给出像素级或规范阈值证明；或需 owner 视觉判定 |
| **OBSERVATION** | 数值/截图已记录，**不**升格为 Gate PASS |

硬约束（照抄 W10 语义）：

- **数据可用 ≠ 性能 Gate 通过**：稳态 median/p90 齐备只证明 evidence completeness，不构成 Performance Gate PASS。
- **PNG diff 只能是 OBSERVATION**：`referenceThreshold` 非规范；不得从 maxAbs / aboveThresholdPixelRatio 推出视觉等价 PASS。
- **artifact-completeness 的 PASS ≠ 视觉 PASS**：debug / motion / convergence 文件齐备只证明产物存在。

## UNABLE (11)

1. `runtime__resizeDiscontinuityApi` — HEAD 无 `setFixedCanvasSize` evidence API；benchmark 固定画布下 Playwright viewport resize 无效  
2. `runtime__deviceLossApi` — harness 无安全的 WebGPU device-loss 注入  
3. `runtime__cameraCutPixelProof` — 无可靠 camera-cut evidence API；`setCamera` 被 interactive orbit follow 覆盖；无整屏 invalidation 像素证明  
4. `runtime__steadyTimingAsPerformanceGate` — 稳态数据可用 ≠ 性能 Gate 通过（无冻结阈值 / 无 owner 判定）  
5. `runtime__taauVsFullresTaaVisualEquivalence` — PNG diff 仅为 OBSERVATION；T1 vs T2 视觉等价需 owner  
6. `runtime__ghostingBreathingVisual` — 拖尾 / 双影 / Bayer 残留 / 16 帧亮度呼吸需 owner 看序列  
7. `taau-vs-fullres-visual-equivalence` — 同上，矩阵级视觉 Gate  
8. `ghosting-breathing-owner-visual` — 同上  
9. `owner-visual-signoff` — owner 视觉签核 PENDING；SHA256 manifest 仅为库存  
10. `steady-median-p90-evidence` — 证据齐备性行；≠ 性能 Gate PASS  
11. `steady-median-p90-performance-gate` — Performance Gate 本身 UNABLE  

## Steady-state timing（三条路径）

- warmup=30，n=60，1280×720，DPR=1  
- HeadlessChrome + timestamp-query；`launchUsed=chrome-headless-webgpu`  
- 设备：nvidia / ampere  
- **警告：`runtimeSourceMatchesHead=false`（src + `shaders/cloud.wgsl` dirty）— 不得当作干净 revision Gate 数据**
- `runtime-evidence.json` `generatedAt=2026-07-28T07:33:03.227Z`

| Path | Mode | cloudCurrentMs med/p90 | taauBackgroundMs med/p90 | taauCurrentMs med/p90 | taauResolveMs med/p90 | temporalResolveMs med/p90 | compositeMs med/p90 | timedPassSumMs med/p90 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T0 | off | 5.799936 / 5.991424 | 0 / 0 | 0 / 0 | 0 / 0 | 0.022528 / 0.024576 | 0.02048 / 0.021504 | 5.861375999999999 / 6.053888 |
| T1 | full-res-taa | 5.944319999999999 / 6.524928 | 0 / 0 | 0 / 0 | 0 / 0 | 0.023039999999999998 / 0.024576 | 0.02048 / 0.021504 | 8.220672 / 8.668159999999999 |
| T2 | taau-4x4 | 0.586752 / 0.633856 | 3.246592 / 3.628032 | 0.586752 / 0.633856 | 0.0512 / 0.057344 | 0.0512 / 0.057344 | 0.021504 / 0.022528 | 6.25152 / 6.607871999999999 |

### 关键性能事实：TAAU 节省远小于 1/16

- T2 low-res current（`taauCurrentMs` median **0.586752** ms）相对 T1 `cloudCurrentMs`（**5.944319999999999** ms）约为 **0.0987×（≈1/10.1）**；raymarch texel 比为 `0.0625`（1/16），current 耗时未同比例降到 1/16。  
- T2 全分辨率 **background-only** pass median **3.246592** ms，占 T2 `timedPassSumMs`（**6.25152** ms）的约 **51.9%**。  
- 因此 `timedPassSumMs` 从 T1 median **8.220672** ms 到 T2 **6.25152** ms（约 **0.760×**），**远小于**「整帧降到 1/16」的叙事。`1/16` 只描述 raymarched texel 数，不得暗示整帧 GPU 开销。

显存（OBSERVATION，理论字节计数，非 bus 实测）：`cloudFrameHistoryBytes=14745600`；`cloudFrameLowResAttachmentBytes=1382400`；`taauHistoryDepthBytes=3686400`；`cloudFrameAttachmentBytes=22118400`；TAAU current 320×180。

## Rejection：聚合 vs 云上

Runtime 稳态 T2 lastSample（`runtime-evidence.json`；1/16 稀疏采样估计，`taauHistoryRejectionSampledEstimate=true`；非当前 phase 样本数 `taauNonCurrentPhaseSampleCount=57600`）：

| 指标 | 值 |
| --- | --- |
| 聚合 `taauHistoryRejectionRatio` | 0.9372395833333333（≈93.72%） |
| `taauRejectNoVelocityRatio` | 0.9334027777777778 |
| `taauRejectViewportRatio` | 0 |
| `taauRejectDepthRatio` | 0.0038368055555555555 |
| `taauRejectOpacityRatio` | 0 |
| 云上 `taauCloudCoveredRejectionRatio` | 0.022621967838648133（n=`taauCloudCoveredSampleCount=3669`，thr=0.01） |

**分类口径（修复后）**：云覆盖 = 3×3 低分辨率邻域**最大** opacity > 0.01（含云边缘）；不再只看中心样本。opacity 拒史判据为历史 opacity 相对该邻域区间的**外置距离**（非「与单个 current 样本比差值」）。

**聚合 ≈93.7% 几乎全部来自天空的 `rejectNoVelocity`。** 天空 current 本身即正确值，该聚合比率 **不能** 用来判定 TAAU 退化。

各场景 T2 diagnostics：

| Scene | cloudReject | n (cloud samples) | aggregate | opacity reject |
| --- | --- | --- | --- | --- |
| cirrostratus | 0 | 57600 | 0 | 0 |
| cirrus | 0 | 0（空场景） | 0 | 0 |
| cirrocumulus | 0.017582417582417582 | 1365 | 0.9745659722222222 | 0 |
| thin-ridge | 0.14067879980324643 | 2033 | 0.9684895833333333 | 0 |
| stratocumulus | 0.021305654192843484 | 3661 | 0.9372395833333333 | 0 |

thin-ridge 云上 rejection≈**14.1%**（分类含边缘后升高；opacity rejection 仍为 0）。TAAU 不接 `taaBlend`。

### thin-ridge 云上拒绝率上界推算（归因未采集）

`diagnostics/thin-ridge__temporal-T2.json` `temporal` 段（1/16 稀疏采样，`taauHistoryRejectionSampledEstimate=true`；采样格点总数 = 1280×720/16 = **57600**）：

| 指标 | 值 |
| --- | --- |
| `taauHistoryRejectionRatio` | 0.9684895833333333 |
| `taauRejectNoVelocityRatio` | 0.9598958333333333 |
| `taauRejectViewportRatio` | 0 |
| `taauRejectDepthRatio` | 0.00859375 |
| `taauRejectOpacityRatio` | 0 |
| `taauCloudCoveredRejectionRatio` | 0.14067879980324643 |
| `taauCloudCoveredSampleCount` | 2033 |

上界推算（非结论）：

- 全屏 depth rejection ≈ 0.00859375 × 57600 = **495** 个采样格点  
- 云覆盖被拒 ≈ 0.14067879980324643 × 2033 = **286** 个采样格点  
- 因 286 ≤ 495，depth **单独足以解释**这 286 个；但云覆盖分类用 3×3 邻域最大 opacity，本身是天空、只是紧邻云的 texel 也会被计为云覆盖，这类 texel 无有效 velocity，会走 `rejectNoVelocity`。thin-ridge 为细结构，边缘相邻天空 texel 占比高，**无法排除**这 286 里含相当比例的 nv。  
- **结论：归因未采集**；需 cause × 云覆盖交叉计数器才能定论（后续 wave 待补缺口）。

## 修复 B：debug 可视化观察者效应

### 发现

`debugView=16/17` 曾在 resolve pass 把可视化颜色（`a=0`）写进 location 0（history）。history opacity 被写成约 1.0 后，下一帧云体大面积触发 opacity rejection。rejection 视图显示的是**视图自身造成的拒绝**，会把判读者引向「TAAU 在云上退化成最近邻」的错误结论。进出 debug 视图还会整屏失效。

### 修复

resolve 在 debug 模式下照常写正确结果；可视化移到 composite 之后的独立叠加 pass 写 `sceneView`；分类逻辑与 resolve 共用同一份 WGSL 源码；切换不再整屏失效。

### 对照（capture diagnostics；opacity 均为 0）

| Source | nv | depth | opacity | cloudReject | n |
| --- | --- | --- | --- | --- | --- |
| cirrocumulus__debug-0 | 0.9713888888888889 | 0.0035243055555555557 | 0 | 0.01762114537444934 | 1362 |
| cirrocumulus__debug-17 | 0.9714930555555555 | 0.0030555555555555557 | 0 | 0.007407407407407408 | 1350 |
| stratocumulus__debug-17 | 0.9332986111111111 | 0.005954861111111111 | 0 | 0.046798029556650245 | 3654 |
| runtime T2 lastSample | 0.9334027777777778 | 0.0038368055555555555 | 0 | 0.022621967838648133 | 3669 |

`stratocumulus__debug-0` 的 rejection 计数为全 0 且 `taauCloudCoveredSampleCount=0`（`phaseCurr=57600`），**未采集**到可用的同场景 debug-0 拆分，故上表以 cirrocumulus 成对对照为准。

## Coding agent 截图判读（OBSERVATION；不替代 owner 签核）

1. `stratocumulus__debug-17__clean.png` 与 `thin-ridge__debug-17__clean.png`：云体内部为 accept 色并叠着 1/16 当前 phase 直写格点，只有云轮廓一圈是深度 rejection 色，天空为 no-velocity 色。与运行时计数一致，可判定**云体内部确实在复用 history**，未退化为最近邻。  
2. `stratocumulus__debug-16__clean.png`：当前 phase 高亮点构成规整 1/16 格点，Bayer 相位映射目视正常。  
3. `thin-ridge__temporal-T1__clean.png` vs `..._T2__clean.png`：亚像素级细长 ridge 在 full-res TAA 下呈细密交叉纹，在 TAAU 下变成**明显更粗的颗粒状点画**，ridge 略微变宽变软。这解释了该场景 PNG maxAbs 高而超阈值像素占比低（差异集中在这条细结构上）。**结论：TAAU 对亚像素细结构（cirrus / ridge 类）有可见劣化。**  
4. `stratocumulus__temporal-T1__clean.png` vs `..._T2__clean.png`：体积云在 TAAU 下丢失部分高频絮状细节、整体略软，但形状、亮度与阴影位置与 full-res TAA 接近。

## 收敛与稳定性（OBSERVATION）

冻结 `sceneClock` 下 cirrocumulus 相邻帧 PNG maxAbs：

| 对照 | maxAbs | aboveThresholdPixelRatio |
| --- | --- | --- |
| T2 f16 vs f17 | **42** | 0.00004991319444444445 |
| T1 f16 vs f17（对照） | **24** | 0 |

T2 相邻帧 maxAbs **大于** T1。这是静态场景下 TAAU 残留时域抖动的**弱信号**，标 **OBSERVATION**；是否构成 16 帧呼吸或棋盘残留需 **owner 看图**判定，不得从此数字推出 FAIL/PASS。

## 场景鉴别力

- `cirrus`：空场景（`raymarchLightSamplesPerPixel=0`）；T1 与 T2 逐位相同（maxAbs=0，同 SHA256）；对 W11 **无鉴别力**。  
- Manifest 无可用的稀疏 Ci 替代 case；Cs 用 `cirrostratus` 近似。  
- 因此 tasks **8.3** 的「sparse Ci」仅有近似替代且鉴别力不足 — 报告如实记缺口，tasks 8.3 **不勾选**。

## T1 vs T2 PNG diff（全部 OBSERVATION）

`pixel-diff.json` `generatedAt=2026-07-28T08:45:40.148Z`；`referenceThreshold=24` 非规范。

| Pair | maxAbs | aboveThresholdPixelRatio | changedPixelRatio |
| --- | --- | --- | --- |
| cirrostratus T1-vs-T2 | 13 | 0 | 0.7226052517361111 |
| cirrus T1-vs-T2 | 0 | 0 | 0 |
| cirrocumulus T1-vs-T2 | 33 | 0.00002170138888888889 | 0.026280381944444445 |
| thin-ridge T1-vs-T2 | 76 | 0.0016905381944444444 | 0.03938368055555556 |
| stratocumulus T1-vs-T2 | 34 | 0.000014105902777777777 | 0.056586371527777776 |
| cirrocumulus conv-f16-vs-f17 | 42 | 0.00004991319444444445 | 0.020130208333333333 |
| cirrocumulus conv-T1-f16-vs-f17 | 24 | 0 | 0.01967013888888889 |
| cirrocumulus conv-f17-vs-T1-steady | 42 | 0.000024956597222222224 | 0.026317274305555555 |

## Policy

- PNG diff = OBSERVATION；阈值非规范  
- 聚合 rejection 高 ≠ TAAU 退化；以云上 rejection 为准（分类口径见上）  
- `runtimeSourceMatchesHead=false` → timing 不作干净 revision Gate  
- 默认保持 `temporalQuality=1`（full-res TAA；已核实 `src/params.ts`）直至 owner 签核  
- 本地 PNG 在 gitignored `screenshots/`；仓库只留 SHA256 manifest  
- debug-16/17 现为非破坏叠加；修复前不可用于判读  

## Validation

| Command | Result |
| --- | --- |
| `npm run test:w11-bayer` | PASS |
| `npm run test:w11-lowres` | PASS |
| `npm run test:w11-invalidation` | PASS |
| `npm run test:w11-resolve` | PASS |
| `npm run capture:w11` | 已跑（截图本地；修复后重采） |
| `npm run evidence:w11-runtime` | 已跑 → `runtime-evidence.json`（`2026-07-28T07:33:03Z`） |
| `npm run evidence:w11-png-diff` | 已跑 → `pixel-diff.json`（`2026-07-28T08:45:40Z`） |
| `npm run evidence:w11-review` | 已跑 → `visual-review.json` |
