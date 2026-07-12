override wg_x : u32 = 8u;
override wg_y : u32 = 8u;
override wg_z : u32 = 4u;

@group(0) @binding(0) var<uniform> densityFrame : DensityFrameGPU;
@group(0) @binding(1) var<storage, read> densityBodies : array<DensityBodyGPU, 12>;
@group(0) @binding(2) var<storage, read> densityRecipes : array<DensityRecipeGPU, 10>;
@group(0) @binding(3) var<storage, read> densityTileMasks : array<u32>;
@group(1) @binding(0) var densityOutput : texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(wg_x, wg_y, wg_z)
fn csDensityV2Empty(
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
  var emptyDensity = 0.0;
  if (candidateMask != 0u) {
    // W4 only establishes the bounded candidate gate. W6 adds evaluators here.
    emptyDensity = min(f32(candidateMask), 0.0);
  }
  textureStore(densityOutput, vec3i(gid), vec4f(emptyDensity));
}
