## Context

现有 temporal 路径在 `src/renderer.ts`：`halton()` 驱动 camera jitter，`historyTex`/`historyViews` ping-pong，`cloudTaaPipeline`（cloud-frame）与 `legacyTaaPipeline`（combined）共享 YCoCg 3×3 variance clipping；`historyValid`、`previousJitterX/Y`、`params.taaEnabled`/`taaBlend` 控制启用与混合。W10A `CloudFrameOutputResources`（`src/rendering/cloudFrameOutput.ts`）发布 full-res `radianceTransmittance`、`depthVelocity`，并独立维护 `resourceGeneration`、`contentRevision`、`discontinuityGeneration`。W10B world-step/STBN 在 `src/rendering/worldRaymarch.ts` 与 stochastic 参数中，且路线图已规定 STBN 不得占用 W11 Bayer phase。

W11 在上述 ABI/采样基线上增加互斥 TAAU 路径；composite owner 与 attachment 格式仍属 W10A，不得重定义。

## Goals / Non-Goals

**Goals:**

- 互斥的两条 quality 路径，单一 history owner。
- Low-res current（宽高各 1/4，texel 1/16）+ 固定 16-phase Bayer 覆盖 + full-res TAAU resolve/history。
- Bayer offset 同时进入 ray direction、projection、previous-jitter/reprojection 与 velocity 约定。
- Rejection / reactive / disocclusion 与三代失效语义分离。
- Full-res current + full-res TAA 始终可切回；emergency combined fallback 禁用 TAAU。
- Gate：三条路径对比 + 固定 debug 视图 + 实际 GPU median/p90。

**Non-Goals:**

- W12 render-time detail。
- 改 BSM / 光照积分公式。
- 改 Density Recipe / family / W8/W9 brick ABI。
- 重定义 W10A attachment 数量/格式/clear/composite owner。
- 改 W10B world-step / skip / STBN 算法本身。
- 假设 W9 final Continue。

## Decisions

### Decision 1: 唯一 history owner，两条互斥路径

```text
Full-res quality:
  cloud current full-res → TAA resolve → cloud history full-res

Temporal upscale quality:
  cloud current (⌈W/4⌉ × ⌈H/4⌉, one 4×4 phase/frame)
  → TAAU resolve full-res → cloud history full-res
```

同一像素 MUST NOT 串联旧 TAA 与 TAAU。实现上以 `temporalQuality` 在 `off` / `full-res-taa` / `taau-4x4` 间切换（见 Resolved Decisions）；`taaEnabled=false` 时强制 Off，走 full-res current 真值路径，不展开 low-res phase。

Alternatives: 先 TAA 再 upsample — 拒绝，双 history 污染。

### Decision 2: Bayer phase 独占 TAAU jitter

- 固定 4×4 Bayer（或等价唯一覆盖序列）；`phase = frameIndex % 16`。
- Full-res TAA 继续用现有 `halton(hi,2/3)`（`src/renderer.ts`）。
- TAAU：Bayer subpixel offset 独占 projection / current-pixel jitter；**禁止**再叠加 Halton。
- W10B STBN/IGN（`stochasticSamplingActive`）只扰动 ray 起点/步进与采样序列，不改变 4×4 pixel phase。
- Bayer offset MUST 写入 current ray direction、current projection、`previousJitter`/reprojection 与 velocity 约定；禁止只偏 uv。

Frozen: 16 phase 唯一覆盖；phase 与 camera jitter 一致性。

### Decision 3: Low-res current 仍是 cloud-only MRT 语义消费者

Low-res target 宽高 = `ceil(fullW/4)`、`ceil(fullH/4)`；仍输出 radiance/transmittance 与 depth/velocity（语义同 W10A，尺寸不同）。不得从合成后地面/天空反推云深度。右/下边界 full→low 映射必须有 `scripts/check-w11-*.mjs` fixture。

