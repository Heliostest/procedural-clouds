fn evalAltocumulus(compatibilityDensity : f32, pos : vec3f, bodyIndex : i32) -> f32 {
  let body = params.bodies[bodyIndex];
  let morphology = presetMorphology(i32(round(body.geom.z)));
  let strength = clamp01(morphology.tileScale);
  if (strength <= 0.0001 || compatibilityDensity <= 0.0) {
    return compatibilityDensity;
  }

  let ctx = prepareGenusEvalContext(pos, bodyIndex);
  let scale = max(ctx.shape.scale, 0.25);
  // Mid-high tile frequency for mackerel-sky cloudlets.
  let freq = mix(1.15, 2.05, strength);
  let tileCoord = vec3f(
    ctx.objectPosRaw.x * freq,
    ctx.objectPosRaw.y * (freq * 0.35),
    ctx.objectPosRaw.z * freq,
  ) / scale;
  let cell = worley_f1_3d(tileCoord);
  let cloudlet = 1.0 - smoothstep(0.18, 0.62, cell);
  let gaps = smoothstep(0.08, 0.42, cell);
  let tileMask = clamp01(cloudlet * mix(0.55, 1.0, 1.0 - gaps * 0.65));
  let tiled = compatibilityDensity * mix(0.18, 1.55, tileMask);
  return max(mix(compatibilityDensity, tiled, strength), 0.0);
}
