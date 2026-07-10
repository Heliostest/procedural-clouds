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
  edgeCurveWidth  : f32,
  edgeCurveShaper : f32,
  frameIndex      : f32,
  adaptiveMarch   : f32,
  temporalDither  : f32,
  aerialDensity   : f32,
  aerialInscatter : f32,
  aerialHeightFalloff : f32,
  shadowTintStrength : f32,
  jitterX         : f32,
  jitterY         : f32,
  taaEnabled      : f32,
  edgeSharpening  : f32,
  groundShadowMode : f32,
  groundShadowMaxSteps : f32,
  groundShadowStepScale : f32,
  groundShadowJitter : f32,
  groundShadowMapValid : f32,
  groundShadowMapGuard : f32,
  groundShadowPhase : f32,
  todPaletteBlend : f32,
  msModel         : f32,
  energyConservingScatter : f32,
  densityShapeModel : f32,
  heightAmbientModel : f32,
  _pad12          : f32,
};

struct BodyGPU {
  geom : vec4f, // x=baseY, y=topY (world), z=typeIdx, w=enabled
  wind : vec4f, // x=advectionOffsetWorldX, y=advectionOffsetWorldZ, z=morphTime, w=reserved
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
  p5 : vec4f,
  p6 : vec4f,
  p7 : vec4f,
};

const PRESET_COUNT = 10;
const DENSITY_SCALE_MAX = 2.0;
const RAYMARCH_MAX_STEPS = 256u;
const GROUND_SHADOW_MAX_STEPS = 64;
// Must match PRESET_P5_OFFSETS in src/params.ts.
const PRESET_P5_EDGE_HARDNESS = 0u;
const PRESET_P5_ANVIL_STRENGTH = 1u;
const PRESET_P5_TOP_CUTOFF_SHARPNESS = 2u;
const PRESET_P5_EDGE_EROSION_STRENGTH = 3u;
// Must match PRESET_P6_OFFSETS in src/params.ts.
const PRESET_P6_CIRRUS_FIBER_STRENGTH = 0u;
const PRESET_P6_CIRRUS_FIBER_CURL = 1u;
const PRESET_P6_CONVECTIVE_TOWER_STRENGTH = 2u;
const PRESET_P6_CONVECTIVE_CELL_SCALE = 3u;
// Must match PRESET_P7_OFFSETS in src/params.ts.
const PRESET_P7_SUN_DISC_VISIBLE = 0u;
const PRESET_P7_HALO_EFFECT = 1u;
const PRESET_P7_INTERNAL_LIGHTNING = 2u;
const PRESET_P7_TILE_SCALE = 3u;

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
@group(2) @binding(1) var groundShadowStore : texture_storage_2d<rgba16float, write>;
@group(3) @binding(0) var groundShadowSampler : sampler;
@group(3) @binding(1) var groundShadowTex : texture_2d<f32>;

struct Shape12 {
  density           : f32,
  coverage          : f32,
  altitude          : f32,
  scale             : f32,
  detail            : f32,
  cloudHeight       : f32,
  coverageThreshold : f32,
  edgeSharpness     : f32,
  worleyBlend       : f32,
  detailStrength    : f32,
  altBase           : f32,
  altTop            : f32,
};

fn presetShape(i : i32) -> Shape12 {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return Shape12(p.p0.x, p.p0.y, p.p0.z, p.p0.w, p.p1.x, p.p1.y, p.p1.z, p.p1.w, p.p2.y, p.p2.z, p.p2.w, p.p3.x);
}

struct Lighting {
  absorption : f32,
  phaseFwd   : f32,
  phaseBack  : f32,
  silver     : f32,
  baseDark   : f32,
  sss        : f32,
  sunDisc    : f32,
  halo       : f32,
  lightning  : f32,
};

fn presetLighting(i : i32) -> Lighting {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return Lighting(
    p.p3.y, p.p3.z, p.p3.w, p.p4.x, p.p4.y, p.p4.z,
    p.p7[PRESET_P7_SUN_DISC_VISIBLE],
    p.p7[PRESET_P7_HALO_EFFECT],
    p.p7[PRESET_P7_INTERNAL_LIGHTNING],
  );
}

struct Morphology {
  baseRoundness     : f32,
  anvilStrength     : f32,
  topCutoffSharpness : f32,
  cirrusFiberStrength : f32,
  cirrusFiberCurl : f32,
  convectiveTowerStrength : f32,
  convectiveCellScale : f32,
  tileScale : f32,
};

fn presetMorphology(i : i32) -> Morphology {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return Morphology(
    p.p2.x,
    p.p5[PRESET_P5_ANVIL_STRENGTH],
    p.p5[PRESET_P5_TOP_CUTOFF_SHARPNESS],
    p.p6[PRESET_P6_CIRRUS_FIBER_STRENGTH],
    p.p6[PRESET_P6_CIRRUS_FIBER_CURL],
    p.p6[PRESET_P6_CONVECTIVE_TOWER_STRENGTH],
    p.p6[PRESET_P6_CONVECTIVE_CELL_SCALE],
    p.p7[PRESET_P7_TILE_SCALE],
  );
}

