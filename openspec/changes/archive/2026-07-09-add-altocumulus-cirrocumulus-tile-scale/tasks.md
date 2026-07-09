## 0. Approval gate

- [x] 0.1 User approves `proposal.md`, `design.md` and three spec deltas
- [x] 0.2 Freeze Ac / Cc fixtures and capture `tileScale=0` baselines

> Do not modify implementation code before 0.1 is complete.

## 1. Preset layout

- [x] 1.1 Add `tileScale` to `PresetMorphology` and all ten presets（非 Ac/Cc 为 0）
- [x] 1.2 Map `p7.w` to `tileScale`；update pack、WGSL、断言（不扩 vec4 数量）
- [x] 1.3 GUI/i18n in morphology folder，范围 `[0,1]`
- [x] 1.4 `tileScale=0` 时十属观感与基线一致

## 2. Evaluators

- [x] 2.1 Extend dispatcher for altocumulus/cirrocumulus with `pos/bodyIndex`
- [x] 2.2 Implement tiled Worley/Voronoi reshape in both evaluators； zero-strength early return
- [x] 2.3 Keep footprint / vertical envelope / wind transport contracts
- [x] 2.4 Calibrate Ac/Cc defaults and record A/B evidence

## 3. Verification

- [x] 3.1 Cached/Hybrid/Realtime compile and render without WGSL errors
- [x] 3.2 Non-target genera ≤3% GPU regression
- [x] 3.3 `npm.cmd run typecheck`、`test:genus-dispatch`、`build`
- [x] 3.4 Update `docs/roadmap-v2.md` stage 14 with tileScale item
- [x] 3.5 `openspec validate add-altocumulus-cirrocumulus-tile-scale --strict --no-interactive`

## Defaults

- altocumulus `tileScale`: `0.55`
- cirrocumulus `tileScale`: `0.82`
