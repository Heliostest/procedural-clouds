// ============================================================
// Uniforms
// ============================================================

struct Camera {
  invViewProj : mat4x4f,
  position    : vec3f,
  _pad        : f32,
};

struct Globals {
  rayMarchSteps   : f32,
  lightMarchSteps : f32,
  shadowDarkness  : f32,
  sunIntensity    : f32,
  skipLight       : f32,
  cacheBlend      : f32,
  activeBodyCount : f32,
  cloudHeight     : f32,
  sceneTime       : f32,
  deltaTime       : f32,
  weatherMorph    : f32,
  sunAzimuth      : f32,
  sunElevation    : f32,
  silverIntensity : f32,
  powderStrength  : f32,
  hgForward       : f32,
  hgBackward      : f32,
  hgBlend         : f32,
  godrayStrength  : f32,
  qualityMode     : f32,
  detailFreq      : f32,
  detailStrength  : f32,
  typeLightingBlend : f32,
  boxHalfExtent   : f32,
  lightMarchStepSize : f32,
  verticalEdgeRange : f32,
  verticalEdgeShape : f32,
  edgeHardness    : f32,
  edgeHardnessThreshold : f32,
  cacheWorkgroupX : f32,
  cacheWorkgroupY : f32,
  cacheWorkgroupZ : f32,
  fxAbsorption    : f32,
  debugView       : f32,
  _pad1           : f32,
  _pad2           : f32,
};

struct BodyGPU {
  geom : vec4f, // x=base, y=altTop, z=typeIdx, w=enabled
  wind : vec4f, // x=dirX, y=dirY, z=speed, w=morphRate
  intensity : vec4f, // x=coverage, y=densityScale, z=morph, w=feather
  footprint : vec4f, // x=centerX, y=centerZ, z=radius, w=shapeId
  rot : vec4f, // x=rotX, y=rotY, z=rotZ (radians), w=unused
};

const MAX_BODIES = 12;

struct Params {
  g      : Globals,
  bodies : array<BodyGPU, MAX_BODIES>,
};

struct PresetShape {
  p0 : vec4f,
  p1 : vec4f,
  p2 : vec4f,
  p3 : vec4f,
  p4 : vec4f,
};

const PRESET_COUNT = 10;
const DENSITY_SCALE_MAX = 2.0;
const RAYMARCH_MAX_STEPS = 256u;

override wg_x : u32 = 8u;
override wg_y : u32 = 8u;
override wg_z : u32 = 4u;

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> params : Params;
@group(0) @binding(2) var weatherTex : texture_2d_array<f32>;
@group(0) @binding(3) var weatherSampler : sampler;
@group(0) @binding(4) var<uniform> presets : array<PresetShape, PRESET_COUNT>;
@group(1) @binding(0) var densitySampler : sampler;
@group(1) @binding(1) var densityTex0 : texture_3d<f32>;
@group(1) @binding(2) var densityTex1 : texture_3d<f32>;
@group(2) @binding(0) var densityStore : texture_storage_3d<rgba16float, write>;

struct Shape13 {
  density           : f32,
  coverage          : f32,
  altitude          : f32,
  scale             : f32,
  detail            : f32,
  cloudHeight       : f32,
  coverageThreshold : f32,
  edgeSharpness     : f32,
  baseRoundness     : f32,
  worleyBlend       : f32,
  detailStrength    : f32,
  altBase           : f32,
  altTop            : f32,
};

fn presetShape(i : i32) -> Shape13 {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return Shape13(p.p0.x, p.p0.y, p.p0.z, p.p0.w, p.p1.x, p.p1.y, p.p1.z, p.p1.w, p.p2.x, p.p2.y, p.p2.z, p.p2.w, p.p3.x);
}

struct Lighting {
  absorption : f32,
  phaseFwd   : f32,
  phaseBack  : f32,
  silver     : f32,
  baseDark   : f32,
  sss        : f32,
};

fn presetLighting(i : i32) -> Lighting {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return Lighting(p.p3.y, p.p3.z, p.p3.w, p.p4.x, p.p4.y, p.p4.z);
}

fn mixLighting(a : Lighting, b : Lighting, t : f32) -> Lighting {
  return Lighting(
    mix(a.absorption, b.absorption, t),
    mix(a.phaseFwd, b.phaseFwd, t),
    mix(a.phaseBack, b.phaseBack, t),
    mix(a.silver, b.silver, t),
    mix(a.baseDark, b.baseDark, t),
    mix(a.sss, b.sss, t),
  );
}

// Density-weighted blend of the two dominant genera at a point (idx, idx2, w2).
fn blendedLighting(idx : f32, idx2 : f32, w2 : f32) -> Lighting {
  return mixLighting(presetLighting(i32(idx)), presetLighting(i32(idx2)), clamp(w2, 0.0, 0.5));
}