struct EdgeStyle {
  hardness        : f32,
  erosionStrength : f32,
};

fn presetEdgeStyle(i : i32) -> EdgeStyle {
  let idx = clamp(i, 0, PRESET_COUNT - 1);
  let p = presets[idx];
  return EdgeStyle(
    p.p5[PRESET_P5_EDGE_HARDNESS],
    p.p5[PRESET_P5_EDGE_EROSION_STRENGTH],
  );
}

fn effectiveEdgeStyle(raw : EdgeStyle) -> EdgeStyle {
  if (params.g.edgeSharpening < 0.5) { return EdgeStyle(0.0, 0.0); }
  return EdgeStyle(
    clamp01(raw.hardness * max(params.g.edgeHardness, 0.0)),
    clamp01(raw.erosionStrength),
  );
}

fn blendedEdgeStyle(idx : f32, idx2 : f32, w2 : f32) -> EdgeStyle {
  let a = presetEdgeStyle(i32(idx));
  let b = presetEdgeStyle(i32(idx2));
  let t = clamp(w2, 0.0, 0.5);
  return effectiveEdgeStyle(EdgeStyle(
    mix(a.hardness, b.hardness, t),
    mix(a.erosionStrength, b.erosionStrength, t),
  ));
}

fn mixLighting(a : Lighting, b : Lighting, t : f32) -> Lighting {
  return Lighting(
    mix(a.absorption, b.absorption, t),
    mix(a.phaseFwd, b.phaseFwd, t),
    mix(a.phaseBack, b.phaseBack, t),
    mix(a.silver, b.silver, t),
    mix(a.baseDark, b.baseDark, t),
    mix(a.sss, b.sss, t),
    mix(a.sunDisc, b.sunDisc, t),
    mix(a.halo, b.halo, t),
    mix(a.lightning, b.lightning, t),
  );
}

// Density-weighted blend of the two dominant genera at a point (idx, idx2, w2).
fn blendedLighting(idx : f32, idx2 : f32, w2 : f32) -> Lighting {
  return mixLighting(presetLighting(i32(idx)), presetLighting(i32(idx2)), clamp(w2, 0.0, 0.5));
}

