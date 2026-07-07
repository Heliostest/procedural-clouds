# Simulation-speed verification

## Contract

- Allowed global rates: `0×`, `1×`, `2×`, `4×`; default `1×`.
- The CPU computes one `simulationDelta = wallDeltaSeconds × rate` per frame.
- Manual clock, lifecycle input, per-body advection, morph time, and scenario playhead consume simulation time.
- Renderer elapsed time, frame index, camera, TAA, GPU scheduling, cache cross-fade, and performance timing continue using wall time.
- Scenario JSON and GPU uniform layouts do not contain the runtime rate.

## Automated CPU checks

Development startup verification covers:

| Wall time | Rate | Simulation time | 10 m/s wind displacement |
|---:|---:|---:|---:|
| 10 s | 0× | 0 s | 0 m |
| 10 s | 1× | 10 s | 100 m |
| 10 s | 2× | 20 s | 200 m |
| 10 s | 4× | 40 s | 400 m |

Unsupported rates and invalid wall deltas are rejected. A 10-second `0×` interval followed by one second at `1×` advances wind by only 10 m, proving that frozen wall time is not caught up later.

## Browser verification — 2026-07-07

- GUI exposes four adjacent game-style buttons and defaults to the highlighted `1×` button; the old manual pause checkbox is absent.
- Manual clock measurements over approximately 0.9 wall seconds produced: `0× = 0.00 s`, `1× = 1.02 s`, `2× = 2.00 s`, `4× = 3.93 s`.
- At `0×`, the debug state reported `frozen`, the scene clock remained unchanged, and frames/debug UI continued updating.
- Scenario `2×` advanced approximately 1.43 scene seconds over 0.6–0.7 wall seconds; explicit pause held the playhead exactly while preserving the selected `2×` rate.
- At `2×`, scrubbing to 30 seconds produced an exact 30-second playhead, not 60 seconds.
- The scenario panel no longer exposes a separate speed control or debug multiplier.
- At scenario `4×`, all nine combinations of Cached/Hybrid/Realtime and Legacy/Adaptive/Transmittance ran without WebGPU or console errors.

The browser automation surface can temporarily throttle the page while commands execute, so correctness gates use clock ratios and state continuity rather than its transient FPS readout. Normal GPU timings remained in the existing range when the page was rendering continuously.