fn mixShape(a : Shape13, b : Shape13, t : f32) -> Shape13 {
  return Shape13(
    mix(a.density, b.density, t),
    mix(a.coverage, b.coverage, t),
    mix(a.altitude, b.altitude, t),
    mix(a.scale, b.scale, t),
    mix(a.detail, b.detail, t),
    mix(a.cloudHeight, b.cloudHeight, t),
    mix(a.coverageThreshold, b.coverageThreshold, t),
    mix(a.edgeSharpness, b.edgeSharpness, t),
    mix(a.baseRoundness, b.baseRoundness, t),
    mix(a.worleyBlend, b.worleyBlend, t),
    mix(a.detailStrength, b.detailStrength, t),
    mix(a.altBase, b.altBase, t),
    mix(a.altTop, b.altTop, t),
  );
}

// ============================================================
// Vertex
// ============================================================

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0)       uv  : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  let pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VSOut;
  out.pos = vec4f(pos[vi], 0.0, 1.0);
  out.uv  = pos[vi];
  return out;
}

// ============================================================
// Helpers
// ============================================================

fn mapRange(value : f32, fromMin : f32, fromMax : f32, toMin : f32, toMax : f32) -> f32 {
  if (abs(fromMax - fromMin) < 1e-5) { return toMin; }
  let t = (value - fromMin) / (fromMax - fromMin);
  return clamp(mix(toMin, toMax, t), min(toMin, toMax), max(toMin, toMax));
}

fn clamp01(v: f32) -> f32 {
  return clamp(v, 0.0, 1.0);
}

fn sharpen(x: f32, amount: f32) -> f32 {
  let a = clamp01(amount);
  let k = mix(1.0, 6.0, a);
  let xc = clamp01(x);
  let p = pow(xc, k);
  let q = pow(1.0 - xc, k);
  let y = p / (p + q + 1e-5);
  return mix(xc, y, a);
}

fn sampleDensityTyped(pos: vec3f) -> vec4f {
  let bmin = boxMin();
  let bmax = getBoxMax();
  let uvw = (pos - bmin) / (bmax - bmin);
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec4f(0.0);
  }
  let sa = textureSampleLevel(densityTex0, densitySampler, uvw, 0.0);
  let sb = textureSampleLevel(densityTex1, densitySampler, uvw, 0.0);
  let blend = clamp(params.g.cacheBlend, 0.0, 1.0);
  let density = mix(sa.r, sb.r, blend);
  // Genus indices: nearest-texel fetch (textureLoad) instead of trilinear+round.
  // Trilinear filtering blends indices across genus boundaries (e.g. cirrus 7 and
  // empty 0 average to unrelated genera like 3), and rounding those fractional
  // indices produces voxel-aligned shells of wrong absorption on cloud edges.
  let dims = vec3f(textureDimensions(densityTex0, 0));
  let coord = vec3i(clamp(floor(uvw * dims), vec3f(0.0), dims - 1.0));
  let la = textureLoad(densityTex0, coord, 0);
  let lb = textureLoad(densityTex1, coord, 0);
  // Take genus from the denser of the two cached samples (avoids fractional
  // indices from time interpolation). The blend weight (a) stays smooth so
  // overlap lighting transitions remain seamless.
  let useB = lb.r > la.r;
  let idx = round(select(la.g, lb.g, useB));
  let idx2 = round(select(la.b, lb.b, useB));
  let w2 = mix(sa.a, sb.a, blend);
  return vec4f(density, idx, idx2, w2);
}

fn sampleDensity(pos: vec3f) -> f32 {
  return sampleDensityTyped(pos).x;
}

// ------------------------------------------------------------
// Cloud Density (100% Blender Node Graph Match)
// ------------------------------------------------------------

struct DensityType {
  d    : f32,
  idx  : f32,
  idx2 : f32,
  w2   : f32,
};

fn cloudDensityTyped(pos : vec3f) -> DensityType {
  // Blender "Object" coordinates for a cloud body (Z-up). World Y is Blender Z.
  let objPosRaw = vec3f(pos.x, pos.z, pos.y);
  var total = 0.0;
  var bestD = 0.0;
  var bestIdx = 0.0;
  var secondD = 0.0;
  var secondIdx = 0.0;
  for (var i = 0; i < MAX_BODIES; i++) {
    if (params.bodies[i].geom.w < 0.5) { continue; }
    let dd = evalBody(pos, objPosRaw, i);
    total += dd;
    let gi = round(params.bodies[i].geom.z);
    if (dd > bestD) {
      secondD = bestD;
      secondIdx = bestIdx;
      bestD = dd;
      bestIdx = gi;
    } else if (dd > secondD) {
      secondD = dd;
      secondIdx = gi;
    }
  }
  // Overlap density: keep the dominant contribution exact, soft-saturate only
  // the extra mass added by other bodies so overlaps thicken naturally instead
  // of summing into an over-dense dark lump. Single clouds are unchanged.
  let rest = max(total - bestD, 0.0);
  let restCap = max(bestD, 0.25);
  let dSoft = bestD + restCap * (1.0 - exp(-rest / restCap));
  // Lighting blend weight of the second genus (0 = single, 0.5 = equal mix).
  let w2 = secondD / max(bestD + secondD, 1e-4);
  return DensityType(dSoft, bestIdx, secondIdx, w2);
}

