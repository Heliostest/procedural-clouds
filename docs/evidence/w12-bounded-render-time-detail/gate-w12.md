# W12 Gate Report

- Decision: **REVIEW**
- Formal Continue: **NO**
- runtimeSourceMatchesHead: **false**
- BSM: **not-applicable**
- Owner visual verdict: **PENDING**

## Capture

- Captures: 95
- Capture errors: 0
- Fixed post: Bloom/exposure/tonemap fixed by capture script.
- Matrix: global-only W9 Stop, hierarchical, equal-overlap, 64 km/far-flicker, Cu/Sc/Ac, Cc, W9 thin-ridge, Cb known linear-remap deviation.

## Cost

- currentMs uses TAAU current only for active `taau-4x4`; otherwise cloud current.
- Main and local-light double difference use on/off × skipLight=false/true.
- Ground shadow: unavailable unless a fresh `shadowRan=true` sample with updated `shadowSampleId` is exposed; current controller does not expose it.
- Full-res/TAAU current, primary iterations, cap hits, and maximum step are in `runtime-evidence.json`.

## Fallback

| Slot | Status | Reason |
| --- | --- | --- |
| detailStrength=0 @ 120/512 | available | on/off pairs include detailStrength=0 with worldStep=true, min=120, maxIterations=512 |
| atlas unavailable | unavailable | no existing page controller API can force atlas unavailable without changing business code |
| Legacy coarse fallback | unavailable | no existing page controller API can select Legacy while preserving the fixed Hybrid matrix without changing business code |

## Zero tolerance

| Item | Status | Reason |
| --- | --- | --- |
| support-leak | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| negative-density | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| nan | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| brick-seam | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| lod-phase-jump | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| camera-lock | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| genus-hard-cut | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |
| thin-layer-break | UNABLE | capture/runtime interfaces provide no automatic visual or density-defect verdict; owner review required |

## Required evidence

| Item | Status | Reason |
| --- | --- | --- |
| raw-density | OBSERVATION | 1 screenshot capture(s) present; owner visual verdict required |
| normal | OBSERVATION | 1 screenshot capture(s) present; owner visual verdict required |
| edge-only | UNABLE | existing benchmark controller exposes no edge-only view; edgeSharpening normal output is not mislabeled as edge-only |
| detail-frequency | OBSERVATION | 2 screenshot capture(s) present; owner visual verdict required |
| wind-motion | UNABLE | benchmark frame override freezes scene clock and controller exposes no deterministic wind-motion drive |
| taau-convergence | OBSERVATION | 8 screenshot capture(s) present; owner visual verdict required |
| debug-18 | OBSERVATION | screenshot captured; not an automated visual pass |
| debug-19 | OBSERVATION | screenshot captured; not an automated visual pass |

## Owner decision

- Date: pending
- Disposition: pending Continue / Review / Stop
- Note: automated evidence does not substitute for owner visual verdict.

<!-- W12-TASK9-START -->
## Task 9 final static recheck

All commands were separately run against the current worktree and exited 0: `openspec validate add-bounded-render-time-cloud-detail --strict --no-interactive`; `npm run test:w12-detail-contract`; `npm run test:w12-density-monotonic`; `npm run test:w12-sample-budget`; `npm run test:w12-light-rough`; `npm run test:pipeline-isolation`; `npm run test:w10b-raymarch`; `npm run test:w10b-world-raymarch`; `npm run typecheck`; `npm run evidence:w12-runtime`; `npm run gate:w12`.

The runtime collector reports 20 pairs, integrity PASS, no unavailable result entries, and `runtimeSourceMatchesHead=false`. The generated Gate remains **REVIEW**, Formal Continue **NO**, owner visual verdict **PENDING**.

## Unified=0 hunk attribution

