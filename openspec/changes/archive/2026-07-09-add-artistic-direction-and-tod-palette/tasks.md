## 0. Approval gate

- [x] 0.1 User approves `proposal.md`, `design.md` and three spec deltas
- [x] 0.2 Capture blend=0 baselines at sunElevation `-6 / 0 / 5 / 12 / 45`

> Do not modify implementation code before 0.1 is complete.

## 1. Genus artistic copy

- [x] 1.1 Add bilingual artistic blurbs for all ten genera from cloud-types.md
- [x] 1.2 Expose via i18n helper (`genusArtistic(key)`)
- [x] 1.3 Show read-only blurb in preset editor for the selected genus
- [x] 1.4 Document source path in `docs/cloud-types-review.md`

## 2. TOD palette alignment

- [x] 2.1 Keep knot elevations; add `TOD_*_ART` tables mapped from the 8-row hex palette
- [x] 2.2 Preserve legacy tables as `TOD_*_LEGACY`
- [x] 2.3 Add `todPaletteBlend` (default 1) and mix in `todColors()`
- [x] 2.4 Wire GUI/i18n for the blend control
- [x] 2.5 Sync clearValue / background with blended sky colors

## 3. Verification

- [x] 3.1 A/B screenshots at five elevations for blend 0 vs 1（浏览器人眼；blend 滑杆可即时对比）
- [x] 3.2 `blend==0` matches pre-change look（legacy 常量表保留）
- [x] 3.3 `npm.cmd run typecheck` and `npm.cmd run build`
- [x] 3.4 Update roadmap note for palette recalibration
- [x] 3.5 `openspec validate add-artistic-direction-and-tod-palette --strict --no-interactive`

## Defaults

- `todPaletteBlend`: `1.0`
- Hex→vec3 from cloud-types lit/shadow/sky rows; ambient/top derived
