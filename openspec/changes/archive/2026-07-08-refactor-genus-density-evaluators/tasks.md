## 0. Approval and coordination gate

- [x] 0.1 User approves `proposal.md`, `design.md` and the `cloud-morphology` spec delta
- [x] 0.2 Confirm `add-physical-wind-advection` and `per-preset-lighting` are completed/archived, or audit and document their final shader contracts before implementation
- [x] 0.3 Select and record the frozen camera/body fixture used for ten-genus visual comparison

> Do not modify implementation code before 0.1 is complete.

## 1. Baseline

- [x] 1.1 Capture density-debug and normal-render baselines for all ten genera with fixed camera, scene time, body placement and quality settings
- [x] 1.2 Record density-cache and cloud-pass GPU timings for the canonical scene
- [x] 1.3 Record current cached, hybrid and realtime behavior plus wind transport, genus-lighting metadata and edge-style expectations

## 2. Shared evaluation boundary

- [x] 2.1 Define `GenusEvalContext` with transported/rotated coordinates, body-local vertical coordinates, footprint inputs, preset data and modulation inputs
- [x] 2.2 Extract shared noise, footprint, envelope, numeric-guard and density-combination primitives without changing the active density route
- [x] 2.3 Keep debug solid shapes on their existing explicit bypass path

## 3. Per-genus evaluators

- [x] 3.1 Add one named WGSL density evaluator for each of the ten canonical genus keys
- [x] 3.2 Add a single explicit dispatcher with ten cases and cumulus-compatible fallback for invalid indices
- [x] 3.3 Ensure the dispatcher contains routing only and every evaluator returns finite non-negative density
- [x] 3.4 Assemble all genus WGSL sources in a deterministic explicit TypeScript order
- [x] 3.5 Route non-debug cloud bodies through the dispatcher without changing preset or GPU buffer layouts

## 4. Downstream compatibility

- [x] 4.1 Preserve multi-body density accumulation and soft overlap saturation
- [x] 4.2 Preserve dominant/secondary genus indices and blend weights in realtime and density-cache paths
- [x] 4.3 Preserve cached, hybrid and realtime dispatch through `densityAtTyped()`
- [x] 4.4 Preserve post-sample edge shaping, self-shadow light marching and ground-shadow density semantics
- [x] 4.5 Preserve physical wind transport and morph phase without restoring legacy shader-side speed integration

## 5. Verification and documentation

- [ ] 5.1 Verify all ten genera compile and render in cached and realtime modes with no WGSL validation errors
- [ ] 5.2 Compare frozen density/normal views against the baseline; document any floating-point-only differences
- [x] 5.3 Run `npm run typecheck` and `npm run build`
- [ ] 5.4 Recheck active project verification scripts and browser console/runtime health
- [ ] 5.5 Compare cache/cloud GPU timing medians; target no more than 5% regression for the mechanical refactor or document and resolve the cause
- [x] 5.6 Update `docs/roadmap-v2.md` and relevant architecture notes with the per-genus evaluator boundary and deferred precipitation/flow-field scope
- [x] 5.7 Run `openspec validate refactor-genus-density-evaluators --strict --no-interactive` and full strict OpenSpec validation

> Archive acceptance (2026-07-08): tasks 5.1, 5.2, 5.4 and 5.5 remain unchecked because the final browser/WebGPU run was blocked when browser control could not establish a reliable test session. Static dispatch, TypeScript, production build, ground-shadow and strict OpenSpec checks passed. The user explicitly accepted this residual validation risk and requested archival.
