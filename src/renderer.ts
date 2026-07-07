import noiseSource from '../shaders/noise.wgsl?raw';
import cloudSource from '../shaders/cloud.wgsl?raw';
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

const shaderSource = noiseSource + cloudSource;

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

function todBackground(elevDeg: number): { r: number; g: number; b: number; a: number } {
  const t = Math.max(0, Math.min(1, Math.sin((elevDeg * Math.PI) / 180)));
  const e = Math.max(0, Math.min(1, (t - 0.0) / 0.5));
  const tk = e * e * (3 - 2 * e);
  const dusk = [0.2, 0.09, 0.1];
  const day = [0.045, 0.1, 0.18];
  return {
    r: dusk[0] + (day[0] - dusk[0]) * tk,
    g: dusk[1] + (day[1] - dusk[1]) * tk,
    b: dusk[2] + (day[2] - dusk[2]) * tk,
    a: 1.0,
  };
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
    if (b.shape === 'rect') {
      const [minX, minZ, maxX, maxZ] = b.bounds;
      const corners: [number, number][] = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
      for (let k = 0; k < 4; k++) {
        const [cx, cz] = corners[k];
        const [nx, nz] = corners[(k + 1) % 4];
        seg(cx, y0, cz, nx, y0, nz, col);
        seg(cx, y1, cz, nx, y1, nz, col);
        seg(cx, y0, cz, cx, y1, cz, col);
      }
    } else {
      const [cx, cz, rad] = b.bounds;
      const N = 40;
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * Math.PI * 2;
        const a1 = ((k + 1) / N) * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * rad, z0 = cz + Math.sin(a0) * rad;
        const x1 = cx + Math.cos(a1) * rad, z1 = cz + Math.sin(a1) * rad;
        seg(x0, y0, z0, x1, y0, z1, col);
        seg(x0, y1, z0, x1, y1, z1, col);
        if (k % 10 === 0) seg(x0, y0, z0, x0, y1, z0, col);
      }
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
  cloudMs: number;
  cacheMs: number;
  postMs: number;
  width: number;
  height: number;
  densityRes: number;
  weatherSize: number;
  cacheWg: [number, number, number];
}

