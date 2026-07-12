override wg_x : u32 = 8u;
override wg_y : u32 = 8u;
override wg_z : u32 = 4u;

@group(0) @binding(0) var<uniform> densityFrame : DensityFrameGPU;
@group(0) @binding(1) var<storage, read> densityBodies : array<DensityBodyGPU, 12>;
@group(0) @binding(2) var<storage, read> densityRecipes : array<DensityRecipeGPU, 10>;
@group(0) @binding(3) var<storage, read> densityTileMasks : array<u32>;
@group(1) @binding(0) var densityOutput : texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(wg_x, wg_y, wg_z)
fn csDensityV2Spike(
  @builtin(global_invocation_id) gid : vec3u,
  @builtin(workgroup_id) tileId : vec3u,
) {
  let resolution = densityFrame.countsAndFlags.x;
  if (any(gid >= vec3u(resolution))) {
    return;
  }
  let activeBodyCount = min(densityFrame.countsAndFlags.y, DENSITY_V2_MAX_BODIES);
  let activeMask = select((1u << activeBodyCount) - 1u, 0u, activeBodyCount == 0u);
  let tileMaskEnabled = (densityFrame.countsAndFlags.w & 2u) != 0u;
  let grid = vec3u(
    (resolution + wg_x - 1u) / wg_x,
    (resolution + wg_y - 1u) / wg_y,
    (resolution + wg_z - 1u) / wg_z,
  );
  let tileIndex = tileId.x + grid.x * (tileId.y + grid.y * tileId.z);
  var candidateMask = activeMask;
  if (tileMaskEnabled) {
    candidateMask = densityTileMasks[tileIndex] & activeMask;
  }

  let worldPosition = densityV2WorldPosition(gid, resolution);
  var totalDensity = 0.0;
  var bestDensity = 0.0;
  var secondDensity = 0.0;
  var bestGenus = 0u;
  var secondGenus = 0u;
  for (var bodyIndex = 0u; bodyIndex < DENSITY_V2_MAX_BODIES; bodyIndex++) {
    if (bodyIndex >= activeBodyCount) {
      break;
    }
    if ((candidateMask & (1u << bodyIndex)) == 0u) {
      continue;
    }
    let body = densityBodies[bodyIndex];
    let recipeId = body.ids.y;
    if (recipeId >= DENSITY_V2_RECIPE_COUNT) {
      continue;
    }
    let recipe = densityRecipes[recipeId];
    if (recipe.identityAndModes.y == 0u) {
      continue;
    }
    let genusId = body.ids.x;
    // Static dispatcher: unsupported genera exit before any shared texture sample.
    if (genusId != 0u && genusId != 1u) {
      continue;
    }
    if (any(body.localScaleAndFeather.xyz <= vec3f(1e-5))) {
      continue;
    }
    let ctx = densityV2BuildContext(worldPosition, body, bodyIndex);
    var evaluation = DensityV2Evaluation(0.0, genusId);
    if (genusId == 0u) {
      evaluation = densityV2EvaluateCumulus(ctx, body, recipe);
    } else if (genusId == 1u) {
      evaluation = densityV2EvaluateStratus(ctx, body, recipe);
    }
    let density = max(evaluation.density, 0.0);
    totalDensity += density;
    if (density > bestDensity) {
      secondDensity = bestDensity;
      secondGenus = bestGenus;
      bestDensity = density;
      bestGenus = evaluation.genusId;
    } else if (density > secondDensity) {
      secondDensity = density;
      secondGenus = evaluation.genusId;
    }
  }

  var output = vec4f(0.0);
  if (bestDensity > 0.0) {
    let rest = max(totalDensity - bestDensity, 0.0);
    let restCap = max(bestDensity, 0.25);
    let softDensity = bestDensity + restCap * (1.0 - exp(-rest / restCap));
    let secondWeight = secondDensity / max(bestDensity + secondDensity, 1e-4);
    output = vec4f(softDensity, f32(bestGenus), f32(secondGenus), secondWeight);
  }
  textureStore(densityOutput, vec3i(gid), output);
}