fn cloudDensity(pos : vec3f) -> f32 {
  return cloudDensityTyped(pos).d;
}

fn bodyRotatedPos(pos : vec3f, b : BodyGPU) -> vec3f {
  let e = b.rot.xyz;
  if (abs(e.x) + abs(e.y) + abs(e.z) < 1e-5) { return pos; }
  let bmin = boxMin();
  let bmaxY = getBoxMax().y;
  let yMid = mix(bmin.y, bmaxY, clamp01((clamp01(b.geom.x) + clamp01(b.geom.y)) * 0.5));
  let c = vec3f(b.footprint.x, yMid, b.footprint.y);
  var v = pos - c;
  // Inverse rotation (sample the unrotated body), order Rx^-1 then Ry^-1 then Rz^-1.
  let cx2 = cos(-e.x); let sx2 = sin(-e.x);
  v = vec3f(v.x, v.y * cx2 - v.z * sx2, v.y * sx2 + v.z * cx2);
  let cy2 = cos(-e.y); let sy2 = sin(-e.y);
  v = vec3f(v.x * cy2 + v.z * sy2, v.y, -v.x * sy2 + v.z * cy2);
  let cz2 = cos(-e.z); let sz2 = sin(-e.z);
  v = vec3f(v.x * cz2 - v.y * sz2, v.x * sz2 + v.y * cz2, v.z);
  return c + v;
}

fn evalBodySolid(posIn : vec3f, b : BodyGPU, shapeId : i32) -> f32 {
  let pos = bodyRotatedPos(posIn, b);
  let bmin = boxMin();
  let bmaxY = getBoxMax().y;
  let cx = b.footprint.x;
  let cz = b.footprint.y;
  let rad = max(b.footprint.z, 0.001);
  let yBase = mix(bmin.y, bmaxY, clamp01(b.geom.x));
  let yTop = mix(bmin.y, bmaxY, clamp01(b.geom.y));
  let yMid = (yBase + yTop) * 0.5;
  let yHalf = max((yTop - yBase) * 0.5, 0.001);
  let p = vec3f((pos.x - cx) / rad, (pos.y - yMid) / yHalf, (pos.z - cz) / rad);
  let s = shapeCoord(shapeId, p);
  // Surface softness reuses the body's Feather (in world units), normalized.
  let edge = clamp(max(b.intensity.w, 0.001) / rad, 0.01, 2.0);
  let level = clamp01(b.intensity.x) * max(b.intensity.y, 0.0) * 5.0;
  return clamp01((1.0 - s) / edge) * level;
}