`worktree-baseline.txt` records an empty `src`/`shaders` baseline patch (SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`), so all 58 current added hunks below are W12 rather than a file-level W11 attribution. Staged handoff/design artifacts are not implementation hunks.

| File | Exact current `@@` header | W12 task |
| --- | --- | --- |
| `shaders/cloud.wgsl` | `@@ -780,2 +780,122 @@ fn dominantWindPhase(pos : vec3f) -> vec3f {` | 2, 3 |
| `shaders/cloud.wgsl` | `@@ -783,2 +903,11 @@ fn detailNoise(pos : vec3f) -> f32 {` | 3 |
| `shaders/cloud.wgsl` | `@@ -884 +1013 @@ fn shapeCoord(mode : i32, p : vec3f) -> f32 {` | 4, 5 |
| `shaders/cloud.wgsl` | `@@ -891,3 +1020,2 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 4 |
| `shaders/cloud.wgsl` | `@@ -895 +1023 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 4 |
| `shaders/cloud.wgsl` | `@@ -898,2 +1026,15 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 4, 5 |
| `shaders/cloud.wgsl` | `@@ -923 +1064 @@ fn lightMarchDepth(pos : vec3f, rayJitter : f32, recordCounters : bool) -> f32 {` | 5 |
| `shaders/cloud.wgsl` | `@@ -994 +1135 @@ fn legacyGroundShadow(p : vec3f) -> GroundShadowResult {` | 5 |
| `shaders/cloud.wgsl` | `@@ -1053 +1194 @@ fn integrateGroundShadow(p : vec3f, shadowCell : vec2u, phase : u32) -> GroundSh` | 5 |
| `shaders/cloud.wgsl` | `@@ -1174,0 +1316,5 @@ fn debugCloudFrame(color : vec3f) -> CloudFrameSample {` | 6 |
| `shaders/cloud.wgsl` | `@@ -1251,0 +1398,3 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 6 |
| `shaders/cloud.wgsl` | `@@ -1348 +1497 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 5 |
| `shaders/cloud.wgsl` | `@@ -1414,0 +1564,12 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 6 |
| `shaders/cloud.wgsl` | `@@ -1460 +1621 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 6 |
| `shaders/cloud.wgsl` | `@@ -1471 +1632 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 5 |
| `shaders/cloud.wgsl` | `@@ -1659,0 +1821,3 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 6 |
| `shaders/cloud.wgsl` | `@@ -1663 +1827 @@ fn renderCloudFrame(fragCoord : vec4f, uv : vec2f) -> CloudFrameSample {` | 6 |
| `src/renderer.ts` | `@@ -46,0 +47 @@ import {` | 2 |
| `src/renderer.ts` | `@@ -90,0 +92,5 @@ const TAAU_DEBUG_VIEWS = Object.freeze([DEBUG_VIEW_TAAU_PHASE, DEBUG_VIEW_TAAU_R` | 6 |
| `src/renderer.ts` | `@@ -94,0 +101,5 @@ function isTaauDebugView(debugView: number): boolean {` | 6 |
| `src/renderer.ts` | `@@ -660,0 +672,27 @@ struct VOut { @builtin(position) pos : vec4f };` | 6 |
| `src/renderer.ts` | `@@ -1239,0 +1278,11 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -1249,0 +1299,5 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -1269,0 +1324,11 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -1425,0 +1491,30 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1477,0 +1573,2 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1509,0 +1607 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1546,0 +1645,12 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1555,0 +1666 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1564,0 +1676 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1575,0 +1688 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1583,0 +1697,2 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1587,0 +1703,8 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1599,0 +1723,6 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1618,0 +1748,2 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -1671,0 +1803 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2283,0 +2416,6 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2375,2 +2513,3 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -2393 +2532 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -2500,0 +2640,6 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2581,0 +2727,3 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2916,0 +3065,19 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 6 |
| `src/renderer.ts` | `@@ -2969,3 +3136,3 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2986,4 +3153,4 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2995 +3162 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -2997 +3164 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/renderer.ts` | `@@ -3340,0 +3508,3 @@ export async function createRenderer(canvas: HTMLCanvasElement): Promise<Rendere` | 2 |
| `src/rendering/densityShaderSources.ts` | `@@ -57 +57 @@ const CLOUD_HIT_START = 'struct HitInfo {';` | 4 |
| `src/rendering/densityShaderSources.ts` | `@@ -100 +100 @@ const cachedQualityAdapter = /* wgsl */ \`` | 5 |
| `src/rendering/densityShaderSources.ts` | `@@ -105,2 +105,6 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 5, 6 |
| `src/rendering/densityShaderSources.ts` | `@@ -115,7 +119,2 @@ const hybridQualityAdapter = /* wgsl */ \`` | 4, 5 |
| `src/rendering/densityShaderSources.ts` | `@@ -124,2 +123,14 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 5, 6 |
| `src/rendering/densityShaderSources.ts` | `@@ -134 +145 @@ const realtimeQualityAdapter = /* wgsl */ \`` | 5 |
| `src/rendering/densityShaderSources.ts` | `@@ -139,2 +150,6 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 5, 6 |
| `src/rendering/densityShaderSources.ts` | `@@ -319 +334 @@ const hierarchicalCachedQualityAdapter = /* wgsl */ \`` | 5 |
| `src/rendering/densityShaderSources.ts` | `@@ -324,2 +339,6 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 5, 6 |
| `src/rendering/densityShaderSources.ts` | `@@ -334,7 +353,6 @@ const hierarchicalHybridQualityAdapter = /* wgsl */ \`` | 4, 5 |
| `src/rendering/densityShaderSources.ts` | `@@ -343,2 +361,10 @@ fn densityAtTyped(pos : vec3f) -> vec4f {` | 5, 6 |

## Remaining owner/blocker items

- Keep 4.2, 4.3, 5.2, and 5.3 unchecked: runtime evidence has 95 captures / 20 pairs but `runtimeSourceMatchesHead=false`.
- Fresh ground-shadow timing is unavailable because the controller does not expose `shadowRan`, a current `shadowSampleId`, or `shadowMs`.
- Atlas-unavailable and Legacy coarse-fallback forcing are unavailable without a controller API.
- Edge-only and wind-motion are unavailable; no edge-only view or deterministic wind drive is exposed.
- All eight zero-tolerance rows need the owner visual verdict. Cb's known linear-remap deviation remains recorded.
- Owner disposition stays PENDING; automation stays REVIEW and does not substitute for owner review.
<!-- W12-TASK9-END -->