fn mixShape(a : Shape12, b : Shape12, t : f32) -> Shape12 {
  return Shape12(
    mix(a.density, b.density, t),
    mix(a.coverage, b.coverage, t),
    mix(a.altitude, b.altitude, t),
    mix(a.scale, b.scale, t),
    mix(a.detail, b.detail, t),
    mix(a.cloudHeight, b.cloudHeight, t),
    mix(a.coverageThreshold, b.coverageThreshold, t),
    mix(a.edgeSharpness, b.edgeSharpness, t),
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
  var total = 0.0;
  var bestD = 0.0;
  var bestIdx = 0.0;
  var secondD = 0.0;
  var secondIdx = 0.0;
  for (var i = 0; i < MAX_BODIES; i++) {
    if (params.bodies[i].geom.w < 0.5) { continue; }
    let dd = evalBody(pos, i);
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
  let yBase = clamp(b.geom.x, bmin.y, bmaxY);
  let yTop = clamp(max(b.geom.y, yBase + 0.02), yBase + 0.02, bmaxY);
  let yMid = (yBase + yTop) * 0.5;
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
  let transportedPos = vec3f(posIn.x - b.wind.x, posIn.y, posIn.z - b.wind.y);
  let pos = bodyRotatedPos(transportedPos, b);
  let bmin = boxMin();
  let bmaxY = getBoxMax().y;
  let cx = b.footprint.x;
  let cz = b.footprint.y;
  let rad = max(b.footprint.z, 0.001);
  let yBase = clamp(b.geom.x, bmin.y, bmaxY);
  let yTop = clamp(max(b.geom.y, yBase + 0.02), yBase + 0.02, bmaxY);
  let yMid = (yBase + yTop) * 0.5;
  let yHalf = max((yTop - yBase) * 0.5, 0.001);
  let p = vec3f((pos.x - cx) / rad, (pos.y - yMid) / yHalf, (pos.z - cz) / rad);
  let s = shapeCoord(shapeId, p);
  // Surface softness reuses the body's Feather (in world units), normalized.
  let edge = clamp(max(b.intensity.w, 0.001) / rad, 0.01, 2.0);
  let level = clamp01(b.intensity.x) * max(b.intensity.y, 0.0) * 5.0;
  return clamp01((1.0 - s) / edge) * level;
}

fn evalBody(pos : vec3f, i : i32) -> f32 {
  let b = params.bodies[i];

  let shapeId = i32(round(b.footprint.w));
  if (shapeId >= 2) {
    return evalBodySolid(pos, b, shapeId);
  }
  let ctx = prepareGenusEvalContext(pos, i);
  let compatibilityDensity = evalCompatibilityGenus(ctx);
  let genusIndex = i32(round(b.geom.z));
  return max(evalGenusDensity(genusIndex, compatibilityDensity, pos, i), 0.0);
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
  shadow  : vec3f,
};

const TOD_KNOTS = array<f32, 8>(-15.0, -6.0, 0.0, 5.0, 12.0, 25.0, 45.0, 90.0);

const TOD_SUN_LEGACY = array<vec3f, 8>(
  vec3f(0.02, 0.03, 0.08),
  vec3f(0.45, 0.22, 0.15),
  vec3f(1.00, 0.38, 0.12),
  vec3f(1.00, 0.55, 0.22),
  vec3f(1.00, 0.75, 0.45),
  vec3f(1.00, 0.92, 0.75),
  vec3f(1.00, 0.98, 0.92),
  vec3f(1.00, 1.00, 1.00),
);

const TOD_AMBIENT_LEGACY = array<vec3f, 8>(
  vec3f(0.05, 0.06, 0.12),
  vec3f(0.10, 0.10, 0.20),
  vec3f(0.16, 0.13, 0.22),
  vec3f(0.20, 0.17, 0.24),
  vec3f(0.22, 0.22, 0.30),
  vec3f(0.24, 0.27, 0.38),
  vec3f(0.26, 0.30, 0.42),
  vec3f(0.26, 0.30, 0.42),
);

const TOD_BG_LEGACY = array<vec3f, 8>(
  vec3f(0.02, 0.03, 0.07),
  vec3f(0.25, 0.12, 0.15),
  vec3f(0.55, 0.25, 0.15),
  vec3f(0.60, 0.38, 0.22),
  vec3f(0.48, 0.45, 0.50),
  vec3f(0.38, 0.52, 0.75),
  vec3f(0.32, 0.55, 0.84),
  vec3f(0.30, 0.55, 0.85),
);

const TOD_TOP_LEGACY = array<vec3f, 8>(
  vec3f(0.01, 0.01, 0.04),
  vec3f(0.05, 0.05, 0.15),
  vec3f(0.10, 0.12, 0.28),
  vec3f(0.12, 0.20, 0.42),
  vec3f(0.10, 0.26, 0.60),
  vec3f(0.09, 0.30, 0.72),
  vec3f(0.08, 0.32, 0.78),
  vec3f(0.08, 0.32, 0.78),
);

const TOD_SHADOW_LEGACY = array<vec3f, 8>(
  vec3f(0.04, 0.05, 0.10),
  vec3f(0.08, 0.08, 0.18),
  vec3f(0.14, 0.12, 0.24),
  vec3f(0.18, 0.16, 0.26),
  vec3f(0.20, 0.21, 0.30),
  vec3f(0.22, 0.25, 0.36),
  vec3f(0.24, 0.27, 0.40),
  vec3f(0.24, 0.28, 0.42),
);

// Artistic palette from procedural-clouds-threejs/cloud-types.md
// knots: Night, Twilight, Sunset, Golden, Afternoon, Morning, Midday, Midday
const TOD_SUN_ART = array<vec3f, 8>(
  vec3f(0.133, 0.133, 0.200),
  vec3f(0.800, 0.267, 0.400),
  vec3f(1.000, 0.400, 0.200),
  vec3f(1.000, 0.667, 0.267),
  vec3f(1.000, 0.957, 0.816),
  vec3f(1.000, 0.941, 0.816),
  vec3f(1.000, 1.000, 1.000),
  vec3f(1.000, 1.000, 1.000),
);

const TOD_SHADOW_ART = array<vec3f, 8>(
  vec3f(0.067, 0.067, 0.133),
  vec3f(0.200, 0.133, 0.267),
  vec3f(0.267, 0.133, 0.333),
  vec3f(0.467, 0.267, 0.200),
  vec3f(0.600, 0.667, 0.733),
  vec3f(0.604, 0.667, 0.733),
  vec3f(0.667, 0.733, 0.800),
  vec3f(0.667, 0.733, 0.800),
);

const TOD_BG_ART = array<vec3f, 8>(
  vec3f(0.020, 0.020, 0.063),
  vec3f(0.039, 0.102, 0.200),
  vec3f(0.102, 0.200, 0.400),
  vec3f(0.200, 0.400, 0.667),
  vec3f(0.333, 0.600, 0.800),
  vec3f(0.400, 0.600, 0.800),
  vec3f(0.267, 0.533, 0.733),
  vec3f(0.267, 0.533, 0.733),
);

const TOD_TOP_ART = array<vec3f, 8>(
  vec3f(0.010, 0.010, 0.031),
  vec3f(0.020, 0.051, 0.120),
  vec3f(0.051, 0.100, 0.240),
  vec3f(0.080, 0.200, 0.450),
  vec3f(0.120, 0.320, 0.580),
  vec3f(0.150, 0.350, 0.620),
  vec3f(0.100, 0.300, 0.580),
  vec3f(0.100, 0.300, 0.580),
);

const TOD_AMBIENT_ART = array<vec3f, 8>(
  vec3f(0.067, 0.067, 0.120),
  vec3f(0.160, 0.100, 0.180),
  vec3f(0.280, 0.160, 0.200),
  vec3f(0.350, 0.250, 0.220),
  vec3f(0.420, 0.430, 0.480),
  vec3f(0.450, 0.460, 0.520),
  vec3f(0.480, 0.520, 0.580),
  vec3f(0.480, 0.520, 0.580),
);

fn todColors() -> SkyColors {
  var knots = TOD_KNOTS;
  var sunL = TOD_SUN_LEGACY;
  var ambL = TOD_AMBIENT_LEGACY;
  var bgL = TOD_BG_LEGACY;
  var topL = TOD_TOP_LEGACY;
  var shadowL = TOD_SHADOW_LEGACY;
  var sunA = TOD_SUN_ART;
  var ambA = TOD_AMBIENT_ART;
  var bgA = TOD_BG_ART;
  var topA = TOD_TOP_ART;
  var shadowA = TOD_SHADOW_ART;
  let e = clamp(params.g.sunElevation, knots[0], knots[7]);
  var i = 0;
  for (var k = 0; k < 7; k++) {
    if (e >= knots[k]) { i = k; }
  }
  let tt = smoothstep(0.0, 1.0, (e - knots[i]) / (knots[i + 1] - knots[i]));
  let blend = clamp01(params.g.todPaletteBlend);
  let sun = mix(mix(sunL[i], sunL[i + 1], tt), mix(sunA[i], sunA[i + 1], tt), blend);
  let amb = mix(mix(ambL[i], ambL[i + 1], tt), mix(ambA[i], ambA[i + 1], tt), blend);
  let bg  = mix(mix(bgL[i], bgL[i + 1], tt), mix(bgA[i], bgA[i + 1], tt), blend);
  let top = mix(mix(topL[i], topL[i + 1], tt), mix(topA[i], topA[i + 1], tt), blend);
  let shadow = mix(mix(shadowL[i], shadowL[i + 1], tt), mix(shadowA[i], shadowA[i + 1], tt), blend);
  return SkyColors(sun, amb, bg, top, shadow);
}

fn hgPhase(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

fn csPhase(cosTheta : f32, g : f32) -> f32 {
  let g2 = g * g;
  let denom = pow(max(1.0 + g2 - 2.0 * g * cosTheta, 1e-4), 1.5);
  return (3.0 * (1.0 - g2)) / (2.0 * (2.0 + g2)) * (1.0 + cosTheta * cosTheta) / (4.0 * 3.14159 * denom);
}

fn dualHG(cosTheta: f32) -> f32 {
    return mix(hgPhase(cosTheta, params.g.hgBackward), csPhase(cosTheta, params.g.hgForward), clamp01(params.g.hgBlend));
}

fn dominantWindPhase(pos : vec3f) -> vec3f {
  let bmin = boxMin();
  let spanXZ = max(boxMaxXZ() - bmin.x, 0.001);
  var bestScore = 0.0;
  var phase = vec3f(0.0);
  for (var i = 0; i < MAX_BODIES; i++) {
    if (f32(i) >= params.g.activeBodyCount) { break; }
    let b = params.bodies[i];
    if (pos.y < b.geom.x || pos.y > b.geom.y) { continue; }
    let transportedXZ = pos.xz - b.wind.xy;
    let uv = (transportedXZ - vec2f(bmin.x, bmin.z)) / spanXZ;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { continue; }
    let alpha = textureSampleLevel(weatherTex, weatherSampler, uv, i, 0.0).r;
    let score = alpha * clamp01(b.intensity.x) * max(b.intensity.y, 0.0);
    if (score > bestScore) {
      bestScore = score;
      phase = vec3f(b.wind.x, b.wind.y, b.wind.z);
    }
  }
  return phase;
}

fn detailNoise(pos : vec3f) -> f32 {
  let f = max(params.g.detailFreq, 0.01);
  let phase = dominantWindPhase(pos);
  let advectedPos = vec3f(pos.x - phase.x, pos.y, pos.z - phase.y);
  return perlin_noise_4d(vec4f(advectedPos * f, phase.z * 0.1));
}

fn applyEdgeShaping(d : f32, idx : f32, idx2 : f32, w2 : f32, pos : vec3f) -> f32 {
  let edgeStyle = blendedEdgeStyle(idx, idx2, w2);
  let h = edgeStyle.hardness;
  let erosionStrength = edgeStyle.erosionStrength;
  if (h < 0.0001 && erosionStrength < 0.0001) { return d; }
  let thr = max(params.g.edgeHardnessThreshold, 0.0001);
  var eroded = max(d, 0.0);
  let edgeBandWidth = mix(0.045, 0.025, max(h, erosionStrength));
  let edgeBand = 1.0 - smoothstep(edgeBandWidth * 0.45, edgeBandWidth, abs(eroded - thr));
  if (edgeBand > 0.001 && erosionStrength > 0.0001) {
    let curl = curl_noise_3d(pos * 1.7, params.g.sceneTime * 0.06);
    let cell = worley_f1_3d(pos * 8.0 + curl * 0.45);
    let pockets = 1.0 - smoothstep(0.16, 0.52, cell);
    let erosion = pockets * edgeBand * erosionStrength * min(thr * 0.7, 0.04);
    eroded = max(eroded - erosion, 0.0);
  }
  if (h < 0.0001) { return eroded; }
  let w = mix(0.15, 0.006, h);
  return smoothstep(thr - w, thr + w, eroded);
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
    return vec4f(applyEdgeShaping(dt.d, dt.idx, dt.idx2, dt.w2, pos), dt.idx, dt.idx2, dt.w2);
  }
  let s = sampleDensityTyped(pos);
  var base = s.x;
  if (mode == 1 && base > 0.01 && params.g.detailStrength > 0.0001) {
    base = base * (1.0 + params.g.detailStrength * detailNoise(pos));
  }
  return vec4f(applyEdgeShaping(max(base, 0.0), s.y, s.z, s.w, pos), s.y, s.z, s.w);
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
  let cutoff = 40.0 / max(params.g.shadowDarkness, 0.1);
  for (var i = 0; i < steps; i++) {
    t = t + ss;
    let p = pos + sd * t;
    shadow = shadow + densityAt(p) * ss;
    if (shadow > cutoff) { break; }
    ss = ss * 2.0;
  }
  return shadow;
}

// Multi-scattering approximation: sum a few octaves of Beer attenuation with
// progressively smaller extinction. The low-extinction octaves keep shadowed
// interiors from going pitch-black, so the bright lit surface blends into the
// body instead of reading as a thin "shell" over a dark/transparent core.
fn sunVisibilityLegacy(opticalDepth : f32) -> f32 {
  let sdk = params.g.shadowDarkness;
  let o0 = exp(-opticalDepth * sdk);
  let o1 = exp(-opticalDepth * sdk * 0.33);
  let o2 = exp(-opticalDepth * sdk * 0.1);
  return (o0 + 0.6 * o1 + 0.35 * o2) / 1.95;
}

// Sky Ocean Sun style triple-Beer MS: μ-driven scatterAmount softens thick
// interiors toward the sun without extra light-march samples.
fn sunVisibilityTripleBeer(opticalDepth : f32, mu : f32) -> f32 {
  let tau = opticalDepth * params.g.shadowDarkness;
  let s = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
  return exp(-tau) + 0.5 * s * exp(-0.1 * tau) + 0.4 * s * exp(-0.02 * tau);
}

fn sunVisibility(opticalDepth : f32, mu : f32) -> f32 {
  if (params.g.msModel > 0.5) {
    return sunVisibilityTripleBeer(opticalDepth, mu);
  }
  return sunVisibilityLegacy(opticalDepth);
}

fn msDensityHeightMod(d : f32, zN : f32, opticalDepth : f32) -> f32 {
  if (params.g.msModel < 0.5) { return 1.0; }
  let tau = opticalDepth * params.g.shadowDarkness;
  let thin = 0.05 + 1.5 * pow(min(1.0, d * 8.5), 0.3 + 5.5 * zN);
  return mix(thin, 1.0, clamp(tau * 0.4, 0.0, 1.0));
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

struct GroundShadowResult {
  transmittance : f32,
  samples : f32,
};

fn legacyGroundShadow(p : vec3f) -> GroundShadowResult {
  let sd = sunDir();
  if (sd.y <= 0.01) { return GroundShadowResult(1.0, 0.0); }
  let h = intersectBox(p, sd);
  if (!h.hit) { return GroundShadowResult(1.0, 0.0); }
  let t0 = max(h.tNear, 0.0);
  let t1 = h.tFar;
  if (t1 <= t0) { return GroundShadowResult(1.0, 0.0); }
  let steps = 18;
  let dt = (t1 - t0) / f32(steps);
  var dens = 0.0;
  for (var i = 0; i < steps; i++) {
    let sp = p + sd * (t0 + dt * (f32(i) + 0.5));
    dens += densityAt(sp) * dt;
    if (dens * params.g.shadowDarkness > 4.6) {
      return GroundShadowResult(0.01, f32(i + 1));
    }
  }
  return GroundShadowResult(exp(-dens * params.g.shadowDarkness), f32(steps));
}

fn groundShadowMixBits(value : u32) -> u32 {
  var state = value;
  state = state ^ (state >> 16u);
  state = state * 0x7feb352du;
  state = state ^ (state >> 15u);
  state = state * 0x846ca68bu;
  state = state ^ (state >> 16u);
  return state;
}

fn groundShadowHash(cell : vec2u, sampleIndex : u32, phase : u32) -> f32 {
  let seed = (cell.x * 0x9e3779b9u)
    ^ (cell.y * 0x85ebca6bu)
    ^ (sampleIndex * 0xc2b2ae35u);
  let spatial = f32(groundShadowMixBits(seed) >> 8u) * (1.0 / 16777216.0);
  return fract(spatial + f32(phase & 7u) * 0.61803398875);
}

fn groundShadowWorldCell(xz : vec2f) -> vec2u {
  return bitcast<vec2u>(vec2i(floor(xz * 16.0)));
}

fn groundShadowPhase() -> u32 {
  return u32(round(params.g.groundShadowPhase)) & 7u;
}

fn integrateGroundShadow(p : vec3f, shadowCell : vec2u, phase : u32) -> GroundShadowResult {
  let sd = sunDir();
  if (sd.y <= 0.01) { return GroundShadowResult(1.0, 0.0); }
  let h = intersectBox(p, sd);
  if (!h.hit) { return GroundShadowResult(1.0, 0.0); }
  let t0 = max(h.tNear, 0.0);
  let t1 = h.tFar;
  if (t1 <= t0) { return GroundShadowResult(1.0, 0.0); }

  let dims = max(vec3f(textureDimensions(densityTex0, 0)), vec3f(1.0));
  let voxel = (getBoxMax() - boxMin()) / dims;
  let targetStep = max(max(voxel.x, voxel.z) * max(params.g.groundShadowStepScale, 0.1), 0.001);
  let maxSteps = clamp(i32(round(params.g.groundShadowMaxSteps)), 8, GROUND_SHADOW_MAX_STEPS);
  let desiredSteps = max(8, i32(ceil((t1 - t0) / targetStep)));
  let steps = min(maxSteps, desiredSteps);
  let dt = (t1 - t0) / f32(steps);
  let jitterStrength = clamp01(params.g.groundShadowJitter);
  var dens = 0.0;
  var used = 0;
  for (var i = 0; i < GROUND_SHADOW_MAX_STEPS; i++) {
    if (i >= steps) { break; }
    let stable = groundShadowHash(shadowCell, u32(i), phase);
    let stratumOffset = mix(0.5, stable, jitterStrength);
    let sp = p + sd * (t0 + dt * (f32(i) + stratumOffset));
    dens += densityAt(sp) * dt;
    used = i + 1;
    if (dens * params.g.shadowDarkness > 4.6) {
      return GroundShadowResult(0.01, f32(used));
    }
  }
  return GroundShadowResult(exp(-dens * params.g.shadowDarkness), f32(used));
}

fn cloudShadowAt(p : vec3f) -> GroundShadowResult {
  let mode = i32(round(params.g.groundShadowMode));
  if (mode == 0) {
    return legacyGroundShadow(p);
  }
  if (mode == 2 && params.g.groundShadowMapValid > 0.5) {
    let extent = max(params.g.boxHalfExtent, 0.001);
    let uv = p.xz / (2.0 * extent) + 0.5;
    let edgeDistance = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
    if (edgeDistance > 0.0) {
      let cached = textureSampleLevel(groundShadowTex, groundShadowSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0);
      let mapWeight = smoothstep(0.0, max(params.g.groundShadowMapGuard, 0.0001), edgeDistance);
      if (mapWeight >= 0.999) {
        return GroundShadowResult(cached.r, cached.g * params.g.groundShadowMaxSteps);
      }
      let fallback = integrateGroundShadow(p, groundShadowWorldCell(p.xz), 0u);
      return GroundShadowResult(mix(fallback.transmittance, cached.r, mapWeight), mix(fallback.samples, cached.g * params.g.groundShadowMaxSteps, mapWeight));
    }
  }
  return integrateGroundShadow(p, groundShadowWorldCell(p.xz), 0u);
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
  let shadowResult = cloudShadowAt(vec3f(gp.x, GROUND_Y + groundHeight(gp.xz), gp.z));
  let shadow = shadowResult.transmittance;

  let base = vec3f(0.10, 0.62, 0.06);
  let tint = noise_fbm(vec4f(gp.xz * 0.6, 0.0, 0.0), 4.0, 0.5, 2.0, true) * 0.5 + 0.5;
  let albedo = base * mix(0.82, 1.12, tint);

  let direct = skyC.sun * (ndl * params.g.sunIntensity * 0.6) * shadow;
  let ambient = skyC.ambient * 0.55;
  return albedo * (direct + ambient);
}

fn applyAerial(col : vec3f, dist : f32, midY : f32, opacity : f32, skyC : SkyColors, sunTheta : f32) -> vec3f {
  let sigma = params.g.aerialDensity * exp(-max(midY, 0.0) * params.g.aerialHeightFalloff);
  let trans = exp(-sigma * dist);
  let haze = mix(skyC.bg, skyC.sun, 0.6 * pow(clamp01(sunTheta), 8.0) * clamp01(params.g.aerialInscatter));
  return col * trans + haze * (1.0 - trans) * opacity;
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
  let texelNdc = vec2f(dpdx(uv.x), dpdy(uv.y));
  let jitterOn = select(1.0, 0.0, params.g.debugView > 0.5);
  let uvJ = uv + vec2f(params.g.jitterX, params.g.jitterY) * texelNdc * jitterOn;
  let world_near = camera.invViewProj * vec4f(uvJ, 0.0, 1.0);
  let world_far  = camera.invViewProj * vec4f(uvJ, 1.0, 1.0);
  let ro = camera.position;
  let rd = normalize(world_far.xyz/world_far.w - world_near.xyz/world_near.w);

  let hit = intersectBox(ro, rd);

  let SUN_DIR = sunDir();
  let skyC = todColors();
  let sky = mix(skyC.bg, skyC.top, clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
  let sunTheta = dot(rd, SUN_DIR);
  let blend = clamp01(params.g.typeLightingBlend);

  var transmittance = 1.0;
  var color = vec3f(0.0);
  var iterCount = 0;
  var depthSum = 0.0;
  var depthW = 0.0;
  var cloudDepth = 1e4;
  var accSunDisc = 0.0;
  var accHalo = 0.0;
  var accFxW = 0.0;

  if (hit.hit) {
    let tEntry = max(hit.tNear, 0.0);
    let tExit  = hit.tFar;
    let baseStep = (tExit - tEntry) / f32(numSteps);
    var dither = interleavedGradientNoise(fragCoord.xy);
    if (params.g.temporalDither > 0.5) {
      dither = fract(dither + fract(params.g.frameIndex * 0.61803398875) * 0.25);
    }

    var t = tEntry + baseStep * dither;
    var mult = 1.0;
    var empties = 0;
    transmittance = 1.0;
    color = vec3f(0.0);
    depthSum = 0.0;
    depthW = 0.0;
    let phaseGlobal = mix(1.0, dualHG(sunTheta), 0.6);
    let bmin = boxMin();
    let boxMax = getBoxMax();
    let adaptive = params.g.adaptiveMarch > 0.5;
    const ABS_K = 22.0;

    for (var i = 0u; i < RAYMARCH_MAX_STEPS; i++) {
      if (i32(i) >= numSteps) { break; }
      if (t >= tExit) { break; }
      iterCount = i32(i) + 1;
      let pos = ro + rd * t;
      let dt = densityAtTyped(pos);
      let d = dt.x;
      if (d > 0.01) {
        if (mult > 1.0) {
          t = t - baseStep * (mult - 1.0);
          mult = 1.0;
          empties = 0;
          continue;
        }
        let L = blendedLighting(dt.y, dt.z, dt.w);
        let extinction = mix(1.0, L.absorption * ABS_K, blend * params.g.fxAbsorption);
        let sigma = d * extinction;
        let step_trans = exp(-sigma * baseStep);
        var shadow = 1.0;
        var opticalDepth = 0.0;
        if (!skipLight) {
          opticalDepth = lightMarchDepth(pos);
          shadow = sunVisibility(opticalDepth, sunTheta);
        }
        let phaseType = mix(1.0, mix(hgPhase(sunTheta, L.phaseBack), csPhase(sunTheta, L.phaseFwd), clamp01(params.g.hgBlend)), 0.6);
        let phase = mix(phaseGlobal, phaseType, blend);
        let powder = mix(1.0, 1.0 - exp(-d * 4.0), clamp01(params.g.powderStrength));
        let zN = clamp((pos.y - bmin.y) / max(boxMax.y - bmin.y, 0.001), 0.0, 1.0);
        let densW = smoothstep(0.6, 1.4, d);
        let heightLight = mix(1.0, mix(0.75, 1.18, smoothstep(0.0, 1.0, zN)), densW);
        let darkAmt = mix(0.0, L.baseDark, blend);
        let darkMul = 1.0 - darkAmt * (1.0 - zN) * densW;
        let msMod = msDensityHeightMod(d, zN, opticalDepth);
        let shadowMix = clamp01(params.g.shadowTintStrength) * (1.0 - shadow);
        var ambLit: vec3f;
        if (params.g.heightAmbientModel > 0.5) {
          // Sky Ocean Sun skyRay ambient: low zN colder, high zN brighter blue; white fades above mid-height.
          // Scale 0.5 keeps daytime mean near legacy ambTint*0.5.
          let heightAmb = (0.5 + 0.6 * zN) * skyC.ambient + max(0.0, 1.0 - 2.0 * zN) * vec3f(0.85);
          ambLit = mix(heightAmb, skyC.shadow, shadowMix) * 0.5;
        } else {
          ambLit = mix(skyC.ambient, skyC.shadow, shadowMix) * 0.5;
        }
        let energyOn = params.g.energyConservingScatter > 0.5;
        let tGate = select(transmittance, 1.0, energyOn);
        var sunPart = shadow * phase * powder * msMod * heightLight * darkMul * params.g.sunIntensity;
        if (!energyOn) {
          sunPart = sunPart * (1.0 - exp(-d * 1.0));
        }
        var litColor = skyC.sun * sunPart + ambLit;
        litColor += skyC.sun * mix(0.0, L.sss, blend) * pow(max(sunTheta, 0.0), 3.0) * exp(-d * 2.0) * tGate * 0.5;
        let silverScale = mix(1.0, L.silver, blend);
        let silverGate = params.g.silverIntensity * silverScale;
        if (sunTheta > 0.0 && silverGate > 0.001) {
          let probeOffset = max(params.g.lightMarchStepSize, 0.001) * 2.0;
          let edgeDens = densityAt(pos + SUN_DIR * probeOffset);
          let edgeThin = exp(-edgeDens * 3.0);
          litColor *= 1.0 + silverGate * pow(clamp01(sunTheta), 4.0) * edgeThin * tGate;
        }
        let lightningAmt = mix(0.0, L.lightning, blend);
        if (lightningAmt > 0.001) {
          let flashSeed = dt.y * 17.13 + dt.z * 9.71;
          let pulse = pow(max(sin(params.g.sceneTime * 2.3 + flashSeed), 0.0), 24.0);
          litColor += vec3f(1.0, 0.85, 0.55) * pulse * lightningAmt * densW * 2.5;
        }

        let w = transmittance * (1.0 - step_trans);
        // Energy path: Frostbite analytic step — (1-e^{-σΔt})·(σ_s Li)/σ ≈ w·(albedo·Li)
        // when σ_s≈σ (sunPart already omits legacy (1-e^{-d})). Legacy keeps (1-e^{-d}) inside sunPart.
        color += w * litColor;
        depthSum += w * t;
        depthW += w;
        accSunDisc += w * L.sunDisc;
        accHalo += w * L.halo;
        accFxW += w;
        transmittance *= step_trans;
        let cutoff = 0.01;
        if (transmittance < cutoff) { break; }
        empties = 0;
        t = t + baseStep;
      } else if (d > 0.002) {
        if (mult > 1.0) {
          t = t - baseStep * (mult - 1.0);
          mult = 1.0;
          empties = 0;
          continue;
        }
        empties = 0;
        t = t + baseStep;
      } else {
        empties = empties + 1;
        if (adaptive && empties >= 4) { mult = min(mult * 2.0, 4.0); }
        t = t + baseStep * mult;
      }
    }
    cloudDepth = select(1e4, depthSum / depthW, depthW > 1e-4);
    if (depthW > 1e-4) {
      let midY = (ro.y + rd.y * cloudDepth) * 0.5;
      color = applyAerial(color, cloudDepth, midY, 1.0 - transmittance, skyC, sunTheta);
    }
  }

  let sunDiscAmt = select(0.0, (accSunDisc / accFxW) * blend, accFxW > 1e-4);
  let haloAmt = select(0.0, (accHalo / accFxW) * blend, accFxW > 1e-4);
  let sunPower = mix(64.0, 16.0, clamp01(sunDiscAmt));
  let sunGain = mix(0.8, 1.2, clamp01(sunDiscAmt));
  var sunDisc = pow(max(sunTheta, 0.0), sunPower) * skyC.sun * sunGain;
  if (sunDiscAmt > 0.001) {
    sunDisc *= mix(1.0, smoothstep(0.0, 0.85, transmittance), clamp01(sunDiscAmt));
  }
  var halo = vec3f(0.0);
  if (haloAmt > 0.001 && SUN_DIR.y > 0.0) {
    let angle = acos(clamp(sunTheta, -1.0, 1.0));
    let halo0 = 0.3839724354387525;
    let width = 0.02617993877991494;
    let ring = exp(-((angle - halo0) / width) * ((angle - halo0) / width));
    halo = skyC.sun * ring * haloAmt * 0.55;
  }
  let finalSky = sky + sunDisc + halo;

  var background = finalSky;
  if (rd.y < -0.0001) {
    let tGround = (GROUND_Y - ro.y) / rd.y;
    if (tGround > 0.0) {
      let gp = ro + rd * tGround;
      let gcol = groundColor(gp, skyC);
      let gAerial = applyAerial(gcol, tGround, 0.0, 1.0, skyC, sunTheta);
      let horizon = smoothstep(0.0, 0.06, -rd.y);
      background = mix(finalSky, gAerial, horizon);
    }
  }

  var outColor = color + transmittance * background;
  if (!hit.hit) {
    outColor = background;
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
    if (dv == 6) {
      let nd = 1.0 - clamp(cloudDepth / (max(params.g.boxHalfExtent, 0.01) * 6.0), 0.0, 1.0);
      return vec4f(vec3f(nd), 1.0);
    }
    if (dv == 4 || dv == 5) {
      let bmin = boxMin();
      let planeY = bmin.y + params.g.cloudHeight * 0.5;
      let tPlane = (planeY - ro.y) / rd.y;
      if (abs(rd.y) < 1e-4 || tPlane <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
      let p = ro + rd * tPlane;
      let spanXZ = max(boxMaxXZ() - bmin.x, 0.001);
      let wUv = (vec2f(p.x, p.z) - vec2f(bmin.x, bmin.z)) / spanXZ;
      if (wUv.x < 0.0 || wUv.x > 1.0 || wUv.y < 0.0 || wUv.y > 1.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
      if (dv == 4) {
        var cov = 0.0;
        let n = i32(params.g.activeBodyCount);
        let wCurve = max(params.g.edgeCurveWidth, 0.01);
        let wShaper = max(params.g.edgeCurveShaper, 0.01);
        for (var i = 0; i < MAX_BODIES; i++) {
          if (i >= n) { break; }
          if (params.bodies[i].geom.w < 0.5) { continue; }
          let s = textureSampleLevel(weatherTex, weatherSampler, wUv, i, 0.0).r;
          let c = pow(smoothstep(0.5 - wCurve, 0.5, s), wShaper);
          cov = max(cov, c);
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

  return vec4f(outColor, cloudDepth);
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

@compute @workgroup_size(8, 8, 1)
fn csGroundShadow(@builtin(global_invocation_id) gid : vec3u) {
  let dims = textureDimensions(groundShadowStore);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let extent = params.g.boxHalfExtent;
  let xz = (uv - 0.5) * (2.0 * extent);
  let p = vec3f(xz.x, GROUND_Y + groundHeight(xz), xz.y);
  let result = integrateGroundShadow(p, gid.xy, groundShadowPhase());
  let normalizedSamples = result.samples / max(params.g.groundShadowMaxSteps, 1.0);
  textureStore(groundShadowStore, vec2i(gid.xy), vec4f(result.transmittance, normalizedSamples, 0.0, 1.0));
}
