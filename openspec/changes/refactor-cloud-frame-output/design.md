## Context

W10A code already shipped without a prior proposal. This design records the frozen ABI of the landed implementation for Gate/review, not a green-field plan.

## Goals / Non-Goals

- Goals: versioned cloud-only MRT; transmittance `T` in alpha; representative depth/velocity + validity; full-res composite ownership; independent resource/content/discontinuity generations; emergency combined fallback that cannot feed W11.
- Non-Goals: world-step/STBN (W10B); TAAU (W11); density recipe/brick ABI changes; changing lighting math.

## Decisions

- Decision: three `rgba16float` attachments — radianceTransmittance (clear `(0,0,0,1)`), depthVelocity (invalid clear alpha 0), backgroundRadiance for composite input.
- Decision: composite owns `cloudRadiance + T * background` at full resolution after cloud temporal resolve; gizmo/debug after resolve.
- Decision: feature-off uses combined path as baseline; emergency fallback disables TAAU/W11 consumers.
- Alternatives considered: single combined history texture — rejected because sky/ground/debug pollute temporal history.

## Overlaps

- W9 `cloud-rendering` deltas remain authoritative for hierarchical density sampling. W10A deltas are additive frame-output concerns only.

## Risks / Trade-offs

- Retrospective approval gap → Mitigate with honest proposal language + Gate REVIEW until owner decides.
- Missing steady median/p90 → Gate cannot be Continue yet.

## Open Questions

- Owner Continue vs REVIEW vs Stop for W10A.
- Whether W9 disposition must be recorded before W10A archive (roadmap says yes).