`CloudFrameOutput` full-res 分配契约不由 W11 改写；low-res current 为 renderer 私有的第二份 `CloudFrameOutputResources` 实例（见 Resolved Decisions），不扩展主 `cloud-frame-output` 对外 ABI。

### Decision 4: Full-res resolve 与通道分离 history

- 当前 phase 对应 full-res texel：直接用本帧 current sample。
- 其余 15 phase：重投影 history。
- Velocity：low-res 3×3 邻域中最近有效云深度 / 最高 derived opacity；`opacity = 1 - T` 仅由 transmittance 通道推导，不是第二种 attachment。
- 稀薄边缘 MUST NOT 借用天空 invalid velocity。
- History 顺序：viewport → depth → derived opacity → generation → camera-cut rejection → YCoCg variance clip。
- Reactive/disocclusion：当前/历史 derived opacity、代表深度或 storage/`resourceGeneration` 差异超阈值 → 提高 current 权重或完全拒绝。
- Color、transmittance、representative depth 的 history 策略分开；禁止把 color clipping 结果当作物理深度。

Frozen: velocity/depth 单位（继承 W10A）、history ping-pong、disocclusion 与 reactive mask。

### Decision 5: 三代失效命名与整屏 vs 局部

| 名称 | 含义 | TAAU 行为 |
| --- | --- | --- |
| `resourceGeneration` | 纹理/分配世代（resize、device loss、attachment 重分配） | 整屏 invalidation |
| `contentRevision` | 当前分配内成功写入/可重投影内容更新（含正常 density cache 更新、连续风平流） | **不得**每帧整屏 reset；靠 velocity + reactive + 局部 rejection |
| `discontinuityGeneration`（discontinuity flag） | 结构性不连续：camera cut、producer/storage/quality 切换、sun discontinuity、scene time jump、W9 brick 重分配（若发生）、pipeline/path 切换 | 整屏 invalidation |

Frozen: resize / device-loss / producer-generation invalidation。

### Decision 6: Emergency fallback 与默认质量

- `cloudFrameActivePath !== 'cloud-frame'` 的 legacy combined emergency fallback：强制禁用 TAAU；可保留 legacy combined TAA（现有 `legacyTaaPipeline`）或关闭 temporal（沿用现状）。
- Feature-off 真值：full-res cloud-only current + full-res TAA（W10A 已规定）。
- 默认 `temporalQuality = full-res-taa`，直到 Gate 在目标设备矩阵通过。

### Decision 7: 参数与诊断

在 `src/params.ts` / GUI 暴露至少：`temporalQuality`（或 `taauEnabled`）、既有 `taaEnabled`/`taaBlend`、reactive/disocclusion 阈值（可先内部常量 + HUD 暴露）。HUD/stats 增加：phase index、current 分辨率、history 字节、rejection 比率、current/resolve/composite/总 GPU timing。文档与 HUD MUST NOT 把 1/16 texel 误写成“像素数只降到 1/4”。

## 上游参考与差异

W11 的 4×4 Bayer TAAU 架构参考 `../../three-geospatial/packages/clouds/`（MIT）。具体来源：

- `src/bayer.ts:3-21` — 16 项 `bayerIndices` 与 `bayerOffsets` subpixel offset 推导
- `src/shaders/cloudsResolve.frag:161-168` — `TEMPORAL_UPSCALE` 分支（`lowResCoord = coord / 4`、`bayerValue == frame % 16` 决定本帧直写 current、其余走 `prevUv = vUv - velocity` 重投影）
- `src/shaders/cloudsResolve.frag:49-61` — `getClosestFragment` 的 3×3 最近深度选 velocity
- `src/shaders/cloudsResolve.frag:63-118` — `temporalUpscale`；`120-152` — `temporalAntialiasing` 的 full-res 分支
- `src/shaders/varianceClipping.glsl` — variance clipping
- `src/CloudsResolveMaterial.ts` 与 `src/CloudsPass.ts` — 两模式资源与切换（含 `temporalUpscale` 时 current 取 1/4 分辨率）
- `src/qualityPresets.ts` — 分档

