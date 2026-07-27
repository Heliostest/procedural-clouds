## 1. Retrospective documentation

- [x] 1.1 Record proposal/design stating implementation preceded approval and depends on W10A
- [x] 1.2 Author delta specs for sampling/rendering/params/units/lighting
- [x] 1.3 Validate with `openspec validate add-world-scale-cloud-raymarch --strict --no-interactive`

## 2. Implementation (already on HEAD)

- [x] 2.1 World-step parameter pack + shader branches
- [x] 2.2 Public Body Support builder and conservative skip wiring
- [x] 2.3 STBN import/load + IGN/Halton fallback
- [x] 2.4 Independent toggles and runtime diagnostics/counters
- [x] 2.5 `scripts/check-w10b-world-raymarch.mjs` and `check-w10b-raymarch-contracts.mjs`

## 3. Evidence / Gate

- [x] 3.1 Package visual QA evidence and toggle/motion captures where collected
- [x] 3.2 Write independent Gate report `gate-w10b.md` with REVIEW/PENDING (not Continue)
- [ ] 3.3 Owner visual approval (miss/banding/screen-lock)
- [ ] 3.4 Steady-state GPU median/p90 + counter series
- [ ] 3.5 Complete stratus/cirrostratus toggle+motion suite (optional recapture)
- [ ] 3.6 Owner Gate disposition after W10A disposition
- [ ] 3.7 Archive only after owner Continue (out of scope for this pass)
