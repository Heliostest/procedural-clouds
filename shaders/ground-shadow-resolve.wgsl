struct ResolveParams {
  historyWeight : f32,
  historyValid : f32,
  filterRadius : f32,
  _pad0 : f32,
};

@group(0) @binding(0) var rawShadow : texture_2d<f32>;
@group(0) @binding(1) var previousShadow : texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolveParams : ResolveParams;
@group(0) @binding(3) var resolvedShadow : texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn csGroundShadowFilter(@builtin(global_invocation_id) gid : vec3u) {
  let dims = textureDimensions(resolvedShadow);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let radius = clamp(i32(round(resolveParams.filterRadius)), 0, 2);
  let maxCoord = vec2i(dims) - vec2i(1);
  var filtered = vec4f(0.0);
  var totalWeight = 0.0;
  for (var x = -2; x <= 2; x++) {
    if (abs(x) <= radius) {
      let coord = clamp(vec2i(gid.xy) + vec2i(x, 0), vec2i(0), maxCoord);
      let weight = f32(radius + 1 - abs(x));
      filtered += textureLoad(rawShadow, coord, 0) * weight;
      totalWeight += weight;
    }
  }
  filtered /= max(totalWeight, 1.0);
  textureStore(resolvedShadow, vec2i(gid.xy), filtered);
}

@compute @workgroup_size(8, 8, 1)
fn csGroundShadowResolve(@builtin(global_invocation_id) gid : vec3u) {
  let dims = textureDimensions(resolvedShadow);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let radius = clamp(i32(round(resolveParams.filterRadius)), 0, 2);
  let maxCoord = vec2i(dims) - vec2i(1);
  var filtered = vec4f(0.0);
  var totalWeight = 0.0;
  for (var y = -2; y <= 2; y++) {
    if (abs(y) <= radius) {
      let coord = clamp(vec2i(gid.xy) + vec2i(0, y), vec2i(0), maxCoord);
      let weight = f32(radius + 1 - abs(y));
      filtered += textureLoad(rawShadow, coord, 0) * weight;
      totalWeight += weight;
    }
  }
  filtered /= max(totalWeight, 1.0);

  let previous = textureLoad(previousShadow, vec2i(gid.xy), 0);
  let historyWeight = clamp(resolveParams.historyWeight * resolveParams.historyValid, 0.0, 0.98);
  textureStore(resolvedShadow, vec2i(gid.xy), mix(filtered, previous, historyWeight));
}
