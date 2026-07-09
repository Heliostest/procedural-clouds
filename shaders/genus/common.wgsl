// Shared inputs and compatibility primitives for per-genus density evaluators.
// New genus-specific morphology belongs in the selected eval<Genus>() function,
// not in evalCompatibilityGenus().

struct GenusEvalContext {
  body         : BodyGPU,
  shape        : Shape12,
  morphology   : Morphology,
  rotatedPos   : vec3f,
  objectPosRaw : vec3f,
  objectPos    : vec3f,
  bodyLocalY   : f32,
  profileLocal : f32,
  bodyIndex    : i32,
  morphTime    : f32,
};

fn prepareGenusEvalContext(pos : vec3f, bodyIndex : i32) -> GenusEvalContext {
  let body = params.bodies[bodyIndex];
  let transportedPos = vec3f(pos.x - body.wind.x, pos.y, pos.z - body.wind.y);
  let rotatedPos = bodyRotatedPos(transportedPos, body);
  // Blender "Object" coordinates are Z-up. World Y maps to Blender Z.
  let objectPosRaw = vec3f(rotatedPos.x, rotatedPos.z, rotatedPos.y);
  let shape = presetShape(i32(round(body.geom.z)));
  let morphology = presetMorphology(i32(round(body.geom.z)));
  let bmin = boxMin();
  let bmaxY = getBoxMax().y;
  let altBase = clamp(body.geom.x, bmin.y, bmaxY - 0.02);
  let altTop = clamp(max(body.geom.y, altBase + 0.02), altBase + 0.02, bmaxY);
  let bodyLocalY = (rotatedPos.y - altBase) / max(altTop - altBase, 0.001);
  let profileBase = clamp(shape.altBase, 0.0, 0.99);
  let profileTop = clamp(max(shape.altTop, profileBase + 0.01), profileBase + 0.01, 1.0);
  let profileLocal = (bodyLocalY - profileBase) / max(profileTop - profileBase, 0.001);
  return GenusEvalContext(
    body,
    shape,
    morphology,
    rotatedPos,
    objectPosRaw,
    objectPosRaw,
    bodyLocalY,
    profileLocal,
    bodyIndex,
    body.wind.z,
  );
}