fn evalBody(pos : vec3f, objPosRaw : vec3f, i : i32) -> f32 {
  let b = params.bodies[i];

  let shapeId = i32(round(b.footprint.w));
  if (shapeId >= 2) {
    return evalBodySolid(pos, b, shapeId);
  }

  let mt = params.g.sceneTime * b.wind.w;
  let timeNoise     = mt;
  let timeVoronoi1  = mt;
  let timeVoronoi2  = mt;

  let lowAltDens    = 0.2;
  let factorDetail  = 1.0;
  let factorShaper  = 1.0;

  // Per-body rotation: sample the unrotated body about its center.
  let rp = bodyRotatedPos(pos, b);
  let oRaw = vec3f(rp.x, rp.z, rp.y);

  // Per-body horizontal advection of the (infinite) procedural sampling domain.
  let advect = vec3f(b.wind.x, b.wind.y, 0.0) * (b.wind.z * params.g.sceneTime);
  let objPos = oRaw - advect;

  // Normalized horizontal silhouette from this body's shape layer.
  let bmin = boxMin();
  let spanXZ = max(boxMaxXZ() - bmin.x, 0.001);
  let wUv = (oRaw.xy - vec2f(bmin.x, bmin.z)) / spanXZ;
  let alpha = textureSampleLevel(weatherTex, weatherSampler, wUv, i, 0.0).r;
  if (alpha < 0.01) { return 0.0; }
  let localCoverage = clamp01(alpha * b.intensity.x);
  if (localCoverage < 0.01) { return 0.0; }
  let wDensityScale = b.intensity.y;
  if (wDensityScale < 0.001) { return 0.0; }
  let wMorph = b.intensity.z;
  let edgeSoft = smoothstep(0.05, 0.45, alpha);
  let shape = presetShape(i32(round(b.geom.z)));

  let densityParam  = shape.density;
  let altitude      = shape.altitude;
  let factorMacro   = localCoverage;
  let scaleAlt      = shape.scale;
  let scaleNoise    = shape.scale;
  let scaleVoronoi1 = shape.scale;
  let scaleVoronoi2 = shape.scale;
  let detail        = shape.detail;
  let coverageThreshold = shape.coverageThreshold;
  let edgeSharpness     = shape.edgeSharpness * edgeSoft;
  let baseRoundness     = shape.baseRoundness;
  let detailBoost       = max(wMorph, 0.0);
  let erosion           = max(-wMorph, 0.0);
  let weatherMorph      = params.g.weatherMorph;
  let worleyBlend       = clamp01(shape.worleyBlend + weatherMorph * erosion);
  let detailStrength    = shape.detailStrength * (1.0 + weatherMorph * detailBoost);
  // Per-body vertical band: clouds float within [base, altTop].
  let altBase           = clamp(b.geom.x, 0.0, 0.98);
  let altTop            = clamp(max(b.geom.y, altBase + 0.02), altBase + 0.02, 1.0);

  let zNorm = (rp.y - bmin.y) / max(getBoxMax().y - bmin.y, 0.001);
  let Z = 1.0 - clamp(zNorm, 0.0, 1.0);

  // --- STAGE 1: Altitude Mask ---
  // Map Range.010: Z from [0, Altitude/5] -> [1 - LowAlt, 1]
  let altFromMax = altitude / 5.0;
  let altToMin = 1.0 - lowAltDens;
  let altMaskRamp = mapRange(Z, 0.0, altFromMax, altToMin, 1.0);
  // Noise Texture: 4D, Scale 2.0, Detail 0.0 (FBM normalized)
  let noiseCoord = objPos / scaleNoise;
  let stage1Noise = node_noise_texture_4d_value(
    noiseCoord, timeNoise, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0);
  // Math.008: Multiply (clamped)
  let altitudeMask = clamp01(altMaskRamp * stage1Noise);

  // --- STAGE 2: Macro Voronoi ---
  let v1Coord = objPos / scaleVoronoi1;
  let v1dist = node_tex_voronoi_f1_4d_distance(v1Coord, timeVoronoi1, 5.0, detail, 0.5, 3.0, 1.0, 0.5, 1.0, 0.0, 1.0);
  let v1mapped = mapRange(v1dist, 0.0, 0.75, factorMacro * -0.4, factorMacro);
  let v1scaled = clamp01(v1mapped * 0.5); // Math.012
  let stage2 = sharpen(clamp01(altitudeMask + v1scaled), edgeSharpness); // Math.003

  // --- STAGE 3: Medium Voronoi Detail ---
  let v2Coord = objPos / scaleVoronoi2;
  let v2dist = node_tex_voronoi_f1_4d_distance(v2Coord, timeVoronoi2, 2.0, detail * 5.0, 0.75, 2.5, 1.0, 0.5, 1.0, 0.0, 1.0);
  let v2mapped = mapRange(v2dist, 0.0, 1.0, factorDetail * -0.25, factorDetail);
  let stage3v = clamp01(stage2 + v2mapped * detailStrength); // Math.004 (cellular path)

  // Puffy (Perlin FBM) path — blended via worleyBlend
  let fbmVal = noise_fbm(vec4f(objPos / scaleVoronoi1, timeVoronoi1), 4.0, 0.5, 2.0, true);
  let puffAdd = clamp01((fbmVal * 0.5 + 0.5) * factorMacro);
  let stage3p = clamp01(altitudeMask + puffAdd);

  let stage3 = sharpen(mix(stage3p, stage3v, clamp01(worleyBlend)), edgeSharpness);

  // --- STAGE 4: Upper Altitude Cutoff ---
  let cutoffFromMin = altitude * scaleAlt;
  let cutoff = mapRange(Z, cutoffFromMin, 0.0, 0.0, 1.0); // Map Range.008 (Blender)
  let shaped = clamp01(stage3 - cutoff); // Math.020

  // Vertical limits folded into the same density-vs-threshold competition that
  // forms horizontal edges: a height envelope raises the threshold toward the
  // top/bottom, so those surfaces fall on the 3D-noise iso-surface and stay
  // irregular instead of being clipped to flat planes.
  let bandHi = max(altTop, altBase + 1e-3);
  let vMid = (altBase + bandHi) * 0.5;
  let vHalf = max((bandHi - altBase) * 0.5, 1e-3);
  let vT = abs(zNorm - vMid) / vHalf;
  let vEnvelope = pow(vT, max(params.g.verticalEdgeShape, 0.01)) * params.g.verticalEdgeRange;
  let finalShaped = clamp01(shaped - (1.0 - factorShaper) - coverageThreshold - vEnvelope); // Math.005

  // --- STAGE 5: Final Multipliers ---
  let falloffRaw = mapRange(Z, 0.0, altitude, 0.0, 1.0); // Map Range.009
  let falloff = pow(clamp01(falloffRaw), mix(1.0, 2.5, clamp01(baseRoundness)));
  let densityScale = densityParam * 5.0; // Tune for WebGPU raymarching
  let edgeFade = smoothstep(0.0, 0.25, localCoverage);
  return finalShaped * falloff * densityScale * wDensityScale * edgeFade; // Math.016
}