export interface Renderer {
  getStats(): RenderStats;
  resizeCanvas(): void;
  setDensityResolution(res: number): void;
  setWeatherSize(size: number): void;
  setCacheWorkgroup(x: number, y: number, z: number): void;
  setBodies(bodies: CloudBody[]): void;
  setBodyMods(mods: BodyMod[]): void;
  setWindSamples(samples: readonly WindAdvectionSample[]): void;
  updatePresets(): void;
  renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number, sceneClock?: number): void;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  if (!navigator.gpu) {
    document.body.innerHTML = '<p style="color:white;padding:2rem;">WebGPU is not supported in this browser.</p>';
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No appropriate GPUAdapter found');

  const hasTimestamp = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice(
    hasTimestamp ? { requiredFeatures: ['timestamp-query'] } : {},
  );
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Failed to get webgpu context');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const shaderModule = device.createShaderModule({ code: shaderSource });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs' },
    fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });

  const postModule = device.createShaderModule({ code: postShaderSource });
  const postPipeline = device.createRenderPipeline({
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

  const bloomModule = device.createShaderModule({ code: bloomShaderSource });
  const bloomExtractPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: bloomModule, entryPoint: 'vsBloom' },
    fragment: { module: bloomModule, entryPoint: 'fsBloomExtract', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });
  const bloomDownPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: bloomModule, entryPoint: 'vsBloom' },
    fragment: { module: bloomModule, entryPoint: 'fsBloomDown', targets: [{ format: OFFSCREEN_FORMAT }] },
    primitive: { topology: 'triangle-list' },
  });
  const bloomUpPipeline = device.createRenderPipeline({
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

  const taaModule = device.createShaderModule({ code: taaShaderSource });
  const taaPipeline = device.createRenderPipeline({
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
  let cacheWg: [number, number, number] = [8, 8, 4];
  let computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'cs',
      constants: { wg_x: cacheWg[0], wg_y: cacheWg[1], wg_z: cacheWg[2] },
    },
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

  let computeBindGroup: GPUBindGroup;
  let bindGroup: GPUBindGroup;

  function rebuildSceneBindGroups(): void {
    computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: { buffer: paramsBuffer } },
        { binding: 2, resource: shapeTexture.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: linearSampler },
        { binding: 4, resource: { buffer: presetBuffer } },
      ],
    });
    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
        { binding: 2, resource: shapeTexture.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: linearSampler },
        { binding: 4, resource: { buffer: presetBuffer } },
      ],
    });
  }

  const lineModule = device.createShaderModule({ code: lineShaderSource });
  const linePipeline = device.createRenderPipeline({
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
  const axisPipeline = device.createRenderPipeline({
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
  }

  function setWeatherSize(size: number): void {
    const next = Math.max(64, Math.min(1024, Math.round(size)));
    if (next === weatherSize) return;
    weatherSize = next;
    shapeTexture.destroy();
    shapeTexture = createShapeTexture(weatherSize);
    shapeData = createShapeData(weatherSize);
    shapeSignature = '';
    rebuildSceneBindGroups();
    uploadShapes();
  }

  function setCacheWorkgroup(x: number, y: number, z: number): void {
    const wx = Math.max(1, Math.min(32, Math.round(x)));
    const wy = Math.max(1, Math.min(32, Math.round(y)));
    const wz = Math.max(1, Math.min(16, Math.round(z)));
    if (wx === cacheWg[0] && wy === cacheWg[1] && wz === cacheWg[2]) return;
    cacheWg = [wx, wy, wz];
    computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'cs',
        constants: { wg_x: wx, wg_y: wy, wg_z: wz },
      },
    });
    rebuildSceneBindGroups();
    if (densityTextures) {
      densityStoreBindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: densityTextures[cacheIndex].createView({ dimension: '3d' }) },
        ],
      });
    }
  }

  let cacheIndex = 0;
  let cacheValidCount = 0;
  let cacheTransitionStart = 0.0;
  let cacheTransitionDuration = 1 / 60;
  let lastCacheUpdateElapsed = 0.0;
  let lastCachedWindOffsets: Array<[number, number]> = [];
  let densityRes = 96;
  let densityTextures: [GPUTexture, GPUTexture] | null = null;
  let densitySampleBindGroup: GPUBindGroup;
  let densityStoreBindGroup: GPUBindGroup;

  function setDensityResolution(res: number): void {
    if (densityTextures) for (const t of densityTextures) t.destroy();
    densityRes = res;
    densityTextures = [0, 1].map(() => device.createTexture({
      size: [res, res, res],
      dimension: '3d',
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })) as [GPUTexture, GPUTexture];

    densityStoreBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: densityTextures[0].createView({ dimension: '3d' }) },
      ],
    });
    densitySampleBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: linearSampler },
        { binding: 1, resource: densityTextures[0].createView({ dimension: '3d' }) },
        { binding: 2, resource: densityTextures[1].createView({ dimension: '3d' }) },
      ],
    });
    cacheValidCount = 0;
    lastCachedWindOffsets = [];
  }

  setDensityResolution(densityRes);
  rebuildSceneBindGroups();

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

  function resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }

  let frameIndex = 0;
  let prevSceneTime = 0.0;

  const TS_COUNT = 6; // [computeStart, computeEnd, renderStart, renderEnd, postStart, postEnd]
  const tsQuerySet = hasTimestamp ? device.createQuerySet({ type: 'timestamp', count: TS_COUNT }) : null;
  const tsResolve = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
  const tsRead = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
  let tsMapping = false;
  const stats = {
    gpuTiming: hasTimestamp,
    cloudMs: 0,
    cacheMs: 0,
    postMs: 0,
    width: 0,
    height: 0,
    densityRes,
    weatherSize,
    cacheWg: [cacheWg[0], cacheWg[1], cacheWg[2]] as [number, number, number],
  };

  const paramsData = new Float32Array(PARAMS_FLOAT_COUNT);
  const cameraData = new Float32Array(20);

  function buildParams(params: CloudParams, cacheBlend: number, sceneTime: number, deltaTime: number, frameIndex: number, jitterX: number, jitterY: number, taaOn: boolean): Float32Array {
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
      qualityMode: params.qualityMode,
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
    });
    packBodies(paramsData, currentBodies, currentMods, currentWindSamples, params);
    return paramsData;
  }

  function windMovedPastVoxel(params: CloudParams): boolean {
    if (currentWindSamples.length !== lastCachedWindOffsets.length) return true;
    const horizontalVoxelM = (params.boxHalfExtent * 2) / Math.max(1, densityRes);
    for (let i = 0; i < currentWindSamples.length; i++) {
      const current = currentWindSamples[i].offsetM;
      const previous = lastCachedWindOffsets[i];
      if (Math.hypot(current[0] - previous[0], current[1] - previous[1]) > horizontalVoxelM) return true;
    }
    return false;
  }

  function snapshotCachedWindOffsets(): void {
    lastCachedWindOffsets = currentWindSamples.map((sample) => [sample.offsetM[0], sample.offsetM[1]]);
  }

  function renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number, sceneClock?: number): void {
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

    const scheduledCacheUpdate = frameIndex % Math.max(1, params.cacheUpdateRate) === 0;
    const cacheWillRun = params.qualityMode !== 2 && (scheduledCacheUpdate || windMovedPastVoxel(params));
    if (cacheWillRun) {
      const interval = lastCacheUpdateElapsed > 0 ? elapsed - lastCacheUpdateElapsed : 1 / 60;
      cacheTransitionDuration = Math.max(1 / 240, interval);
      cacheTransitionStart = elapsed;
      lastCacheUpdateElapsed = elapsed;
      cacheIndex = 1 - cacheIndex;
      cacheValidCount++;
      snapshotCachedWindOffsets();
    }
    let cacheBlend: number;
    if (cacheValidCount <= 1) {
      cacheBlend = cacheIndex === 0 ? 0 : 1;
    } else {
      let progress = Math.min(1, Math.max(0, (elapsed - cacheTransitionStart) / cacheTransitionDuration));
      if (params.cacheSmooth > 0) progress = Math.pow(progress, 1 / (1 + params.cacheSmooth * 4));
      cacheBlend = cacheIndex === 1 ? progress : 1 - progress;
    }

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

    const taaOn = params.taaEnabled;
    let jitterX = 0.0;
    let jitterY = 0.0;
    if (taaOn) {
      const hi = (frameIndex % 8) + 1;
      jitterX = halton(hi, 2) - 0.5;
      jitterY = halton(hi, 3) - 0.5;
    }
    device.queue.writeBuffer(paramsBuffer, 0, buildParams(params, cacheBlend, clock, deltaTime, frameIndex, jitterX, jitterY, taaOn));

    const commandEncoder = device.createCommandEncoder();
    let cacheRan = false;

    if (cacheWillRun) {
      cacheRan = true;
      densityStoreBindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: densityTextures![cacheIndex].createView({ dimension: '3d' }) },
        ],
      });

      const pass = commandEncoder.beginComputePass(
        tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : undefined,
      );
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBindGroup);
      pass.setBindGroup(2, densityStoreBindGroup);
      pass.dispatchWorkgroups(
        Math.ceil(densityRes / cacheWg[0]),
        Math.ceil(densityRes / cacheWg[1]),
        Math.ceil(densityRes / cacheWg[2]),
      );
      pass.end();
    }

    ensureSceneTexture(canvas.width, canvas.height);

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: sceneView!,
          loadOp: 'clear',
          clearValue: todBackground(params.sunElevation),
          storeOp: 'store',
        },
      ],
      ...(tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 } } : {}),
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setBindGroup(1, densitySampleBindGroup);
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

    const textureView = context!.getCurrentTexture().createView();
    const postPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          clearValue: todBackground(params.sunElevation),
          storeOp: 'store',
        },
      ],
      ...(tsQuerySet ? { timestampWrites: { querySet: tsQuerySet, beginningOfPassWriteIndex: 4, endOfPassWriteIndex: 5 } } : {}),
    });
    postPass.setPipeline(postPipeline);
    postPass.setBindGroup(0, postBindGroup);
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

    if (tsQuerySet && tsResolve && tsRead && !tsMapping) {
      commandEncoder.resolveQuerySet(tsQuerySet, 0, TS_COUNT, tsResolve, 0);
      commandEncoder.copyBufferToBuffer(tsResolve, 0, tsRead, 0, TS_COUNT * 8);
    }

    device.queue.submit([commandEncoder.finish()]);

    stats.width = canvas.width;
    stats.height = canvas.height;
    stats.densityRes = densityRes;
    stats.weatherSize = weatherSize;
    stats.cacheWg = [cacheWg[0], cacheWg[1], cacheWg[2]];

    if (tsRead && !tsMapping) {
      tsMapping = true;
      tsRead.mapAsync(GPUMapMode.READ).then(() => {
        const ts = new BigInt64Array(tsRead.getMappedRange().slice(0));
        tsRead.unmap();
        const renderNs = Number(ts[3] - ts[2]);
        if (renderNs >= 0) stats.cloudMs = renderNs / 1e6;
        const postNs = Number(ts[5] - ts[4]);
        if (postNs >= 0) stats.postMs = postNs / 1e6;
        if (cacheRan) {
          const cacheNs = Number(ts[1] - ts[0]);
          if (cacheNs >= 0) stats.cacheMs = cacheNs / 1e6;
        }
        tsMapping = false;
      }).catch(() => { tsMapping = false; });
    }
  }

  function getStats() {
    return stats;
  }

  return {
    getStats,
    resizeCanvas,
    setDensityResolution,
    setWeatherSize,
    setCacheWorkgroup,
    setBodies,
    setBodyMods,
    setWindSamples,
    updatePresets,
    renderFrame,
  };
}
