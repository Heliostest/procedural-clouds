fn evalCirrus(compatibilityDensity : f32, pos : vec3f, bodyIndex : i32) -> f32 {
  let body = params.bodies[bodyIndex];
  let morphology = presetMorphology(i32(round(body.geom.z)));
  let strength = clamp01(morphology.cirrusFiberStrength);
  if (strength <= 0.0001 || compatibilityDensity <= 0.0) {
    return compatibilityDensity;
  }

  let ctx = prepareGenusEvalContext(pos, bodyIndex);
  let scale = max(ctx.shape.scale, 0.25);
  let curlAmount = clamp01(morphology.cirrusFiberCurl);
  let curl = curl_noise_3d(
    vec3f(ctx.objectPosRaw.x * 0.22, ctx.objectPosRaw.y * 0.75, ctx.objectPosRaw.z * 0.75) / scale,
    ctx.morphTime * 0.035,
  );
  let warped = ctx.objectPosRaw + vec3f(0.0, curl.x, curl.z) * (0.48 * scale * curlAmount);

  // Local X is the long axis. Higher transverse frequencies turn the shared
  // volume into coherent wisps while body rotation controls their direction.
  let fiberCoord = vec3f(warped.x * 0.22, warped.y * 4.2, warped.z * 3.6) / scale;
  let phase = ctx.morphTime * 0.035;
  let carrier = sin(fiberCoord.y + sin(fiberCoord.x * 0.55 + phase))
    * cos(fiberCoord.z * 1.13 - cos(fiberCoord.x * 0.31 - phase));
  let branch = sin((fiberCoord.y + fiberCoord.z) * 1.73
    + sin(fiberCoord.x * 0.41 + phase * 0.7));
  let fiberNoise = mix(carrier, branch, 0.28);
  let ridge = clamp01(1.0 - abs(fiberNoise));
  let broadStrands = smoothstep(0.38, 0.88, ridge);
  let fineStrands = 0.5 + 0.5 * sin((warped.y * 6.5 + warped.z * 2.7) / scale + fiberNoise * 2.2);
  let fiberMask = clamp01(broadStrands * mix(0.72, 1.0, fineStrands));

  // Multiplicative reshaping cannot escape the compatibility footprint or
  // vertical envelope. Boosted ridges remain bounded by the final clamp.
  let fiberDensity = compatibilityDensity * mix(0.22, 1.65, fiberMask);
  return max(mix(compatibilityDensity, fiberDensity, strength), 0.0);
}
