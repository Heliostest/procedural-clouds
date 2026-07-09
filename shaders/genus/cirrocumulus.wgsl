fn evalCirrocumulus(compatibilityDensity : f32, pos : vec3f, bodyIndex : i32) -> f32 {
  let body = params.bodies[bodyIndex];
  let morphology = presetMorphology(i32(round(body.geom.z)));
  let strength = clamp01(morphology.tileScale);
  if (strength <= 0.0001 || compatibilityDensity <= 0.0) {
    return compatibilityDensity;
  }

  let ctx = prepareGenusEvalContext(pos, bodyIndex);
  let scale = max(ctx.shape.scale, 0.25);
  // Higher frequency than altocumulus for fine fish-scale / grain pattern.
  let freq = mix(1.85, 3.35, strength);
  let tileCoord = vec3f(
    ctx.objectPosRaw.x * freq,
    ctx.objectPosRaw.y * (freq * 0.28),
    ctx.objectPosRaw.z * freq,
  ) / scale;
  let cell = worley_f1_3d(tileCoord);
  let grain = 1.0 - smoothstep(0.12, 0.48, cell);
  let ripple = 0.5 + 0.5 * sin(tileCoord.x * 3.1 + tileCoord.z * 2.7 + cell * 4.0);
  let tileMask = clamp01(grain * mix(0.7, 1.0, ripple));
  let tiled = compatibilityDensity * mix(0.12, 1.7, tileMask);
  return max(mix(compatibilityDensity, tiled, strength), 0.0);
}
