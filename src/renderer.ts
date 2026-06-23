import noiseSource from '../shaders/noise.wgsl?raw';
import cloudSource from '../shaders/cloud.wgsl?raw';
import {
  packParams,
  packPresetArray,
  PARAMS_FLOAT_COUNT,
  PARAMS_BYTE_SIZE,
  PRESET_BYTE_SIZE,
  type CloudParams,
} from './params';
import { WEATHER_SIZE, createWeatherData, paintRegions, type Region } from './weather';
import type { CameraFrame } from './camera';

const shaderSource = noiseSource + cloudSource;

export interface Renderer {
  resizeCanvas(): void;
  setDensityResolution(res: number): void;
  setRegions(regions: Region[]): void;
  renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number): void;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  if (!navigator.gpu) {
    document.body.innerHTML = '<p style="color:white;padding:2rem;">WebGPU is not supported in this browser.</p>';
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No appropriate GPUAdapter found');

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Failed to get webgpu context');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const shaderModule = device.createShaderModule({ code: shaderSource });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs' },
    fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'cs' },
  });

  const cameraBuffer = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const paramsBuffer = device.createBuffer({
    size: PARAMS_BYTE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
    ],
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

  const weatherTexture = device.createTexture({
    size: [WEATHER_SIZE, WEATHER_SIZE],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const weatherData = createWeatherData();
  weatherData.fill(0);

  function setRegions(regions: Region[]): void {
    paintRegions(weatherData, regions);
    device.queue.writeTexture(
      { texture: weatherTexture },
      weatherData,
      { bytesPerRow: WEATHER_SIZE * 4, rowsPerImage: WEATHER_SIZE },
      { width: WEATHER_SIZE, height: WEATHER_SIZE },
    );
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

  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: weatherTexture.createView() },
      { binding: 3, resource: linearSampler },
      { binding: 4, resource: { buffer: presetBuffer } },
    ],
  });

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

  const paramsData = new Float32Array(PARAMS_FLOAT_COUNT);
  const cameraData = new Float32Array(20);

  function buildParams(params: CloudParams, morphTime: number, cacheBlend: number, sceneTime: number, deltaTime: number): Float32Array {
    const rad = params.windDeg * Math.PI / 180.0;
    return packParams(paramsData, {
      noiseTime: morphTime,
      timeVoronoi1: morphTime,
      timeVoronoi2: morphTime,
      density: params.density,
      lowAltDensity: 0.2,
      altitude: params.altitude,
      coverage: params.coverage,
      factorDetail: 1.0,
      factorShaper: 1.0,
      scale: params.scale,
      detail: params.detail,
      coverageThreshold: params.coverageThreshold,
      edgeSharpness: params.edgeSharpness,
      baseRoundness: params.baseRoundness,
      worleyBlend: params.worleyBlend,
      detailStrength: params.detailStrength,
      altBase: params.altBase,
      altTop: params.altTop,
      rayMarchSteps: params.rayMarchSteps,
      skipLight: params.skipLight,
      cacheBlend,
      lightMarchSteps: params.lightMarchSteps,
      shadowDarkness: params.shadowDarkness,
      sunIntensity: params.sunIntensity,
      cloudHeight: params.cloudHeight,
      windDir: [Math.cos(rad), Math.sin(rad), 0.0],
      windSpeed: params.windSpeed,
      morphRate: params.morphRate,
      sceneTime,
      deltaTime,
    });
  }

  function renderFrame(params: CloudParams, cam: CameraFrame, elapsed: number): void {
    frameIndex++;

    cameraData.set(cam.invViewProj, 0);
    cameraData[16] = cam.eye[0];
    cameraData[17] = cam.eye[1];
    cameraData[18] = cam.eye[2];
    device.queue.writeBuffer(cameraBuffer, 0, cameraData);

    const morphTime = elapsed * params.morphRate;
    const blendDenom = Math.max(1e-5, nextCacheTime - prevCacheTime);
    const linearBlend = Math.min(1.0, Math.max(0.0, (elapsed - prevCacheTime) / blendDenom));
    let cacheBlend = linearBlend;
    if (params.cacheSmooth > 0.0) {
      cacheBlend = Math.pow(linearBlend, 1.0 / (1.0 + params.cacheSmooth * 4.0));
    }

    const deltaTime = elapsed - prevSceneTime;
    prevSceneTime = elapsed;

    device.queue.writeBuffer(paramsBuffer, 0, buildParams(params, morphTime, cacheBlend, elapsed, deltaTime));

    const commandEncoder = device.createCommandEncoder();

    if (frameIndex % params.cacheUpdateRate === 0) {
      prevCacheTime = nextCacheTime;
      nextCacheTime = elapsed;
      cacheIndex = 1 - cacheIndex;

      densityStoreBindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: densityTextures![cacheIndex].createView({ dimension: '3d' }) },
        ],
      });

      const pass = commandEncoder.beginComputePass();
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBindGroup);
      pass.setBindGroup(2, densityStoreBindGroup);
      pass.dispatchWorkgroups(Math.ceil(densityRes / 8), Math.ceil(densityRes / 8), Math.ceil(densityRes / 4));
      pass.end();
    }

    const textureView = context!.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          clearValue: { r: 0.075, g: 0.145, b: 0.25, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setBindGroup(1, densitySampleBindGroup);
    renderPass.draw(3);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  return { resizeCanvas, setDensityResolution, setRegions, renderFrame };
}
