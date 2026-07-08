## 0. Approval and baseline gate

- [ ] 0.1 User approves `proposal.md`, `design.md` and both spec deltas
- [ ] 0.2 Audit the final `add-global-simulation-speed` morph-time contract before implementation; do not reintroduce wall-time morphology
- [ ] 0.3 Freeze cirrus and cumulonimbus camera/body fixtures with fixed time, rotation, footprint and quality settings
- [ ] 0.4 Capture normal/density-debug baselines and cache/cloud GPU timing medians for both fixtures

> Do not modify implementation code before 0.1 is complete.

## 1. Preset morphology layout

- [ ] 1.1 Add the four morphology keys to `PresetMorphology` and every canonical preset; keep non-target genera at zero
- [ ] 1.2 Expand preset storage from 6 to 7 vec4 and map p6 x/y/z/w exactly as specified
- [ ] 1.3 Update CPU packing, byte counts, WGSL structs/accessors and layout assertions
- [ ] 1.4 Expose the four fields in preset GUI/i18n with `[0,1]` bounds and genus-specific explanations
- [ ] 1.5 With all four strengths zero, verify all ten genera retain the pre-change density and normal-render baselines

## 2. Minimal dispatcher inputs

- [ ] 2.1 Extend only cirrus/cumulonimbus dispatch calls with `pos/bodyIndex`; keep the other eight scalar evaluators unchanged
- [ ] 2.2 Add target-genus lightweight context helpers without adding genus formulas to dispatcher or compatibility code
- [ ] 2.3 Add zero-strength early returns before new noise sampling
- [ ] 2.4 Run a browser WGSL compile spike and reject any design that stalls initialization or loses the device

## 3. Cirrus fibers

- [ ] 3.1 Implement body-local anisotropic fiber coordinates in `evalCirrus()`
- [ ] 3.2 Add bounded curl/domain warp for hooks and branching while preserving footprint and vertical masks
- [ ] 3.3 Mix with compatibility density through `cirrusFiberStrength`; keep output finite and non-negative
- [ ] 3.4 Verify body rotation controls fiber direction and physical wind translates the complete structure without phase jumps
- [ ] 3.5 Calibrate and record the cirrus default fiber strength/curl with normal and density-debug A/B evidence

## 4. Cumulonimbus convective towers

- [ ] 4.1 Implement height-gated elongated cell/tower signals in `evalCumulonimbus()`
- [ ] 4.2 Form bounded cauliflower lobes via soft density union inside the existing footprint/body envelope
- [ ] 4.3 Preserve and independently verify baseRoundness, topCutoffSharpness and anvilStrength behavior
- [ ] 4.4 Mix through `convectiveTowerStrength`, apply `convectiveCellScale`, and keep output finite/non-negative
- [ ] 4.5 Calibrate and record the cumulonimbus default tower strength/cell scale with normal and density-debug A/B evidence

## 5. Compatibility and performance

- [ ] 5.1 Verify all ten genera compile/render in Cached, Hybrid and Realtime with no WGSL/runtime errors
- [ ] 5.2 Verify non-target genera remain visually equivalent and within 3% GPU timing regression
- [ ] 5.3 Record target-genus Hybrid steady, cache rebuild and Realtime timing medians against the design budgets
- [ ] 5.4 Recheck multi-body overlap metadata, per-genus lighting, edge-style, self-shadow and ground-shadow behavior
- [ ] 5.5 Extend static dispatch/layout checks and run all existing project verification scripts
- [ ] 5.6 Run `npm.cmd run typecheck`, `npm.cmd run build` and browser console/runtime health checks

## 6. Documentation and OpenSpec

- [ ] 6.1 Update `docs/roadmap-v2.md` and `docs/cloud-types-review.md` with implemented morphology and remaining precipitation/flow-field boundaries
- [ ] 6.2 Record fixed fixtures, calibrated defaults, screenshots, compiler health and GPU timing evidence in this change
- [ ] 6.3 Run `openspec validate add-cirrus-cumulonimbus-morphology --strict --no-interactive` and full strict validation
- [ ] 6.4 Archive only after all acceptance evidence is complete
