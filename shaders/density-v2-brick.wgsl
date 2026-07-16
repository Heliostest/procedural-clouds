override brick_wg_x : u32 = 8u;
override brick_wg_y : u32 = 8u;
override brick_wg_z : u32 = 4u;

struct DensityBrickDispatchGPU {
  originAndBody : vec4u,
  edges : vec4u,
  supportCenter : vec4f,
  supportHalfExtents : vec4f,
  supportRotation0 : vec4f,
  supportRotation1 : vec4f,
  supportRotation2 : vec4f,
};

@group(0) @binding(0) var<uniform> densityFrame : DensityFrameGPU;
@group(0) @binding(1) var<storage, read> densityBodies : array<DensityBodyGPU, 12>;
@group(0) @binding(2) var<storage, read> densityRecipes : array<DensityRecipeGPU, 10>;
@group(0) @binding(3) var<storage, read> densityTileMasks : array<u32>;
@group(1) @binding(0) var densityBrickOutput : texture_storage_3d<__BRICK_STORAGE_FORMAT__, write>;
@group(3) @binding(0) var<uniform> densityBrickDispatch : DensityBrickDispatchGPU;

fn densityBrickSupportedGenus(genusId : u32) -> bool {
  return genusId == 0u || genusId == 1u || genusId == 2u || genusId == 4u
    || genusId == 5u || genusId == 6u || genusId == 8u || genusId == 9u;
}

fn densityBrickWorldPosition(gid : vec3u) -> vec3f {
  let logicalEdge = max(densityBrickDispatch.edges.x, 1u);
  let padding = densityBrickDispatch.edges.z;
  let logicalIndex = clamp(
    vec3i(gid) - vec3i(i32(padding)),
    vec3i(0),
    vec3i(i32(logicalEdge) - 1),
  );
  let local01 = (vec3f(logicalIndex) + vec3f(0.5)) / f32(logicalEdge);
  let local = (local01 * 2.0 - 1.0) * densityBrickDispatch.supportHalfExtents.xyz;
  let rotated = vec3f(
    dot(densityBrickDispatch.supportRotation0.xyz, local),
    dot(densityBrickDispatch.supportRotation1.xyz, local),
    dot(densityBrickDispatch.supportRotation2.xyz, local),
  );
  return densityBrickDispatch.supportCenter.xyz + rotated;
}

@compute @workgroup_size(brick_wg_x, brick_wg_y, brick_wg_z)
fn csDensityV2Brick(@builtin(global_invocation_id) gid : vec3u) {
  let physicalEdge = densityBrickDispatch.edges.y;
  if (any(gid >= vec3u(physicalEdge))) {
    return;
  }
  let outputCoord = densityBrickDispatch.originAndBody.xyz + gid;
  let bodyIndex = densityBrickDispatch.originAndBody.w;
  var density = 0.0;
  if (bodyIndex < min(densityFrame.countsAndFlags.y, DENSITY_V2_MAX_BODIES)) {
    let body = densityBodies[bodyIndex];
    let recipeId = body.ids.y;
    let genusId = body.ids.x;
    if (recipeId < DENSITY_V2_RECIPE_COUNT
      && densityBrickSupportedGenus(genusId)
      && all(body.localScaleAndFeather.xyz > vec3f(1e-5))) {
      let recipe = densityRecipes[recipeId];
      if (recipe.identityAndModes.y != 0u) {
        let worldPosition = densityBrickWorldPosition(gid);
        let ctx = densityV2BuildContext(worldPosition, body, bodyIndex);
        var evaluation = DensityV2Evaluation(0.0, genusId);
        if (genusId == 0u) {
          evaluation = densityV2EvaluateCumulus(ctx, body, recipe);
        } else if (recipe.identityAndModes.w == 0u) {
          evaluation = densityV2EvaluateStratiform(ctx, body, recipe);
        } else if (recipe.identityAndModes.w == 2u) {
          evaluation = densityV2EvaluateCellular(ctx, body, recipe);
        }
        density = max(evaluation.density, 0.0);
      }
    }
  }
  textureStore(densityBrickOutput, vec3i(outputCoord), vec4f(density, 0.0, 0.0, 1.0));
}
