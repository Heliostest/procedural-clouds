# Change: 追认 Cloud-only Frame Output 与 Full-resolution Composite（W10A）

## Why

HEAD `c0de3a5`/`bd266eb` 已实现 `CloudFrameOutput` MRT、cloud-only temporal resolve 与 full-resolution composite，并附带自动契约检查与视觉证据，但**实施前未建立/批准**本 OpenSpec change。本提案对既有实现做追认与规范化，供 owner 审批 Gate，不伪造“实施前已批准”的历史。

## What Changes

- 新增 `cloud-frame-output` capability：版本化 cloud-only attachment、clear value、`T`/validity、resource/content/discontinuity generation、销毁与诊断。
- 修改 `cloud-rendering`：full-resolution cloud-only + composite 路径、feature-off 真值路径、legacy combined emergency fallback（禁用 W11 输入语义）。
- **不**改变主 ray 步进分布、skip、STBN、Density Recipe、W9 hierarchical ABI。

## Retroactive status

- Implementation: already present on `main` at `bd266eb`.
- Prior approval: **none**. This change is retrospective documentation + Gate packaging.
- Archive: **not** requested here; owner must approve Gate before any archive.

## Prerequisites and Conflicts

- Active overlaps on `cloud-rendering`: `add-hierarchical-body-local-density-bricks` (W9). Serial boundary: W10A only adds frame-output/composite requirements; MUST NOT rewrite W9 density sampling / brick bundle requirements. W9 final disposition remains pending and is recorded honestly.
- Other active changes (`establish-density-v2-baseline`, `add-density-v2-cellular-wave-family`, height shaping/tint, stratocumulus breakup) are out of scope; not archived or modified by this change.
- Roadmap prerequisite “W9 final disposition Continue/Stop” is still unmet; this retrospective change documents risk and does not claim the prerequisite was satisfied before implementation.

## Impact

- Affected specs: `cloud-frame-output` (new), `cloud-rendering` (modified via ADDED requirements)
- Affected code (already landed): `src/rendering/cloudFrameOutput.ts`, `src/renderer.ts`, quality pipelines, `scripts/check-w10a-cloud-frame-output.mjs`
- Evidence: `docs/evidence/w10-visual-qa/gate-w10a.md`
