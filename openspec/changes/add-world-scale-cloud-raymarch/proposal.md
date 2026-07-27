# Change: 追认世界尺度 Raymarch、保守 Skip 与 STBN（W10B）

## Why

HEAD `c0de3a5`/`bd266eb` 已实现 world-step、公开 Body Support / candidate 保守 skip、STBN 资源与 IGN/Halton fallback，但**实施前未建立/批准**本 OpenSpec change，且严格串行上应在 W10A Continue/归档之后。本提案对既有实现做追认与规范化，明确依赖 W10A，不伪造预批准或已 Continue。

## What Changes

- 新增 `cloud-stochastic-sampling`：STBN 资源契约、frame slice、确定性 fallback。
- 修改 `cloud-rendering`：world-step 主循环顺序、独立开关、feature-off 回退 W10A fixed-step。
- 修改 `cloud-params`：world-step / STBN / 旧 `rayMarchSteps→maxPrimaryIterations` 映射参数。
- 修改 `cloud-physical-units`：米制步长到 render-space `Δt` 的集中换算约束。
- 修改 `cloud-lighting`：能量守恒积分的 `Δt` 必须来自当前步进（含 world-step 米制换算），不改变散射公式本身。
- **不**修改 W10A attachment/composite/discontinuity 语义；不实现 TAAU/occupancy mip/HDDA。

## Retroactive status

- Implementation: already present on `main` at `bd266eb`.
- Prior approval: **none**. W10A Continue/archive had **not** completed before W10B code landed.
- This change depends on `refactor-cloud-frame-output` for ABI freeze intent; Gate remains REVIEW until owner decides.

## Prerequisites and Conflicts

- Depends on W10A change `refactor-cloud-frame-output` (retrospective; Gate not Continue).
- Active `cloud-rendering` / `cloud-params` overlap with W9 `add-hierarchical-body-local-density-bricks`：W10B only consumes public Support / valid candidate hard reject；MUST NOT read producer-private tile masks or expand W9 payload.
- Active `cloud-params` / `cloud-lighting` overlaps with `add-height-weather-shaping`、`add-height-ambient-tint`：serial boundary — W10B adds raymarch/sampling fields and Δt sourcing only; MUST NOT alter height shaping/tint requirements.
- Empty historical `raymarch-occupancy` placeholder is superseded in intent by this change’s world-step/skip sub-gate; no separate archive performed here.
- No new `density-cache-production` payload is introduced.

## Impact

- Affected specs: `cloud-stochastic-sampling` (new); `cloud-rendering`, `cloud-params`, `cloud-physical-units`, `cloud-lighting`
- Affected code (already landed): `src/rendering/worldRaymarch.ts`, `stbnTexture.ts`, shader raymarch, `scripts/check-w10b-*.mjs`
- Evidence: `docs/evidence/w10-visual-qa/gate-w10b.md`
