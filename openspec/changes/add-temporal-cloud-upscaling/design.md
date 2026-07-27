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

同一像素 MUST NOT 串联旧 TAA 与 TAAU。实现上以 `temporalQuality`（或等价枚举，见 Open Questions）在 `full-res-taa` 与 `taau-4x4` 间切换；`taaEnabled=false` 时两条 resolve 都旁路，current 直通（full-res 或经点采样/最近 phase 展开，默认 full-res current 用于真值）。

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

`CloudFrameOutput` full-res 分配契约不由 W11 改写；若实现选择独立 low-res attachment 集合，须在不修改主 `cloud-frame-output` spec 的前提下作为 renderer 内部资源（见 Open Questions）。

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
- 若 low-res 需要独立 attachment 而触及 `cloud-frame-output` 公开 ABI → 升级为开放问题，不在本 change 擅自改主 spec。

## Migration Plan

1. 落地参数与路径枚举，默认 full-res TAA。
2. Low-res current + Bayer + TAAU resolve 可开关并行。
3. 自动检查 + Gate 证据；未 Continue 前不改默认。
4. 回退：关 TAAU / `temporalQuality=full-res-taa`；emergency fallback 自动禁用 TAAU。

## Open Questions

1. Low-res current 是扩展 `CloudFrameOutputResources` 支持第二套尺寸，还是 renderer 私有 low-res MRT？前者可能需要后续独立 amendment `cloud-frame-output`（本 change 不写该 delta）。
2. History 是否除 radiance/T 外额外存 representative depth（独立 texture/通道），还是 resolve 时仅从 current `depthVelocity` + 派生规则重建？
3. Reactive/disocclusion 默认阈值数值与是否进 GUI（本提案允许实现期常量 + Gate 校准）。
4. `temporalQuality` 命名与打包：CPU-only（类似 `densityProducerMode`）还是写入 `RenderParams`/`PARAM_OFFSETS`？
5. TAAU 关闭 temporal（`taaEnabled=false`）时，low-res current 如何展示到 full-res（nearest phase splat vs 强制切回 full-res current）——建议强制 full-res current 作真值，需 owner 确认。
6. W9 仍 pending 时，brick 重分配事件如何从 public API 订阅到 `discontinuityGeneration`（仅在 W9 active 时）？
