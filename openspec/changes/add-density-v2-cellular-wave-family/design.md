## Context

W7 source closure 已包含 Common Context、Stratiform family、Cumulus Billow、固定 12-body loop、tile candidate mask、top-two composition 与 final writer。Recipe 表启用五属，W5 shared Base Atlas 的 G/B 通道已经提供有界 Worley cell/edge 信号，但当前 V2 evaluator 尚未消费这些信号构造 Cellular 层。

Stratocumulus、Altocumulus 与 Cirrocumulus 共享 Cellular Layer 主体，但不应共享完全相同的最终密度：

- Stratocumulus：低空、cell 大、连接度高、层较厚；
- Altocumulus：中层、cell 中等、连接度中等；
- Cirrocumulus：高空、cell 小、profile 极薄、ripple 较强。

W8 需要扩展 family 而不改变 renderer/cache 外部契约，也不能因 Wave/Lens/Roll 的未来需求引入动态图解释器。

## Goals

- 用一个参数化 Cellular kernel 表达 Sc/Ac/Cc。
- 固定每次有效 Cellular evaluation 的 shared sample 上限为 3。
- 让 cell scale、connectivity、thickness 与 ripple 成为正交、可检查参数。
- 提供有界解析 Wave/Lens/Roll hook，零强度无额外形态成本。
- 保持 W7 五属、Legacy、Realtime、Optical、tile mask 与缓存消费者回归。
- 为 W9 增加新 family 时提供第二个“单 kernel、多 Recipe”模板。

## Non-Goals

- 不建立任意 Recipe graph、variant interpreter 或可变长 operator list。
- 不实现完整云种/变种枚举、scenario schema、用户自定义 WGSL。
- 不实现 Fiber、Convective、Hybrid detail、降水或 attachment。
- 不修改共享场生成格式、尺寸、更新 cadence 或新增纹理。
- 不以增加 cache resolution 修复周期、粒度或层厚问题。

## Decisions

### Decision 1: 一个 Cellular family kernel，三属静态分发

新增概念 evaluator：

```wgsl
fn densityV2EvaluateCellular(
  ctx: DensityV2Context,
  body: DensityBodyGPU,
  recipe: DensityRecipeGPU,
) -> DensityV2Evaluation
```

dispatcher 先检查 Recipe enabled，再按 topology family 将 Sc/Ac/Cc 路由到该 kernel。不得复制三个完整 evaluator，也不得按 genus 动态选择 sample 数。Stratiform 与 Cumulus 路径保持原 source 和预算。

W8 enabled genus IDs：

- 0 Cumulus；
- 1 Stratus；
- 2 Stratocumulus；
- 4 Altocumulus；
- 5 Altostratus；
- 6 Nimbostratus；
- 8 Cirrostratus；
- 9 Cirrocumulus。

disabled：3 Cumulonimbus、7 Cirrus。Unsupported-only V2 场景仍写 valid zero cache。

### Decision 2: Cellular 固定 Macro=1、Base=2、Detail=0

每个通过 footprint、height、profile 与 enabled dispatch 的 Cellular Body：

1. Macro sample：coverage、低频 thickness/ripple phase；
2. Base-A sample：主 cell interior/edge 信号；
3. Base-B sample：不同固定 seed/scale 的第二 cell 信号，用于破除单一格点规则性；
4. 解析 combine/finalize：cell contrast、connectivity 与 ripple，不新增 sample。

固定预算：

| Genus | Macro | Base | Detail | Dynamic neighbor/octave | Attachment |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stratocumulus | 1 | 2 | 0 | 0 | 0 |
| Altocumulus | 1 | 2 | 0 | 0 | 0 |
| Cirrocumulus | 1 | 2 | 0 | 0 | 0 |

`sampleLimits=[3,0,0,0]`，`detailAttachmentCosts=[1,0,0,0]`。Cost lanes 只用于验证与诊断，不驱动循环。

Alternative：在 cache evaluator 中重新执行 Worley 3×3×3 邻域。拒绝，因为 W5 atlas 已将该成本移出稳态热路径，运行时邻域会重复生成相同信息。

Alternative：只采一次 Base。拒绝，因为单一周期 cell 场更易暴露规则重复；第二个固定偏移/尺度 sample 提供有界去相关能力。