// Mechanical migration bridge for the pre-refactor five-stage Blender-matched
// density chain. It preserves the baseline while each genus gains an isolated
// orchestration entry point. Do not add new genus-specific behavior here.
fn evalCompatibilityGenus(ctx : GenusEvalContext) -> f32 {
  let body = ctx.body;
  let shape = ctx.shape;
  let morphology = ctx.morphology;
  let objectPosRaw = ctx.objectPosRaw;
  let objectPos = ctx.objectPos;
  let bodyLocalY = ctx.bodyLocalY;
  let profileLocal = ctx.profileLocal;
  let bodyIndex = ctx.bodyIndex;
  let timeNoise = ctx.morphTime;
  let timeVoronoi1 = ctx.morphTime;
  let timeVoronoi2 = ctx.morphTime;

  let lowAltDens = 0.2;
  let factorDetail = 1.0;
  let factorShaper = 1.0;

  // Genus morphology widens only the upper footprint. Edge-style controls are
  // deliberately absent here so disabling edge rendering cannot remove anvils.
  let anvilBand = smoothstep(0.68, 0.90, bodyLocalY) * (1.0 - smoothstep(0.98, 1.02, bodyLocalY));
  let anvilScale = 1.0 + 0.28 * clamp01(morphology.anvilStrength) * anvilBand;
  let footprintCenter = body.footprint.xy;
  let footprintPos = footprintCenter + (objectPosRaw.xy - footprintCenter) / anvilScale;

  // Normalized horizontal silhouette from this body's shape layer.
  let bmin = boxMin();
  let spanXZ = max(boxMaxXZ() - bmin.x, 0.001);
  let wUv = (footprintPos - vec2f(bmin.x, bmin.z)) / spanXZ;
  let alpha = textureSampleLevel(weatherTex, weatherSampler, wUv, bodyIndex, 0.0).r;
  if (alpha < 0.005) { return 0.0; }
  let wCurve = max(params.g.edgeCurveWidth, 0.01);
  let cov = pow(smoothstep(0.5 - wCurve, 0.5, alpha), max(params.g.edgeCurveShaper, 0.01));
  let localCoverage = clamp01(cov * body.intensity.x);
  if (localCoverage < 0.01) { return 0.0; }
  let wDensityScale = body.intensity.y;
  if (wDensityScale < 0.001) { return 0.0; }
  let wMorph = body.intensity.z;
  let edgeSoft = smoothstep(0.35, 0.65, alpha);
  let densityParam = shape.density;
  let altitude = shape.altitude;
  var factorMacro = localCoverage;
  let scaleAlt = shape.scale;
  let scaleNoise = shape.scale;
  let scaleVoronoi1 = shape.scale;
  let scaleVoronoi2 = shape.scale;
  let detail = shape.detail;
  let coverageThreshold = shape.coverageThreshold;
  let edgeSharpness = shape.edgeSharpness * edgeSoft;
  let baseRoundness = morphology.baseRoundness;
  let detailBoost = max(wMorph, 0.0);
  let erosion = max(-wMorph, 0.0);
  let weatherMorph = params.g.weatherMorph;
  let worleyBlend = clamp01(shape.worleyBlend + weatherMorph * erosion);
  let detailStrength = shape.detailStrength * (1.0 + weatherMorph * detailBoost);
  // Per-body vertical band: clouds float within [base, altTop].
  let Z = 1.0 - clamp(profileLocal, 0.0, 1.0);
  let h = clamp(profileLocal, 0.0, 1.0);

  // Sky Ocean Sun–style height–weather shaping (densityShapeModel=1).
  // Large scale via XZ fbm (footprint weather is single-blob SDF, not dual-scale tex).
  if (params.g.densityShapeModel > 0.5) {
    let largeFbm = noise_fbm(vec4f(footprintPos.x * 0.05, footprintPos.y * 0.05, 0.0, timeNoise * 0.15), 2.0, 0.5, 2.0, true);
    let largeWeather = clamp((largeFbm - 0.18) * 5.0, 0.0, 2.0);
    var weather = largeWeather * localCoverage;
    weather *= smoothstep(0.0, 0.5, h) * smoothstep(1.0, 0.5, h);
    let cloudShape = pow(max(weather, 0.0), 0.3 + 1.5 * smoothstep(0.2, 0.5, h));
    if (cloudShape <= 1e-4) { return 0.0; }
    let fbmCoarse = noise_fbm(vec4f(objectPos * 0.01, timeNoise), 3.0, 0.5, 2.02, true);
    var den = cloudShape - 0.7 * fbmCoarse;
    if (den <= 0.0) { return 0.0; }
    let fbmFine = noise_fbm(vec4f(objectPos * 0.05, timeNoise + 17.3), 3.0, 0.5, 2.03, true);
    den = den - 0.2 * fbmFine;
    if (den <= 0.0) { return 0.0; }
    factorMacro = clamp01(min(1.0, 5.0 * den) * largeWeather * 0.2);
    if (factorMacro < 0.01) { return 0.0; }
  }

  // --- STAGE 1: Altitude Mask ---
  let altFromMax = altitude / 5.0;
  let altToMin = 1.0 - lowAltDens;
  let altMaskRamp = mapRange(Z, 0.0, altFromMax, altToMin, 1.0);
  let noiseCoord = objectPos / scaleNoise;
  let stage1Noise = node_noise_texture_4d_value(
    noiseCoord, timeNoise, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0);
  let altitudeMask = clamp01(altMaskRamp * stage1Noise);

  // --- STAGE 2: Macro Voronoi ---
  let v1Coord = objectPos / scaleVoronoi1;
  let v1dist = node_tex_voronoi_f1_4d_distance(v1Coord, timeVoronoi1, 5.0, detail, 0.5, 3.0, 1.0, 0.5, 1.0, 0.0, 1.0);
  let v1mapped = mapRange(v1dist, 0.0, 0.75, factorMacro * -0.4, factorMacro);
  let v1scaled = clamp01(v1mapped * 0.5);
  let stage2 = sharpen(clamp01(altitudeMask + v1scaled), edgeSharpness);

  // --- STAGE 3: Medium Voronoi Detail ---
  let v2Coord = objectPos / scaleVoronoi2;
  let v2dist = node_tex_voronoi_f1_4d_distance(v2Coord, timeVoronoi2, 2.0, detail * 5.0, 0.75, 2.5, 1.0, 0.5, 1.0, 0.0, 1.0);
  let v2mapped = mapRange(v2dist, 0.0, 1.0, factorDetail * -0.25, factorDetail);
  let stage3v = clamp01(stage2 + v2mapped * detailStrength);

  let fbmVal = noise_fbm(vec4f(objectPos / scaleVoronoi1, timeVoronoi1), 4.0, 0.5, 2.0, true);
  let puffAdd = clamp01((fbmVal * 0.5 + 0.5) * factorMacro);
  let stage3p = clamp01(altitudeMask + puffAdd);
  let stage3 = sharpen(mix(stage3p, stage3v, clamp01(worleyBlend)), edgeSharpness);

  // --- STAGE 4: Upper Altitude Cutoff ---
  let cutoffFromMin = altitude * scaleAlt;
  let cutoff = mapRange(Z, cutoffFromMin, 0.0, 0.0, 1.0);
  let shaped = clamp01(stage3 - cutoff);

  let vT = abs(profileLocal - 0.5) * 2.0;
  let vEnvelope = pow(vT, max(params.g.verticalEdgeShape, 0.01)) * params.g.verticalEdgeRange;
  let legacyShaped = clamp01(shaped - (1.0 - factorShaper) - coverageThreshold - vEnvelope);
  let topMask = 1.0 - smoothstep(0.975, 1.015, profileLocal);
  let bottomWidth = mix(0.035, 0.22, clamp01(baseRoundness));
  let bottomMask = smoothstep(-0.01, bottomWidth, profileLocal);
  let hardShaped = clamp01(shaped - (1.0 - factorShaper) - coverageThreshold) * topMask * bottomMask;
  let topCutoffSharpness = clamp01(morphology.topCutoffSharpness);
  let finalShaped = mix(legacyShaped, hardShaped, topCutoffSharpness);

  // --- STAGE 5: Final Multipliers ---
  let falloffRaw = mapRange(Z, 0.0, altitude, 0.0, 1.0);
  let legacyFalloff = pow(clamp01(falloffRaw), mix(1.0, 2.5, clamp01(baseRoundness)));
  let falloff = mix(legacyFalloff, 1.0, topCutoffSharpness);
  let densityScale = densityParam * 5.0;
  let edgeFade = smoothstep(0.0, 0.25, localCoverage);
  return finalShaped * falloff * densityScale * wDensityScale * edgeFade;
}
