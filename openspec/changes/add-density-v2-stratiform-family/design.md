## Context

W6 source closure 当前包含 Common Context、Stratus Thin Sheet、Cumulus Billow、固定 body loop、top-two composition 与 final writer。Recipe 表中只有 Cumulus/Stratus enabled。W7 需要增加三属，但不能退化为四份复制 shader，也不能让所有 Stratiform 共享完全相同的最终密度形态。

形态讨论与技术手册给出一致分类：

- Stratus：低空、薄、低幅、近连续；
- Cirrostratus：高空、极薄、近均匀、几乎不侵蚀；
- Altostratus：中层、较厚、水平相对垂直方向拉伸、缓慢厚度变化；
- Nimbostratus：低/中层、厚、高覆盖、高密度；底部碎云与降水属于后续能力。

四者共享 Stratiform topology，但 Placement、Vertical Profile、密度幅度和 Optical Profile 不同。

## Goals

- 用一个参数化 family kernel 表达四个 Stratiform genus。
- 保持 Stratus W6 行为和 Cumulus W6 行为可回归。
- 将每个 Stratiform evaluation 固定在 Macro=1、Base=1、Detail=0。
- 让四属在固定场景下通过高度、厚度、连续性和低频结构可辨。
- 保持 Support、tile mask、metadata、cache 与 renderer 契约不变。
- 为 W8 提供“新增 family 不复制整个 pipeline”的模板。

## Non-Goals

- 不实现云种/变种、fractus、降水、附件或 Hybrid 微观细节。
- 不修改 optical/light scattering 参数。
- 不优化全屏 raymarch、light march 或 ground shadow。
- 不引入新的 GPU 资源或动态 Recipe interpreter。

## Decisions

### Decision 1: 一个 Stratiform family kernel，不复制四个 evaluator

W7 将 W6 `densityV2EvaluateStratus` 泛化为概念上的：

```wgsl
fn densityV2EvaluateStratiform(
  ctx: DensityV2Context,
  body: DensityBodyGPU,
  recipe: DensityRecipeGPU,
) -> DensityV2Evaluation
```

dispatcher 先检查 Recipe enabled，再按 topology family 将 Stratus、Cirrostratus、Altostratus、Nimbostratus 路由到这个 kernel；Cumulus 继续路由 Billow。不得为四属复制四套 sample 调用图。

Stratus Recipe 应保持 W6 初始值和公式结果；泛化提交必须用 CPU mirror/source fixture 证明它没有因重命名或 profile 分支发生无意漂移。

### Decision 2: Vertical Profile 只有 Thin Sheet 与 Soft Layer 两条解析分支

| Genus | Vertical Profile | 目标 |
| --- | --- | --- |
| Stratus | Thin Sheet | 低空薄层、有限上下 fade、低幅厚度变化 |
| Cirrostratus | Thin Sheet | 更均匀、更低 thickness variation、柔和薄幕 |
| Altostratus | Soft Layer | 中等厚度、上下边界缓和、磨砂式连续层 |
| Nimbostratus | Soft Layer | 厚层、高填充、允许更宽 bottom/top fade |

Soft Layer SHALL 是解析函数，不读取 texture。profile 选择由 Recipe `identityAndModes.z` 的预定义 mode 完成，分支位于 Macro/Base sample 之前能完成的高度 early reject 之后。

不得用 Thin Sheet/Soft Layer 生成 Support 外密度。Nimbostratus 现有 Support 上下各允许 0.05 作为保守余量，但 W7 主 profile 默认仍限制在 Body local height 内；未来底部 fractus 若使用扩张必须另行授权。

### Decision 3: 四属统一 2-sample budget

每个通过 analytic footprint、height 和 enabled dispatch 的 Stratiform Body：

1. Macro sample：coverage 与低幅 thickness variation；
2. Base sample：低频连续 modulation；
3. Finalize：body density/lifecycle × Recipe multiplier。