// ============================================================
// Ray Marching
// ============================================================

fn boxMin() -> vec3f {
  let e = max(params.g.boxHalfExtent, 0.01);
  return vec3f(-e, 0.0, -e);
}

fn boxMaxXZ() -> f32 {
  return max(params.g.boxHalfExtent, 0.01);
}

fn getBoxMax() -> vec3f {
  return vec3f(boxMaxXZ(), max(params.g.cloudHeight, 0.01), boxMaxXZ());
}

struct HitInfo {
  hit   : bool,
  tNear : f32,
  tFar  : f32,
};

fn intersectBox(ro : vec3f, rd : vec3f) -> HitInfo {
  let bmin = boxMin();
  let bmax = getBoxMax();
  let invRd = 1.0 / rd;
  let t0 = (bmin - ro) * invRd;
  let t1 = (bmax - ro) * invRd;
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  let tNear = max(tmin.x, max(tmin.y, tmin.z));
  let tFar  = min(tmax.x, min(tmax.y, tmax.z));
  return HitInfo(tFar >= max(tNear, 0.0), tNear, tFar);
}

fn sunDir() -> vec3f {
  let a = radians(params.g.sunAzimuth);
  let e = radians(params.g.sunElevation);
  let ce = cos(e);
  return normalize(vec3f(ce * sin(a), sin(e), ce * cos(a)));
}

struct SkyColors {
  sun     : vec3f,
  ambient : vec3f,
  bg      : vec3f,
  top     : vec3f,
};

fn todColors() -> SkyColors {
  let t = clamp(sin(radians(params.g.sunElevation)), 0.0, 1.0);
  let tk = smoothstep(0.0, 0.5, t);
  let sun = mix(vec3f(1.0, 0.55, 0.25), vec3f(1.0, 1.0, 1.0), tk);
  let amb = mix(vec3f(0.18, 0.16, 0.22), vec3f(0.26, 0.30, 0.42), tk);
  let bg  = mix(vec3f(0.20, 0.09, 0.10), vec3f(0.30, 0.55, 0.85), tk);
  let top = mix(vec3f(0.35, 0.20, 0.18), vec3f(0.08, 0.32, 0.78), tk);
  return SkyColors(sun, amb, bg, top);
}

