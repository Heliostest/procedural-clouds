# Ground-shadow verification

## Environment

- Date: 2026-07-07
- Browser: Chromium WebGPU in the Codex in-app browser; adapter name was not exposed
- Viewport/render target: 1920×1080, timestamp queries available
- Scene: default three-body manual scene, 32 km × 32 km ground extent
- Default density cache: 96³, Hybrid; comparison cache: 48³

## Stage 1 gate

Legacy remains an actively selectable pixel baseline. Adaptive uses `densityAt()`, a maximum of 32 samples by default (static ceiling 64), early optical-depth termination, and world-stable stratified jitter.

At 96³ across sun elevations 10°/25°/45°/70° and TAA off/on, mean total GPU time was:

| Mode | Mean GPU time | Relative to Legacy |
|---|---:|---:|
| Legacy | 2.23 ms | baseline |
| Adaptive | 2.33 ms | +4.5% |

At 48³ the corresponding means were 1.82 ms and 1.87 ms (+2.8%). Both remain below the 20% stage gate and held 60 FPS. Visual A/B confirmed that Adaptive breaks up the regular fixed-step bands without leakage or direction reversal; the user accepted the result on 2026-07-07.

## Stage 2 gate

Transmittance uses a 512² `rgba16float` map by default, a 2-frame update interval, history weight 0.8, and separable tent radius 1. It invokes the Stage 1 integrator from `csGroundShadow`, filters horizontally/vertically, then blends independent history.

At 96³ across the same elevation/TAA matrix, mean total GPU time was 2.17 ms versus Adaptive's 2.33 ms. The measured shadow integration + filter + history resolve cost was about 0.06 ms at 512². The path held 60 FPS at 1920×1080.

Verified behaviors:

- Legacy and Adaptive do not dispatch the transmittance passes.
- 256/512/1024 resource recreation succeeds without WebGPU validation errors.
- World-space history is reset on scene/signature changes, backward/large time jumps, resolution changes, and excessive per-body advection; smaller motion reduces history weight.
- Resetting manual time from the paused scene produced `history-reset:time` and no stale shadow frame.
- Map edges blend continuously to Adaptive; invalid resources and out-of-bounds samples fall back to Adaptive.
- Cached, Hybrid, and Realtime all retain the unified `densityAt()` path; edge sharpening remains downstream of the same density source.

## Final defaults

- `groundShadowMode = Transmittance`
- `groundShadowMaxSteps = 32`
- `groundShadowStepScale = 1.0`
- `groundShadowJitter = 1.0`
- `groundShadowMapResolution = 512`
- `groundShadowMapUpdateRate = 2`
- `groundShadowHistoryWeight = 0.8`
- `groundShadowFilterRadius = 1`

Transmittance is the final default after both stage gates passed. Adaptive remains the invalid-resource/out-of-bounds fallback and Legacy remains available for active pixel-baseline A/B checks.