许可与移植边界：优先移植算法与资源契约到 WebGPU/WGSL；若直接改写 shader 片段，必须在本项目文件内保留上游 MIT 与来源注释。

本 change 刻意偏离上游之处：

1. 上游 resolve 只做视口越界 rejection；W11 额外要求 depth / derived opacity / generation / camera-cut rejection 与 reactive/disocclusion mask。
2. 上游把 depth 与 velocity 打包进同一 buffer 的 rgb 通道；W11 沿用 W10A 已冻结的 `depthVelocity` 语义，不得新增第二种 attachment 语义。
3. 上游注释自认「大 varianceGamma 会增加 ghosting，但云上不太看得出来」（`cloudsResolve.frag:95-97`）；W11 把稀薄云 smearing 列为高风险并要求固定 case 验证，不接受这种取舍。
4. 上游 `textureCatmullRom` 在 resolve 中已被注释掉、退回双线性（`cloudsResolve.frag:98-99`）；W11 若考虑更高阶 history 采样必须自带证据。
5. 上游绑定 Three.js `Pass`/`postprocessing` 的 `Resolution` 与 ECEF 世界；W11 使用本项目的 WebGPU 管线与本地平面世界。

## Risks / Trade-offs

- 稀薄云 history smearing → 固定 case：sparse Ci/Cs、Cc ripple、cloud/sky edge、cloud/ground overlap、快速相机 yaw；debug：normal / raw density / transmittance / depth / velocity / history rejection / phase。
- 高运动过度 current blend 失去重建收益 → Gate = Review；默认保持 full-res TAA。
- ceil 边界映射错误 → fixture 锁定右/下边。
- 双重 jitter（Bayer+Halton）→ 规范禁止；检查脚本断言 TAAU 路径 Halton 关闭。
- 不得暗示「整帧 GPU 开销降到 1/16」：TAAU 下仍有全分辨率 background-only pass；`1/16` 只作用于 raymarch/light-march current。

## Migration Plan

1. 落地参数与路径枚举，默认 full-res TAA。
2. Low-res current + Bayer + TAAU resolve 可开关并行。
3. 自动检查 + Gate 证据；未 Continue 前不改默认。
4. 回退：关 TAAU / `temporalQuality=full-res-taa`；emergency fallback 自动禁用 TAAU。

## Resolved Decisions

原 Open Questions 在实施中已全部落地，按代码核对如下。

1. **低分辨率 current 的资源归属**  
   - 问题：扩展 `CloudFrameOutputResources` 公开 ABI，还是 renderer 私有第二套 MRT？  
   - 决策：复用 `CloudFrameOutputResources` 类再实例化一份低分辨率实例（renderer 私有，`label` 前缀 `w11-taau-lowres`，尺寸 `⌈W/4⌉×⌈H/4⌉`）；attachment 数量/格式/clear/generation 语义与 W10A 完全一致。  
   - 理由：不扩展 `cloud-frame-output` 主 spec 对外 ABI，无需单独 amendment。

2. **representative depth history**  
   - 问题：是否额外存储代表深度，还是仅从 current `depthVelocity` 重建？  
   - 决策：独立全分辨率 `r16float` ping-pong（`w11-taau-history-depth-*`），存 `log2(1 + depth)`；读取一律 `textureLoad` 最近取整，不做双线性。  
   - 理由：`r32float` 在 WebGPU 默认不可过滤；双线性会跨深度边界插值出假深度。Color history 与 depth history 分离，color clip 不得充当物理深度。

3. **reactive / rejection 阈值**  
   - 问题：默认数值与是否进 GUI？  
   - 决策：本轮为实现期常量，不进 GUI：`TAAU_DEPTH_REJECT_REL = 0.1`（深度相对容差）、`TAAU_OPACITY_REACT_LO = 0.05`、`TAAU_OPACITY_REJECT_HI = 0.25`（均为邻域区间**外置距离**阈值，见 Implementation Decisions §5）。实际取值经 stats（`taauDepthRejectRel` / `taauOpacityOutsideReactLo` / `taauOpacityOutsideRejectHi`）暴露，供 Gate 调参。  
   - 理由：冻结 ABI 前先用常量收敛；避免过早占 GUI/`PARAM_OFFSETS` 槽位。

