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
  _pad0           : f32,
  _pad1           : f32,
};

struct BodyGPU {
  geom : vec4f, // x=base, y=altTop, z=typeIdx, w=enabled
  wind : vec4f, // x=dirX, y=dirY, z=speed, w=morphRate
  intensity : vec4f, // x=coverage, y=densityScale, z=morph
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
};

const PRESET_COUNT = 10;
const DENSITY_SCALE_MAX = 2.0;
const VERTICAL_EDGE_RANGE = 0.55;
const VERTICAL_EDGE_SHAPE = 2.0;

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

fn sampleDensity(pos: vec3f) -> f32 {
  let uvw = (pos - BOX_MIN) / (getBoxMax() - BOX_MIN);
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return 0.0;
  }
  let a = textureSampleLevel(densityTex0, densitySampler, uvw, 0.0).r;
  let b = textureSampleLevel(densityTex1, densitySampler, uvw, 0.0).r;
  let blend = clamp(params.g.cacheBlend, 0.0, 1.0);
  let density = mix(a, b, blend);
  return density;
}

// ------------------------------------------------------------
// Cloud Density (100% Blender Node Graph Match)
// ------------------------------------------------------------

fn cloudDensity(pos : vec3f) -> f32 {
  // Blender "Object" coordinates for a cloud body (Z-up). World Y is Blender Z.
  let objPosRaw = vec3f(pos.x, pos.z, pos.y);
  var total = 0.0;
  for (var i = 0; i < MAX_BODIES; i++) {
    if (params.bodies[i].geom.w < 0.5) { continue; }
    total += evalBody(pos, objPosRaw, i);
  }
  return total;
}

