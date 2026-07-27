## Context

W10B code already shipped after W10A code, without prior OpenSpec approval or W10A Gate Continue. This design freezes the landed sampling contracts for retrospective review.

## Goals / Non-Goals

- Goals: meter-based primary steps; max ray distance; independent world-step / support-skip / candidate-skip / STBN toggles; conservative hard reject only on public Support and valid candidate coverage; STBN with IGN/Halton fallback; counters for iterations/skips/steps.
- Non-Goals: changing CloudFrameOutput ABI; TAAU; occupancy pyramid; new density-cache payload; Recipe family edits.

## Decisions

- Decision: `maxPrimaryIterations` is a safety cap; step length comes from min/max meters converted via scene scale to ray `Δt`.
- Decision: hard reject only with public Body Support intervals and complete/valid hierarchical candidates; coarse probe may hint inside envelope only (default off when envelope unproven).
- Decision: STBN is optional sampling noise on ray start/step/light sequence; missing STBN never fails init.
- Alternatives considered: ECEF shell intersection — rejected; keep AABB/Support. Full HDDA — deferred to W17 evidence gate.

## Dependency

- Requires W10A `CloudFrameOutput`/composite semantics unchanged. Feature-off of all W10B switches MUST return to W10A fixed-step + IGN/Halton full-res baseline.

## Risks / Trade-offs

- Thin cloud under-sampling vs cost → Gate REVIEW until owner visual + median/p90.
- Cirrocumulus single-shot cloudMs can rise while iterations fall → report both, no win-only narrative.
- Implemented before W10A archive → documented; owner decides disposition.

## Open Questions

- Owner Continue/REVIEW/Stop for W10B after W10A decision.
- Whether candidate skip on global-only scenes remains forced-off (observed in evidence).
