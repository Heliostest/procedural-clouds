fn evalCumulonimbus(compatibilityDensity : f32, pos : vec3f, bodyIndex : i32) -> f32 {
  let body = params.bodies[bodyIndex];
  let morphology = presetMorphology(i32(round(body.geom.z)));
  let strength = clamp01(morphology.convectiveTowerStrength);
  if (strength <= 0.0001 || compatibilityDensity <= 0.0) {
    return compatibilityDensity;
  }

  let ctx = prepareGenusEvalContext(pos, bodyIndex);
  let profileLocal = clamp01(ctx.profileLocal);
  let upperGate = smoothstep(0.26, 0.52, profileLocal)
    * (1.0 - smoothstep(0.94, 1.01, profileLocal));
  if (upperGate <= 0.0001) {
    return compatibilityDensity;
  }

  let scale = max(ctx.shape.scale, 0.25);
  let cellFrequency = mix(2.4, 6.8, clamp01(morphology.convectiveCellScale));
  // Compress the vertical coordinate so analytic cells stretch into buoyant
  // columns. Trigonometric carriers avoid integer-hash Worley cost in the
  // cache and ground-shadow density paths.
  let cellCoord = vec3f(
    ctx.objectPosRaw.x,
    ctx.objectPosRaw.y,
    ctx.objectPosRaw.z * 0.28,
  ) * (cellFrequency / scale);
  let phase = vec3f(ctx.morphTime * 0.012, -ctx.morphTime * 0.009, 0.0);
  let macroCell = 0.5 + 0.5
    * sin(cellCoord.x + phase.x + sin(cellCoord.z * 1.3))
    * cos(cellCoord.y * 0.93 + phase.y - cos(cellCoord.z));
  let detailCell = 0.5 + 0.5
    * sin((cellCoord.x + cellCoord.y) * 1.72 - phase.x * 0.7)
    * cos((cellCoord.y - cellCoord.x) * 1.31 + cellCoord.z * 1.8);
  let cauliflower = smoothstep(0.30, 0.78, mix(macroCell, detailCell, 0.32));

  let towerDensity = compatibilityDensity
    * mix(0.12, 2.05, cauliflower)
    * mix(0.92, 1.12, upperGate);
  // Keep a weaker scaffold so cell valleys can carve the smooth compatibility
  // dome while the soft union grows bright cauliflower lobes above it.
  let scaffoldDensity = compatibilityDensity * 0.58;
  let smoothing = max(compatibilityDensity * 0.08, 0.006);
  let unionBlend = clamp01(0.5 + 0.5 * (scaffoldDensity - towerDensity) / smoothing);
  let softUnion = mix(towerDensity, scaffoldDensity, unionBlend)
    + smoothing * unionBlend * (1.0 - unionBlend);
  let towerShaped = mix(compatibilityDensity, softUnion, upperGate);
  return max(mix(compatibilityDensity, towerShaped, strength), 0.0);
}
