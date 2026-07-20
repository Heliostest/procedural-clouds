# W9 Body-local Bricks Gate Report

- Evidence: 2026-07-18T13:19:10.692Z
- Revision: 08f4c7683961da047bdb0c971168b7ac8c168f63
- Decision: **STOP**
- Runtime: pass; protocol: pass; visual: fail; performance: fail; owner: pending

## Visual review

- single-stratocumulus: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- single-altocumulus: fail — hierarchicalVsGlobal=fail; normal=fail; densityDebug=fail; seamAndPhase=unresolved; metadataAndSupport=unresolved
- single-cirrocumulus: fail — hierarchicalVsGlobal=fail; normal=fail; densityDebug=fail; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-cellular-scale: fail — hierarchicalVsGlobal=fail; normal=fail; densityDebug=fail; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-cellular-overlap: review — hierarchicalVsGlobal=unresolved; normal=unresolved; densityDebug=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-wave-ripple: review — hierarchicalVsGlobal=unresolved; normal=unresolved; densityDebug=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w9-brick-lod-sweep: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- w9-brick-overflow: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- w9-thin-ridge-proxy: review — seamAndPhase=unresolved; metadataAndSupport=unresolved

## Performance

- single-stratocumulus: fail — cloud median 1.291x > 1.250x; ground-shadow median 1.377x > 1.350x
- single-altocumulus: fail — cloud median 1.273x > 1.250x; ground-shadow median 1.382x > 1.350x
- single-cirrocumulus: fail — cloud median 1.277x > 1.250x; ground-shadow median 1.380x > 1.350x
- w8-cellular-scale: fail — cloud median 1.325x > 1.250x; ground-shadow median 1.380x > 1.350x
- w8-cellular-overlap: fail — cloud median 1.400x > 1.250x; cloud p90 1.411x > 1.350x; ground-shadow median 1.383x > 1.350x
- w8-wave-ripple: fail — cloud median 1.341x > 1.250x; ground-shadow median 1.385x > 1.350x
- w9-brick-lod-sweep: fail — cloud median 1.314x > 1.250x; ground-shadow median 1.382x > 1.350x
- w9-brick-overflow: fail — cloud median 1.305x > 1.250x; ground-shadow median 1.379x > 1.350x
- w9-thin-ridge-proxy: fail — cloud median 1.297x > 1.250x; ground-shadow median 1.379x > 1.350x

## Remaining blockers

- Visual review is missing, stale, unresolved, or failed.
- GPU timestamp evidence is insufficient or exceeds thresholds.
- Project owner approval is not recorded.
