import groundShadowResolveSource from '../shaders/ground-shadow-resolve.wgsl?raw';
import densitySharedDebugSource from '../shaders/density-shared-debug.wgsl?raw';
import {
  packParams,
  packBodies,
  packPresetArray,
  PARAMS_FLOAT_COUNT,
  PARAMS_BYTE_SIZE,
  PRESET_BYTE_SIZE,
  MAX_BODIES,
  type CloudParams,
} from './params';
import { DEFAULT_WEATHER_SIZE, DEFAULT_BOX_HALF_EXTENT, createShapeData, paintBodyShapes } from './weather';
import { geometrySignature, bodyCenterWorld, GIZMO_AXIS_LEN, GIZMO_RING_RADIUS, type CloudBody } from './body';
import { buildAxisMesh } from './axis';
import type { BodyMod } from './lifecycle';
import type { CameraFrame } from './camera';
import { DEFAULT_SCENE_SCALE, bodyToRenderSpace, bodyToTransportedRenderSpace, metersToWorldXZ, metersToWorldY, normalizedSceneScale, type SceneScale } from './space';
import type { WindAdvectionSample } from './wind';
import { LegacyDensityAdapter } from './density/legacyDensityAdapter';
import { DensityProducerSelector } from './density/densityProducerSelector';
import { createRecipeDensityV2Adapter } from './density/recipeDensityV2Adapter';
import {
  DENSITY_PRODUCER_MODE,
  type DensityFrameInput,
  type DensityProducerKind,
  type DensitySharedFieldStats,
  type DensityTileMaskStats,
  type DensityV2EvaluatorStats,
  type DensityBrickStats,
} from './density/contracts';
import { createLegacyDensityPipelineResources } from './density/legacyDensityPipeline';
import {
  createDensityQualityBindings,
  createDensityQualityPipelineBundle,
  DensityQualityPipelineManager,
} from './rendering/densityQualityPipelines';
import {
  densityQualityKindFromMode,
  densityQualityModeFromKind,
  type DensityQualityBindings,
  type DensityQualityKind,
  type DensityQualityPipelineState,
} from './rendering/densityQualityContracts';

const OFFSCREEN_FORMAT: GPUTextureFormat = 'rgba16float';

function halton(index: number, base: number): number {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

const BLOOM_LEVELS = 5;

const bloomShaderSource = /* wgsl */ `
struct BloomU { texelSize : vec4f, params : vec4f };
@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var inputSamp : sampler;
@group(0) @binding(2) var<uniform> u : BloomU;
struct VOut { @builtin(position) pos : vec4f };
@vertex fn vsBloom(@builtin(vertex_index) vi : u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o : VOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  return o;
}
fn luminance(c : vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
@fragment fn fsBloomExtract(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = (fc.xy + 0.5) / u.texelSize.zw;
  let col = textureSampleLevel(inputTex, inputSamp, uv, 0.0).rgb * u.params.y;
  let lum = luminance(col);
  let contrib = max(lum - u.params.x, 0.0);
  return vec4f(col * (contrib / max(lum, 1e-5)), 1.0);
}
@fragment fn fsBloomDown(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = (fc.xy + 0.5) / u.texelSize.zw;
  let ts = u.texelSize.xy;
  var col = textureSampleLevel(inputTex, inputSamp, uv, 0.0).rgb * 4.0;
  col += textureSampleLevel(inputTex, inputSamp, uv - vec2f(ts.x, 0.0), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(ts.x, 0.0), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv - vec2f(0.0, ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(0.0, ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(-ts.x, -ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(ts.x, -ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(-ts.x, ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(ts.x, ts.y), 0.0).rgb;
  return vec4f(col / 12.0, 1.0);
}
@fragment fn fsBloomUp(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = (fc.xy + 0.5) / u.texelSize.zw;
  let ts = u.texelSize.xy * 2.0;
  var col = textureSampleLevel(inputTex, inputSamp, uv, 0.0).rgb * 4.0;
  col += textureSampleLevel(inputTex, inputSamp, uv - vec2f(ts.x, 0.0), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(ts.x, 0.0), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv - vec2f(0.0, ts.y), 0.0).rgb;
  col += textureSampleLevel(inputTex, inputSamp, uv + vec2f(0.0, ts.y), 0.0).rgb;
  return vec4f(col / 8.0, 1.0);
}
`;

const postShaderSource = /* wgsl */ `
struct Post { sun : vec4f, flags : vec4f, bloom : vec4f };
@group(0) @binding(0) var sceneTex : texture_2d<f32>;
@group(0) @binding(1) var sceneSamp : sampler;
@group(0) @binding(2) var<uniform> post : Post;
@group(0) @binding(3) var bloomTex : texture_2d<f32>;
struct VOut { @builtin(position) pos : vec4f };
fn acesNarkowicz(x : vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn agx(colIn : vec3f) -> vec3f {
  let agx_mat = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let agx_mat_inv = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  let min_ev = -12.47393;
  let max_ev = 4.026069;
  var col = agx_mat * colIn;
  col = clamp(log2(max(col, vec3f(1e-10))), vec3f(min_ev), vec3f(max_ev));
  col = (col - vec3f(min_ev)) / (max_ev - min_ev);
  let x2 = col * col;
  let x4 = x2 * x2;
  col = 15.5 * x4 * x2 - 40.14 * x4 * col + 31.96 * x4 - 6.868 * x2 * col + 0.4298 * x2 + 0.1191 * col - 0.00232;
  col = agx_mat_inv * col;
  return clamp(col, vec3f(0.0), vec3f(1.0));
}
@vertex fn vsPost(@builtin(vertex_index) vi : u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o : VOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  return o;
}
@fragment fn fsPost(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(sceneTex));
  let uv = fc.xy / dims;
  var col = textureSampleLevel(sceneTex, sceneSamp, uv, 0.0).rgb;
  if (post.flags.x > 0.5) { return vec4f(col, 1.0); }
  col = col * max(post.flags.z, 0.01);
  if (post.flags.w > 0.5 && post.bloom.y > 0.0) {
    let bloomCol = textureSampleLevel(bloomTex, sceneSamp, uv, 0.0).rgb;
    col += bloomCol * post.bloom.y;
  }
  let strength = post.sun.z;
  let vis = post.sun.w;
  if (strength > 0.0 && vis > 0.5) {
    let NUM = 48;
    let density = 0.9;
    let delta = (uv - post.sun.xy) * (density / f32(NUM));
    var p = uv;
    var illum = 1.0;
    let decay = 0.95;
    var acc = vec3f(0.0);
    for (var i = 0; i < NUM; i++) {
      p -= delta;
      acc += textureSampleLevel(sceneTex, sceneSamp, p, 0.0).rgb * illum;
      illum *= decay;
    }
    col += (acc / f32(NUM)) * strength;
  }
  let mode = i32(post.flags.y);
  if (mode == 1) {
    col = acesNarkowicz(col);
  } else if (mode == 2) {
    col = agx(col);
    col = pow(col, vec3f(2.2));
  } else {
    col = col / (col + vec3f(1.0));
  }
  col = pow(col, vec3f(1.0 / 2.2));
  return vec4f(col, 1.0);
}
`;

const taaShaderSource = /* wgsl */ `
struct TaaU { prevViewProj : mat4x4f, invViewProj : mat4x4f, camPos : vec4f, flags : vec4f };
@group(0) @binding(0) var sceneTex : texture_2d<f32>;
@group(0) @binding(1) var historyTex : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var<uniform> u : TaaU;
fn rgb2ycocg(c : vec3f) -> vec3f {
  return vec3f(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
fn ycocg2rgb(c : vec3f) -> vec3f {
  let t = c.x - c.z;
  return vec3f(t + c.y, c.x + c.z, t - c.y);
}
struct VOut { @builtin(position) pos : vec4f };
@vertex fn vsTaa(@builtin(vertex_index) vi : u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o : VOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  return o;
}
@fragment fn fsTaa(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(sceneTex));
  let uv = fc.xy / dims;
  let cur = textureSampleLevel(sceneTex, samp, uv, 0.0);
  if (u.flags.x < 0.5) { return cur; }
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let pNear = u.invViewProj * vec4f(ndc, 0.0, 1.0);
  let pFar  = u.invViewProj * vec4f(ndc, 1.0, 1.0);
  let rd = normalize(pFar.xyz / pFar.w - pNear.xyz / pNear.w);
  let worldPos = u.camPos.xyz + rd * cur.a;
  let prevClip = u.prevViewProj * vec4f(worldPos, 1.0);
  if (prevClip.w <= 0.0) { return cur; }
  let prevNdc = prevClip.xy / prevClip.w;
  let prevUv = vec2f(prevNdc.x * 0.5 + 0.5, 0.5 - prevNdc.y * 0.5);
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) { return cur; }
  var hist = textureSampleLevel(historyTex, samp, prevUv, 0.0).rgb;
  let texel = 1.0 / dims;
  var m1 = vec3f(0.0);
  var m2 = vec3f(0.0);
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let s = textureSampleLevel(sceneTex, samp, uv + vec2f(f32(x), f32(y)) * texel, 0.0).rgb;
      let yc = rgb2ycocg(s);
      m1 = m1 + yc;
      m2 = m2 + yc * yc;
    }
  }
  let mean = m1 / 9.0;
  let variance = max(m2 / 9.0 - mean * mean, vec3f(0.0));
  let extent = sqrt(variance);
  let center = mean;
  let histY = rgb2ycocg(hist);
  let dir = histY - center;
  var tScale = 1.0;
  if (abs(dir.x) > 1e-5) { tScale = min(tScale, extent.x / abs(dir.x)); }
  if (abs(dir.y) > 1e-5) { tScale = min(tScale, extent.y / abs(dir.y)); }
  if (abs(dir.z) > 1e-5) { tScale = min(tScale, extent.z / abs(dir.z)); }
  tScale = clamp(tScale, 0.0, 1.0);
  hist = ycocg2rgb(center + dir * tScale);
  let outRgb = mix(cur.rgb, hist, u.flags.y);
  return vec4f(outRgb, cur.a);
}
`;

const TOD_KNOTS = [-15, -6, 0, 5, 12, 25, 45, 90];
const TOD_BG_LEGACY: [number, number, number][] = [
  [0.02, 0.03, 0.07],
  [0.25, 0.12, 0.15],
  [0.55, 0.25, 0.15],
  [0.60, 0.38, 0.22],
  [0.48, 0.45, 0.50],
  [0.38, 0.52, 0.75],
  [0.32, 0.55, 0.84],
  [0.30, 0.55, 0.85],
];
const TOD_BG_ART: [number, number, number][] = [
  [0.020, 0.020, 0.063],
  [0.039, 0.102, 0.200],
  [0.102, 0.200, 0.400],
  [0.200, 0.400, 0.667],
  [0.333, 0.600, 0.800],
  [0.400, 0.600, 0.800],
  [0.267, 0.533, 0.733],
  [0.267, 0.533, 0.733],
];

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function sampleTodBg(elevDeg: number, table: [number, number, number][]): [number, number, number] {
  const e = Math.max(TOD_KNOTS[0], Math.min(TOD_KNOTS[7], elevDeg));
  let i = 0;
  for (let k = 0; k < 7; k++) if (e >= TOD_KNOTS[k]) i = k;
  const span = TOD_KNOTS[i + 1] - TOD_KNOTS[i];
  const u = span > 1e-6 ? (e - TOD_KNOTS[i]) / span : 0;
  const tt = u * u * (3 - 2 * u);
  return mix3(table[i], table[i + 1], tt);
}

function todBackground(elevDeg: number, paletteBlend = 1): { r: number; g: number; b: number; a: number } {
  const blend = Math.max(0, Math.min(1, paletteBlend));
  const c = mix3(sampleTodBg(elevDeg, TOD_BG_LEGACY), sampleTodBg(elevDeg, TOD_BG_ART), blend);
  return { r: c[0], g: c[1], b: c[2], a: 1.0 };
}

const lineShaderSource = /* wgsl */ `
struct LineCam { viewProj : mat4x4f, tint : vec4f };
@group(0) @binding(0) var<uniform> cam : LineCam;
struct VOut { @builtin(position) pos : vec4f, @location(0) color : vec3f };
@vertex fn vsLine(@location(0) p : vec3f, @location(1) c : vec3f) -> VOut {
  var o : VOut;
  o.pos = cam.viewProj * vec4f(p, 1.0);
  o.color = c * cam.tint.x;
  return o;
}
@fragment fn fsLine(i : VOut) -> @location(0) vec4f { return vec4f(i.color, 1.0); }
`;

const MAX_LINE_VERTS = 8192;
const MAX_AXIS_VERTS = 16384;
const BODY_COLORS: [number, number, number][] = [
  [0.2, 1.0, 0.35],
  [1.0, 0.6, 0.12],
  [0.3, 0.7, 1.0],
  [1.0, 0.3, 0.7],
  [0.9, 0.9, 0.2],
  [0.5, 0.4, 1.0],
];

function buildLineVerts(bodies: CloudBody[], boxHeight: number, selectedId: string | null): Float32Array {
  const out: number[] = [];
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, col: [number, number, number]) => {
    out.push(ax, ay, az, col[0], col[1], col[2]);
    out.push(bx, by, bz, col[0], col[1], col[2]);
  };
  bodies.forEach((b, i) => {
    const baseCol = BODY_COLORS[i % BODY_COLORS.length];
    const sel = b.id === selectedId;
    const col: [number, number, number] = sel
      ? [Math.min(1, baseCol[0] + 0.4), Math.min(1, baseCol[1] + 0.4), Math.min(1, baseCol[2] + 0.4)]
      : [baseCol[0] * 0.5, baseCol[1] * 0.5, baseCol[2] * 0.5];
    const y0 = b.base;
    const y1 = Math.min(boxHeight, b.base + b.thickness);
    const [minX, minZ, maxX, maxZ] = b.bounds;
    const corners: [number, number][] = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = corners[k];
      const [nx, nz] = corners[(k + 1) % 4];
      seg(cx, y0, cz, nx, y0, nz, col);
      seg(cx, y1, cz, nx, y1, nz, col);
      seg(cx, y0, cz, cx, y1, cz, col);
    }
  });
  return new Float32Array(out);
}

