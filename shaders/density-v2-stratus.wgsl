fn densityV2EvaluateStratiform(
  ctx : DensityV2Context,
  body : DensityBodyGPU,
  recipe : DensityRecipeGPU,
) -> DensityV2Evaluation {
  let footprint = densityV2RoundedSheetFade(ctx.normalized.xz, ctx.feather01 * recipe.finalize0.y);
  let profileHeight = densityV2ProfileHeight(ctx.height01, recipe.vertical1.x, recipe.vertical1.y);
  if (footprint <= 0.0 || profileHeight <= 0.0 || profileHeight >= 1.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }

  // W7 Stratiform fixed cost: exactly one Macro + one Base sample.
  let macroSample = densitySharedSampleMacro(densityV2MacroCoordinate(ctx, body, recipe));
  let thicknessVariation = densityV2StratiformTop(macroSample.g, recipe.vertical0.z) - 1.0;
  var vertical = densityV2ThinSheetProfile(profileHeight, recipe.vertical0.x, recipe.vertical0.y, thicknessVariation);
  if (recipe.identityAndModes.z == 1u) {
    vertical = densityV2SoftLayerProfile(profileHeight, recipe.vertical0.x, recipe.vertical0.y, thicknessVariation);
  }
  if (vertical <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }
  let coverage = densityV2CoverageGate(macroSample.r, body.coverageLifecycle.x, recipe);
  if (coverage <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }
  let base = densitySharedSampleBase(densityV2SamplingCoordinate(ctx, body, recipe, recipe.domain0.y, 11u));
  let lowAmplitude = 1.0 + (base.r - 0.5) * 2.0 * recipe.topology2.x + recipe.topology1.w;
  let rawDensity = footprint * vertical * coverage * max(lowAmplitude, 0.0);
  return DensityV2Evaluation(densityV2Finalize(rawDensity, body, recipe), body.ids.x);
}
