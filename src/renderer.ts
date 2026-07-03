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
import type { BodyMod } from './lifecycle';
import type { CameraFrame } from './camera';

const shaderSource = noiseSource + cloudSource;

const OFFSCREEN_FORMAT: GPUTextureFormat = 'rgba16float';

const postShaderSource = /* wgsl */ `
struct Post { sun : vec4f };
@group(0) @binding(0) var sceneTex : texture_2d<f32>;
@group(0) @binding(1) var sceneSamp : sampler;
@group(0) @binding(2) var<uniform> post : Post;
struct VOut { @builtin(position) pos : vec4f };
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
  return vec4f(col, 1.0);
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
const BODY_COLORS: [number, number, number][] = [
  [0.2, 1.0, 0.35],
  [1.0, 0.6, 0.12],
  [0.3, 0.7, 1.0],
  [1.0, 0.3, 0.7],
  [0.9, 0.9, 0.2],
  [0.5, 0.4, 1.0],
];

function buildLineVerts(bodies: CloudBody[], cloudHeight: number, selectedId: string | null): Float32Array {
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
    const y0 = b.base * cloudHeight;
    const y1 = Math.min(1, b.base + b.thickness) * cloudHeight;
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

function buildGizmoVerts(body: CloudBody, cloudHeight: number, mode: 'move' | 'rotate'): Float32Array {
  const out: number[] = [];
  const seg = (a: number[], b: number[], c: [number, number, number]) => {
    out.push(a[0], a[1], a[2], c[0], c[1], c[2]);
    out.push(b[0], b[1], b[2], c[0], c[1], c[2]);
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
      const u = a === 1 ? [1, 0, 0] : [0, 1, 0];
      const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      const bp = [tip[0] - d[0] * back, tip[1] - d[1] * back, tip[2] - d[2] * back];
      seg(tip, [bp[0] + v[0] * w, bp[1] + v[1] * w, bp[2] + v[2] * w], col);
      seg(tip, [bp[0] - v[0] * w, bp[1] - v[1] * w, bp[2] - v[2] * w], col);
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
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const postData = new Float32Array(4);
  const postSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  let weatherSize = DEFAULT_WEATHER_SIZE;
  let boxHalfExtent = DEFAULT_BOX_HALF_EXTENT;
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
    paintBodyShapes(shapeData, currentBodies, weatherSize, boxHalfExtent);
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
  const lineCamData = new Float32Array(20);
  let lineVertCount = 0;

  let currentBodies: CloudBody[] = [];
  let currentMods: BodyMod[] = [];
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
  }

  setDensityResolution(densityRes);
  rebuildSceneBindGroups();

  let sceneTexture: GPUTexture | null = null;
  let sceneView: GPUTextureView | null = null;
  let postBindGroup: GPUBindGroup;
  let sceneW = 0;
  let sceneH = 0;

  function ensureSceneTexture(w: number, h: number): void {
    if (sceneTexture && sceneW === w && sceneH === h) return;
    if (sceneTexture) sceneTexture.destroy();
    sceneW = w;
    sceneH = h;
    sceneTexture = device.createTexture({
      size: [w, h],
      format: OFFSCREEN_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    sceneView = sceneTexture.createView();
    postBindGroup = device.createBindGroup({
      layout: postPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sceneView },
        { binding: 1, resource: postSampler },
        { binding: 2, resource: { buffer: postUniformBuffer } },
      ],
    });
  }

  function resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }

  let frameIndex = 0;
  let cacheIndex = 0;
  let prevCacheTime = 0.0;
  let nextCacheTime = 0.0;
  let prevSceneTime = 0.0;

  const TS_COUNT = 4; // [computeStart, computeEnd, renderStart, renderEnd]
  const tsQuerySet = hasTimestamp ? device.createQuerySet({ type: 'timestamp', count: TS_COUNT }) : null;
  const tsResolve = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
  const tsRead = hasTimestamp ? device.createBuffer({ size: TS_COUNT * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
  let tsMapping = false;
  const stats = {
    gpuTiming: hasTimestamp,
    cloudMs: 0,
    cacheMs: 0,
    width: 0,
    height: 0,
    densityRes,
    weatherSize,
    cacheWg: [cacheWg[0], cacheWg[1], cacheWg[2]] as [number, number, number],
  };

  const paramsData = new Float32Array(PARAMS_FLOAT_COUNT);
  const cameraData = new Float32Array(20);

  function buildParams(params: CloudParams, cacheBlend: number, sceneTime: number, deltaTime: number): Float32Array {
    packParams(paramsData, {
      rayMarchSteps: params.rayMarchSteps,
      lightMarchSteps: params.lightMarchSteps,
      shadowDarkness: params.shadowDarkness,
      sunIntensity: params.sunIntensity,
      skipLight: params.skipLight,
      cacheBlend,
      cloudHeight: params.cloudHeight,
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
      boxHalfExtent: params.boxHalfExtent,
      lightMarchStepSize: params.lightMarchStepSize,
      verticalEdgeRange: params.verticalEdgeRange,
      verticalEdgeShape: params.verticalEdgeShape,
      edgeHardness: params.edgeHardness,
      edgeHardnessThreshold: params.edgeHardnessThreshold,
      cacheWorkgroupX: params.cacheWorkgroupX,
      cacheWorkgroupY: params.cacheWorkgroupY,
      cacheWorkgroupZ: params.cacheWorkgroupZ,
    });
    packBodies(paramsData, currentBodies, currentMods);
    return paramsData;
  }

  function renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number, sceneClock?: number): void {
    frameIndex++;
    const clock = sceneClock ?? elapsed;

    cameraData.set(cam.invViewProj, 0);
    cameraData[16] = cam.eye[0];
    cameraData[17] = cam.eye[1];
    cameraData[18] = cam.eye[2];
    device.queue.writeBuffer(cameraBuffer, 0, cameraData);

    const arrays: Float32Array[] = [];
    if (params.showBodyBounds && currentBodies.length > 0) {
      arrays.push(buildLineVerts(currentBodies, params.cloudHeight, params.selectedBody));
    }
    if (params.gizmoMode && params.selectedBody) {
      const gb = currentBodies.find((b) => b.id === params.selectedBody);
      if (gb) arrays.push(buildGizmoVerts(gb, params.cloudHeight, params.gizmoMode));
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

    const blendDenom = Math.max(1e-5, nextCacheTime - prevCacheTime);
    const linearBlend = Math.min(1.0, Math.max(0.0, (elapsed - prevCacheTime) / blendDenom));
    let cacheBlend = linearBlend;
    if (params.cacheSmooth > 0.0) {
      cacheBlend = Math.pow(linearBlend, 1.0 / (1.0 + params.cacheSmooth * 4.0));
    }

    const deltaTime = clock - prevSceneTime;
    prevSceneTime = clock;

    if (params.boxHalfExtent !== boxHalfExtent) {
      boxHalfExtent = params.boxHalfExtent;
      shapeSignature = '';
      uploadShapes();
    }

    device.queue.writeBuffer(paramsBuffer, 0, buildParams(params, cacheBlend, clock, deltaTime));

    const commandEncoder = device.createCommandEncoder();
    let cacheRan = false;

    if (params.qualityMode !== 2 && frameIndex % params.cacheUpdateRate === 0) {
      cacheRan = true;
      prevCacheTime = nextCacheTime;
      nextCacheTime = elapsed;
      cacheIndex = 1 - cacheIndex;

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
      renderPass.setPipeline(linePipeline);
      renderPass.setBindGroup(0, lineBindGroup);
      renderPass.setVertexBuffer(0, lineVertexBuffer);
      renderPass.draw(lineVertCount);
    }
    renderPass.end();

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
    device.queue.writeBuffer(postUniformBuffer, 0, postData);

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
    });
    postPass.setPipeline(postPipeline);
    postPass.setBindGroup(0, postBindGroup);
    postPass.draw(3);
    postPass.end();

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
    updatePresets,
    renderFrame,
  };
}