const AXIS_DIRS: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const AXIS_COLS: [number, number, number][] = [
  [1.0, 0.27, 0.27],
  [0.4, 1.0, 0.35],
  [0.32, 0.55, 1.0],
];

function buildGizmoVerts(body: CloudBody, cloudHeight: number, mode: 'move' | 'rotate' | 'scale'): Float32Array {
  const out: number[] = [];
  const seg = (a: number[], b: number[], c: [number, number, number]) => {
    out.push(a[0], a[1], a[2], c[0], c[1], c[2]);
    out.push(b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const perp = (d: number[]): [number[], number[]] => {
    const u = d[1] === 1 ? [1, 0, 0] : [0, 1, 0];
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const vl = Math.hypot(v[0], v[1], v[2]) || 1;
    const vn = [v[0] / vl, v[1] / vl, v[2] / vl];
    const un = [vn[1] * d[2] - vn[2] * d[1], vn[2] * d[0] - vn[0] * d[2], vn[0] * d[1] - vn[1] * d[0]];
    return [un, vn];
  };
  const wireCube = (center: number[], d: number[], s: number, col: [number, number, number]) => {
    const [u, v] = perp(d);
    const p = (i: number, j: number, k: number) => [
      center[0] + d[0] * s * i + u[0] * s * j + v[0] * s * k,
      center[1] + d[1] * s * i + u[1] * s * j + v[1] * s * k,
      center[2] + d[2] * s * i + u[2] * s * j + v[2] * s * k,
    ];
    const c = [
      p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1),
      p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1),
    ];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      seg(c[i], c[j], col);
    }
  };
  const [ox, oy, oz] = bodyCenterWorld(body, cloudHeight);
  if (mode === 'move') {
    const L = GIZMO_AXIS_LEN;
    for (let a = 0; a < 3; a++) {
      const d = AXIS_DIRS[a];
      const col = AXIS_COLS[a];
      const tip = [ox + d[0] * L, oy + d[1] * L, oz + d[2] * L];
      seg([ox, oy, oz], tip, col);
      const back = 0.18;
      const w = 0.09;
      const [, v] = perp(d);
      const bp = [tip[0] - d[0] * back, tip[1] - d[1] * back, tip[2] - d[2] * back];
      seg(tip, [bp[0] + v[0] * w, bp[1] + v[1] * w, bp[2] + v[2] * w], col);
      seg(tip, [bp[0] - v[0] * w, bp[1] - v[1] * w, bp[2] - v[2] * w], col);
    }
  } else if (mode === 'scale') {
    const L = GIZMO_AXIS_LEN;
    const hs = 0.16;
    for (let a = 0; a < 3; a++) {
      const d = AXIS_DIRS[a];
      const col = AXIS_COLS[a];
      const tip = [ox + d[0] * L, oy + d[1] * L, oz + d[2] * L];
      seg([ox, oy, oz], tip, col);
      wireCube(tip, d, hs, col);
    }
  } else {
    const R = GIZMO_RING_RADIUS;
    const N = 48;
    for (let a = 0; a < 3; a++) {
      const col = AXIS_COLS[a];
      for (let k = 0; k < N; k++) {
        const t0 = (k / N) * Math.PI * 2;
        const t1 = ((k + 1) / N) * Math.PI * 2;
        const pt = (t: number): number[] => {
          const c = Math.cos(t) * R;
          const s = Math.sin(t) * R;
          if (a === 0) return [ox, oy + c, oz + s];
          if (a === 1) return [ox + c, oy, oz + s];
          return [ox + c, oy + s, oz];
        };
        seg(pt(t0), pt(t1), col);
      }
    }
  }
  return new Float32Array(out);
}

export interface RenderStats {
  gpuTiming: boolean;
  gpuTimingError: string;
  gpuSampleId: number;
  cacheSampleId: number;
  brickSampleId: number;
  shadowSampleId: number;
  cacheRan: boolean;
  shadowRan: boolean;
  cloudMs: number;
  cacheMs: number;
  brickMs: number;
  shadowMs: number;
  postMs: number;
  activeBodyCount: number;
  width: number;
  height: number;
  densityRes: number;
  weatherSize: number;
  cacheWg: [number, number, number];
  densityQualityRequested: DensityQualityKind;
  densityQualityActive: DensityQualityKind;
  densityQualityLifecycle: string;
  densityQualityFallbackReason: string;
  densityQualityActiveGeneration: number;
  densityQualityPipelines: Record<DensityQualityKind, DensityQualityPipelineState>;
  densityHierarchicalPipelines: Record<'cached' | 'hybrid', DensityQualityPipelineState>;
  densityStorageRequested: 'global-only' | 'hierarchical';
  densityStorageActive: 'global-only' | 'hierarchical';
  densityStorageLifecycle: string;
  densityStorageFallbackReason: string;
  densityProducerRequested: DensityProducerKind;
  densityProducerActive: DensityProducerKind;
  densityProducerActiveGeneration: number;
  densityProducerCandidateLifecycle: string;
  densityProducerCandidateReason: string;
  densityProducerFallbackReason: string;
  densityProducerResourceGeneration: number;
  densityProducerContentRevision: number;
  densityProducerLifecycle: string;
  densityProducerFailureReason: string;
  densityProducerCreateCpuMs: number;
  densityProducerRebuildCpuMs: number;
  densityProducerShaderModuleCreateCpuMs: number;
  densityProducerPipelineCreateCpuMs: number;
  densityProducerSourceLength: number;
  densityProducerRecordBytes: number;
  densityProducerOutputBytes: number;
  densityProducerDispatchWorkgroups: [number, number, number];
  densityProducerEmptyDensity: boolean;
  densityProducerTileMask: DensityTileMaskStats | null;
  densityProducerSharedFields: DensitySharedFieldStats | null;
  densityProducerEvaluator: DensityV2EvaluatorStats | null;
  densityProducerBricks: DensityBrickStats | null;
  densitySharedFieldDebugReason: string;
  shadowMapResolution: number;
  shadowUpdated: boolean;
  shadowHistoryResetReason: string;
  deviceInfo: RendererDeviceInfo;
  startupTiming: RendererStartupTiming;
}

export interface RendererDeviceInfo {
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
  };
  features: string[];
  limits: Record<string, number>;
}

