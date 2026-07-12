struct DensitySharedDebugParams {
  fieldKind : u32,
  channel : u32,
  showSeams : u32,
  _pad0 : u32,
  slice : f32,
  phase : f32,
  tileScale : f32,
  _pad1 : f32,
}

@group(0) @binding(0) var sharedDebugSampler : sampler;
@group(0) @binding(1) var sharedDebugBase : texture_3d<f32>;
@group(0) @binding(2) var sharedDebugDetail : texture_3d<f32>;
@group(0) @binding(3) var sharedDebugMacro : texture_2d<f32>;
@group(0) @binding(4) var<uniform> sharedDebugParams : DensitySharedDebugParams;

struct SharedDebugVertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vsDensitySharedDebug(@builtin(vertex_index) vertexIndex : u32) -> SharedDebugVertexOut {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var output : SharedDebugVertexOut;
  let position = positions[vertexIndex];
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = position * vec2f(0.5, -0.5) + vec2f(0.5);
  return output;
}

fn sharedDebugChannel(value : vec4f, channel : u32) -> f32 {
  if (channel == 0u) { return value.r; }
  if (channel == 1u) { return value.g; }
  if (channel == 2u) { return value.b; }
  return value.a;
}

@fragment
fn fsDensitySharedDebug(input : SharedDebugVertexOut) -> @location(0) vec4f {
  let tiled = input.uv * sharedDebugParams.tileScale + vec2f(sharedDebugParams.phase);
  let slice = sharedDebugParams.slice + sharedDebugParams.phase * 0.125;
  var field = vec4f(0.0);
  if (sharedDebugParams.fieldKind == 0u) {
    field = textureSampleLevel(sharedDebugBase, sharedDebugSampler, vec3f(tiled, slice), 0.0);
  } else if (sharedDebugParams.fieldKind == 1u) {
    field = textureSampleLevel(sharedDebugDetail, sharedDebugSampler, vec3f(tiled, slice), 0.0);
  } else {
    field = textureSampleLevel(sharedDebugMacro, sharedDebugSampler, tiled, 0.0);
  }
  let selected = sharedDebugChannel(field, sharedDebugParams.channel);
  var color = vec3f(selected);
  if (sharedDebugParams.showSeams != 0u) {
    let cell = fract(tiled);
    let edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
    let seam = 1.0 - smoothstep(0.0, max(fwidth(edge) * 1.5, 0.002), edge);
    color = mix(color, vec3f(1.0, 0.1, 0.05), seam * 0.8);
  }
  return vec4f(color, 1.0);
}
