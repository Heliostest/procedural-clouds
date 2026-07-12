struct DensitySharedFieldConfigGPU {
  atlasDimension : u32,
  macroDimension : u32,
  atlasSeed : u32,
  macroSeed : u32,
}

@group(0) @binding(0) var densityMacroFieldOut : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> densitySharedConfig : DensitySharedFieldConfigGPU;

fn macroHash(value : u32) -> u32 {
  var x = value;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn macroHash2(cell : vec2u, seed : u32) -> u32 {
  return macroHash(cell.x ^ macroHash(cell.y ^ seed));
}

fn macroHash01(value : u32) -> f32 {
  return f32(value & 0x00ffffffu) / 16777216.0;
}

fn macroWrap(value : i32, period : i32) -> u32 {
  return u32(((value % period) + period) % period);
}

fn macroWrap2(value : vec2i, period : i32) -> vec2u {
  return vec2u(macroWrap(value.x, period), macroWrap(value.y, period));
}

fn macroValue2(coordinate : vec2f, period : i32, seed : u32) -> f32 {
  let cell = vec2i(floor(coordinate));
  let local = fract(coordinate);
  let fade = local * local * (3.0 - 2.0 * local);
  let c00 = macroHash01(macroHash2(macroWrap2(cell + vec2i(0, 0), period), seed));
  let c10 = macroHash01(macroHash2(macroWrap2(cell + vec2i(1, 0), period), seed));
  let c01 = macroHash01(macroHash2(macroWrap2(cell + vec2i(0, 1), period), seed));
  let c11 = macroHash01(macroHash2(macroWrap2(cell + vec2i(1, 1), period), seed));
  return mix(mix(c00, c10, fade.x), mix(c01, c11, fade.x), fade.y);
}

fn macroFbm2(coordinate : vec2f, seed : u32) -> f32 {
  return macroValue2(coordinate * 2.0, 2, seed) * 0.5714286
    + macroValue2(coordinate * 4.0, 4, seed ^ 0x9e3779b9u) * 0.2857143
    + macroValue2(coordinate * 8.0, 8, seed ^ 0x85ebca6bu) * 0.1428571;
}

fn macroWorleyPoint(cell : vec2u, seed : u32) -> vec2f {
  let base = macroHash2(cell, seed);
  return vec2f(
    macroHash01(macroHash(base ^ 0xa511e9b3u)),
    macroHash01(macroHash(base ^ 0x63d83595u)),
  );
}

fn macroWorley2(coordinate : vec2f, period : i32, seed : u32) -> f32 {
  let cell = vec2i(floor(coordinate));
  let local = fract(coordinate);
  var first = 8.0;
  for (var y = -1; y <= 1; y += 1) {
    for (var x = -1; x <= 1; x += 1) {
      let neighbor = vec2i(x, y);
      let point = macroWorleyPoint(macroWrap2(cell + neighbor, period), seed);
      let delta = vec2f(neighbor) + point - local;
      first = min(first, dot(delta, delta));
    }
  }
  return sqrt(first);
}

@compute @workgroup_size(8, 8, 1)
fn csDensitySharedMacro(@builtin(global_invocation_id) gid : vec3u) {
  let dimension = densitySharedConfig.macroDimension;
  if (any(gid.xy >= vec2u(dimension))) {
    return;
  }
  let coordinate = (vec2f(gid.xy) + vec2f(0.5)) / f32(dimension);
  let seed = densitySharedConfig.macroSeed;
  let coverage = macroFbm2(coordinate, seed);
  let thickness = macroFbm2(coordinate.yx + vec2f(0.25, 0.5), seed ^ 0x27d4eb2fu);
  let waveWarp = macroValue2(coordinate * 4.0, 4, seed ^ 0x165667b1u);
  let wavePhase = 0.5 + 0.5 * sin(6.28318530718 * (coordinate.x * 4.0 + coordinate.y * 2.0 + waveWarp));
  let cellLayout = 1.0 - clamp(macroWorley2(coordinate * 8.0, 8, seed ^ 0xfd7046c5u), 0.0, 1.0);
  textureStore(
    densityMacroFieldOut,
    vec2i(gid.xy),
    clamp(vec4f(coverage, thickness, wavePhase, cellLayout), vec4f(0.0), vec4f(1.0)),
  );
}
