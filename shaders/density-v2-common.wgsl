struct DensityV2Context {
  local : vec3f,
  normalized : vec3f,
  height01 : f32,
  radius01 : f32,
  feather01 : f32,
  bodyIndex : u32,
};

struct DensityV2Evaluation {
  density : f32,
  genusId : u32,
};

fn densityV2InverseQuaternionRotate(value : vec3f, rotation : vec4f) -> vec3f {
  let q = vec4f(-rotation.xyz, rotation.w);
  let t = 2.0 * cross(q.xyz, value);
  return value + q.w * t + cross(q.xyz, t);
}

fn densityV2WorldPosition(gid : vec3u, resolution : u32) -> vec3f {
  let uvw = (vec3f(gid) + vec3f(0.5)) / f32(resolution);
  return densityFrame.volumeMin.xyz + uvw * densityFrame.volumeExtent.xyz;
}

fn densityV2BuildContext(worldPosition : vec3f, body : DensityBodyGPU, bodyIndex : u32) -> DensityV2Context {
  let center = vec3f(
    (body.boundsXZ.x + body.boundsXZ.z) * 0.5,
    (body.heightDensity.x + body.heightDensity.y) * 0.5,
    (body.boundsXZ.y + body.boundsXZ.w) * 0.5,
  );
  let transported = worldPosition - vec3f(body.transport.x, 0.0, body.transport.y);
  let local = densityV2InverseQuaternionRotate(transported - center, body.rotation);
  let halfExtent = max(body.localScaleAndFeather.xyz, vec3f(1e-5));
  let normalized = local / halfExtent;
  let height01 = normalized.y * 0.5 + 0.5;
  let feather01 = body.localScaleAndFeather.w / max(min(halfExtent.x, halfExtent.z), 1e-5);
  return DensityV2Context(local, normalized, height01, length(normalized.xz), feather01, bodyIndex);
}

fn densityV2RoundedSheetFade(normalizedXZ : vec2f, feather01 : f32) -> f32 {
  let outside = length(max(abs(normalizedXZ) - vec2f(1.0), vec2f(0.0)));
  return 1.0 - smoothstep(0.0, max(feather01, 1e-4), outside);
}

fn densityV2EllipseFade(radius01 : f32, feather01 : f32) -> f32 {
  return 1.0 - smoothstep(1.0, 1.0 + max(feather01, 1e-4), radius01);
}

fn densityV2ThinSheetProfile(height01 : f32, bottomFade : f32, topFade : f32, topVariation : f32) -> f32 {
  let top = clamp(1.0 + topVariation, 0.72, 1.0);
  return smoothstep(0.0, max(bottomFade, 1e-4), height01)
    * (1.0 - smoothstep(max(0.0, top - topFade), top, height01));
}

fn densityV2SoftLayerProfile(height01 : f32, bottomFade : f32, topFade : f32, topVariation : f32) -> f32 {
  if (height01 <= 0.0 || height01 >= 1.0) {
    return 0.0;
  }
  let top = clamp(1.0 + topVariation, 0.72, 1.0);
  if (height01 >= top) {
    return 0.0;
  }
  return smoothstep(0.0, max(bottomFade, 1e-4), height01)
    * (1.0 - smoothstep(max(0.0, top - topFade), top, height01));
}

fn densityV2DomeTop(radius01 : f32, falloff : f32, exponent : f32) -> f32 {
  return max(0.08, 1.0 - clamp(falloff, 0.0, 1.0) * pow(clamp(radius01, 0.0, 1.0), max(exponent, 1e-4)));
}

fn densityV2FlatBaseDomeProfile(
  height01 : f32,
  radius01 : f32,
  bottomFade : f32,
  topFade : f32,
  falloff : f32,
  exponent : f32,
) -> f32 {
  if (height01 <= 0.0) {
    return 0.0;
  }
  let top = densityV2DomeTop(radius01, falloff, exponent);
  if (height01 >= top) {
    return 0.0;
  }
  return smoothstep(0.0, max(bottomFade, 1e-4), height01)
    * (1.0 - smoothstep(max(0.0, top - topFade), top, height01));
}

fn densityV2SamplingCoordinate(ctx : DensityV2Context, body : DensityBodyGPU, recipe : DensityRecipeGPU, frequency : f32, seedDelta : u32) -> vec3f {
  let seed = ctx.bodyIndex * 37u + body.ids.x * 131u + seedDelta;
  var coordinate = ctx.normalized * vec3f(recipe.domain1.z, recipe.domain1.w, recipe.domain1.z) * frequency;
  coordinate += densitySharedPeriodicOffset(seed);
  let transport = body.transport.xy * recipe.domain1.x;
  coordinate += vec3f(transport.x, 0.0, transport.y);
  return coordinate;
}

fn densityV2MacroCoordinate(ctx : DensityV2Context, body : DensityBodyGPU, recipe : DensityRecipeGPU) -> vec2f {
  let offset = densitySharedPeriodicOffset(ctx.bodyIndex * 59u + body.ids.x * 173u).xz;
  return ctx.normalized.xz * recipe.domain0.x * 0.5 + offset + body.transport.xy * recipe.domain1.x;
}

fn densityV2CoverageGate(field : f32, bodyCoverage : f32, recipe : DensityRecipeGPU) -> f32 {
  let coverageSignal = field
    + (clamp(bodyCoverage, 0.0, 1.5) - 0.5) * recipe.topology0.z
    + recipe.topology2.z;
  let softness = max(recipe.topology0.y, 1e-4);
  return smoothstep(recipe.topology0.x - softness, recipe.topology0.x + softness, coverageSignal);
}

fn densityV2Finalize(rawDensity : f32, body : DensityBodyGPU, recipe : DensityRecipeGPU) -> f32 {
  let scaled = max(rawDensity, 0.0)
    * max(body.heightDensity.z, 0.0)
    * max(body.coverageLifecycle.y, 0.0)
    * max(body.coverageLifecycle.w, 0.0)
    * max(recipe.finalize0.x, 0.0);
  return clamp(scaled, 0.0, max(recipe.finalize0.z, 0.0));
}