export interface RendererStartupTiming {
  adapterRequestMs: number;
  deviceRequestMs: number;
  shaderModuleCreateMs: number;
  pipelineCreateMs: number;
  totalCreateRendererMs: number;
}

export interface Renderer {
  getStats(): RenderStats;
  resizeCanvas(): void;
  setFixedCanvasSize(size: { width: number; height: number } | null): void;
  setDensityResolution(res: number): void;
  setWeatherSize(size: number): void;
  setCacheWorkgroup(x: number, y: number, z: number): void;
  setBodies(bodies: CloudBody[]): void;
  setBodyMods(mods: BodyMod[]): void;
  setWindSamples(samples: readonly WindAdvectionSample[]): void;
  updatePresets(): void;
  renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number, sceneClock?: number): void;
  destroy(): void;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  const createRendererStarted = performance.now();
  if (!navigator.gpu) {
    document.body.innerHTML = '<p style="color:white;padding:2rem;">WebGPU is not supported in this browser.</p>';
    throw new Error('WebGPU not supported');
  }

  const adapterRequestStarted = performance.now();
  const adapter = await navigator.gpu.requestAdapter();
  const adapterRequestMs = performance.now() - adapterRequestStarted;
  if (!adapter) throw new Error('No appropriate GPUAdapter found');

  const hasTimestamp = adapter.features.has('timestamp-query');
  const deviceRequestStarted = performance.now();
  const device = await adapter.requestDevice(
    hasTimestamp ? { requiredFeatures: ['timestamp-query'] } : {},
  );
  const deviceRequestMs = performance.now() - deviceRequestStarted;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Failed to get webgpu context');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  let shaderModuleCreateMs = 0;
  let pipelineCreateMs = 0;
  function createShaderModuleTimed(descriptor: GPUShaderModuleDescriptor): GPUShaderModule {
    const started = performance.now();
    const result = device.createShaderModule(descriptor);
    shaderModuleCreateMs += performance.now() - started;
    return result;
  }
  function createRenderPipelineTimed(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    const started = performance.now();
    const result = device.createRenderPipeline(descriptor);
    pipelineCreateMs += performance.now() - started;
    return result;
  }
  function createComputePipelineTimed(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    const started = performance.now();
    const result = device.createComputePipeline(descriptor);
    pipelineCreateMs += performance.now() - started;
    return result;
  }
  const adapterInfo = adapter.info;
  const deviceInfo: RendererDeviceInfo = {
    adapter: {
      vendor: adapterInfo.vendor ?? '',
      architecture: adapterInfo.architecture ?? '',
      device: adapterInfo.device ?? '',
      description: adapterInfo.description ?? '',
    },
    features: Array.from(adapter.features, (feature) => String(feature)).sort(),
    limits: {
      maxTextureDimension1D: adapter.limits.maxTextureDimension1D,
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      maxTextureDimension3D: adapter.limits.maxTextureDimension3D,
      maxTextureArrayLayers: adapter.limits.maxTextureArrayLayers,
      maxBindGroups: adapter.limits.maxBindGroups,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: adapter.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: adapter.limits.maxComputeWorkgroupSizeZ,
      maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
    },
  };

  const [cachedBundleResult, hybridBundleResult] = await Promise.allSettled([
    createDensityQualityPipelineBundle({ device, kind: 'cached', colorFormat: OFFSCREEN_FORMAT }),
    createDensityQualityPipelineBundle({ device, kind: 'hybrid', colorFormat: OFFSCREEN_FORMAT }),
  ]);
  if (cachedBundleResult.status === 'rejected') {
    const reason = cachedBundleResult.reason instanceof Error
      ? cachedBundleResult.reason.message
      : String(cachedBundleResult.reason);
    throw new Error(`Cached density quality pipeline creation failed: ${reason}`);
  }
  const cachedBundle = cachedBundleResult.value;
  const hybridBundle = hybridBundleResult.status === 'fulfilled' ? hybridBundleResult.value : undefined;
  const hybridFailureReason = hybridBundleResult.status === 'rejected'
    ? (hybridBundleResult.reason instanceof Error ? hybridBundleResult.reason.message : String(hybridBundleResult.reason))
    : '';
  const densityQualityPipelineManager = new DensityQualityPipelineManager({
    cached: cachedBundle,
    hybrid: hybridBundle,
    hybridFailureReason,
    createRealtime: () => createDensityQualityPipelineBundle({
      device,
      kind: 'realtime',
      colorFormat: OFFSCREEN_FORMAT,
    }),
    createHierarchical: (kind) => createDensityQualityPipelineBundle({
      device,
      kind,
      colorFormat: OFFSCREEN_FORMAT,
      storageMode: 'hierarchical',
    }),
  });
  for (const bundle of [cachedBundle, hybridBundle]) {
    if (!bundle) continue;
    shaderModuleCreateMs += bundle.creation.shaderModuleCreateCpuMs;
    pipelineCreateMs += bundle.creation.renderPipelineCreateCpuMs
      + bundle.creation.groundShadowPipelineCreateCpuMs;
  }

  const postModule = createShaderModuleTimed({ code: postShaderSource });
  const postPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: { module: postModule, entryPoint: 'vsPost' },
    fragment: { module: postModule, entryPoint: 'fsPost', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const postUniformBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const postData = new Float32Array(12);
  let densitySharedDebugPipeline: GPURenderPipeline | null = null;
  let densitySharedDebugUniformBuffer: GPUBuffer | null = null;
  let densitySharedDebugFailureReason = '';

  function ensureDensitySharedDebugPipeline(): GPURenderPipeline | null {
    if (densitySharedDebugPipeline || densitySharedDebugFailureReason) return densitySharedDebugPipeline;
    try {
      const module = createShaderModuleTimed({ label: 'density-shared-debug-module', code: densitySharedDebugSource });
      densitySharedDebugPipeline = createRenderPipelineTimed({
        label: 'density-shared-debug-pipeline',
        layout: 'auto',
        vertex: { module, entryPoint: 'vsDensitySharedDebug' },
        fragment: { module, entryPoint: 'fsDensitySharedDebug', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      densitySharedDebugUniformBuffer = device.createBuffer({
        label: 'density-shared-debug-uniform',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    } catch (error: unknown) {
      densitySharedDebugFailureReason = error instanceof Error ? error.message : String(error);
    }
    return densitySharedDebugPipeline;
  }

  const bloomModule = createShaderModuleTimed({ code: bloomShaderSource });
  const bloomExtractPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: { module: bloomModule, entryPoint: 'vsBloom' },
    fragment: { module: bloomModule, entryPoint: 'fsBloomExtract', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });
  const bloomDownPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: { module: bloomModule, entryPoint: 'vsBloom' },
    fragment: { module: bloomModule, entryPoint: 'fsBloomDown', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });
  const bloomUpPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: { module: bloomModule, entryPoint: 'vsBloom' },
    fragment: {
      module: bloomModule,
      entryPoint: 'fsBloomUp',
      targets: [{
        format: OFFSCREEN_FORMAT,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const bloomUniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bloomData = new Float32Array(8);
  const dummyBloomTexture = device.createTexture({
    size: [1, 1],
    format: OFFSCREEN_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const dummyBloomView = dummyBloomTexture.createView();

  const taaModule = createShaderModuleTimed({ code: taaShaderSource });
  const taaPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: { module: taaModule, entryPoint: 'vsTaa' },
    fragment: { module: taaModule, entryPoint: 'fsTaa', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });
  const taaUniformBuffer = device.createBuffer({
    size: 160,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const taaData = new Float32Array(40);

  const postSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  let weatherSize = DEFAULT_WEATHER_SIZE;
  let boxHalfExtent = DEFAULT_BOX_HALF_EXTENT;
  let cornerRadius = 0.5;
  let sceneScale: SceneScale = { ...DEFAULT_SCENE_SCALE };
  const groundShadowResolveModule = createShaderModuleTimed({ code: groundShadowResolveSource });
  const groundShadowFilterPipeline = createComputePipelineTimed({
    layout: 'auto',
    compute: { module: groundShadowResolveModule, entryPoint: 'csGroundShadowFilter' },
  });
  const groundShadowResolvePipeline = createComputePipelineTimed({
    layout: 'auto',
    compute: { module: groundShadowResolveModule, entryPoint: 'csGroundShadowResolve' },
  });

  function createShapeTexture(size: number): GPUTexture {
    return device.createTexture({
      size: [size, size, MAX_BODIES],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  let shapeTexture = createShapeTexture(weatherSize);
  let shapeData = createShapeData(weatherSize);

  function uploadShapes(): void {
    const worldBodies = currentBodies.map((body) => bodyToRenderSpace(body, sceneScale));
    paintBodyShapes(
      shapeData,
      worldBodies,
      weatherSize,
      metersToWorldXZ(boxHalfExtent, sceneScale),
      cornerRadius,
    );
    device.queue.writeTexture(
      { texture: shapeTexture },
      shapeData,
      { bytesPerRow: weatherSize, rowsPerImage: weatherSize },
      { width: weatherSize, height: weatherSize, depthOrArrayLayers: MAX_BODIES },
    );
  }

  let qualityBindings: DensityQualityBindings;
  let qualityBindingsReady = false;

  const lineModule = createShaderModuleTimed({ code: lineShaderSource });
  const linePipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: {
      module: lineModule,
      entryPoint: 'vsLine',
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      }],
    },
    fragment: { module: lineModule, entryPoint: 'fsLine', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'line-list' },
  });
  const lineCamBuffer = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const lineVertexBuffer = device.createBuffer({
    size: MAX_LINE_VERTS * 24,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const lineBindGroup = device.createBindGroup({
    layout: linePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: lineCamBuffer } }],
  });
  const axisPipeline = createRenderPipelineTimed({
    layout: 'auto',
    vertex: {
      module: lineModule,
      entryPoint: 'vsLine',
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      }],
    },
    fragment: {
      module: lineModule,
      entryPoint: 'fsLine',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });
  const startupTiming: RendererStartupTiming = {
    adapterRequestMs,
    deviceRequestMs,
    shaderModuleCreateMs,
    pipelineCreateMs,
    totalCreateRendererMs: 0,
  };
  const axisVertexBuffer = device.createBuffer({
    size: MAX_AXIS_VERTS * 24,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const axisBindGroup = device.createBindGroup({
    layout: axisPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: lineCamBuffer } }],
  });
  const lineCamData = new Float32Array(20);
  let lineVertCount = 0;
  let axisVertCount = 0;
  let axisMeshSig = '';
  let axisMeshCache: Float32Array | null = null;

  let currentBodies: CloudBody[] = [];
  let currentMods: BodyMod[] = [];
  let currentWindSamples: readonly WindAdvectionSample[] = [];
  let shapeSignature = '';

  const cameraBuffer = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const paramsBuffer = device.createBuffer({
    size: PARAMS_BYTE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const linearSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const presetBuffer = device.createBuffer({
    size: PRESET_BYTE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(presetBuffer, 0, packPresetArray());

  function setBodies(bodies: CloudBody[]): void {
    currentBodies = bodies;
    const sig = geometrySignature(bodies);
    if (sig !== shapeSignature) {
      shapeSignature = sig;
      uploadShapes();
    }
  }

  function setBodyMods(mods: BodyMod[]): void {
    currentMods = mods;
  }

  function setWindSamples(samples: readonly WindAdvectionSample[]): void {
    currentWindSamples = samples;
  }

  function updatePresets(): void {
    device.queue.writeBuffer(presetBuffer, 0, packPresetArray());
    shadowRevision++;
  }

  function setWeatherSize(size: number): void {
    const next = Math.max(64, Math.min(1024, Math.round(size)));
    if (next === weatherSize) return;
    weatherSize = next;
    shapeTexture.destroy();
    shapeTexture = createShapeTexture(weatherSize);
    shapeData = createShapeData(weatherSize);
    shapeSignature = '';
    shadowRevision++;
    densitySceneRevision++;
    rebuildQualityBindings(true);
    uploadShapes();
  }

  function setCacheWorkgroup(x: number, y: number, z: number): void {
    densityProducerSelector.setWorkgroup([x, y, z]);
  }

  let shadowRevision = 0;
  let densitySceneRevision = 0;
  let densityConsumerGeneration = -1;
  let densityConsumerHierarchyGeneration = -1;
  let densityConsumerProducerGeneration = -1;
  let qualityConsumerGeneration = -1;

  const initialCacheWorkgroup = [8, 8, 4] as const;
  const legacyPipelineResources = await createLegacyDensityPipelineResources(device, initialCacheWorkgroup);
  shaderModuleCreateMs += legacyPipelineResources.creation.shaderModuleCreateCpuMs;
  pipelineCreateMs += legacyPipelineResources.creation.pipelineCreateCpuMs;

  const legacyDensityAdapter = new LegacyDensityAdapter({
    device,
    sampler: linearSampler,
    initialResolution: 96,
    initialWorkgroup: initialCacheWorkgroup,
    pipelineResources: legacyPipelineResources,
    createSceneBindGroup(densityPipeline) {
      return device.createBindGroup({
        layout: densityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 1, resource: { buffer: paramsBuffer } },
          { binding: 2, resource: shapeTexture.createView({ dimension: '2d-array' }) },
          { binding: 3, resource: linearSampler },
          { binding: 4, resource: { buffer: presetBuffer } },
        ],
      });
    },
  });
  const densityProducerSelector = new DensityProducerSelector({
    legacy: legacyDensityAdapter,
    createRecipeV2: () => createRecipeDensityV2Adapter({
      device,
      initialResolution: legacyDensityAdapter.getStats().resolution,
      initialWorkgroup: legacyDensityAdapter.getStats().workgroup,
    }),
  });

  function requestedDensityProducer(mode: number): DensityProducerKind {
    return Math.round(mode) === DENSITY_PRODUCER_MODE.recipeV2 ? 'recipe-v2' : 'legacy';
  }

  function setDensityResolution(res: number): void {
    densityProducerSelector.setResolution(res);
    rebuildQualityBindings(true);
  }

  const groundShadowResolveUniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const groundShadowResolveData = new Float32Array(4);
  let groundShadowResolution = 0;
  let groundShadowRawTexture: GPUTexture;
  let groundShadowFilterTexture: GPUTexture;
  let groundShadowHistoryTextures: [GPUTexture, GPUTexture];
  let groundShadowHistoryViews: [GPUTextureView, GPUTextureView];
  let groundShadowHistoryIndex = 0;
  let groundShadowHistoryValid = false;
  let groundShadowPhaseIndex = 0;
  let lastGroundShadowSignature = '';
  let lastGroundShadowWindOffsets: Array<[number, number]> = [];
  let groundShadowResetReason = 'initial';

  function normalizeGroundShadowResolution(value: number): number {
    if (value <= 384) return 256;
    if (value <= 768) return 512;
    return 1024;
  }

  function rebuildGroundShadowSampleBindGroup(): void {
    if (!qualityBindingsReady) return;
    const bundle = densityQualityPipelineManager.getActiveBundle();
    qualityBindings = {
      ...qualityBindings,
      cloudGroundShadow: device.createBindGroup({
        layout: bundle.cloudPipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: linearSampler },
          { binding: 1, resource: groundShadowHistoryViews[groundShadowHistoryIndex] },
        ],
      }),
    };
  }

  function rebuildQualityBindings(force = false): void {
    if (groundShadowResolution <= 0) return;
    const selection = densityQualityPipelineManager.getSelection();
    const bundle = densityQualityPipelineManager.getActiveBundle();
    const producerSelection = densityProducerSelector.getSelection();
    const densityOutput = densityProducerSelector.getActive().getOutput();
    if (
      !force
      && qualityBindingsReady
      && qualityConsumerGeneration === selection.activeGeneration
      && densityConsumerProducerGeneration === producerSelection.activeGeneration
      && (!bundle.usesDensityCache || densityConsumerGeneration === densityOutput.resourceGeneration)
      && (bundle.storageMode !== 'hierarchical'
        || densityConsumerHierarchyGeneration === densityOutput.hierarchical?.layoutGeneration)
    ) {
      return;
    }
    qualityBindings = createDensityQualityBindings(device, bundle, {
      cameraBuffer,
      paramsBuffer,
      shapeView: shapeTexture.createView({ dimension: '2d-array' }),
      weatherSampler: linearSampler,
      presetBuffer,
      densityOutput,
      groundShadowStoreView: groundShadowRawTexture.createView(),
      groundShadowSampler: linearSampler,
      groundShadowView: groundShadowHistoryViews[groundShadowHistoryIndex],
    });
    qualityBindingsReady = true;
    qualityConsumerGeneration = selection.activeGeneration;
    densityConsumerProducerGeneration = producerSelection.activeGeneration;
    densityConsumerGeneration = bundle.usesDensityCache ? densityOutput.resourceGeneration : -1;
    densityConsumerHierarchyGeneration = bundle.storageMode === 'hierarchical'
      ? densityOutput.hierarchical?.layoutGeneration ?? -1
      : -1;
    shadowRevision++;
  }

  function ensureGroundShadowResources(requestedResolution: number): boolean {
    const resolution = normalizeGroundShadowResolution(requestedResolution);
    if (resolution === groundShadowResolution) return false;
    groundShadowRawTexture?.destroy();
    groundShadowFilterTexture?.destroy();
    if (groundShadowHistoryTextures) for (const texture of groundShadowHistoryTextures) texture.destroy();
    groundShadowResolution = resolution;
    const descriptor: GPUTextureDescriptor = {
      size: [resolution, resolution],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    };
    groundShadowRawTexture = device.createTexture(descriptor);
    groundShadowFilterTexture = device.createTexture(descriptor);
    groundShadowHistoryTextures = [device.createTexture(descriptor), device.createTexture(descriptor)];
    groundShadowHistoryViews = [groundShadowHistoryTextures[0].createView(), groundShadowHistoryTextures[1].createView()];
    groundShadowHistoryIndex = 0;
    groundShadowHistoryValid = false;
    groundShadowPhaseIndex = 0;
    lastGroundShadowWindOffsets = [];
    groundShadowResetReason = 'resolution';
    if (qualityBindingsReady) rebuildQualityBindings(true);
    return true;
  }

  ensureGroundShadowResources(512);
  rebuildQualityBindings(true);

  let sceneTexture: GPUTexture | null = null;
  let sceneView: GPUTextureView | null = null;
  let historyTex: [GPUTexture, GPUTexture] | null = null;
  let historyViews: [GPUTextureView, GPUTextureView];
  let taaBindGroups: [GPUBindGroup, GPUBindGroup];
  let histIndex = 0;
  let historyValid = false;
  let prevTaaEnabled = false;
  const prevViewProj = new Float32Array(16);
  let sceneW = 0;
  let sceneH = 0;
  let bloomTextures: GPUTexture[] = [];
  let bloomViews: GPUTextureView[] = [];
  let bloomWs: number[] = [];
  let bloomHs: number[] = [];

  function bloomBindGroup(inputView: GPUTextureView, layout: GPUBindGroupLayout): GPUBindGroup {
    return device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: inputView },
        { binding: 1, resource: postSampler },
        { binding: 2, resource: { buffer: bloomUniformBuffer } },
      ],
    });
  }

  function ensureBloomTextures(w: number, h: number): void {
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    if (bloomTextures.length > 0 && bloomWs[0] === bw && bloomHs[0] === bh) return;
    for (const t of bloomTextures) t.destroy();
    bloomTextures = [];
    bloomViews = [];
    bloomWs = [];
    bloomHs = [];
    let cw = bw;
    let ch = bh;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      cw = Math.max(1, cw);
      ch = Math.max(1, ch);
      bloomWs.push(cw);
      bloomHs.push(ch);
      const tex = device.createTexture({
        size: [cw, ch],
        format: OFFSCREEN_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      bloomTextures.push(tex);
      bloomViews.push(tex.createView());
      cw = Math.max(1, Math.floor(cw / 2));
      ch = Math.max(1, Math.floor(ch / 2));
    }
  }

  function runBloomPasses(
    encoder: GPUCommandEncoder,
    sceneInput: GPUTextureView,
    params: CloudParams,
  ): GPUTextureView {
    ensureBloomTextures(sceneW, sceneH);
    bloomData[2] = bloomWs[0];
    bloomData[3] = bloomHs[0];
    bloomData[4] = params.bloomThreshold;
    bloomData[5] = Math.max(params.exposure, 0.01);
    device.queue.writeBuffer(bloomUniformBuffer, 0, bloomData);

    const extractPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: bloomViews[0],
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store',
      }],
    });
    extractPass.setPipeline(bloomExtractPipeline);
    extractPass.setBindGroup(0, bloomBindGroup(sceneInput, bloomExtractPipeline.getBindGroupLayout(0)));
    extractPass.draw(3);
    extractPass.end();

    for (let i = 0; i < BLOOM_LEVELS - 1; i++) {
      bloomData[0] = 1 / bloomWs[i];
      bloomData[1] = 1 / bloomHs[i];
      bloomData[2] = bloomWs[i + 1];
      bloomData[3] = bloomHs[i + 1];
      device.queue.writeBuffer(bloomUniformBuffer, 0, bloomData);
      const downPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: bloomViews[i + 1],
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        }],
      });
      downPass.setPipeline(bloomDownPipeline);
      downPass.setBindGroup(0, bloomBindGroup(bloomViews[i], bloomDownPipeline.getBindGroupLayout(0)));
      downPass.draw(3);
      downPass.end();
    }

    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      bloomData[0] = 1 / bloomWs[i + 1];
      bloomData[1] = 1 / bloomHs[i + 1];
      bloomData[2] = bloomWs[i];
      bloomData[3] = bloomHs[i];
      device.queue.writeBuffer(bloomUniformBuffer, 0, bloomData);
      const upPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: bloomViews[i],
          loadOp: 'load',
          storeOp: 'store',
        }],
      });
      upPass.setPipeline(bloomUpPipeline);
      upPass.setBindGroup(0, bloomBindGroup(bloomViews[i + 1], bloomUpPipeline.getBindGroupLayout(0)));
      upPass.draw(3);
      upPass.end();
    }

    return bloomViews[0];
  }

  function ensureSceneTexture(w: number, h: number): void {
    if (sceneTexture && sceneW === w && sceneH === h) return;
    if (sceneTexture) sceneTexture.destroy();
    if (historyTex) for (const t of historyTex) t.destroy();
    sceneW = w;
    sceneH = h;
    sceneTexture = device.createTexture({
      size: [w, h],
      format: OFFSCREEN_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    sceneView = sceneTexture.createView();
    historyTex = [0, 1].map(() => device.createTexture({
      size: [w, h],
      format: OFFSCREEN_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })) as [GPUTexture, GPUTexture];
    historyViews = [historyTex[0].createView(), historyTex[1].createView()];
    taaBindGroups = [0, 1].map((i) => device.createBindGroup({
      layout: taaPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sceneView! },
        { binding: 1, resource: historyViews[1 - i] },
        { binding: 2, resource: postSampler },
        { binding: 3, resource: { buffer: taaUniformBuffer } },
      ],
    })) as [GPUBindGroup, GPUBindGroup];
    ensureBloomTextures(w, h);
    historyValid = false;
  }

  let fixedCanvasSize: { width: number; height: number } | null = null;

  function resizeCanvas(): void {
    if (fixedCanvasSize) {
      canvas.width = fixedCanvasSize.width;
      canvas.height = fixedCanvasSize.height;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }

  function setFixedCanvasSize(size: { width: number; height: number } | null): void {
    fixedCanvasSize = size
      ? { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) }
      : null;
    resizeCanvas();
  }

  let frameIndex = 0;
  let prevSceneTime = 0.0;
  let rendererDestroyed = false;

  const TS_COUNT = 18; // + W5 shared fields and W9 body-local brick cache
  const tsQuerySet = hasTimestamp ? device.createQuerySet({ type: 'timestamp', count: TS_COUNT }) : null;
  const tsResolve = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
  const tsRead = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
  let timestampEnabled = hasTimestamp;
  let tsMapping = false;
  const initialDensityStats = legacyDensityAdapter.getStats();
  const initialDensitySelection = densityProducerSelector.getSelection();
  const initialQualitySelection = densityQualityPipelineManager.getSelection();
  const stats = {
    gpuTiming: hasTimestamp,
    gpuTimingError: '',
    gpuSampleId: 0,
    cacheSampleId: 0,
    brickSampleId: 0,
    shadowSampleId: 0,
    cacheRan: false,
    shadowRan: false,
    cloudMs: 0,
    cacheMs: 0,
    brickMs: 0,
    shadowMs: 0,
    postMs: 0,
    activeBodyCount: 0,
    width: 0,
    height: 0,
    densityRes: initialDensityStats.resolution,
    weatherSize,
    cacheWg: [...initialDensityStats.workgroup] as [number, number, number],
    densityQualityRequested: initialQualitySelection.requested,
    densityQualityActive: initialQualitySelection.active,
    densityQualityLifecycle: initialQualitySelection.lifecycle,
    densityQualityFallbackReason: initialQualitySelection.reason,
    densityQualityActiveGeneration: initialQualitySelection.activeGeneration,
    densityQualityPipelines: densityQualityPipelineManager.getStates(),
    densityHierarchicalPipelines: densityQualityPipelineManager.getHierarchicalStates(),
    densityStorageRequested: initialQualitySelection.requestedStorage,
    densityStorageActive: initialQualitySelection.activeStorage,
    densityStorageLifecycle: initialQualitySelection.storageLifecycle,
    densityStorageFallbackReason: initialQualitySelection.storageReason,
    densityProducerRequested: initialDensitySelection.requested,
    densityProducerActive: initialDensitySelection.active,
    densityProducerActiveGeneration: initialDensitySelection.activeGeneration,
    densityProducerCandidateLifecycle: initialDensitySelection.candidateLifecycle,
    densityProducerCandidateReason: initialDensitySelection.candidateReason,
    densityProducerFallbackReason: initialDensitySelection.fallbackReason,
    densityProducerResourceGeneration: initialDensityStats.resourceGeneration,
    densityProducerContentRevision: initialDensityStats.contentRevision,
    densityProducerLifecycle: initialDensityStats.lifecycle,
    densityProducerFailureReason: initialDensityStats.failureReason,
    densityProducerCreateCpuMs: initialDensityStats.createCpuMs,
    densityProducerRebuildCpuMs: initialDensityStats.rebuildCpuMs,
    densityProducerShaderModuleCreateCpuMs: initialDensityStats.shaderModuleCreateCpuMs,
    densityProducerPipelineCreateCpuMs: initialDensityStats.pipelineCreateCpuMs,
    densityProducerSourceLength: initialDensityStats.sourceLength,
    densityProducerRecordBytes: initialDensityStats.recordBytes,
    densityProducerOutputBytes: initialDensityStats.outputBytes,
    densityProducerDispatchWorkgroups: [...initialDensityStats.dispatchWorkgroups] as [number, number, number],
    densityProducerEmptyDensity: initialDensityStats.emptyDensity,
    densityProducerTileMask: initialDensityStats.tileMask,
    densityProducerSharedFields: initialDensityStats.sharedFields,
    densityProducerEvaluator: initialDensityStats.evaluator,
    densityProducerBricks: initialDensityStats.bricks,
    densitySharedFieldDebugReason: '',
    shadowMapResolution: groundShadowResolution,
    shadowUpdated: false,
    shadowHistoryResetReason: groundShadowResetReason,
    deviceInfo,
    startupTiming,
  };
  void device.lost.then((reason) => {
    densityProducerSelector.handleDeviceLost(reason);
    densityQualityPipelineManager.destroy();
    stats.gpuTiming = false;
    stats.gpuTimingError = reason.message || String(reason.reason);
    stats.densityProducerLifecycle = 'device-lost';
    stats.densityQualityLifecycle = 'failed';
    stats.densityQualityFallbackReason = reason.message || String(reason.reason);
  });

  const paramsData = new Float32Array(PARAMS_FLOAT_COUNT);
  const cameraData = new Float32Array(20);

  function buildParams(
    params: CloudParams,
    activeQualityMode: number,
    cacheBlend: number,
    densityResolution: number,
    sceneTime: number,
    deltaTime: number,
    frameIndex: number,
    jitterX: number,
    jitterY: number,
    taaOn: boolean,
    groundShadowMapValid: boolean,
    groundShadowPhase: number,
  ): Float32Array {
    packParams(paramsData, {
      rayMarchSteps: params.rayMarchSteps,
      lightMarchSteps: params.lightMarchSteps,
      shadowDarkness: params.shadowDarkness,
      sunIntensity: params.sunIntensity,
      skipLight: params.skipLight,
      cacheBlend,
      cloudHeight: metersToWorldY(params.cloudHeight, params),
      weatherMorph: params.morphStrength,
      sceneTime,
      deltaTime,
      sunAzimuth: params.sunAzimuth,
      sunElevation: params.sunElevation,
      silverIntensity: params.silverIntensity,
      powderStrength: params.powderStrength,
      hgForward: params.hgForward,
      hgBackward: params.hgBackward,
      hgBlend: params.hgBlend,
      godrayStrength: params.godrayStrength,
      qualityMode: activeQualityMode,
      detailFreq: params.detailFreq,
      detailStrength: params.detailStrength,
      typeLightingBlend: params.typeLightingBlend,
      fxAbsorption: params.fxAbsorption,
      boxHalfExtent: metersToWorldXZ(params.boxHalfExtent, params),
      lightMarchStepSize: params.lightMarchStepSize,
      verticalEdgeRange: params.verticalEdgeRange,
      verticalEdgeShape: params.verticalEdgeShape,
      edgeHardness: params.edgeHardness,
      edgeHardnessThreshold: params.edgeHardnessThreshold,
      cacheWorkgroupX: params.cacheWorkgroupX,
      cacheWorkgroupY: params.cacheWorkgroupY,
      cacheWorkgroupZ: params.cacheWorkgroupZ,
      debugView: params.debugView,
      edgeCurveWidth: params.edgeCurveWidth,
      edgeCurveShaper: params.edgeCurveShaper,
      frameIndex: frameIndex % 4096,
      adaptiveMarch: params.adaptiveMarch,
      temporalDither: params.temporalDither,
      aerialDensity: params.aerialDensity,
      aerialInscatter: params.aerialInscatter,
      aerialHeightFalloff: params.aerialHeightFalloff,
      shadowTintStrength: params.shadowTintStrength,
      jitterX,
      jitterY,
      taaEnabled: taaOn,
      edgeSharpening: params.edgeSharpening,
      groundShadowMode: params.groundShadowMode,
      groundShadowMaxSteps: params.groundShadowMaxSteps,
      groundShadowStepScale: params.groundShadowStepScale,
      groundShadowJitter: params.groundShadowJitter,
      groundShadowMapValid,
      groundShadowMapGuard: Math.max(2 / Math.max(1, groundShadowResolution), 0.002),
      groundShadowPhase,
      todPaletteBlend: params.todPaletteBlend,
      msModel: params.msModel,
      energyConservingScatter: params.energyConservingScatter,
      densityShapeModel: params.densityShapeModel,
      heightAmbientModel: params.heightAmbientModel,
      densityResolution,
    });
    packBodies(paramsData, currentBodies, currentMods, currentWindSamples, params);
    return paramsData;
  }

  function groundShadowSignature(params: CloudParams, activeQuality: DensityQualityKind): string {
    const densityStats = densityProducerSelector.getActive().getStats();
    return [
      params.sunAzimuth,
      params.sunElevation,
      params.boxHalfExtent,
      params.cloudHeight,
      params.horizontalMetersPerWorldUnit,
      params.verticalMetersPerWorldUnit,
      activeQuality,
      densityStats.resolution,
      params.edgeHardness,
      params.edgeHardnessThreshold,
      params.edgeCurveWidth,
      params.edgeCurveShaper,
      params.verticalEdgeRange,
      params.verticalEdgeShape,
      params.densityShapeModel,
      params.detailFreq,
      params.detailStrength,
      params.shadowDarkness,
      shapeSignature,
      JSON.stringify(currentMods),
      shadowRevision,
    ].join('|');
  }

  function groundShadowWindMotionMeters(): number {
    if (currentWindSamples.length !== lastGroundShadowWindOffsets.length) return Number.POSITIVE_INFINITY;
    let maxMotion = 0;
    for (let i = 0; i < currentWindSamples.length; i++) {
      const current = currentWindSamples[i].offsetM;
      const previous = lastGroundShadowWindOffsets[i];
      maxMotion = Math.max(maxMotion, Math.hypot(current[0] - previous[0], current[1] - previous[1]));
    }
    return maxMotion;
  }

  function snapshotGroundShadowWindOffsets(): void {
    lastGroundShadowWindOffsets = currentWindSamples.map((sample) => [sample.offsetM[0], sample.offsetM[1]]);
  }

  function renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number, sceneClock?: number): void {
    const activeProducerLifecycle = densityProducerSelector.getActive().getStats().lifecycle;
    if (rendererDestroyed || (activeProducerLifecycle !== 'ready' && activeProducerLifecycle !== 'warming')) return;
    frameIndex++;
    const clock = sceneClock ?? elapsed;

    cameraData.set(cam.invViewProj, 0);
    cameraData[16] = cam.eye[0];
    cameraData[17] = cam.eye[1];
    cameraData[18] = cam.eye[2];
    device.queue.writeBuffer(cameraBuffer, 0, cameraData);

    const worldCloudHeight = metersToWorldY(params.cloudHeight, params);
    const worldBoxHalfExtent = metersToWorldXZ(params.boxHalfExtent, params);
    const worldBodies = currentBodies.map((body, index) => bodyToTransportedRenderSpace(body, currentWindSamples[index]?.offsetM ?? [0, 0], params));
    const arrays: Float32Array[] = [];
    if (params.showBodyBounds && currentBodies.length > 0) {
      arrays.push(buildLineVerts(worldBodies, worldCloudHeight, params.selectedBody));
    }
    if (params.gizmoMode && params.selectedBody) {
      const gb = worldBodies.find((b) => b.id === params.selectedBody);
      if (gb) arrays.push(buildGizmoVerts(gb, worldCloudHeight, params.gizmoMode));
    }
    if (params.showAxes) {
      const sig = `${worldBoxHalfExtent}:${worldCloudHeight}`;
      if (sig !== axisMeshSig) {
        axisMeshSig = sig;
        axisMeshCache = buildAxisMesh(worldBoxHalfExtent, worldCloudHeight);
        axisVertCount = Math.min(axisMeshCache.length / 6, MAX_AXIS_VERTS);
        device.queue.writeBuffer(axisVertexBuffer, 0, axisMeshCache, 0, axisVertCount * 6);
      } else if (axisMeshCache) {
        axisVertCount = Math.min(axisMeshCache.length / 6, MAX_AXIS_VERTS);
      }
    } else {
      axisVertCount = 0;
    }
    if (arrays.length > 0) {
      const total = arrays.reduce((n, a) => n + a.length, 0);
      const verts = new Float32Array(total);
      let off = 0;
      for (const a of arrays) { verts.set(a, off); off += a.length; }
      lineVertCount = Math.min(verts.length / 6, MAX_LINE_VERTS);
      device.queue.writeBuffer(lineVertexBuffer, 0, verts, 0, lineVertCount * 6);
      lineCamData.set(cam.viewProj, 0);
      lineCamData[16] = 1.0;
      device.queue.writeBuffer(lineCamBuffer, 0, lineCamData);
    } else {
      lineVertCount = 0;
    }

    const requestedQualityKind = densityQualityKindFromMode(params.qualityMode);
    const requestedProducerKind = requestedDensityProducer(params.densityProducerMode);
    const requestedStorage = Math.round(params.densityStorageMode) === 1 ? 'hierarchical' : 'global-only';
    const bundleStorageRequest = requestedProducerKind === 'recipe-v2' && requestedQualityKind !== 'realtime'
      ? requestedStorage
      : 'global-only';
    let currentDensityOutput = densityProducerSelector.getActive().getOutput();
    let qualitySelection = densityQualityPipelineManager.request(
      requestedQualityKind,
      bundleStorageRequest,
      currentDensityOutput.hierarchical?.valid === true,
    );
    let activeQualityMode = densityQualityModeFromKind(qualitySelection.active);
    const effectiveParams = activeQualityMode === Math.round(params.qualityMode)
      ? params
      : { ...params, qualityMode: activeQualityMode };

    const cacheRequired = activeQualityMode !== 2;
    densityProducerSelector.requestStorageMode(requestedStorage, cacheRequired && requestedProducerKind === 'recipe-v2');
    const densityProducer = densityProducerSelector.request(
      requestedProducerKind,
      cacheRequired,
    );
    const densityFrameInput: DensityFrameInput = {
      frameIndex,
      elapsedSeconds: elapsed,
      sceneTimeSeconds: clock,
      params: effectiveParams,
      bodies: currentBodies,
      bodyMods: currentMods,
      windSamples: currentWindSamples,
      sceneRevision: densitySceneRevision,
      cameraPosition: [cam.eye[0], cam.eye[1], cam.eye[2]],
    };
    const densityPlan = densityProducer.prepareFrame(densityFrameInput);
    densityProducerSelector.prepareTransition(densityFrameInput, cacheRequired);
    currentDensityOutput = densityProducerSelector.getActive().getOutput();
    qualitySelection = densityQualityPipelineManager.request(
      requestedQualityKind,
      bundleStorageRequest,
      currentDensityOutput.hierarchical?.valid === true,
    );
    activeQualityMode = densityQualityModeFromKind(qualitySelection.active);
    const qualityChanged = qualityConsumerGeneration !== qualitySelection.activeGeneration;
    if (qualityChanged) {
      groundShadowHistoryValid = false;
      groundShadowPhaseIndex = 0;
      groundShadowResetReason = qualitySelection.activeStorage === 'hierarchical' ? 'storage' : 'quality';
      historyValid = false;
    }
    const producerSelection = densityProducerSelector.getSelection();
    const producerChanged = densityConsumerProducerGeneration !== producerSelection.activeGeneration;
    if (producerChanged) {
      groundShadowHistoryValid = false;
      groundShadowPhaseIndex = 0;
      groundShadowResetReason = 'producer';
      historyValid = false;
    }
    const densityResolution = densityProducer.getStats().resolution;
    const cacheWillRun = densityPlan.willEncode;
    rebuildQualityBindings(qualityChanged || producerChanged);

    const deltaTime = clock - prevSceneTime;
    prevSceneTime = clock;

    if (params.boxHalfExtent !== boxHalfExtent) {
      boxHalfExtent = params.boxHalfExtent;
      shapeSignature = '';
      uploadShapes();
    }

    const nextScale = normalizedSceneScale(params);
    if (
      nextScale.horizontalMetersPerWorldUnit !== sceneScale.horizontalMetersPerWorldUnit
      || nextScale.verticalMetersPerWorldUnit !== sceneScale.verticalMetersPerWorldUnit
    ) {
      sceneScale = nextScale;
      shapeSignature = '';
      uploadShapes();
    }

    if (params.cornerRadius !== cornerRadius) {
      cornerRadius = params.cornerRadius;
      uploadShapes();
    }

    const taaOn = params.taaEnabled && params.debugView < 0.5;
    let jitterX = 0.0;
    let jitterY = 0.0;
    if (taaOn) {
      const hi = (frameIndex % 8) + 1;
      jitterX = halton(hi, 2) - 0.5;
      jitterY = halton(hi, 3) - 0.5;
    }
    const shadowResourcesChanged = ensureGroundShadowResources(params.groundShadowMapResolution);
    const transmittanceMode = Math.round(params.groundShadowMode) === 2;
    const shadowSignature = groundShadowSignature(params, qualitySelection.active);
    const shadowSignatureChanged = shadowSignature !== lastGroundShadowSignature;
    const shadowTimeDiscontinuity = deltaTime < -1e-5 || Math.abs(deltaTime) > 0.25;
    const shadowTexelMeters = (params.boxHalfExtent * 2) / groundShadowResolution;
    const shadowWindMotion = groundShadowWindMotionMeters();
    const shadowWindExceeded = shadowWindMotion > shadowTexelMeters * 0.5;
    let shadowResetThisFrame = '';
    if (transmittanceMode && qualityChanged) shadowResetThisFrame = 'quality';
    else if (transmittanceMode && shadowResourcesChanged) shadowResetThisFrame = 'resolution';
    else if (transmittanceMode && shadowSignatureChanged) shadowResetThisFrame = 'scene';
    else if (transmittanceMode && shadowTimeDiscontinuity) shadowResetThisFrame = 'time';
    else if (transmittanceMode && shadowWindExceeded) shadowResetThisFrame = 'wind';
    if (shadowResetThisFrame) {
      groundShadowHistoryValid = false;
      groundShadowPhaseIndex = 0;
      groundShadowResetReason = shadowResetThisFrame;
    }
    const scheduledShadowUpdate = frameIndex % Math.max(1, Math.round(params.groundShadowMapUpdateRate)) === 0;
    const groundShadowWillRun = transmittanceMode && (
      !groundShadowHistoryValid
      || scheduledShadowUpdate
      || cacheWillRun
      || shadowSignatureChanged
      || shadowTimeDiscontinuity
      || shadowWindExceeded
    );
    const groundShadowWillBeValid = transmittanceMode && (groundShadowHistoryValid || groundShadowWillRun);
    const motionHistoryScale = Number.isFinite(shadowWindMotion)
      ? Math.max(0, 1 - shadowWindMotion / Math.max(shadowTexelMeters * 0.5, 1e-5))
      : 0;
    const effectiveShadowHistoryWeight = params.groundShadowHistoryWeight * motionHistoryScale;
    if (transmittanceMode) lastGroundShadowSignature = shadowSignature;
    device.queue.writeBuffer(paramsBuffer, 0, buildParams(
      params,
      activeQualityMode,
      densityPlan.cacheBlend,
      densityResolution,
      clock,
      deltaTime,
      frameIndex,
      jitterX,
      jitterY,
      taaOn,
      groundShadowWillBeValid,
      groundShadowPhaseIndex,
    ));

    const commandEncoder = device.createCommandEncoder();
    let shadowRan = false;
    const cacheEncode = densityProducer.encode(commandEncoder, timestampEnabled && tsQuerySet
      ? {
          timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
          brickTimestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 16, endOfPassWriteIndex: 17 },
        }
      : undefined);
    const cacheRan = cacheEncode.cacheRan;
    const transitionEncode = densityProducerSelector.encodeTransition(commandEncoder, timestampEnabled && tsQuerySet
      ? {
          sharedFieldAtlasTimestampWrites: {
            querySet: tsQuerySet,
            beginningOfPassWriteIndex: 12,
            endOfPassWriteIndex: 13,
          },
          sharedFieldMacroTimestampWrites: {
            querySet: tsQuerySet,
            beginningOfPassWriteIndex: 14,
            endOfPassWriteIndex: 15,
          },
          brickTimestampWrites: {
            querySet: tsQuerySet,
            beginningOfPassWriteIndex: 16,
            endOfPassWriteIndex: 17,
          },
        }
      : {});
    const brickRan = cacheEncode.brickRan === true || transitionEncode?.brickRan === true;
    const transitionSharedStats = densityProducerSelector.getRecipeV2Stats()?.sharedFields;
    const sharedAtlasRan = transitionSharedStats?.atlasRan === true;
    const sharedMacroRan = transitionSharedStats?.macroRan === true;

    if (groundShadowWillRun) {
      shadowRan = true;
      const outputIndex = 1 - groundShadowHistoryIndex;
      groundShadowResolveData[0] = effectiveShadowHistoryWeight;
      groundShadowResolveData[1] = groundShadowHistoryValid ? 1 : 0;
      groundShadowResolveData[2] = params.groundShadowFilterRadius;
      groundShadowResolveData[3] = 0;
      device.queue.writeBuffer(groundShadowResolveUniformBuffer, 0, groundShadowResolveData);

      const integrationPass = commandEncoder.beginComputePass(
        timestampEnabled && tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 } } : undefined,
      );
      const activeQualityBundle = densityQualityPipelineManager.getActiveBundle();
      integrationPass.setPipeline(activeQualityBundle.groundShadowPipeline);
      integrationPass.setBindGroup(0, qualityBindings.groundShadowScene);
      if (qualityBindings.groundShadowDensity) {
        integrationPass.setBindGroup(1, qualityBindings.groundShadowDensity);
      }
      integrationPass.setBindGroup(2, qualityBindings.groundShadowStore);
      integrationPass.dispatchWorkgroups(
        Math.ceil(groundShadowResolution / 8),
        Math.ceil(groundShadowResolution / 8),
      );
      integrationPass.end();

      const filterBindGroup = device.createBindGroup({
        layout: groundShadowFilterPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: groundShadowRawTexture.createView() },
          { binding: 2, resource: { buffer: groundShadowResolveUniformBuffer } },
          { binding: 3, resource: groundShadowFilterTexture.createView() },
        ],
      });
      const filterPass = commandEncoder.beginComputePass(
        timestampEnabled && tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 4, endOfPassWriteIndex: 5 } } : undefined,
      );
      filterPass.setPipeline(groundShadowFilterPipeline);
      filterPass.setBindGroup(0, filterBindGroup);
      filterPass.dispatchWorkgroups(
        Math.ceil(groundShadowResolution / 8),
        Math.ceil(groundShadowResolution / 8),
      );
      filterPass.end();

      const resolveBindGroup = device.createBindGroup({
        layout: groundShadowResolvePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: groundShadowFilterTexture.createView() },
          { binding: 1, resource: groundShadowHistoryViews[groundShadowHistoryIndex] },
          { binding: 2, resource: { buffer: groundShadowResolveUniformBuffer } },
          { binding: 3, resource: groundShadowHistoryViews[outputIndex] },
        ],
      });
      const resolvePass = commandEncoder.beginComputePass(
        timestampEnabled && tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 6, endOfPassWriteIndex: 7 } } : undefined,
      );
      resolvePass.setPipeline(groundShadowResolvePipeline);
      resolvePass.setBindGroup(0, resolveBindGroup);
      resolvePass.dispatchWorkgroups(
        Math.ceil(groundShadowResolution / 8),
        Math.ceil(groundShadowResolution / 8),
      );
      resolvePass.end();

      groundShadowHistoryIndex = outputIndex;
      groundShadowHistoryValid = true;
      groundShadowPhaseIndex = (groundShadowPhaseIndex + 1) % 8;
      snapshotGroundShadowWindOffsets();
      rebuildGroundShadowSampleBindGroup();
    }

    ensureSceneTexture(canvas.width, canvas.height);

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: sceneView!,
          loadOp: 'clear',
          clearValue: todBackground(params.sunElevation, params.todPaletteBlend),
          storeOp: 'store',
        },
      ],
      ...(timestampEnabled && tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 8, endOfPassWriteIndex: 9 } } : {}),
    });

    const activeQualityBundle = densityQualityPipelineManager.getActiveBundle();
    renderPass.setPipeline(activeQualityBundle.cloudPipeline);
    renderPass.setBindGroup(0, qualityBindings.cloudScene);
    if (qualityBindings.cloudDensity) {
      renderPass.setBindGroup(1, qualityBindings.cloudDensity);
    }
    renderPass.setBindGroup(3, qualityBindings.cloudGroundShadow);
    renderPass.draw(3);

    if (lineVertCount > 0) {
      lineCamData.set(cam.viewProj, 0);
      lineCamData[16] = 1.0;
      device.queue.writeBuffer(lineCamBuffer, 0, lineCamData);
    }
    if (lineVertCount > 0) {
      renderPass.setPipeline(linePipeline);
      renderPass.setBindGroup(0, lineBindGroup);
      renderPass.setVertexBuffer(0, lineVertexBuffer);
      renderPass.draw(lineVertCount);
    }
    renderPass.end();

    if (taaOn !== prevTaaEnabled) { historyValid = false; prevTaaEnabled = taaOn; }
    const flagsX = (taaOn && historyValid) ? 1 : 0;
    taaData.set(prevViewProj, 0);
    taaData.set(cam.invViewProj, 16);
    taaData[32] = cam.eye[0];
    taaData[33] = cam.eye[1];
    taaData[34] = cam.eye[2];
    taaData[35] = 0;
    taaData[36] = flagsX;
    taaData[37] = params.taaBlend;
    taaData[38] = 0;
    taaData[39] = 0;
    device.queue.writeBuffer(taaUniformBuffer, 0, taaData);

    const taaPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: historyViews[histIndex],
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        },
      ],
    });
    taaPass.setPipeline(taaPipeline);
    taaPass.setBindGroup(0, taaBindGroups[histIndex]);
    taaPass.draw(3);
    taaPass.end();
    historyValid = true;
    prevViewProj.set(cam.viewProj);

    const ar = (params.sunAzimuth * Math.PI) / 180;
    const er = (params.sunElevation * Math.PI) / 180;
    const ce = Math.cos(er);
    const sd = [ce * Math.sin(ar), Math.sin(er), ce * Math.cos(ar)];
    const sw = [cam.eye[0] + sd[0] * 1000, cam.eye[1] + sd[1] * 1000, cam.eye[2] + sd[2] * 1000, 1];
    const vp = cam.viewProj;
    const c = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let col = 0; col < 4; col++) s += vp[col * 4 + r] * sw[col];
      c[r] = s;
    }
    let sunVis = 0;
    if (c[3] > 0) {
      postData[0] = (c[0] / c[3]) * 0.5 + 0.5;
      postData[1] = (1 - c[1] / c[3]) * 0.5;
      sunVis = 1;
    }
    postData[2] = params.godrayStrength;
    postData[3] = sunVis;
    postData[4] = params.debugView;
    postData[5] = params.tonemapMode;
    postData[6] = params.exposure;
    postData[7] = params.bloomEnabled ? 1 : 0;
    postData[8] = params.bloomThreshold;
    postData[9] = params.bloomAmount;
    device.queue.writeBuffer(postUniformBuffer, 0, postData);

    const bloomOn = params.bloomEnabled && params.bloomAmount > 0 && params.debugView === 0;
    let bloomView: GPUTextureView = dummyBloomView;
    if (bloomOn) {
      bloomView = runBloomPasses(commandEncoder, historyViews[histIndex], params);
    }

    const postBindGroup = device.createBindGroup({
      layout: postPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: historyViews[histIndex] },
        { binding: 1, resource: postSampler },
        { binding: 2, resource: { buffer: postUniformBuffer } },
        { binding: 3, resource: bloomView },
      ],
    });

    const sharedDebugRequested = params.debugView >= 7 && params.debugView <= 9;
    let sharedDebugBindGroup: GPUBindGroup | null = null;
    if (sharedDebugRequested) {
      const diagnostics = densityProducerSelector.getActive().getSharedFieldDiagnostics();
      const debugPipeline = diagnostics ? ensureDensitySharedDebugPipeline() : null;
      if (diagnostics && debugPipeline && densitySharedDebugUniformBuffer) {
        const data = new ArrayBuffer(32);
        const uints = new Uint32Array(data);
        const floats = new Float32Array(data);
        uints[0] = Math.max(0, Math.min(2, Math.round(params.debugView - 7)));
        uints[1] = Math.max(0, Math.min(3, Math.round(params.sharedFieldDebugChannel)));
        uints[2] = params.sharedFieldDebugSeams ? 1 : 0;
        floats[4] = Math.max(0, Math.min(1, params.sharedFieldDebugSlice));
        floats[5] = Number.isFinite(params.sharedFieldDebugPhase) ? params.sharedFieldDebugPhase : 0;
        floats[6] = 2;
        device.queue.writeBuffer(densitySharedDebugUniformBuffer, 0, data);
        sharedDebugBindGroup = device.createBindGroup({
          label: 'density-shared-debug-bindings',
          layout: debugPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: diagnostics.sampler },
            { binding: 1, resource: diagnostics.baseView },
            { binding: 2, resource: diagnostics.detailView },
            { binding: 3, resource: diagnostics.macroView },
            { binding: 4, resource: { buffer: densitySharedDebugUniformBuffer } },
          ],
        });
        stats.densitySharedFieldDebugReason = '';
      } else {
        stats.densitySharedFieldDebugReason = diagnostics
          ? densitySharedDebugFailureReason || 'debug-pipeline-unavailable'
          : 'active-producer-has-no-ready-shared-fields';
      }
    } else {
      stats.densitySharedFieldDebugReason = '';
    }

    const textureView = context!.getCurrentTexture().createView();
    const postPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          clearValue: todBackground(params.sunElevation, params.todPaletteBlend),
          storeOp: 'store',
        },
      ],
      ...(timestampEnabled && tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 10, endOfPassWriteIndex: 11 } } : {}),
    });
    if (sharedDebugBindGroup && densitySharedDebugPipeline) {
      postPass.setPipeline(densitySharedDebugPipeline);
      postPass.setBindGroup(0, sharedDebugBindGroup);
    } else {
      postPass.setPipeline(postPipeline);
      postPass.setBindGroup(0, postBindGroup);
    }
    postPass.draw(3);
    postPass.end();

    if (axisVertCount > 0) {
      lineCamData.set(cam.viewProj, 0);
      lineCamData[16] = 1.0;
      device.queue.writeBuffer(lineCamBuffer, 0, lineCamData);
      const axisPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          loadOp: 'load',
          storeOp: 'store',
        }],
      });
      axisPass.setPipeline(axisPipeline);
      axisPass.setBindGroup(0, axisBindGroup);
      axisPass.setVertexBuffer(0, axisVertexBuffer);
      axisPass.draw(axisVertCount);
      axisPass.end();
    }
    histIndex ^= 1;

    if (timestampEnabled && tsQuerySet && tsResolve && tsRead && !tsMapping) {
      commandEncoder.resolveQuerySet(tsQuerySet, 0, TS_COUNT, tsResolve, 0);
      commandEncoder.copyBufferToBuffer(tsResolve, 0, tsRead, 0, TS_COUNT * 8);
    }

    device.queue.submit([commandEncoder.finish()]);
    densityProducerSelector.commitTransition();

    stats.width = canvas.width;
    stats.height = canvas.height;
    const densityStats = densityProducerSelector.getActive().getStats();
    const densitySelection = densityProducerSelector.getSelection();
    const currentQualitySelection = densityQualityPipelineManager.getSelection();
    stats.activeBodyCount = densityStats.activeBodyCount;
    stats.densityRes = densityStats.resolution;
    stats.weatherSize = weatherSize;
    stats.cacheWg = [...densityStats.workgroup] as [number, number, number];
    stats.densityQualityRequested = currentQualitySelection.requested;
    stats.densityQualityActive = currentQualitySelection.active;
    stats.densityQualityLifecycle = currentQualitySelection.lifecycle;
    stats.densityQualityFallbackReason = currentQualitySelection.reason;
    stats.densityQualityActiveGeneration = currentQualitySelection.activeGeneration;
    stats.densityQualityPipelines = densityQualityPipelineManager.getStates();
    stats.densityHierarchicalPipelines = densityQualityPipelineManager.getHierarchicalStates();
    stats.densityStorageRequested = currentQualitySelection.requestedStorage;
    stats.densityStorageActive = currentQualitySelection.activeStorage;
    stats.densityStorageLifecycle = currentQualitySelection.storageLifecycle;
    stats.densityStorageFallbackReason = currentQualitySelection.storageReason;
    stats.densityProducerRequested = densitySelection.requested;
    stats.densityProducerActive = densitySelection.active;
    stats.densityProducerActiveGeneration = densitySelection.activeGeneration;
    stats.densityProducerCandidateLifecycle = densitySelection.candidateLifecycle;
    stats.densityProducerCandidateReason = densitySelection.candidateReason;
    stats.densityProducerFallbackReason = densitySelection.fallbackReason;
    stats.densityProducerResourceGeneration = densityStats.resourceGeneration;
    stats.densityProducerContentRevision = densityStats.contentRevision;
    stats.densityProducerLifecycle = densityStats.lifecycle;
    stats.densityProducerFailureReason = densityStats.failureReason;
    stats.densityProducerCreateCpuMs = densityStats.createCpuMs;
    stats.densityProducerRebuildCpuMs = densityStats.rebuildCpuMs;
    stats.densityProducerShaderModuleCreateCpuMs = densityStats.shaderModuleCreateCpuMs;
    stats.densityProducerPipelineCreateCpuMs = densityStats.pipelineCreateCpuMs;
    stats.densityProducerSourceLength = densityStats.sourceLength;
    stats.densityProducerRecordBytes = densityStats.recordBytes;
    stats.densityProducerOutputBytes = densityStats.outputBytes;
    stats.densityProducerDispatchWorkgroups = [...densityStats.dispatchWorkgroups] as [number, number, number];
    stats.densityProducerEmptyDensity = densityStats.emptyDensity;
    stats.densityProducerTileMask = densityStats.tileMask;
    stats.densityProducerSharedFields = densityStats.sharedFields;
    stats.densityProducerEvaluator = densityStats.evaluator;
    stats.densityProducerBricks = densityStats.bricks;
    stats.cacheRan = cacheRan;
    stats.shadowRan = shadowRan;
    stats.shadowMapResolution = groundShadowResolution;
    stats.shadowUpdated = shadowRan;
    stats.shadowHistoryResetReason = groundShadowResetReason;

    if (timestampEnabled && tsRead && !tsMapping) {
      tsMapping = true;
      device.queue.onSubmittedWorkDone().then(() => tsRead.mapAsync(GPUMapMode.READ)).then(() => {
        const ts = new BigInt64Array(tsRead.getMappedRange().slice(0));
        tsRead.unmap();
        const renderNs = Number(ts[9] - ts[8]);
        if (renderNs >= 0) stats.cloudMs = renderNs / 1e6;
        const postNs = Number(ts[11] - ts[10]);
        if (postNs >= 0) stats.postMs = postNs / 1e6;
        if (cacheRan) {
          const cacheNs = Number(ts[1] - ts[0]);
          if (cacheNs >= 0) stats.cacheMs = cacheNs / 1e6;
          stats.cacheSampleId++;
        }
        if (brickRan) {
          const brickNs = Number(ts[17] - ts[16]);
          if (brickNs >= 0) stats.brickMs = brickNs / 1e6;
          stats.brickSampleId++;
          densityProducerSelector.recordRecipeV2BrickGpuTiming(
            brickNs >= 0 ? brickNs / 1e6 : null,
          );
        }
        if (shadowRan) {
          const integrationNs = Number(ts[3] - ts[2]);
          const filterNs = Number(ts[5] - ts[4]);
          const resolveNs = Number(ts[7] - ts[6]);
          if (integrationNs >= 0 && filterNs >= 0 && resolveNs >= 0) stats.shadowMs = (integrationNs + filterNs + resolveNs) / 1e6;
          stats.shadowSampleId++;
        }
        if (sharedAtlasRan || sharedMacroRan) {
          const atlasNs = sharedAtlasRan ? Number(ts[13] - ts[12]) : -1;
          const macroNs = sharedMacroRan ? Number(ts[15] - ts[14]) : -1;
          densityProducerSelector.recordRecipeV2SharedFieldGpuTiming(
            atlasNs >= 0 ? atlasNs / 1e6 : null,
            macroNs >= 0 ? macroNs / 1e6 : null,
          );
        }
        stats.cacheRan = cacheRan;
        stats.shadowRan = shadowRan;
        stats.gpuSampleId++;
        tsMapping = false;
      }).catch((error: unknown) => {
        stats.gpuTimingError = error instanceof Error ? error.message : String(error);
        stats.gpuTiming = false;
        timestampEnabled = false;
        tsMapping = false;
      });
    }
  }

  function getStats() {
    return stats;
  }

  function destroy(): void {
    if (rendererDestroyed) return;
    rendererDestroyed = true;
    densityQualityPipelineManager.destroy();
    densityProducerSelector.destroy();
    densitySharedDebugUniformBuffer?.destroy();
    device.destroy();
  }

  startupTiming.shaderModuleCreateMs = shaderModuleCreateMs;
  startupTiming.pipelineCreateMs = pipelineCreateMs;
  startupTiming.totalCreateRendererMs = performance.now() - createRendererStarted;

  return {
    getStats,
    resizeCanvas,
    setFixedCanvasSize,
    setDensityResolution,
    setWeatherSize,
    setCacheWorkgroup,
    setBodies,
    setBodyMods,
    setWindSamples,
    updatePresets,
    renderFrame,
    destroy,
  };
}