### Decision 3: Cell scale、connectivity、thickness、ripple 四轴分离

W8 复用 layout v2 的既有 lanes，并为 Cellular family定义独立语义 descriptor：

- `domain0`：Macro frequency、Base-A cell frequency、Base-B cell frequency、seed scale；
- `domain1`：wind phase、wave strength、horizontal anisotropy、vertical anisotropy；
- `vertical0/vertical1`：bottom/top fade、profile start/span、thickness variation；
- `topology0`：coverage threshold/softness/body gain/cell softness；
- `topology1`：cell interior/edge/secondary weights/connectivity bias；
- `topology2`：cell contrast、secondary scale、macro bias、ripple frequency；
- `detail0`：ripple amplitude、lens strength、roll strength、reserved；
- `finalize0`：density multiplier、feather scale、max density、reserved。

初始校准方向：

| Genus | Cell frequency | Connectivity | Profile | Ripple |
| --- | --- | --- | --- | --- |
| Sc | 低（大 cell） | 高 | 厚 Soft Layer | 弱 |
| Ac | 中 | 中 | 中等 Cellular Layer | 中弱 |
| Cc | 高（小 cell） | 低到中 | 极薄 Cellular Layer | 强 |

参数必须通过 CPU mirror probes 证明：默认三属 cell 特征尺度严格满足 `Sc > Ac > Cc`，profile span 满足 `Sc > Ac > Cc`，connectivity 响应不退化为相同阈值。

### Decision 4: Wave/Lens/Roll 是解析静态 hook，不是 variant 系统

W8 提供固定源码中的解析 hook：

```text
if waveStrength == 0 && rippleAmplitude == 0 && lensStrength == 0 && rollStrength == 0
  return unchanged cellular domain/support
```

hook 只允许使用 body-local coordinate、解析 sine/ridge/SDF 与已取得的 Macro phase；不得增加 texture sample、邻域、octave 或 Support 外密度。`waveStrength` 控制域排列，`rippleAmplitude` 控制已有 cell density 的有界幅度调制；两者与 Lens/Roll 都为零时才走完整零成本早退。Cc 默认可使用非零 ripple；Lens/Roll 默认保持零，作为未来独立 variant proposal 的 ABI/源码锚点。

W8 不增加 per-body variant ID，也不修改 scenario/import schema。不得把 genus identity 偷用为任意变体编码。

### Decision 5: Stage 顺序保证 sample-before-zero 风险最小

```text
global bounds
→ tile candidate bit
→ recipe enabled / topology family
→ finite extent
→ transported inverse-quaternion local context
→ rounded cellular-layer footprint
→ local height / profile reject
→ Macro sample
→ coverage / thickness reject
→ analytic wave/ripple domain hook
→ Base-A + Base-B samples
→ connectivity / cell combine
→ nonnegative finalize
→ Legacy-compatible soft overlap
→ one final RGBA store
```

Wave/Ripple/Lens/Roll 强度全零时必须在相关解析计算前返回 unchanged domain。Base sample 必须位于 coverage/profile reject 之后。

### Decision 6: 不扩大 Support、资源与稳态 pass

Cellular 主体、ripple 与 dormant lens/roll hook 均限制在既有 body-local rounded layer footprint 和 vertical profile 内，不允许产生 Support 外密度。现有 Sc/Ac/Cc conservative Support envelope 可保持不变；若实现期 fixture 证明不足，必须先在同一 change 内同步扩大 Recipe Support、mask signature 与 sweep fixture，不能仅改 shader。

W8 不新增 texture/buffer/bind-group/pass。普通 cache update仍只有一个 V2 compute pass；shared fields 只按 W5 signature cadence 生成。默认 Legacy 未请求 V2 时仍为零 V2 开销。

### Decision 7: 保持 top-two composition 与 Optical 正交

Cellular contribution 与 Stratiform/Billow 使用同一 total/best/second soft overlap 和 RGBA metadata。Cellular evaluator 不读取 Optical Profile。Sc/Ac/Cc 的阴影、透射和属级颜色继续由输出 genus metadata 驱动。

