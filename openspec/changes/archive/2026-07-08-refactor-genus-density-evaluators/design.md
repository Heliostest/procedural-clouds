## Context

`cloudDensityTyped()` currently loops over active bodies and calls one monolithic `evalBody()` for every non-debug cloud. `evalBody()` performs transport and rotation, footprint sampling, body-local vertical profiling, Perlin/Voronoi density generation, morphology shaping and final scaling. The selected preset changes parameters, but all ten genera execute the same shape program.

This is compact for a shared prototype, but it creates the wrong extension boundary. A cirrus-specific directional fiber path or a cumulonimbus-specific convective-tower path would have to enter the common function as more conditional branches. Those branches would execute in the hottest density path and make unrelated genera harder to reason about and validate.

The renderer already depends on a single downstream density contract: cached, hybrid and realtime modes converge through `densityAtTyped()`, while lighting, self-shadow and ground shadow consume that result. This proposal changes only the upstream per-body morphology dispatch and preserves the downstream contract.

## Goals / Non-Goals

### Goals

- Give each of the ten supported genera one explicit WGSL density evaluator.
- Keep the runtime call chain direct: common body preparation -> genus dispatcher -> selected genus evaluator -> shared primitives.
- Share low-level noise, coordinate, envelope and density-combination primitives without sharing a mandatory genus-shape pipeline.
- Preserve current density output during the mechanical migration unless floating-point reordering is documented and visually verified.
- Preserve cached, hybrid and realtime behavior, density metadata, edge shaping, lighting and ground-shadow semantics.
- Make later genus-specific changes reviewable and verifiable without modifying unrelated genus evaluators.

### Non-Goals

- Implementing new cirrus fibers, cauliflower towers, mammatus, virga, precipitation or typhoon deformation.
- Introducing a runtime shader graph, bytecode interpreter, arbitrary operator registry or user-authored WGSL.
- Adding cloud species/variant schema fields.
- Changing preset values, GUI controls, `CloudBody`, scenario JSON, density cache format or GPU buffer layout.
- Replacing the current physical wind model with wind shear, vortex flow or fluid simulation.
- Changing lighting or edge-style behavior.

## Decisions

### D1: One explicit evaluator per genus

The shader SHALL expose one named evaluator for each canonical preset key:

```wgsl
fn evalCumulus(compatibilityDensity: f32) -> f32;
fn evalStratus(compatibilityDensity: f32) -> f32;
fn evalStratocumulus(compatibilityDensity: f32) -> f32;
fn evalCumulonimbus(compatibilityDensity: f32) -> f32;
fn evalAltocumulus(compatibilityDensity: f32) -> f32;
fn evalAltostratus(compatibilityDensity: f32) -> f32;
fn evalNimbostratus(compatibilityDensity: f32) -> f32;
fn evalCirrus(compatibilityDensity: f32) -> f32;
fn evalCirrostratus(compatibilityDensity: f32) -> f32;
fn evalCirrocumulus(compatibilityDensity: f32) -> f32;
```

A single `evalGenusDensity(genusIndex, compatibilityDensity)` switch selects exactly one evaluator. The dispatcher contains routing and fallback only; genus-specific density formulas are forbidden in the dispatcher. Unknown indices preserve the existing preset-index fallback and route to cumulus rather than creating an eleventh generic path.

Alternative considered: one common evaluator with per-genus branches. Rejected because it retains the current coupling and gives every new morphology feature a shared regression surface.

Alternative considered: runtime recipe/graph interpretation. Rejected because the genus set is fixed, the added indirection complicates GPU cost analysis, and the project does not need user-authored morphology graphs.

### D2: Shared context, independent shape orchestration

`evalBody()` remains responsible for body eligibility and debug-solid bypass. It prepares a `GenusEvalContext` containing the data that every genus would otherwise recompute, including:

- body and preset references/values;
- transported and body-rotated positions;
- Blender-compatible object coordinates;
- body-local and preset-local vertical coordinates;
- footprint identity and lifecycle/coverage/density modulation inputs;
- morph time and shared global shape controls.

The context MUST retain enough coordinate information for a genus to alter its footprint lookup before sampling it. This is required by the existing cumulonimbus anvil, which expands only the upper horizontal footprint. Therefore common preparation MUST NOT prematurely collapse the footprint to one immutable alpha value.

Each genus evaluator returns a finite, non-negative raw body-density contribution. Common finalization may apply invariants that are identical for every genus, but it MUST NOT encode genus-specific shape decisions.

### D3: Shared primitives are functions, not a second hidden generic pipeline

Shared WGSL code may provide:

- Perlin/FBM, Voronoi/Worley and Curl noise;
- normalized footprint sampling and coverage remapping;
- vertical envelopes and range mapping;
- sharpening, erosion and soft density union helpers;
- common numeric guards and final density scaling.

