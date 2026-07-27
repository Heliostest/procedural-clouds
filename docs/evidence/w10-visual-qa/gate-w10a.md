# W10A Gate Report — Cloud-only Frame Output

- Evidence: `docs/evidence/w10-visual-qa/`
- Revision: `bd266eb` (HEAD); runtimeSourceMatchesHead=true (src/shaders clean; docs/OpenSpec dirty)
- OpenSpec: `refactor-cloud-frame-output` (retrospective)
- Decision: **CONTINUE (owner-approved 2026-07-27)**
- Formal Continue: **YES (owner decision; visual/performance evidence owner-waived)**

## Verdict

| Axis | Status | Notes |
| --- | --- | --- |
| Automated contracts | PASS | `test:w10a-cloud-frame` |
| Visual equivalence A vs B | UNABLE | PNG maxAbs OBSERVATION only; threshold not normative; owner PENDING |
| Depth/velocity runtime hard | UNABLE | no HEAD-safe pixel proof |
| History contamination visual | UNABLE | owner PENDING |
| Resize / camera-cut / device-loss | UNABLE | withdrawn uncommitted evidence APIs not retained |
| Feature-off fallback API | PASS | path=combined-feature-off |
| Steady median/p90 evidence | PASS (completeness) | ≠ performance Gate |
| Performance Gate | UNABLE | 数据可用 ≠ 性能 Gate 通过 |
| Gate | **CONTINUE (owner-approved)** | owner decision 2026-07-27; not measured-equivalent PASS |

## Shared matrix (`visual-review.json`)

**78 PASS / 0 FAIL / 13 UNABLE / 9 OBSERVATION** — `visualGate=UNABLE`, `performanceGate=UNABLE`.

## Owner decision

- Date: 2026-07-27
- Disposition: **Continue** — archive `refactor-cloud-frame-output` (owner-approved)
- Owner-waived (非实测通过):
  - owner visual approval
  - steady-state GPU median/p90 作为性能 Gate
  - resize / camera-cut / device-loss 与 depth/velocity 的像素级证明
- Note: W9 hierarchical-bricks disposition 仍为 pending；本 Continue 不依赖也不改写 W9 final disposition（owner 豁免该前置）
