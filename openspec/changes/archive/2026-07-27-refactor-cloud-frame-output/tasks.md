## 1. Retrospective documentation

- [x] 1.1 Record proposal/design stating implementation preceded OpenSpec approval
- [x] 1.2 Author `cloud-frame-output` and `cloud-rendering` delta specs
- [x] 1.3 Validate change with `openspec validate refactor-cloud-frame-output --strict --no-interactive`

## 2. Implementation (already on HEAD)

- [x] 2.1 `CloudFrameOutput` MRT resources, clear values, generations
- [x] 2.2 Cloud-only temporal resolve + full-res composite ordering
- [x] 2.3 Feature-off / emergency combined fallback routing
- [x] 2.4 `scripts/check-w10a-cloud-frame-output.mjs` automated contracts

## 3. Evidence / Gate

- [x] 3.1 Package visual QA evidence under `docs/evidence/w10-visual-qa/`
- [x] 3.2 Write independent Gate report `gate-w10a.md` with REVIEW/PENDING (not Continue)
- [x] 3.3 Owner visual approval (owner-waived 2026-07-27)
- [x] 3.4 Steady-state GPU median/p90 for current/resolve/composite (owner-waived 2026-07-27; completeness ≠ performance Gate)
- [x] 3.5 Owner Gate disposition Continue/Stop/Review (owner-approved Continue 2026-07-27)
- [x] 3.6 Archive only after owner Continue (owner-approved archive 2026-07-27)