重叠验证至少覆盖：Cellular family 内两属重叠、Cellular + Stratiform、Cellular + Cumulus。不得新增私有 cache channel。

### Decision 8: 固定 manifests 与诊断

新增或扩展 manifest：

- single-stratocumulus；
- single-altocumulus；
- single-cirrocumulus；
- w8-cellular-scale（相同视域内比较 cell 尺度与 profile）；
- w8-cellular-overlap（验证 top-two metadata）；
- w8-wave-ripple（零强度与非零 ripple 对照）。

每个场景提供 Legacy/V2、Cached/Hybrid、normal/raw density-debug。固定 `96³`、`8×8×4`、相机、时间、风和 Body。

Stats/HUD/report 至少包含 enabled/unsupported genera、Sc/Ac/Cc 静态 sample limits、wave/lens/roll strengths、tile candidate upper bound、`actualEvaluatorCalls=unavailable`、shared-field generation、pipeline/source size、cache sample ID 与 timestamp 状态。

### Decision 9: W8 Gate 区分自动正确性、视觉与性能

不可豁免项：

- source/sample budget；
- Support containment 与 mask 无 false-negative；
- finite/nonnegative RGBA 与 genus metadata；
- W7 五属、Legacy、Realtime、Optical、资源/pass 回归；
- 无明显 atlas 周期棋盘、相机锁纹或 wind discontinuity。

若 timestamp query 可用，每个 backend/case 至少 5 个 cache warmup、30 个有效 cache samples。Sc/Ac/Cc V2 cache median 目标不高于 Legacy `1.00×`，p90 不高于 `1.20×`。timestamp 不可用或样本不足记为 `unresolved`；项目所有者可明确记录 `owner-waived`，但不得写成性能 pass。

## Cost Model

默认 `96³` 为 884,736 invocations。W8 仍 full-grid dispatch，tile mask 限制进入 family kernel 的 voxel-body pairs。最坏 dense fallback：

- 每个 Stratiform Body：最多 2 shared samples；
- Cumulus：最多 4；
- 每个 Cellular Body：最多 3；
- 八属同时 active 的理论 dense sample bound 为每 voxel 21 次 shared samples（四个 Stratiform 共 8、Cumulus 4、三个 Cellular 共 9）。

该数字只是静态上界，不是实际 evaluator 调用数或实测性能。正常场景必须依靠 Support/tile mask 显著低于 dense bound。

## Migration and Rollback

1. 扩展 Recipe banks/fixtures，但先保持 Sc/Ac/Cc disabled。
2. 增加 Cellular family kernel 与 CPU mirror，证明固定 3-sample closure。
3. 逐属启用 Sc、Ac、Cc，每属独立校准并验证尺度排序。
4. 接入静态 Wave/Ripple hook；Lens/Roll 保持默认零。
5. 扩展 dispatcher、HUD、manifests 与 Gate report。
6. 任一新属失败时可将该 Recipe 单独恢复 disabled；W7 五属与 Legacy Producer继续可用。

## Risks and Mitigations

- **三属看起来相同**：用 cell frequency、connectivity、profile span、coverage 与 ripple 多轴 fixture约束，不只靠 Optical 区分。
- **明显棋盘或周期重复**：固定第二 Base sample 去相关，并以 wind/rotation/camera sweep 验证；不得增加动态 octave掩盖。
- **Cc 粒度低于缓存 Nyquist**：先校准 cell frequency/profile 和解析 ripple；不默认提高全局 resolution。若仍无法辨识，Gate Stop/Review。
- **Sc 过度碎裂**：提高 connectivity/coverage，而不是回退完整 Legacy 团块链。
- **Wave hook 偷渡 variant 系统**：不增加 per-body variant ID，Lens/Roll 默认零，完整变种由后续独立提案授权。
- **source 膨胀**：强制单 Cellular kernel、三个 evaluator family source closure和固定 call-site 计数。
- **W7 证据缺口被误传**：W8 report单独标记 W7 inherited baseline 状态，不把历史未采集项写成通过。

## Open Questions

无阻塞问题。具体 Recipe 数值属于实施期校准，但不能改变批准的 3-sample budget、零新增资源/pass、无 scenario schema 扩展和非目标边界。
