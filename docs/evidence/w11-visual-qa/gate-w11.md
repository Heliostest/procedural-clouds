# W11 Gate Report — 4×4 Bayer Temporal Cloud Upscaling (TAAU)

- Evidence: `docs/evidence/w11-visual-qa/`
- Revision: `6121d434` (HEAD); **runtimeSourceMatchesHead=false**（src/shaders dirty；docs/OpenSpec/evidence 亦 dirty）
- OpenSpec: `add-temporal-cloud-upscaling`
- Decision: **PENDING (owner review required)**
- Formal Continue: **NO**

## Verdict

| Axis | Status | Notes |
| --- | --- | --- |
| Automated contracts | PASS | `test:w11-bayer` / `test:w11-lowres` / `test:w11-invalidation` / `test:w11-resolve`；既有回归未在本证据包重跑失败记录 |
| 三路径对比证据齐备性 | PASS | T0/T1/T2 截图+diagnostics+timing 齐备；**≠ 视觉 PASS** |
| opacity 拒史消除 | PASS | 修复 A 目标：全场景 `taauRejectOpacityRatio`=0（不再出现整片 opacity 拒史）。聚合≈93.7% 为天空 `rejectNoVelocity`，不作退化判据 |
| 云上总拒绝率归因 | OBSERVATION | 云覆盖分类口径：3×3 低分辨率邻域**最大** opacity>0.01（含云边缘）；与旧口径（中心样本）数字不可比。runtime 稳态 n=3669、cloudReject=0.022621967838648133；各场景 T2：cirrostratus=0（n=57600）、cirrus n=0、cirrocumulus=0.017582417582417582（n=1365）、thin-ridge=0.14067879980324643（n=2033）、stratocumulus=0.021305654192843484（n=3661）。thin-ridge 云上拒绝率 14.1% 的 **cause 归因未采集**（产物仅有全屏 cause 拆分 + 云覆盖总拒绝率，无 cause × 云覆盖交叉表）；上界推算见 `report.md`。**不得**作为 PASS 依据 |
| debug 可视化可信度 | PASS | debug-16/17 为非破坏叠加（composite 之后写 `sceneView`，不污染 history）。cirrocumulus debug-0 / debug-17 对照：`taauRejectOpacityRatio` 均为 0；拆分见 `report.md`。**修复前该视图不可用于判读** |
| 视觉等价 T1 vs T2 | UNABLE | PNG maxAbs 仅为 OBSERVATION；owner PENDING。coding agent 截图 OBSERVATION：thin-ridge 亚像素细结构在 TAAU 下呈更粗颗粒点画、ridge 变宽变软（见下） |
| 静态收敛 / 16 帧呼吸 | UNABLE | 冻结时钟 T2 邻帧 maxAbs=42 vs T1=24（OBSERVATION 弱信号）；需 owner 看 conv 序列 |
| 运动拖尾 / 双影 | UNABLE | stratocumulus motion T0/T1/T2 序列已采；需 owner |
| Performance Gate | UNABLE | 数据可用 ≠ 性能 Gate 通过；且 TAAU `timedPassSumMs` 节省远小于 1/16（见 `report.md`） |
| resize / device-loss / camera-cut 像素级证明 | UNABLE | HEAD harness 无对应 evidence API |
| clean-revision timing | UNABLE | `runtimeSourceMatchesHead=false`（W11 src/shaders 未提交） |
| Gate | **REVIEW (pending owner)** | 不代替 owner Continue |

## Shared matrix (`visual-review.json`)

**64 PASS / 0 FAIL / 11 UNABLE / 16 OBSERVATION** — `visualGate=UNABLE`, `performanceGate=UNABLE`, `gateVerdict=REVIEW/PENDING`, `formalContinue=false`.

## Owner 判读指引

截图在 gitignored `screenshots/`；需本地 `npm run capture:w11` 后查看。建议最短路径：

1. **三路径**：`{scene}__temporal-T0/T1/T2__clean.png`（优先 thin-ridge、cirrocumulus、stratocumulus；忽略 cirrus——空场景无鉴别力）  
2. **Phase / rejection**：`thin-ridge__debug-16__clean.png`、`thin-ridge__debug-17__clean.png`、`stratocumulus__debug-16/17__clean.png` — **现为非破坏性**（不污染 history、切换不整屏失效）；修复前 debug-16/17 曾把可视化写入 history，**不可用于判读**  
3. **收敛**：`cirrocumulus__conv-f16.png` / `conv-f17.png`，对照 `conv-T1-f16` / `conv-T1-f17`  
4. **运动**：`stratocumulus__motion-T1__f*.png` vs `motion-T2__f*.png`

### Coding agent 截图 OBSERVATION（不替代 owner 签核）

`thin-ridge__temporal-T1__clean.png` vs `..._T2__clean.png`：亚像素细长 ridge 在 full-res TAA 下呈细密交叉纹，在 TAAU 下变成明显更粗的颗粒状点画，ridge 略微变宽变软。对应 PNG maxAbs=76、aboveThresholdPixelRatio≈0.00169（差异集中在细结构）。**TAAU 对亚像素细结构（cirrus / ridge 类）有可见劣化** — 直接影响是否 Continue。

## 默认策略（tasks 8.6）

目前没有观察到「靠过度 current blend 去鬼影」的证据（TAAU 不接 `taaBlend`；opacity rejection=0；云上 rejection 见上表）。thin-ridge 云上拒绝率≈14.1% 的 **cause 归因未采集**：全屏 depth rejection 上界足以解释该数量，但因 3×3 邻域分类会把紧邻云的天空 texel 计入云覆盖，**无法排除**其中含相当比例 `rejectNoVelocity`；推算见 `report.md`。视觉判定未完成，故**默认保持 full-res TAA 为出厂默认**（`temporalQuality` 默认值 **1**，已核实 `src/params.ts`）直至 owner 签核。

## Owner decision

- Date: （待填）
- Disposition: （待填：Continue / Stop / 继续 Review）
- Owner-waived（若 Continue，逐项列出非实测通过项）: （待填）
- Note: （待填）
