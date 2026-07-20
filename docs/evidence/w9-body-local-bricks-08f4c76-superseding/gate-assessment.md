# W9 Gate assessment

## Decision layers

- **Report verdict: STOP.** `gate-report.json` 在 clean `08f4c76` evidence 上生成，
  runtime=`pass`、matrix protocol=`pass`、visual=`fail`、performance=`fail`、owner=`pending`。
- **Recommended final disposition: Stop.** 性能硬阈值与视觉验收均失败，source audit 还发现
  两个 machine Gate 未检查的 protocol 缺口。
- **Recorded final disposition: pending owner.** 本文不是 owner approval，也不把 report verdict
  冒充项目所有者已正式记录的 final disposition。

W9 不可归档；在 owner 正式记录 final disposition 前不得开始 W10 实现。

## Gate conditions

| Gate condition | Result | Evidence |
|---|---|---|
| Same-revision reproducibility | Pass | clean `08f4c76`; 108/108 cases; fixed manifest/environment |
| Runtime completion | Pass | 无 timeout/stale/page error；仅 benign favicon 404 |
| Fixed-matrix protocol checks | Pass | Gate builder 的 108-case terminal diagnostics 全通过 |
| Full W9 protocol/lifecycle | Fail | task 4.5 没有独立 staging atlas generation；task 7.2 没有实际 fallback sample count |
| Visual benefit/safety | Fail | Ac、Cc、cellular-scale 出现规则 stripe/lattice；多项 motion/Support 仍需 Review |
| Performance budget | Fail | 九场景 cloud median 与 ground-shadow median 全部超阈值 |
| GPU sample sufficiency | Pass | 每 timing case cache/brick/shadow 60 samples；cloud 119–120 |
| Memory/K/bounds terminal diagnostics | Pass | 13.5 MiB resident、27 MiB reported peak、K=4、one-brick/Body |
| Real lifecycle/manual evidence | Review | device loss、Body mutation、resize、moving LOD 没有真实 capture |
| Owner approval | Pending | 未伪造或代签 |

注意：machine `protocol=pass` 只表示它所编码的 terminal snapshot checks 通过。
它不检查逐帧 generation promotion，也不检查 `fallbackSamples`，因此不能覆盖下面的 source audit。

## Protocol blockers outside the machine Gate

### Atomic layout generation is not implemented

`BodyLocalBrickCache` 只有一套 atlas pair/record/candidate resources。layout 变化时它原地替换
layout、清 warm mask、覆盖 buffers，并在同一 atlas pair 上依次重写；warming 期间 `getOutput()`
返回 `null`，renderer 安全退回 global-only，之后再 promotion 回 hierarchical。

这避免消费半初始化资源，但不满足已批准 spec 的要求：旧 hierarchical generation 必须继续
有效，直到独立的新 pair、records 与 candidates 完整 warm-up，再进行一次原子切换。当前
`rebuildPeakBytes=residentBytes×2` 只是诊断公式，不是两套 live atlas pair 的观测值。

因此 task 4.5 已重新打开；Body/LOD mutation 时还可能出现短暂 detail drop/popping，task 7.3、
9.3 与 10.1 保持未完成。

### Fallback sample count is unavailable

所有 hierarchical results 都记录 `fallbackSamples=null`，HUD 也不显示 unavailable；Gate builder
没有检查该字段。`null` 比伪造 `0` 或用 tile upper bound 冒充实际调用诚实，但当前 W9 spec
明确要求报告 fallback count，未明确授权 nullable。task 7.2 已重新打开。若 owner 希望接受
unavailable，必须通过明确的 spec amendment/waiver；否则需要 diagnostic-only 真实 GPU counter。

## Visual result

AI static-PNG review 已与本轮 `evidenceGeneratedAt` 对齐，但不是 owner review。

- Fail: `single-altocumulus`、`single-cirrocumulus`、`w8-cellular-scale`。hierarchical normal、
  density-debug 与 ground shadow 出现规则竖向条带/格点，不能因比 global-only 更锐而判为改善。
- Review: `w8-cellular-overlap` 的重叠区更白/更满且带规则细带，静态图不能排除 double-density；
  `w8-wave-ripple` 不能区分 world-stable ripple 与 atlas/screen locking。
- Static pass with external review still required: stratocumulus、LOD、overflow coarse fallback、thin-ridge。
  单帧不能证明相机/风/LOD transition、Body mutation、Support/metadata ownership。

完整逐 scene 字段见 `visual-review.json`。

## Performance result

阈值：cloud median `≤1.25×`、p90 `≤1.35×`；ground-shadow median `≤1.35×`、
p90 `≤1.50×`。下表为 hierarchical / global-only：

| Scene | Cloud median | Cloud p90 | Shadow median | Shadow p90 |
|---|---:|---:|---:|---:|
| single-stratocumulus | 1.291× | 1.298× | 1.377× | 1.371× |
| single-altocumulus | 1.273× | 1.285× | 1.382× | 1.378× |
| single-cirrocumulus | 1.277× | 1.279× | 1.380× | 1.372× |
| w8-cellular-scale | 1.325× | 1.339× | 1.380× | 1.375× |
| w8-cellular-overlap | 1.400× | 1.411× | 1.383× | 1.379× |
| w8-wave-ripple | 1.341× | 1.349× | 1.385× | 1.382× |
| w9-brick-lod-sweep | 1.314× | 1.324× | 1.382× | 1.377× |
| w9-brick-overflow | 1.305× | 1.317× | 1.379× | 1.377× |
| w9-thin-ridge-proxy | 1.297× | 1.301× | 1.379× | 1.373× |

九个 cloud median 与九个 shadow median 全部失败；overlap 的 cloud p90 也失败。
shadow p90 与 combined coarse+brick cache absolute budgets 全部通过。各 pass 的绝对
median/p90/count 仍完整保存在 `results.raw.json`，没有被失败摘要丢弃。

反向顺序复测在同 revision/同设备得到 cloud median `1.281–1.396×`、shadow median
`1.381–1.389×`，与 canonical capture 一致，排除固定 global→hierarchical 顺序造成的假失败。
早一版 `faac799` 的同设备复测更差（cloud `1.381–1.567×`、shadow `1.451–1.474×`），
说明 `08f4c76` 的 uniform record/single-candidate path 是改善，不是当前失败来源；但改善后仍超预算。

## Missing external evidence

以下不能从固定 screenshot/timestamp matrix 推导，保持 Review：

- 真实 device-loss 与 async completion race；
- resize、workgroup、Body add/remove/reorder、allocation recovery 的逐帧 capture；
- moving camera/wind 与跨 LOD threshold 的 seam/popping/phase 视频；
- per-Body Support/metadata ownership 与 fallback sample 实际调用计数；
- owner 对视觉收益、任何 waiver 与 final disposition 的签字。

没有提高默认 global cache resolution、没有增加无界 atlas/brick/body scan、没有放宽阈值、
没有移除 global-only 或 Legacy fallback。