4. **`temporalQuality` 的传递方式**  
   - 问题：CPU-only 还是写入 `PARAM_OFFSETS`？  
   - 决策：CPU-only 参数，**不占** `PARAM_OFFSETS`（W10B 已冻结 `BODY_BASE = 60` 等 ABI）。Shader 所需 pass 形态经 renderer 私有 camera uniform 传递：该 buffer 从 40 个 float 扩到 48，追加 `taauMode` 与 `taauTargetSize` 两个 `vec4f`。  
   - 理由：避免触碰已冻结 params 布局；passMode / Bayer 子像素中心 / 全分辨率尺寸只服务 renderer 内部。

5. **`taaEnabled` 与 `temporalQuality` 的关系**  
   - 问题：关闭 temporal 时 low-res 如何展示；模式优先级如何？  
   - 决策：`temporalQuality` 是唯一模式来源（`0=off` / `1=full-res-taa` / `2=taau-4x4`）；`taaEnabled=false` 强制 Off；`debugView` 非 TAAU 专用视图（16/17）时强制 Off；legacy combined 路径（`cloudFrameActivePath !== 'cloud-frame'`）上将 TAAU 上限降为 full-res TAA。Off 走 full-res current 真值，不做 nearest-phase splat。每种降级在 stats 报告 `temporalFallbackReason`（`taa-disabled` / `debug-view` / `combined-path`）。  
   - 理由：单一模式 owner，避免 TAA 与 TAAU 串联；真值路径始终可对比。

6. **W9 brick 重分配的失效信号**  
   - 问题：W9 仍 pending 时如何接到 `discontinuityGeneration`？  
   - 决策：经已有公开信号 `DensityCacheOutput.hierarchical.allocationGeneration` 接入整屏失效，未新建跨模块私有通道。另：太阳方向跳变超过 `SUN_DIRECTION_DISCONTINUITY_DEG = 2`（点积阈值 `cos(2°)`）亦触发整屏失效；连续日移不触发。  
   - 理由：只消费已发布 generation，不耦合 W9 内部；太阳硬切与连续 TOD 分离。

## Implementation Decisions

实施期新增、原 design 未覆盖的决定：

1. **全分辨率 background-only pass**  
   TAAU 帧内跑三个 pass：全分辨率 background-only（复用 cloud pipeline，`passMode=2`，跳过 raymarch 与 light march）、低分辨率 Bayer current（`passMode=1`）、全分辨率 resolve。Composite 仍需要全分辨率背景（天空 / 地面 / 地面云影）；把 1/4 分辨率背景放大回去会让地平线与地面阴影明显走样。因此 `1/16` 节省只作用于 raymarch 部分，不得暗示总开销降到 1/16。

2. **低分辨率 ray 的精确映射**  
   低分辨率 texel `(lx, ly)` 的 ray 精确穿过全分辨率像素 `(4lx + sx, 4ly + sy)` 的中心（`sx/sy` 为当前 Bayer 子像素），由全分辨率尺寸反算 NDC，而不是把低分辨率 uv 线性缩放到全分辨率。`W` 或 `H` 不能被 4 整除时，低分辨率网格右/下边界会落到视口外；这些 texel 照常渲染但 resolve 永远读不到，无需仿射修正。

3. **TAAU 下不存在额外 jitter**  
   子像素选择本身即采样位置，样本精确落在全分辨率 texel 中心；TAAU 模式下 Halton 与 `jitterPixels` 全部置 0，Bayer 不与 Halton 叠加。

4. **非当前 phase 输出纯 clipped history**  
   `taaBlend` 只服务 full-res TAA，不接入 TAAU。TAAU 的 `current` 来自同一低分辨率块的**另一个子像素**；任何固定比例 current 混入都会每帧注入错位样本并持续软化重建。默认输出 variance-clipped history。

