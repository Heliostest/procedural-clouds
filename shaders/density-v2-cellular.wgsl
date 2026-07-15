// Bounded analytic hook shared by Sc/Ac/Cc. With every strength at zero it
// returns before evaluating trigonometry and is exactly the identity transform.
fn densityV2CellularAnalyticHooks(
  ctx : DensityV2Context,
  macroSample : vec4f,
  recipe : DensityRecipeGPU,
) -> vec2f {
  let waveStrength = max(recipe.domain1.y, 0.0);
  let rippleAmplitude = max(recipe.detail0.x, 0.0);
  let lensStrength = max(recipe.detail0.y, 0.0);
  let rollStrength = max(recipe.detail0.z, 0.0);
  if (waveStrength <= 0.0
    && rippleAmplitude <= 0.0
    && lensStrength <= 0.0
    && rollStrength <= 0.0) {
    return vec2f(0.0, 1.0);
  }

  let phase = (ctx.normalized.x * recipe.topology2.w
    + ctx.normalized.z * 0.5
    + macroSample.b) * 6.28318530718;
  let waveOffset = sin(phase) * waveStrength;
  let ripple = 1.0 + sin(phase * 1.7 + ctx.height01 * 3.14159265359) * rippleAmplitude;
  let lensAspect = max(recipe.vertical1.z, 1.0);
  let lensDistance = length(ctx.normalized.xz * vec2f(1.0, lensAspect));
  let lens = mix(1.0, max(1.0 - lensDistance * lensDistance, 0.0), clamp(lensStrength, 0.0, 1.0));
  let roll = 1.0 + cos(phase + ctx.height01 * 6.28318530718) * rollStrength;
  return vec2f(waveOffset, max(ripple * lens * roll, 0.0));
}

fn densityV2EvaluateCellular(
  ctx : DensityV2Context,
  body : DensityBodyGPU,
  recipe : DensityRecipeGPU,
) -> DensityV2Evaluation {
  let footprint = densityV2RoundedSheetFade(ctx.normalized.xz, ctx.feather01 * recipe.finalize0.y);
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
  let cellSignal = primary.g * recipe.topology1.x
    + primary.b * recipe.topology1.y
    + mix(secondary.g, secondary.b, 0.25) * recipe.topology1.z
    + recipe.topology1.w;
  let cellSoftness = max(recipe.topology0.w, 1e-4);
  let cellular = smoothstep(
    0.72 - cellSoftness,
    0.72 + cellSoftness,
    cellSignal * max(recipe.topology2.x, 0.0),
  );
  let rawDensity = footprint * vertical * coverage * cellular * hooks.y;
  return DensityV2Evaluation(densityV2Finalize(rawDensity, body, recipe), body.ids.x);
}
