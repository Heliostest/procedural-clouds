import commonDensitySource from '../../shaders/density-v2-common.wgsl?raw';
import cumulusDensitySource from '../../shaders/density-v2-cumulus.wgsl?raw';
import spikeDensitySource from '../../shaders/density-v2-spike.wgsl?raw';
import stratusDensitySource from '../../shaders/density-v2-stratus.wgsl?raw';
import sharedFieldBindingsSource from '../../shaders/density-shared-fields-bindings.wgsl?raw';
import sharedFieldSamplingSource from '../../shaders/density-shared-sampling.wgsl?raw';
import {
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_FRAME_GPU_LAYOUT,
  DENSITY_RECIPE_GPU_LAYOUT,
  DENSITY_V2_INPUT_BINDINGS,
  DENSITY_V2_TILE_MASK_WORD_BYTES,
  buildDensityV2WgslAbi,
  verifyDensityV2Layouts,
} from './recipeV2Layout';
import { verifyDensityV2PackingFixtures } from './recipeV2PackingFixtures';
import { verifyDensityV2EvaluatorMathFixtures } from './recipeV2EvaluatorMath';
import { verifyDensityRecipeV2Table } from './recipeV2Recipes';
import { verifyDensityV2TileMaskFixtures } from './recipeV2TileMaskFixtures';

export interface RecipeV2PipelineCreationStats {
  shaderModuleCreateCpuMs: number;
  pipelineCreateCpuMs: number;
  sourceLength: number;
}

export interface RecipeV2PipelineResources {
  readonly module: GPUShaderModule;
  readonly inputLayout: GPUBindGroupLayout;
  readonly outputLayout: GPUBindGroupLayout;
  readonly sharedFieldLayout: GPUBindGroupLayout;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly pipeline: GPUComputePipeline;
  readonly source: string;
  readonly creation: RecipeV2PipelineCreationStats;
  createPipeline(workgroup: readonly [number, number, number]): GPUComputePipeline;
}

export function clampDensityV2Workgroup(
  limits: GPUSupportedLimits,
  requested: readonly [number, number, number],
): [number, number, number] {
  let x = Math.max(1, Math.min(limits.maxComputeWorkgroupSizeX, Math.round(requested[0])));
  let y = Math.max(1, Math.min(limits.maxComputeWorkgroupSizeY, Math.round(requested[1])));
  let z = Math.max(1, Math.min(limits.maxComputeWorkgroupSizeZ, Math.round(requested[2])));
  const maxInvocations = Math.max(1, limits.maxComputeInvocationsPerWorkgroup);
  while (x * y * z > maxInvocations) {
    if (x >= y && x >= z && x > 1) x -= 1;
    else if (y >= z && y > 1) y -= 1;
    else if (z > 1) z -= 1;
    else break;
  }
  return [x, y, z];
}

function descriptor(
  pipelineLayout: GPUPipelineLayout,
  module: GPUShaderModule,
  workgroup: readonly [number, number, number],
): GPUComputePipelineDescriptor {
  return {
    label: 'recipe-density-v2-spike-compute',
    layout: pipelineLayout,
    compute: {
      module,
      entryPoint: 'csDensityV2Spike',
      constants: { wg_x: workgroup[0], wg_y: workgroup[1], wg_z: workgroup[2] },
    },
  };
}

export async function createRecipeV2PipelineResources(
  device: GPUDevice,
  requestedWorkgroup: readonly [number, number, number],
): Promise<RecipeV2PipelineResources> {
  verifyDensityV2Layouts();
  verifyDensityRecipeV2Table();
  verifyDensityV2PackingFixtures();
  verifyDensityV2TileMaskFixtures();
  verifyDensityV2EvaluatorMathFixtures();
  const workgroup = clampDensityV2Workgroup(device.limits, requestedWorkgroup);
  const source = [
    buildDensityV2WgslAbi(),
    sharedFieldBindingsSource,
    sharedFieldSamplingSource,
    commonDensitySource,
    stratusDensitySource,
    cumulusDensitySource,
    spikeDensitySource,
  ].join('\n\n');
  const inputLayout = device.createBindGroupLayout({
    label: 'recipe-density-v2-input-layout',
    entries: [
      {
        binding: DENSITY_V2_INPUT_BINDINGS.frame,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform', minBindingSize: DENSITY_FRAME_GPU_LAYOUT.stride },
      },
      {
        binding: DENSITY_V2_INPUT_BINDINGS.bodies,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
          minBindingSize: DENSITY_BODY_GPU_LAYOUT.stride * DENSITY_BODY_GPU_LAYOUT.count,
        },
      },
      {
        binding: DENSITY_V2_INPUT_BINDINGS.recipes,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
          minBindingSize: DENSITY_RECIPE_GPU_LAYOUT.stride * DENSITY_RECIPE_GPU_LAYOUT.count,
        },
      },
      {
        binding: DENSITY_V2_INPUT_BINDINGS.tileMask,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage', minBindingSize: DENSITY_V2_TILE_MASK_WORD_BYTES },
      },
    ],
  });
  const outputLayout = device.createBindGroupLayout({
    label: 'recipe-density-v2-output-layout',
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' },
    }],
  });
  const sharedFieldLayout = device.createBindGroupLayout({
    label: 'recipe-density-v2-shared-field-layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: 'recipe-density-v2-pipeline-layout',
    bindGroupLayouts: [inputLayout, outputLayout, sharedFieldLayout],
  });
  const moduleStarted = performance.now();
  const module = device.createShaderModule({ label: 'recipe-density-v2-spike-module', code: source });
  const shaderModuleCreateCpuMs = performance.now() - moduleStarted;
  const pipelineStarted = performance.now();
  device.pushErrorScope('validation');
  let pipeline: GPUComputePipeline | undefined;
  let creationError: unknown;
  try {
    pipeline = await device.createComputePipelineAsync(descriptor(pipelineLayout, module, workgroup));
  } catch (error: unknown) {
    creationError = error;
  }
  const validationError = await device.popErrorScope();
  if (creationError || validationError || !pipeline) {
    const reason = creationError instanceof Error
      ? creationError.message
      : validationError?.message ?? String(creationError ?? 'unknown-error');
    throw new Error(`recipe-density-v2-pipeline-create-failed: ${reason}`);
  }
  const pipelineCreateCpuMs = performance.now() - pipelineStarted;
  return {
    module,
    inputLayout,
    outputLayout,
    sharedFieldLayout,
    pipelineLayout,
    pipeline,
    source,
    creation: { shaderModuleCreateCpuMs, pipelineCreateCpuMs, sourceLength: source.length },
    createPipeline(nextWorkgroup) {
      const validated = clampDensityV2Workgroup(device.limits, nextWorkgroup);
      return device.createComputePipeline(descriptor(pipelineLayout, module, validated));
    },
  };
}