fn evalBody(pos : vec3f, objPosRaw : vec3f, i : i32) -> f32 {
  let b = params.bodies[i];

  let mt = params.g.sceneTime * b.wind.w;
  let timeNoise     = mt;
  let timeVoronoi1  = mt;
  let timeVoronoi2  = mt;

  let lowAltDens    = 0.2;
  let factorDetail  = 1.0;
  let factorShaper  = 1.0;

  // Per-body horizontal advection of the (infinite) procedural sampling domain.
  let advect = vec3f(b.wind.x, b.wind.y, 0.0) * (b.wind.z * params.g.sceneTime);
  let objPos = objPosRaw - advect;

  // Normalized horizontal silhouette from this body's shape layer.
  let wUv = (objPosRaw.xy - vec2f(BOX_MIN.x, BOX_MIN.z)) / (BOX_MAX_XZ - BOX_MIN.x);
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

  let zNorm = (pos.y - BOX_MIN.y) / (getBoxMax().y - BOX_MIN.y);
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
  let vT = clamp01(abs(zNorm - vMid) / vHalf);
  let vEnvelope = pow(vT, VERTICAL_EDGE_SHAPE) * VERTICAL_EDGE_RANGE;
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

const BOX_MIN = vec3f(-4.5, 0.0, -4.5); // Reduced bounds
const BOX_MAX_XZ = 4.5;

fn getBoxMax() -> vec3f {
  return vec3f(BOX_MAX_XZ, params.g.cloudHeight, BOX_MAX_XZ);
}

struct HitInfo {
  hit   : bool,
  tNear : f32,
  tFar  : f32,
};

fn intersectBox(ro : vec3f, rd : vec3f) -> HitInfo {
  let invRd = 1.0 / rd;
  let t0 = (BOX_MIN - ro) * invRd;
  let t1 = (getBoxMax() - ro) * invRd;
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
  let bg  = mix(vec3f(0.20, 0.09, 0.10), vec3f(0.045, 0.10, 0.18), tk);
  let top = mix(vec3f(0.35, 0.20, 0.18), vec3f(0.1, 0.2, 0.4), tk);
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

fn densityAt(pos : vec3f) -> f32 {
  let mode = i32(params.g.qualityMode);
  if (mode == 2) {
    return cloudDensity(pos);
  }
  var base = sampleDensity(pos);
  if (mode == 1 && base > 0.01) {
    base = base * (1.0 + params.g.detailStrength * detailNoise(pos));
  }
  return max(base, 0.0);
}

fn lightMarch(pos : vec3f) -> f32 {
  var shadow = 0.0;
  let steps = i32(params.g.lightMarchSteps);
  let stepSize = 0.15;
  let sd = sunDir();
  for (var i = 1; i <= steps; i++) {
    let p = pos + sd * (f32(i) * stepSize);
    shadow += densityAt(p) * stepSize;
  }
  return exp(-shadow * params.g.shadowDarkness); 
}

fn interleavedGradientNoise(uv: vec2f) -> f32 {
    let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
    return fract(magic.z * fract(dot(uv, magic.xy)));
}

const GROUND_Y = 0.0;

fn groundHeight(xz : vec2f) -> f32 {
  let n = noise_fbm(vec4f(xz * 0.18, 0.0, 0.0), 3.0, 0.5, 2.0, true);
  return n * 0.35;
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

  let base = vec3f(0.34, 0.40, 0.24);
  let tint = noise_fbm(vec4f(gp.xz * 0.6, 0.0, 0.0), 4.0, 0.5, 2.0, true) * 0.5 + 0.5;
  let albedo = base * mix(0.82, 1.12, tint);

  let direct = skyC.sun * (ndl * params.g.sunIntensity * 0.6) * shadow;
  let ambient = skyC.ambient * 0.55;
  return albedo * (direct + ambient);
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

  if (hit.hit) {
    let tEntry = max(hit.tNear, 0.0);
    let tExit  = hit.tFar;
    let stepSize = (tExit - tEntry) / f32(numSteps);
    let dither = interleavedGradientNoise(fragCoord.xy);
    
    var pos = ro + rd * (tEntry + stepSize * dither);
    var transmittance = 1.0;
    var color = vec3f(0.0);
    let phase = mix(1.0, dualHG(sunTheta), 0.6);
    let boxMax = getBoxMax();

    for (var i = 0; i < numSteps; i++) {
      let d = densityAt(pos);
      if (d > 0.01) {
        let step_trans = exp(-d * stepSize);
        let shadow = select(lightMarch(pos), 1.0, skipLight);
        var scattering = shadow * phase * (1.0 - exp(-d * 1.0));
        scattering *= mix(1.0, 1.0 - exp(-d * 4.0), clamp01(params.g.powderStrength));
        let zN = clamp((pos.y - BOX_MIN.y) / (boxMax.y - BOX_MIN.y), 0.0, 1.0);
        let densW = smoothstep(0.6, 1.4, d);
        let heightLight = mix(1.0, mix(0.75, 1.18, smoothstep(0.0, 1.0, zN)), densW);
        scattering *= heightLight;
        var litColor = skyC.sun * scattering * params.g.sunIntensity + skyC.ambient * 0.5;
        litColor *= 1.0 + params.g.silverIntensity * pow(clamp01(sunTheta), 4.0) * transmittance;

        color += transmittance * (1.0 - step_trans) * litColor;
        transmittance *= step_trans;
        let cutoff = 0.01;
        if (transmittance < cutoff) { break; }
      }
      pos += rd * stepSize;
    }
    outColor = color + transmittance * background;
  }
    
  outColor = outColor / (outColor + vec3f(1.0));
  outColor = pow(outColor, vec3f(1.0 / 2.2));
  return vec4f(outColor, 1.0);
}

// ============================================================
// Density Cache Compute
// ============================================================

@compute @workgroup_size(8, 8, 4)
fn cs(@builtin(global_invocation_id) gid : vec3u) {
  let dims = textureDimensions(densityStore);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) { return; }

  let uvw = (vec3f(gid) + 0.5) / vec3f(dims);
  let pos = mix(BOX_MIN, getBoxMax(), uvw);
  let d = cloudDensity(pos);
  textureStore(densityStore, vec3i(gid), vec4f(d, 0.0, 0.0, 1.0));
}