The shared layer MUST remain compositional. A helper that reproduces the entire current five-stage density chain is allowed only as a temporary migration bridge and MUST be named as compatibility code. During the mechanical migration it SHALL run once before dispatch and pass only `compatibilityDensity` to the selected genus evaluator; passing the full context through ten no-op branches was measured to trigger pathological shader inlining. New genus-specific morphology MUST be expressed in the selected genus evaluator rather than added to that compatibility helper. A later approved genus change MAY extend only that evaluator's signature with the context values it needs and replace rather than retain the compatibility density.

### D4: Deterministic shader source assembly

Per-genus sources SHALL live under `shaders/genus/` with shared context/primitives and dispatcher separated from genus implementations. Because WGSL has no native module system, TypeScript SHALL concatenate sources in an explicit canonical order. Dynamic filesystem discovery or order-dependent globbing is rejected; a missing genus source must fail review/build/runtime verification visibly.

Suggested layout:

```text
shaders/genus/common.wgsl
shaders/genus/cumulus.wgsl
...
shaders/genus/cirrocumulus.wgsl
shaders/genus/dispatch.wgsl
```

Whether imports remain in `renderer.ts` or move to a small `shaderSources.ts` is an implementation choice. The assembly list must be explicit and contain all ten genera exactly once.

### D5: Mechanical migration before visual divergence

The implementation proceeds in two internal steps:

1. Extract context and shared primitives while the existing `evalBody()` remains authoritative.
2. Add all ten evaluators and route through the dispatcher, initially reproducing the same formulas and parameters.

The second step is complete only when all ten genera compile and render in cached and realtime modes. This proposal does not authorize intentional appearance changes. Later morphology proposals may change one genus evaluator with its own acceptance evidence.

### D6: Preserve the unified downstream density contract

`cloudDensityTyped()` continues to perform multi-body accumulation and dominant/secondary genus tracking. The selected genus evaluator supplies only the per-body density contribution. Cache compute, cache interpolation, hybrid detail, realtime density, edge shaping, raymarch lighting and ground shadows continue through the current unified entrypoints.

No genus evaluator may directly shade pixels, perform light marching, write cache textures or apply post-sample edge style. This keeps morphology independent from rendering response.

### D7: Phenomena that are not genus shape remain separate

Future cirrus fibers or cumuliform towers belong inside their corresponding genus evaluators because they produce condensate density within the cloud body.

Precipitation extends below the cloud body's condensate envelope and has different transport and optical behavior; it requires an auxiliary precipitation field and a separate proposal. Typhoon bands, vortex deformation and vertical wind shear are scene/environment flow concerns; they must compose before genus evaluation and must not redefine the physical-wind transport contract in this refactor.

### D8: Coordinate with active shader changes

`add-physical-wind-advection` changes transported coordinates and cache snapshot semantics. `per-preset-lighting` changes genus metadata stored beside density and consumed after sampling. Both touch the same shader path but define contracts this refactor must preserve.

Implementation MUST begin after those changes are completed/archived, or explicitly audit their final code and specs before extraction. The refactor must not revive legacy `speed * sceneTime` transport or collapse dominant/secondary genus metadata.

## Risks / Trade-offs

- Ten functions and source files increase code surface. Mitigation: share primitives and keep each genus evaluator as the only orchestration point for that genus.
- Initial functions may look repetitive because they reproduce one legacy path. Mitigation: accept temporary structural repetition only where it creates a clear future divergence point; do not copy noise implementations.
- A runtime switch executes inside every body-density evaluation. Mitigation: the existing path already branches on body shape and preset behavior; record cache/realtime GPU timings and investigate any material regression.
- Mechanical extraction can change floating-point ordering. Mitigation: freeze time/camera, compare density debug views and document any non-bitwise but visually equivalent differences.
- Active wind and lighting changes can be lost during extraction. Mitigation: enforce D8 as a task gate and verify their specific runtime contracts after migration.

## Migration Plan

1. Record frozen-time density screenshots and GPU timings for all ten genera on the current completed shader baseline.
2. Extract shared context and primitive helpers without changing the active evaluation route.
3. Add the ten named evaluators and explicit dispatcher; initially route each evaluator through compatibility-equivalent formulas.
4. Switch `evalBody()` to the dispatcher while preserving debug-solid bypass and common finalization.
5. Verify all quality modes and downstream density consumers, then compare visual and performance baselines.
6. Update architecture documentation and archive the proposal only after all acceptance evidence is recorded.

Rollback is a source-level revert to the monolithic `evalBody()` path; no serialized data or GPU resource migration is involved.

## Open Questions

- Should the ten genus implementations remain ten files permanently, or may closely related genera share one source file while retaining separate named functions? The proposal requires separate functions and explicit assembly, not permanent one-file-per-function organization.
- What frozen camera/body fixture should become the canonical ten-genus visual baseline? This must be selected before implementation changes the shader path.
