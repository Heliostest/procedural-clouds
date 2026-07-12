fn densityV2EvaluateCumulus(
  ctx : DensityV2Context,
  body : DensityBodyGPU,
  recipe : DensityRecipeGPU,
) -> DensityV2Evaluation {
  let footprint = densityV2EllipseFade(ctx.radius01, ctx.feather01 * recipe.finalize0.y);
  if (footprint <= 0.0 || ctx.height01 <= 0.0 || ctx.height01 >= 1.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }
  let vertical = densityV2FlatBaseDomeProfile(
    ctx.height01,
    ctx.radius01,
    recipe.vertical0.x,
    recipe.vertical0.y,
    recipe.vertical0.w,
    recipe.vertical1.x,
  );
  if (vertical <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }

  // W6 Cumulus fixed cost: one Macro + Base-A + Base-B + one Detail sample.
  let macro = densitySharedSampleMacro(densityV2MacroCoordinate(ctx, body, recipe));
  let coverage = densityV2CoverageGate(macro.r, body.coverageLifecycle.x, recipe);
  if (coverage <= 0.0) {
    return DensityV2Evaluation(0.0, body.ids.x);
  }
  let baseCoordinate = densityV2SamplingCoordinate(ctx, body, recipe, recipe.domain0.y, 23u);
  let baseA = densitySharedSampleBase(baseCoordinate);
  // The sole permitted warp reuses Base-A; it does not add a texture sample.
  let warp = (baseA.a - 0.5) * clamp(recipe.domain1.y, 0.0, 0.25);
  let heightScale = mix(1.0, recipe.topology2.y, clamp(ctx.height01, 0.0, 1.0));
  let baseBCoordinate = baseCoordinate * heightScale + vec3f(warp, warp * 0.35, -warp);
  let baseB = densitySharedSampleBase(baseBCoordinate);
  let billow = baseA.r * recipe.topology1.x
    + baseA.g * recipe.topology1.y
    + mix(baseB.r, baseB.g, 0.35) * recipe.topology1.z
    + recipe.topology1.w;
  let solid = smoothstep(
    recipe.topology0.w,
    1.0 - recipe.topology0.w,
    billow,
  );

  let detailCoordinate = densityV2SamplingCoordinate(ctx, body, recipe, recipe.detail0.z, 47u);
  let detail = densitySharedSampleDetail(detailCoordinate);
  let erosionBias = mix(1.0 - clamp(recipe.detail0.y, 0.0, 1.0), 1.0, clamp(ctx.height01, 0.0, 1.0));
  let erosion = clamp(detail.g, 0.0, 1.0) * recipe.detail0.x * erosionBias;
  let rawDensity = footprint * vertical * coverage * max(solid - erosion, 0.0);
  return DensityV2Evaluation(densityV2Finalize(rawDensity, body, recipe), body.ids.x);
}