fn hgPhase(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

fn dualHG(cosTheta: f32) -> f32 {
    return mix(hgPhase(cosTheta, params.g.hgBackward), hgPhase(cosTheta, params.g.hgForward), clamp01(params.g.hgBlend));
}

fn detailNoise(pos : vec3f) -> f32 {
  let f = max(params.g.detailFreq, 0.01);
  return perlin_noise_4d(vec4f(pos * f, params.g.sceneTime * 0.1));
}

fn applyEdgeHardness(d: f32) -> f32 {
  let h = params.g.edgeHardness;
  if (h < 0.0001) { return d; }
  let thr = max(params.g.edgeHardnessThreshold, 0.0001);
  let w = mix(0.15, 0.001, clamp01(h));
  return smoothstep(thr - w, thr + w, d);
}

// ------------------------------------------------------------
// Debug analytic shapes (bypass procedural noise + weather + cache).
// Each returns a "shape coordinate" s: s<1 inside, s==1 on surface.
// ------------------------------------------------------------
fn dbgSphere(p : vec3f) -> f32 { return length(p); }

fn dbgCube(p : vec3f) -> f32 { return max(max(abs(p.x), abs(p.y)), abs(p.z)); }

fn dbgOcta(p : vec3f) -> f32 {
  let n = 0.5773502692;
  return max(
    max(abs(dot(p, vec3f(1.0, 1.0, 1.0))), abs(dot(p, vec3f(-1.0, 1.0, 1.0)))),
    max(abs(dot(p, vec3f(1.0, -1.0, 1.0))), abs(dot(p, vec3f(1.0, 1.0, -1.0))))
  ) * n;
}

fn dbgTetra(p : vec3f) -> f32 {
  let n = 0.5773502692;
  let a = dot(p, vec3f(1.0, 1.0, 1.0));
  let b = dot(p, vec3f(1.0, -1.0, -1.0));
  let c = dot(p, vec3f(-1.0, 1.0, -1.0));
  let d = dot(p, vec3f(-1.0, -1.0, 1.0));
  return max(max(a, b), max(c, d)) * n;
}

fn dbgDodeca(p : vec3f) -> f32 {
  let n = normalize(vec3f(0.0, 1.0, 1.618034));
  let v0 = vec3f(0.0, n.y, n.z);
  let v1 = vec3f(0.0, n.y, -n.z);
  let v2 = vec3f(n.z, 0.0, n.y);
  let v3 = vec3f(-n.z, 0.0, n.y);
  let v4 = vec3f(n.y, n.z, 0.0);
  let v5 = vec3f(n.y, -n.z, 0.0);
  var m = abs(dot(p, v0));
  m = max(m, abs(dot(p, v1)));
  m = max(m, abs(dot(p, v2)));
  m = max(m, abs(dot(p, v3)));
  m = max(m, abs(dot(p, v4)));
  m = max(m, abs(dot(p, v5)));
  return m * 1.070466;
}

fn dbgIcosa(p : vec3f) -> f32 {
  let a = normalize(vec3f(1.0, 1.0, 1.0));
  let b = normalize(vec3f(0.0, 1.0, 2.618034));
  let c = normalize(vec3f(2.618034, 0.0, 1.0));
  let d = normalize(vec3f(1.0, 2.618034, 0.0));
  var m = abs(dot(p, a));
  m = max(m, abs(dot(p, vec3f(-a.x, a.y, a.z))));
  m = max(m, abs(dot(p, vec3f(a.x, -a.y, a.z))));
  m = max(m, abs(dot(p, vec3f(a.x, a.y, -a.z))));
  m = max(m, abs(dot(p, vec3f(0.0, b.y, b.z))));
  m = max(m, abs(dot(p, vec3f(0.0, -b.y, b.z))));
  m = max(m, abs(dot(p, vec3f(c.x, 0.0, c.z))));
  m = max(m, abs(dot(p, vec3f(-c.x, 0.0, c.z))));
  m = max(m, abs(dot(p, vec3f(d.x, d.y, 0.0))));
  m = max(m, abs(dot(p, vec3f(-d.x, d.y, 0.0))));
  return m * 0.9341724;
}

fn dbgTorus(p : vec3f) -> f32 {
  let q = vec2f(length(p.xz) - 0.7, p.y);
  return length(q) / 0.3;
}

fn shapeCoord(mode : i32, p : vec3f) -> f32 {
  if (mode == 2) { return dbgSphere(p); }
  else if (mode == 3) { return dbgCube(p); }
  else if (mode == 4) { return dbgOcta(p); }
  else if (mode == 5) { return dbgTetra(p); }
  else if (mode == 6) { return dbgDodeca(p); }
  else if (mode == 7) { return dbgIcosa(p); }
  else if (mode == 8) { return dbgTorus(p); }
  return 1e9;
}

fn densityAtTyped(pos : vec3f) -> vec4f {
  let mode = i32(params.g.qualityMode);
  if (mode == 2) {
    let dt = cloudDensityTyped(pos);
    return vec4f(applyEdgeHardness(dt.d), dt.idx, dt.idx2, dt.w2);
  }
  let s = sampleDensityTyped(pos);
  var base = s.x;
  if (mode == 1 && base > 0.01) {
    base = base * (1.0 + params.g.detailStrength * detailNoise(pos));
  }
  return vec4f(applyEdgeHardness(max(base, 0.0)), s.y, s.z, s.w);
}

fn densityAt(pos : vec3f) -> f32 {
  return densityAtTyped(pos).x;
}

// Accumulated optical depth toward the sun (raw, not yet attenuated).
fn lightMarchDepth(pos : vec3f) -> f32 {
  var shadow = 0.0;
  let steps = i32(params.g.lightMarchSteps);
  let sd = sunDir();
  // Exponentially growing steps probe the whole sun-ward path instead of a
  // fixed shallow depth.
  var ss = max(params.g.lightMarchStepSize, 0.001);
  var t = 0.0;
  for (var i = 0; i < steps; i++) {
    t = t + ss;
    let p = pos + sd * t;
    shadow = shadow + densityAt(p) * ss;
    ss = ss * 2.0;
  }
  return shadow;
}

// Multi-scattering approximation: sum a few octaves of Beer attenuation with
// progressively smaller extinction. The low-extinction octaves keep shadowed
// interiors from going pitch-black, so the bright lit surface blends into the
// body instead of reading as a thin "shell" over a dark/transparent core.
fn sunVisibility(opticalDepth : f32) -> f32 {
  let sdk = params.g.shadowDarkness;
  let o0 = exp(-opticalDepth * sdk);
  let o1 = exp(-opticalDepth * sdk * 0.33);
  let o2 = exp(-opticalDepth * sdk * 0.1);
  return (o0 + 0.6 * o1 + 0.35 * o2) / 1.95;
}

fn interleavedGradientNoise(uv: vec2f) -> f32 {
    let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(uv, magic.xy)));
}

const GROUND_Y = 0.0;

fn groundHeight(xz : vec2f) -> f32 {
  let n = noise_fbm(vec4f(xz * 0.18, 0.0, 0.0), 3.0, 0.5, 2.0, true);
  return n * 0.85;
}