5. **opacity rejection / reactive 的最终语义：邻域区间外置距离**  
   不得把「历史 opacity 与单个 current 低分辨率样本的差值」当作拒史判据：该 current 样本属于块内**另一个子像素**，不是本 texel 的同位置真值，在 TAAU 下差值必然偏大并误触发整片 opacity rejection。最终语义：对历史 opacity 相对 **3×3 低分辨率邻域 opacity 区间**计算**外置距离**；超过 `TAAU_OPACITY_REACT_LO`（stats：`taauOpacityOutsideReactLo`）时 reactive 提高 current 权重，超过 `TAAU_OPACITY_REJECT_HI`（stats：`taauOpacityOutsideRejectHi`）则完全拒史。云覆盖分类同步改为 3×3 邻域**最大** opacity（含云边缘），不再只看中心样本。

6. **rejection 比率为 1/16 稀疏采样估计值**  
   resolve 原子计数只在 `coord.x % 4 == 0 && coord.y % 4 == 0` 的格点累加，避免每帧上百万次原子操作拖慢被测 resolve pass。文档与 HUD（`taauHistoryRejectionSampledEstimate`）均标注为估计值；Gate 不得拿它做精确硬阈值。

7. **timestamp 契约放宽**  
   `TS_COUNT` 从 22 增到 26（新增 background 与 low-res current 两对槽位：22–23、24–25）。`scripts/check-w10a-cloud-frame-output.mjs` 与 `scripts/check-density-shared-fields.mjs` 中硬编码 `const TS_COUNT = 22` 的字面断言已改为解析数值并要求不小于各自需要的槽位上限；具体槽位索引断言全部保留。`openspec/specs/cloud-frame-output/spec.md`、`cloud-rendering/spec.md` 与 W10A 归档 delta 均未将 `TS_COUNT = 22` 列为规范性要求。

8. **时域可视化不得写入被观测的 history**  
   若 debug 可视化写进 resolve 的 history 输出（location 0），会把 history opacity 污染为可视化颜色的派生值，下一帧在云体上大面积触发 opacity rejection，rejection 视图显示的是**观察者效应自身造成的拒绝**，自证为伪。实施教训：观测通道与被观测状态分离。

## Debug Views（TAAU）

`debugView` 枚举新增：

| 值 | 名称 | 含义 |
| --- | --- | --- |
| 16 | TAAU phase | 当前 Bayer phase 高亮，其余 phase 按序号着色 |
| 17 | TAAU rejection | 各 rejection / accept 原因着色 |

二者是唯一不会强制关闭 temporal 的 debug 视图。resolve 在 debug 模式下仍写正确的 history；可视化在 composite **之后**的独立叠加 pass 写到 `sceneView`。分类逻辑由 resolve 与 overlay 共用同一份 WGSL 源码常量。history 保持干净；进出这两个视图**不**触发整屏失效。

颜色映射（overlay `debugMode`，仅影响 `sceneView` 显示，不写 history）：

| 视图 | 条件 | RGB |
| --- | --- | --- |
| phase (16) | 当前 phase texel | `(1.0, 0.4, 0.05)` |
| phase (16) | 其他 phase | `(t·0.35, t·0.55, t)`，`t = bayerIndex / 15` |
| rejection (17) | 当前 phase / history 无效时直写 current | `(1.0, 1.0, 1.0)` |
| rejection (17) | 无有效 velocity | `(1.0, 0.15, 0.15)` |
| rejection (17) | 视口越界 | `(0.9, 0.2, 0.9)` |
| rejection (17) | 深度 rejection | `(0.15, 0.85, 0.95)` |
| rejection (17) | opacity rejection | `(1.0, 0.85, 0.15)` |
| rejection (17) | 接受 history（含 reactive 混合路径的可视化底色） | `(0.08, 0.1, 0.14)` |
