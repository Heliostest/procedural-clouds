override wg_x : u32 = 8u;
override wg_y : u32 = 8u;
override wg_z : u32 = 4u;

@group(0) @binding(0) var<uniform> densityFrame : DensityFrameGPU;
@group(0) @binding(1) var<storage, read> densityBodies : array<DensityBodyGPU, 12>;
@group(0) @binding(2) var<storage, read> densityRecipes : array<DensityRecipeGPU, 10>;
@group(1) @binding(0) var densityOutput : texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(wg_x, wg_y, wg_z)
fn csDensityV2Empty(@builtin(global_invocation_id) gid : vec3u) {
  let resolution = densityFrame.countsAndFlags.x;
  if (any(gid >= vec3u(resolution))) {
    return;
  }
  textureStore(densityOutput, vec3i(gid), vec4f(0.0));
}