fn cloudShadowAt(p : vec3f) -> f32 {
  let sd = sunDir();
  if (sd.y <= 0.01) { return 1.0; }
  let h = intersectBox(p, sd);
  if (!h.hit) { return 1.0; }
  let t0 = max(h.tNear, 0.0);
  let t1 = h.tFar;
  if (t1 <= t0) { return 1.0; }
  let steps = 18;
  let dt = (t1 - t0) / f32(steps);
  var dens = 0.0;
  for (var i = 0; i < steps; i++) {
    let sp = p + sd * (t0 + dt * (f32(i) + 0.5));
    dens += densityAt(sp) * dt;
  }
  return exp(-dens * params.g.shadowDarkness);
}

fn groundColor(gp : vec3f, skyC : SkyColors) -> vec3f {
  let e = 0.25;
  let hL = groundHeight(gp.xz - vec2f(e, 0.0));
  let hR = groundHeight(gp.xz + vec2f(e, 0.0));
  let hD = groundHeight(gp.xz - vec2f(0.0, e));
  let hU = groundHeight(gp.xz + vec2f(0.0, e));
  let n = normalize(vec3f(hL - hR, 2.0 * e, hD - hU));

  let sd = sunDir();
  let ndl = clamp(dot(n, sd), 0.0, 1.0);
  let shadow = cloudShadowAt(vec3f(gp.x, GROUND_Y + groundHeight(gp.xz), gp.z));

  let base = vec3f(0.10, 0.62, 0.06);
  let tint = noise_fbm(vec4f(gp.xz * 0.6, 0.0, 0.0), 4.0, 0.5, 2.0, true) * 0.5 + 0.5;
  let albedo = base * mix(0.82, 1.12, tint);

  let direct = skyC.sun * (ndl * params.g.sunIntensity * 0.6) * shadow;
  let ambient = skyC.ambient * 0.55;
  return albedo * (direct + ambient);
}

fn debugBodyColor(i : i32, core : bool) -> vec3f {
  let palette = array<vec3f, 6>(
    vec3f(0.2, 1.0, 0.35),
    vec3f(1.0, 0.6, 0.12),
    vec3f(0.3, 0.7, 1.0),
    vec3f(1.0, 0.3, 0.7),
    vec3f(0.9, 0.9, 0.2),
    vec3f(0.5, 0.4, 1.0),
  );
  let c = palette[i % 6];
  if (core) { return c; }
  return c * 0.4 + vec3f(0.15);
}

