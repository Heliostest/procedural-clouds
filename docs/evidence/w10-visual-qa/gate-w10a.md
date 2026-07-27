# W10A Gate Report — Cloud-only Frame Output

- Evidence: `docs/evidence/w10-visual-qa/`
- Revision: `bd266eb` (HEAD); runtimeSourceMatchesHead=true (src/shaders clean; docs/OpenSpec dirty)
- OpenSpec: `refactor-cloud-frame-output` (retrospective)
- Decision: **REVIEW / PENDING**
- Formal Continue: **NO**

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
| Gate | **REVIEW** | not Continue |

## Shared matrix (`visual-review.json`)

**78 PASS / 0 FAIL / 13 UNABLE / 9 OBSERVATION** — `visualGate=UNABLE`, `performanceGate=UNABLE`.

## Owner decision

Continue / REVIEW / Stop. Owner visual signoff remains PENDING.
