# W9 task audit

## Count transition

- 接手时 OpenSpec：44/57。
- 本轮完成四项 evidence/prerequisite tasks：0.5、7.5、9.1、10.2。
- 本轮重新打开两项被过早勾选的 tasks：4.5、7.2。
- 当前 checklist：46/57；仍有 11 项未完成。

## Changed statuses

| Task | New state | Reason |
|---|---|---|
| 0.5 | complete | 固定 clean revision、RTX 5090/Chrome 150、1280×720/DPR1、96³、8×8×4 与完整 A/B manifest |
| 4.5 | reopened | 只有 warming→global-only→hierarchical；没有旧 active + 新 staging pair 的原子 generation replacement |
| 7.2 | reopened | candidate tile diagnostics 存在，但 `fallbackSamples=null` 且 HUD/Gate 不报告 unavailable |
| 7.5 | complete | 独立 machine-readable source evidence、raw output 与 Gate report 已生成 |
| 9.1 | complete | 108-case matrix 与 216 PNG 全部捕获 |
| 10.2 | complete | 所有 timing case 达到 5+ cache warm-up 与 60+ timestamp samples |

## Still unchecked

- **Implementation/protocol:** 4.5、7.2。
- **Missing scenario evidence:** 7.3，尤其 lifecycle/resize/device-loss/Body mutation。
- **Manual acceptance:** 9.2–9.5。9.2 已有明确视觉失败；9.3–9.5 仍缺运动、Support、format/device-loss/switch evidence。
- **Gate:** 10.1（protocol/lifecycle 未全通过）、10.3（性能阈值失败）、10.4（owner pending）、10.5（不得归档）。

## Existing checked tasks that do not close the Gate

2.5、6.3 与 8.1 继续反映现有 allocator/generation source 与 pure fixtures 已实现；但现有 fixtures
不执行 `ready A → layout B staging → atomic B` 的真实资源状态轨迹，也不验证旧 payload identity。
因此它们不能代替 4.5、7.3、9.3 和 10.1 的逐帧 lifecycle acceptance。

## Safe automatically completed work

- runtime/protocol terminal matrix、source closure、typecheck/build、strict OpenSpec validation；
- clean same-revision global-only/hierarchical visual与 timestamp capture；
- K=4/overflow/invalid record/resource guards 的现有自动检查；
- fixed profile/budget/record/candidate/generation terminal diagnostics；
- reverse-order 与 earlier-revision same-device performance attribution。

## Owner/external decisions only

- 是否接受或 amendment `fallbackSamples=unavailable`；
- 是否批准任何性能 waiver（当前报告没有 waiver，阈值也未修改）；
- 对视觉收益/条带伪影的最终人工结论；
- W9 final disposition。没有 owner approval 时，本轮只记录 report verdict 与 Stop 建议。