@fragment
fn fs(@builtin(position) fragCoord : vec4f, @location(0) uv : vec2f) -> @location(0) vec4f {
  let skipLight = params.g.skipLight > 0.5;
  let numSteps = i32(params.g.rayMarchSteps);
  let world_near = camera.invViewProj * vec4f(uv, 0.0, 1.0);
  let world_far  = camera.invViewProj * vec4f(uv, 1.0, 1.0);
  let ro = camera.position;
  let rd = normalize(world_far.xyz/world_far.w - world_near.xyz/world_near.w);

  let hit = intersectBox(ro, rd);

  let SUN_DIR = sunDir();
  let skyC = todColors();
  let sky = mix(skyC.bg, skyC.top, clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
  let sunTheta = dot(rd, SUN_DIR);
  let finalSky = sky + pow(max(sunTheta, 0.0), 64.0) * skyC.sun * 0.8;

  var background = finalSky;
  if (rd.y < -0.0001) {
    let tGround = (GROUND_Y - ro.y) / rd.y;
    if (tGround > 0.0) {
      let gp = ro + rd * tGround;
      let gcol = groundColor(gp, skyC);
      let fade = clamp(tGround / 80.0, 0.0, 1.0);
      let horizon = smoothstep(0.0, 0.06, -rd.y);
      background = mix(finalSky, mix(gcol, finalSky, fade), horizon);
    }
  }

  var outColor = background;
  var transmittance = 1.0;
  var color = vec3f(0.0);
  var iterCount = 0;

  if (hit.hit) {
    let tEntry = max(hit.tNear, 0.0);
    let tExit  = hit.tFar;
    let stepSize = (tExit - tEntry) / f32(numSteps);
    let dither = interleavedGradientNoise(fragCoord.xy);
    
    var pos = ro + rd * (tEntry + stepSize * dither);
    transmittance = 1.0;
    color = vec3f(0.0);
    let phaseGlobal = mix(1.0, dualHG(sunTheta), 0.6);
    let blend = clamp01(params.g.typeLightingBlend);
    let bmin = boxMin();
    let boxMax = getBoxMax();
    const ABS_K = 22.0;

    for (var i = 0u; i < RAYMARCH_MAX_STEPS; i++) {
      if (i32(i) >= numSteps) { break; }
      iterCount = i32(i) + 1;
      let dt = densityAtTyped(pos);
      let d = dt.x;
      if (d > 0.01) {
        let L = blendedLighting(dt.y, dt.z, dt.w);
        let extinction = mix(1.0, L.absorption * ABS_K, blend * params.g.fxAbsorption);
        let step_trans = exp(-d * stepSize * extinction);
        var shadow = 1.0;
        if (!skipLight) { shadow = sunVisibility(lightMarchDepth(pos)); }
        let phaseType = mix(1.0, mix(hgPhase(sunTheta, L.phaseBack), hgPhase(sunTheta, L.phaseFwd), clamp01(params.g.hgBlend)), 0.6);
        let phase = mix(phaseGlobal, phaseType, blend);
        var scattering = shadow * phase * (1.0 - exp(-d * 1.0));
        scattering *= mix(1.0, 1.0 - exp(-d * 4.0), clamp01(params.g.powderStrength));
        let zN = clamp((pos.y - bmin.y) / max(boxMax.y - bmin.y, 0.001), 0.0, 1.0);
        let densW = smoothstep(0.6, 1.4, d);
        let heightLight = mix(1.0, mix(0.75, 1.18, smoothstep(0.0, 1.0, zN)), densW);
        scattering *= heightLight;
        let darkAmt = mix(0.0, L.baseDark, blend);
        scattering *= 1.0 - darkAmt * (1.0 - zN) * densW;
        var litColor = skyC.sun * scattering * params.g.sunIntensity + skyC.ambient * 0.5;
        litColor += skyC.sun * mix(0.0, L.sss, blend) * pow(max(sunTheta, 0.0), 3.0) * exp(-d * 2.0) * transmittance * 0.5;
        let silverScale = mix(1.0, L.silver, blend);
        litColor *= 1.0 + params.g.silverIntensity * silverScale * pow(clamp01(sunTheta), 4.0) * transmittance;

        color += transmittance * (1.0 - step_trans) * litColor;
        transmittance *= step_trans;
        let cutoff = 0.01;
        if (transmittance < cutoff) { break; }
      }
      pos += rd * stepSize;
    }
    outColor = color + transmittance * background;
  }

  if (params.g.debugView > 0.5) {
    let dv = i32(params.g.debugView);
    if (dv == 1) { return vec4f(vec3f(transmittance), 1.0); }
    if (dv == 2) { return vec4f(color, 1.0); }
    if (dv == 3) {
      if (!hit.hit) { return vec4f(0.0, 0.0, 0.0, 1.0); }
      let heat = f32(iterCount) / f32(numSteps);
      let c = select(mix(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), (heat - 0.5) * 2.0), mix(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), heat * 2.0), heat < 0.5);
      return vec4f(c, 1.0);
    }
    if (dv == 4 || dv == 5) {
      let bmin = boxMin();
      let planeY = bmin.y + params.g.cloudHeight * 0.5;
      let tPlane = (planeY - ro.y) / rd.y;
      if (abs(rd.y) < 1e-4 || tPlane <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
      let p = ro + rd * tPlane;
      let spanXZ = max(boxMaxXZ() - bmin.x, 0.001);
      let wUv = (vec2f(p.x, p.z) - vec2f(bmin.x, bmin.z)) / spanXZ;
      if (dv == 4) {
        var cov = 0.0;
        let n = i32(params.g.activeBodyCount);
        for (var i = 0; i < MAX_BODIES; i++) {
          if (i >= n) { break; }
          if (params.bodies[i].geom.w < 0.5) { continue; }
          cov = max(cov, textureSampleLevel(weatherTex, weatherSampler, wUv, i, 0.0).r);
        }
        return vec4f(vec3f(cov), 1.0);
      }
      var out = vec3f(0.0);
      let n = i32(params.g.activeBodyCount);
      for (var i = 0; i < MAX_BODIES; i++) {
        if (i >= n) { break; }
        let b = params.bodies[i];
        if (b.geom.w < 0.5) { continue; }
        let dx = p.x - b.footprint.x;
        let dz = p.z - b.footprint.y;
        let r = max(b.footprint.z, 0.001);
        let f = b.intensity.w;
        let shapeId = i32(round(b.footprint.w));
        var core = false;
        var feather = false;
        if (shapeId == 0) {
          core = abs(dx) <= r && abs(dz) <= r;
          feather = abs(dx) <= r + f && abs(dz) <= r + f;
        } else {
          let d = sqrt(dx * dx + dz * dz);
          core = d <= r;
          feather = d <= r + f;
        }
        if (core || feather) {
          out = debugBodyColor(i, core);
        }
      }
      return vec4f(out, 1.0);
    }
  }
    
  return vec4f(outColor, 1.0);
}

// ============================================================
// Density Cache Compute
// ============================================================

@compute @workgroup_size(wg_x, wg_y, wg_z)
fn cs(@builtin(global_invocation_id) gid : vec3u) {
  let dims = textureDimensions(densityStore);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) { return; }

  let uvw = (vec3f(gid) + 0.5) / vec3f(dims);
  let pos = mix(boxMin(), getBoxMax(), uvw);
  let dt = cloudDensityTyped(pos);
  textureStore(densityStore, vec3i(gid), vec4f(dt.d, dt.idx, dt.idx2, dt.w2));
}