固定成本：

| Genus | Macro | Base | Detail | Warp | Attachment |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stratus | 1 | 1 | 0 | 0 | 0 |
| Cirrostratus | 1 | 1 | 0 | 0 | 0 |
| Altostratus | 1 | 1 | 0 | 0 | 0 |
| Nimbostratus | 1 | 1 | 0 | 0 | 0 |

`sampleLimits=[2,0,0,0]`，`detailAttachmentCosts=[1,0,0,0]`。Cost lanes 只用于验证/统计，不驱动动态循环。

Alternative：让 Cirrostratus 零 Base sample。拒绝，因为这会引入不同静态调用图或条件采样，且一次低幅 Base 有助于避免完全均匀塑料薄片；其 amplitude 可接近零。

Alternative：Nimbostratus 增加 Detail/fBm。拒绝，底部碎云不是主体厚层，属于 Variant/Attachment。

### Decision 4: Recipe 参数负责差异，Optical 不进入 Density

W7 继续使用现有 lanes：

- `domain0`：Macro/Base frequency；
- `domain1`：wind phase、warp=0、horizontal-vs-vertical anisotropy；
- `vertical0/vertical1`：profile fades 与 thickness variation；
- `topology0`：coverage threshold/softness/body coverage gain；
- `topology1/topology2`：Base weight、connectivity bias、低幅 modulation、macro bias；
- `finalize0`：density multiplier、feather scale、max density。

初始校准方向：

| Genus | Coverage | Base amplitude/frequency | Vertical | Density |
| --- | --- | --- | --- | --- |
| Stratus | 高 | 低幅、低频 | 薄 | 中低 |
| Cirrostratus | 近全覆盖 | 极低幅、极低频 | 极薄/均匀 | 低 |
| Altostratus | 近全覆盖 | 低幅、水平相对垂直拉伸 | Soft/中厚 | 中 |
| Nimbostratus | 全覆盖 | 低频、高填充 | Soft/厚 | 高 |

Cirrostratus halo、Altostratus sun disc、Nimbostratus absorption/base darkening 继续由输出 genus metadata 选择 Optical Profile。Density Recipe 不读取这些参数。

### Decision 5: Stage 顺序保持 sample-before-zero 风险最小

```text
global bounds
→ tile candidate bit
→ recipe enabled / topology family
→ finite extent
→ transported inverse-quaternion local context
→ rounded-sheet footprint
→ local height reject
→ analytic Thin Sheet / Soft Layer support
→ Macro sample
→ coverage gate / thickness adjustment
→ Base sample
→ nonnegative finalize
→ Legacy-compatible soft overlap
→ one final RGBA store
```

由于 Macro 参与 thickness variation，精确 profile top 可能在 Macro 后确定；但 local `height01<=0 || >=1` 必须先于所有 sample，Soft Layer 的基础边界也应尽可能提前。

### Decision 6: Enabled 集合为五属，unsupported 集合也为五属

W7 enabled genus IDs：

- 0 Cumulus；
- 1 Stratus；
- 5 Altostratus；
- 6 Nimbostratus；
- 8 Cirrostratus。

disabled：Stratocumulus、Cumulonimbus、Altocumulus、Cirrus、Cirrocumulus。Unsupported-only V2 场景仍必须输出 valid zero cache。

多体合成公式、G/B/A metadata 与 cache format 不变。Stratiform 与 Cumulus 重叠，以及不同 Stratiform genus 重叠，都使用 W6 top-two soft overlap。

### Decision 7: 不扩大共享资源与 steady pass 数

W7 不新增 texture/buffer/pass。Base/Detail/Macro 三个共享资源继续存在，但 Stratiform kernel只绑定并读取 Macro/Base。普通 cache update 不重建 shared fields；Recipe bank 改变属于静态 pipeline/adapter 创建内容。

source closure 静态检查应证明：

