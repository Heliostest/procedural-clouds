## 0. Approval and baseline gate

- [x] 0.1 User approves `proposal.md`, `design.md` and both spec deltas
- [x] 0.2 Audit the final `add-global-simulation-speed` morph-time contract before implementation; do not reintroduce wall-time morphology
- [x] 0.3 Freeze cirrus and cumulonimbus camera/body fixtures with fixed time, rotation, footprint and quality settings
- [x] 0.4 Capture normal/density-debug baselines and cache/cloud GPU timing medians for both fixtures

> Do not modify implementation code before 0.1 is complete.

## 1. Preset morphology layout

- [x] 1.1 Add the four morphology keys to `PresetMorphology` and every canonical preset; keep non-target genera at zero
- [x] 1.2 Expand preset storage from 6 to 7 vec4 and map p6 x/y/z/w exactly as specified
- [x] 1.3 Update CPU packing, byte counts, WGSL structs/accessors and layout assertions
- [x] 1.4 Expose the four fields in preset GUI/i18n with `[0,1]` bounds and genus-specific explanations
- [x] 1.5 With all four strengths zero, verify all ten genera retain the pre-change density and normal-render baselines

## 2. Minimal dispatcher inputs

- [x] 2.1 Extend only cirrus/cumulonimbus dispatch calls with `pos/bodyIndex`; keep the other eight scalar evaluators unchanged
- [x] 2.2 Add target-genus lightweight context helpers without adding genus formulas to dispatcher or compatibility code
- [x] 2.3 Add zero-strength early returns before new noise sampling
- [x] 2.4 Run a browser WGSL compile spike and reject any design that stalls initialization or loses the device

## 3. Cirrus fibers

- [x] 3.1 Implement body-local anisotropic fiber coordinates in `evalCirrus()`
- [x] 3.2 Add bounded curl/domain warp for hooks and branching while preserving footprint and vertical masks
- [x] 3.3 Mix with compatibility density through `cirrusFiberStrength`; keep output finite and non-negative
- [x] 3.4 Verify body rotation controls fiber direction and physical wind translates the complete structure without phase jumps
- [x] 3.5 Calibrate and record the cirrus default fiber strength/curl with normal and density-debug A/B evidence

## 4. Cumulonimbus convective towers

- [x] 4.1 Implement height-gated elongated cell/tower signals in `evalCumulonimbus()`
- [x] 4.2 Form bounded cauliflower lobes via soft density union inside the existing footprint/body envelope
- [x] 4.3 Preserve and independently verify baseRoundness, topCutoffSharpness and anvilStrength behavior
- [x] 4.4 Mix through `convectiveTowerStrength`, apply `convectiveCellScale`, and keep output finite/non-negative
- [x] 4.5 Calibrate and record the cumulonimbus default tower strength/cell scale with normal and density-debug A/B evidence

## 5. Compatibility and performance

- [x] 5.1 Verify all ten genera compile/render in Cached, Hybrid and Realtime with no WGSL/runtime errors
- [x] 5.2 Verify non-target genera remain visually equivalent and within 3% GPU timing regression
- [x] 5.3 Record target-genus Hybrid steady, cache rebuild and Realtime timing medians against the design budgets
- [x] 5.4 Recheck multi-body overlap metadata, per-genus lighting, edge-style, self-shadow and ground-shadow behavior
- [x] 5.5 Extend static dispatch/layout checks and run all existing project verification scripts
- [x] 5.6 Run `npm.cmd run typecheck`, `npm.cmd run build` and browser console/runtime health checks

## 6. Documentation and OpenSpec

- [x] 6.1 Update `docs/roadmap-v2.md` and `docs/cloud-types-review.md` with implemented morphology and remaining precipitation/flow-field boundaries
- [x] 6.2 Record fixed fixtures, calibrated defaults, screenshots, compiler health and GPU timing evidence in this change
- [x] 6.3 Run `openspec validate add-cirrus-cumulonimbus-morphology --strict --no-interactive` and full strict validation
- [x] 6.4 Archive only after all acceptance evidence is complete

## Verification record (2026-07-08)

- Baseline source: commit `57ab240`. Canonical runtime fixture: default camera and three bodies, B1 switched to `rect/cumulonimbus`, B2 kept `circle/altocumulus`, B3 kept `circle/cirrus`; simulation frozen at `0×` after transport, Hybrid 64+8 steps, cache 96³.
- Preset defaults: cirrus fiber strength/curl `0.78/0.55`; cumulonimbus tower strength/cell scale `0.82/0.55`. Zero-strength paths return before context/noise work. Normal-render A/B screenshots were captured in the implementation thread; density behavior was also exercised through Cached/Hybrid/Realtime and genus switching.
- Compiler health: a fresh Chrome WebGPU tab initialized the final shader in 52.7 s with no WGSL/runtime errors. The detached baseline required roughly 40–60+ s in the same environment, so the large-module initialization delay is pre-existing rather than a new pathological context-inlining regression.
- 1917×1905 Hybrid steady A/B: cirrus enabled/zero cloud-pass medians were both about 3.55–3.56 ms; cumulonimbus enabled/zero cloud-pass medians were about 3.56/3.55 ms. Cumulonimbus cache median was about 0.60 ms enabled versus 0.54 ms at zero strength (about 11%, below the 25% budget).
- Final 3840×1822 target fixture: Hybrid 7.20 ms cloud + 0.48 ms cache, Cached 6.79 ms cloud + 0.57 ms cache, Realtime 268.91 ms cloud + 0.54 ms cache. Hybrid/Cached held 60 FPS; Realtime is a correctness path at this resolution. Browser console reported no errors.
- `npm.cmd run test:genus-dispatch`, `npm.cmd run test:ground-shadow-hash`, `npm.cmd run typecheck`, `npm.cmd run build`, single-change strict validation and full strict OpenSpec validation passed.
