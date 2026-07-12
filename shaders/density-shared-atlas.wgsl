struct DensitySharedFieldConfigGPU {
  atlasDimension : u32,
  macroDimension : u32,
  atlasSeed : u32,
  macroSeed : u32,
}

@group(0) @binding(0) var densityBaseAtlasOut : texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var densityDetailAtlasOut : texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> densitySharedConfig : DensitySharedFieldConfigGPU;

fn sharedHash(value : u32) -> u32 {
  var x = value;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn sharedHash3(cell : vec3u, seed : u32) -> u32 {
  return sharedHash(cell.x ^ sharedHash(cell.y ^ sharedHash(cell.z ^ seed)));
}

fn sharedHash01(value : u32) -> f32 {
  return f32(value & 0x00ffffffu) / 16777216.0;
}

fn sharedWrap(value : i32, period : i32) -> u32 {
  return u32(((value % period) + period) % period);
}

fn sharedWrap3(value : vec3i, period : i32) -> vec3u {
  return vec3u(
    sharedWrap(value.x, period),
    sharedWrap(value.y, period),
    sharedWrap(value.z, period),
  );
}

fn sharedFade3(value : vec3f) -> vec3f {
  return value * value * (3.0 - 2.0 * value);
}

fn sharedValue3(coordinate : vec3f, period : i32, seed : u32) -> f32 {
  let cell = vec3i(floor(coordinate));
  let local = fract(coordinate);
  let fade = sharedFade3(local);
  let c000 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(0, 0, 0), period), seed));
  let c100 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(1, 0, 0), period), seed));
  let c010 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(0, 1, 0), period), seed));
  let c110 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(1, 1, 0), period), seed));
  let c001 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(0, 0, 1), period), seed));
  let c101 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(1, 0, 1), period), seed));
  let c011 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(0, 1, 1), period), seed));
  let c111 = sharedHash01(sharedHash3(sharedWrap3(cell + vec3i(1, 1, 1), period), seed));
  let z0 = mix(mix(c000, c100, fade.x), mix(c010, c110, fade.x), fade.y);
  let z1 = mix(mix(c001, c101, fade.x), mix(c011, c111, fade.x), fade.y);
  return mix(z0, z1, fade.z);
}

fn sharedFbm3(coordinate : vec3f, seed : u32) -> f32 {
  let octave0 = sharedValue3(coordinate * 4.0, 4, seed);
  let octave1 = sharedValue3(coordinate * 8.0, 8, seed ^ 0x9e3779b9u);
  let octave2 = sharedValue3(coordinate * 16.0, 16, seed ^ 0x85ebca6bu);
  return (octave0 * 0.5714286 + octave1 * 0.2857143 + octave2 * 0.1428571);
}

fn sharedWorleyPoint(cell : vec3u, seed : u32) -> vec3f {
  let base = sharedHash3(cell, seed);
  return vec3f(
    sharedHash01(sharedHash(base ^ 0xa511e9b3u)),
    sharedHash01(sharedHash(base ^ 0x63d83595u)),
    sharedHash01(sharedHash(base ^ 0xb5297a4du)),
  );
}

fn sharedWorley3(coordinate : vec3f, period : i32, seed : u32) -> vec2f {
  let cell = vec3i(floor(coordinate));
  let local = fract(coordinate);
  var first = 16.0;
  var second = 16.0;
  for (var z = -1; z <= 1; z += 1) {
    for (var y = -1; y <= 1; y += 1) {
      for (var x = -1; x <= 1; x += 1) {
        let neighbor = vec3i(x, y, z);
        let point = sharedWorleyPoint(sharedWrap3(cell + neighbor, period), seed);
        let delta = vec3f(neighbor) + point - local;
        let distanceSquared = dot(delta, delta);
        if (distanceSquared < first) {
          second = first;
          first = distanceSquared;
        } else if (distanceSquared < second) {
          second = distanceSquared;
        }
      }
    }
  }
  return sqrt(vec2f(first, second));
}

@compute @workgroup_size(4, 4, 4)
fn csDensitySharedAtlas(@builtin(global_invocation_id) gid : vec3u) {
  let dimension = densitySharedConfig.atlasDimension;
  if (any(gid >= vec3u(dimension))) {
    return;
  }
  let coordinate = (vec3f(gid) + vec3f(0.5)) / f32(dimension);
  let seed = densitySharedConfig.atlasSeed;
  let baseFbm = sharedFbm3(coordinate, seed);
  let baseCell = sharedWorley3(coordinate * 4.0, 4, seed ^ 0x27d4eb2fu);
  let baseWarp = sharedValue3(coordinate * 2.0, 2, seed ^ 0x165667b1u);
  let base = vec4f(
    baseFbm,
    1.0 - clamp(baseCell.x * 0.75, 0.0, 1.0),
    clamp((baseCell.y - baseCell.x) * 1.5, 0.0, 1.0),
    baseWarp,
  );

  let detailFbm = sharedFbm3(coordinate * 2.0, seed ^ 0xd3a2646cu);
  let detailCell = sharedWorley3(coordinate * 16.0, 16, seed ^ 0xfd7046c5u);
  let detail = vec4f(
    detailFbm,
    clamp(detailCell.x * 0.85, 0.0, 1.0),
    clamp((detailCell.y - detailCell.x) * 1.75, 0.0, 1.0),
    sharedValue3(coordinate * 32.0, 32, seed ^ 0xb55a4f09u),
  );
  textureStore(densityBaseAtlasOut, vec3i(gid), clamp(base, vec4f(0.0), vec4f(1.0)));
  textureStore(densityDetailAtlasOut, vec3i(gid), clamp(detail, vec4f(0.0), vec4f(1.0)));
}
