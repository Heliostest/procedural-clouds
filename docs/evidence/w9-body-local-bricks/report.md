# W9 Body-local Bricks Gate Report

- Evidence: 2026-07-16T13:33:40.657Z
- Revision: 3179c5d3350d4d7069c4c9a697f18337be00cdf2 (dirty)
- Decision: **STOP**
- Runtime: pass; protocol: fail; visual: fail; performance: review; owner: pending

## Visual review

- single-stratocumulus: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- single-altocumulus: review — hierarchicalVsGlobal=unresolved; normal=unresolved; densityDebug=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- single-cirrocumulus: review — normal=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-cellular-scale: review — normal=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-cellular-overlap: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- w8-wave-ripple: review — normal=unresolved; seamAndPhase=unresolved; metadataAndSupport=unresolved
- w9-brick-lod-sweep: review — seamAndPhase=unresolved; metadataAndSupport=unresolved
- w9-brick-overflow: fail — hierarchicalVsGlobal=fail; normal=fail; densityDebug=fail; seamAndPhase=fail; metadataAndSupport=unresolved
- w9-thin-ridge-proxy: review — seamAndPhase=unresolved; metadataAndSupport=unresolved

## Performance

- single-stratocumulus: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- single-altocumulus: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- single-cirrocumulus: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w8-cellular-scale: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w8-cellular-overlap: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w8-wave-ripple: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w9-brick-lod-sweep: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w9-brick-overflow: review — one or more GPU timestamp ranges have fewer than 60 valid samples
- w9-thin-ridge-proxy: review — one or more GPU timestamp ranges have fewer than 60 valid samples

## Remaining blockers

- One or more W9 resource/fallback protocol checks failed.
- Visual review is missing, stale, unresolved, or failed.
- GPU timestamp evidence is insufficient or exceeds thresholds.
- Project owner approval is not recorded.
