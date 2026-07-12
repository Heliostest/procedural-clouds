// W5 publishes this bounded sampling ABI for W6+. The W5 density cache entry does not include it.
fn densitySharedPeriodicOffset(seed : u32) -> vec3f {
  let x = f32((seed * 1664525u + 1013904223u) & 65535u) / 65536.0;
  let y = f32((seed * 22695477u + 1u) & 65535u) / 65536.0;
  let z = f32((seed * 1103515245u + 12345u) & 65535u) / 65536.0;
  return vec3f(x, y, z);
}

fn densitySharedAdvectedCoordinate(
  localCoordinate : vec3f,
  scale : vec3f,
  accumulatedWind : vec2f,
  frequency : f32,
  seed : u32,
  warpStrength : f32,
) -> vec3f {
  var coordinate = localCoordinate * scale + densitySharedPeriodicOffset(seed);
  coordinate.xz += accumulatedWind * frequency;
  // Exactly one analytic low-frequency warp. No fourth noise dimension is evaluated.
  let warp = sin((coordinate.x + coordinate.z) * 6.28318530718) * clamp(warpStrength, 0.0, 0.25);
  coordinate += vec3f(warp, warp * 0.5, -warp);
  return coordinate;
}

fn densitySharedSampleBase(coordinate : vec3f) -> vec4f {
  return textureSampleLevel(densityBaseAtlas, densitySharedSampler, coordinate, 0.0);
}

fn densitySharedSampleDetail(coordinate : vec3f) -> vec4f {
  return textureSampleLevel(densityDetailAtlas, densitySharedSampler, coordinate, 0.0);
}

fn densitySharedSampleMacro(coordinate : vec2f) -> vec4f {
  return textureSampleLevel(densityMacroField, densitySharedSampler, coordinate, 0.0);
}
