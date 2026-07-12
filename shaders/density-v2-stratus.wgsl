fn densityV2EvaluateStratus(
  ctx : DensityV2Context,
  body : DensityBodyGPU,
  recipe : DensityRecipeGPU,
) -> DensityV2Evaluation {
  let footprint = densityV2RoundedSheetFade(ctx.normalized.xz, ctx.feather01 * recipe.finalize0.y);
  if (footprint <= 0.0 || ctx.height01 <= 0.0 || ctx.height01 >= 1.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }

  // W6 Stratus fixed cost: exactly one Macro + one Base sample.
  let macroSample = densitySharedSampleMacro(densityV2MacroCoordinate(ctx, body, recipe));
  let thicknessVariation = (macroSample.g - 0.5) * recipe.vertical0.z;
  let vertical = densityV2ThinSheetProfile(
    ctx.height01,
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
  let base = densitySharedSampleBase(densityV2SamplingCoordinate(ctx, body, recipe, recipe.domain0.y, 11u));
  let lowAmplitude = 1.0 + (base.r - 0.5) * recipe.topology2.x + recipe.topology1.w;
  let rawDensity = footprint * vertical * coverage * max(lowAmplitude, 0.0);
  return DensityV2Evaluation(densityV2Finalize(rawDensity, body, recipe), body.ids.x);
}
