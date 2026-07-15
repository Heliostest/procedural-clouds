// Bounded analytic hook shared by Sc/Ac/Cc. With every strength at zero it
// returns before evaluating trigonometry and is exactly the identity transform.
// x = horizontal domain offset, y = density multiplier, z = cell-threshold offset.
fn densityV2CellularAnalyticHooks(
  ctx : DensityV2Context,
  macroSample : vec4f,
  recipe : DensityRecipeGPU,
) -> vec3f {
  let waveStrength = max(recipe.domain1.y, 0.0);
  let rippleAmplitude = max(recipe.detail0.x, 0.0);
  let lensStrength = max(recipe.detail0.y, 0.0);
  let rollStrength = max(recipe.detail0.z, 0.0);
  if (waveStrength <= 0.0
    && rippleAmplitude <= 0.0
    && lensStrength <= 0.0
    && rollStrength <= 0.0) {
    return vec3f(0.0, 1.0, 0.0);
  }

  // Keep the carrier body-local and horizontally coherent. Macro wave phase
  // only perturbs the carrier slightly so it cannot destroy visible bands.
  let phase = (ctx.normalized.x * recipe.topology2.w
    + ctx.normalized.z * 0.35
    + (macroSample.b - 0.5) * 0.25) * 6.28318530718;
  let carrier = 0.5 + 0.5 * sin(phase);
  let waveOffset = (carrier * 2.0 - 1.0) * waveStrength;
  let rippleThresholdOffset = (0.5 - carrier) * rippleAmplitude;
  let rippleBlend = clamp(rippleAmplitude * 3.0, 0.0, 1.0);
  let rippleDensity = mix(1.0, 0.35 + carrier * 0.65, rippleBlend);
  let lensAspect = max(recipe.vertical1.z, 1.0);
  let lensDistance = length(ctx.normalized.xz * vec2f(1.0, lensAspect));
  let lens = mix(1.0, max(1.0 - lensDistance * lensDistance, 0.0), clamp(lensStrength, 0.0, 1.0));
  let roll = 1.0 + cos(phase + ctx.height01 * 6.28318530718) * rollStrength;
  return vec3f(waveOffset, max(rippleDensity * lens * roll, 0.0), rippleThresholdOffset);
}

fn densityV2CellularSignal(
  primary : vec4f,
  secondary : vec4f,
  recipe : DensityRecipeGPU,
  thresholdOffset : f32,
) -> f32 {
  let weights = max(recipe.topology1.xyz, vec3f(0.0));
  let weightSum = max(dot(weights, vec3f(1.0)), 1e-4);
  let secondaryCell = mix(secondary.g, secondary.b, 0.25);
  let weightedCell = (
    primary.g * weights.x
      + primary.b * weights.y
      + secondaryCell * weights.z
  ) / weightSum;

  // Connectivity is a bounded bridge toward the strongest cell interior. It
  // can join nearby cells without adding a positive bias that fills the body.
  let bridge = max(primary.g, secondary.g) * 0.85;
  let connectedCell = mix(
    weightedCell,
    max(weightedCell, bridge),
    clamp(recipe.topology1.w, 0.0, 1.0),
  );
  let cellSignal = connectedCell * max(recipe.topology2.x, 0.0);
  let cellThreshold = clamp(recipe.topology2.y + thresholdOffset, 0.05, 0.95);
  let cellSoftness = max(recipe.topology0.w, 1e-4);
  return smoothstep(
    cellThreshold - cellSoftness,
    cellThreshold + cellSoftness,
    cellSignal,
  );
}

fn densityV2EvaluateCellular(
  ctx : DensityV2Context,
  body : DensityBodyGPU,
  recipe : DensityRecipeGPU,
) -> DensityV2Evaluation {
  let footprintFeather = max(ctx.feather01 * recipe.finalize0.y, 1e-4);
  let outerFootprint = densityV2RoundedSheetFade(ctx.normalized.xz, footprintFeather);
  let innerEdge = max(abs(ctx.normalized.x), abs(ctx.normalized.z));
  let footprint = outerFootprint * (1.0 - smoothstep(
    max(1.0 - min(footprintFeather, 0.45), 0.0),
    1.0,
    innerEdge,
  ));
  let profileHeight = densityV2ProfileHeight(ctx.height01, recipe.vertical1.x, recipe.vertical1.y);
  if (footprint <= 0.0 || profileHeight <= 0.0 || profileHeight >= 1.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }

  // W8 Cellular fixed cost: exactly one Macro + two Base samples.
  let macroSample = densitySharedSampleMacro(densityV2MacroCoordinate(ctx, body, recipe));
  let thicknessVariation = densityV2StratiformTop(macroSample.g, recipe.vertical0.z) - 1.0;
  let vertical = densityV2SoftLayerProfile(
    profileHeight,
    recipe.vertical0.x,
    recipe.vertical0.y,
    thicknessVariation,
  );
  if (vertical <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }
  let coverage = densityV2CoverageGate(macroSample.r, body.coverageLifecycle.x, recipe);
  if (coverage <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }

  let hooks = densityV2CellularAnalyticHooks(ctx, macroSample, recipe);
  let primaryCoordinate = densityV2SamplingCoordinate(ctx, body, recipe, recipe.domain0.y, 71u)
    + vec3f(hooks.x, 0.0, -hooks.x * 0.35);
  let secondaryCoordinate = densityV2SamplingCoordinate(ctx, body, recipe, recipe.domain0.z, 89u)
    + vec3f(-hooks.x * 0.45, 0.0, hooks.x);
  let primary = densitySharedSampleBase(primaryCoordinate);
  let secondary = densitySharedSampleBase(secondaryCoordinate);
  let cellular = densityV2CellularSignal(primary, secondary, recipe, hooks.z);
  let rawDensity = footprint * vertical * coverage * cellular * hooks.y;
  return DensityV2Evaluation(densityV2Finalize(rawDensity, body, recipe), body.ids.x);
}