- evaluator family 恰好为 Stratiform + Cumulus；
- Stratiform source 只有 Macro/Base 两个 sample call site；
- Cumulus 仍为 Macro+Base+Base+Detail；
- 无 Legacy/4D/interpreter/atomic/workgroup/indirect source；
- normal frame 仍只有一个 cache compute pass。

### Decision 8: 固定验证场景与诊断

新增或扩展 manifest：

- single-stratus；
- single-cirrostratus；
- single-altostratus；
- single-nimbostratus；
- w7-stratiform-stack（按 Placement 高度分层、水平重叠）；
- w7-stratiform-overlap（同一局部区域验证 top-two metadata）。

每个场景提供 Legacy/V2，Cached normal 为主要 cache timing；Cached density-debug 与 Hybrid normal/debug 用于视觉/协议回归。固定 `96³`、`8×8×4`、相机、时间、风和 Body。

HUD/report 至少包含 enabled/unsupported genera、每属静态 sample limits、tile candidate upper bound、actual evaluator calls unavailable、shared-field generation、pipeline/source size、cache sample ID 与 timestamp 状态。

### Decision 9: Gate 区分测量结果与项目所有者豁免

若 timestamp query 可用，每个 backend/case 至少 5 个 cache warmup、30 个有效 cache samples。每个新属 V2 cache median 目标不高于 Legacy `1.0×`，p90 不高于 `1.2×`。Stratus 只做 W6 回归，不重新宣称 W6 未采集阈值。

若 timestamp 不可用或项目所有者决定以人工验收继续，report 可以记录 `owner-waived`，但不得写成 `pass`。任何 source budget、NaN/Inf、Support false-negative、metadata 错误或 Legacy 回退失败不可豁免。

## Cost Model

默认 `96³` 为 884,736 invocations。W7 仍 full-grid dispatch，但 tile mask 限制进入 family kernel 的 voxel-body pairs。最坏 dense fallback：

- 每个 Stratiform Body：最多 2 shared samples/evaluation；
- Cumulus：最多 4；
- 五属同时 active：每 voxel 理论 12 次 shared samples，而不是 Legacy 多体 4D noise；
- 正常场景应通过 Support/tile mask 远低于 dense bound。

这只是静态 upper bound，不得表述为实际 evaluator 调用数或实际性能收益。

## Migration and Rollback

1. 扩展 Recipe banks/fixtures，但先保持新属 disabled。
2. 泛化 Stratiform kernel，并证明 Stratus 回归。
3. 逐个启用 Cirrostratus、Altostratus、Nimbostratus，每属独立校准/提交。
4. 扩展 dispatcher、HUD/manifests 与 Gate report。
5. 任一新属失败时可将该 Recipe 单独恢复 disabled；Cumulus/Stratus 与 Legacy Producer继续可用。

不删除 `density-v2-stratus.wgsl` 历史语义，文件可重命名为 family 名，但 source fixture 与文档必须同步。

## Risks and Mitigations

- **四属看起来相同**：用 Placement、profile、coverage、anisotropy、amplitude/density 多轴区分；光学继续由 genus metadata 区分。
- **Cirrostratus 过于均匀像平板**：保留极低幅 Base，不增加 Detail。
- **薄层在 96³ 断裂**：优先调整实际 Body thickness 与 analytic fade；不提高全局 resolution。
- **Nimbostratus 缺少底部碎云**：明确作为后续 Variant/Attachment，不污染主体 kernel。
- **复制分支导致 source 膨胀**：强制单 family kernel和两个 evaluator family source closure。
- **benchmark 再次卡住或漏样本**：以 cacheSampleId/timestamp availability 为权威，保留 failed/unresolved/owner-waived 分类。
- **Optical 串入 density**：source/static checks 禁止 optical preset字段进入 V2 compute。

## Open Questions

无阻塞问题。具体 Recipe 数值属于实施期校准，但不能改变批准的 profile mapping、2-sample budget、资源/pass 数和非目标边界。
