import emptyDensitySource from '../../shaders/density-v2-empty.wgsl?raw';
import {
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_FRAME_GPU_LAYOUT,
  DENSITY_RECIPE_GPU_LAYOUT,
  buildDensityV2WgslAbi,
  verifyDensityV2Layouts,
} from './recipeV2Layout';
import { verifyDensityV2PackingFixtures } from './recipeV2PackingFixtures';
import { verifyDensityRecipeV2Table } from './recipeV2Recipes';

export interface RecipeV2PipelineCreationStats {
  shaderModuleCreateCpuMs: number;
  pipelineCreateCpuMs: number;
  sourceLength: number;
}

export interface RecipeV2PipelineResources {
  readonly module: GPUShaderModule;
  readonly inputLayout: GPUBindGroupLayout;
  readonly outputLayout: GPUBindGroupLayout;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly pipeline: GPUComputePipeline;
  readonly source: string;
  readonly creation: RecipeV2PipelineCreationStats;
  createPipeline(workgroup: readonly [number, number, number]): GPUComputePipeline;
}

function validateWorkgroup(
  limits: GPUSupportedLimits,
  requested: readonly [number, number, number],
): [number, number, number] {
  const workgroup = requested.map((value) => Math.round(value)) as [number, number, number];
  const [x, y, z] = workgroup;
  if (x < 1 || y < 1 || z < 1) throw new Error(`Density V2 workgroup must be positive: ${workgroup.join('x')}`);
  if (x > limits.maxComputeWorkgroupSizeX
    || y > limits.maxComputeWorkgroupSizeY
    || z > limits.maxComputeWorkgroupSizeZ) {
    throw new Error(`Density V2 workgroup dimension exceeds device limits: ${workgroup.join('x')}`);
  }
  if (x * y * z > limits.maxComputeInvocationsPerWorkgroup) {
    throw new Error(`Density V2 workgroup invocation product exceeds device limit: ${x * y * z}`);
  }
  return workgroup;
}

function descriptor(
  pipelineLayout: GPUPipelineLayout,
  module: GPUShaderModule,
  workgroup: readonly [number, number, number],
): GPUComputePipelineDescriptor {
  return {
    label: 'recipe-density-v2-empty-compute',
    layout: pipelineLayout,
    compute: {
      module,
      entryPoint: 'csDensityV2Empty',
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
  const workgroup = validateWorkgroup(device.limits, requestedWorkgroup);
  const source = `${buildDensityV2WgslAbi()}\n\n${emptyDensitySource}`;
  const inputLayout = device.createBindGroupLayout({
    label: 'recipe-density-v2-input-layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform', minBindingSize: DENSITY_FRAME_GPU_LAYOUT.stride },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
          minBindingSize: DENSITY_BODY_GPU_LAYOUT.stride * DENSITY_BODY_GPU_LAYOUT.count,
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
          minBindingSize: DENSITY_RECIPE_GPU_LAYOUT.stride * DENSITY_RECIPE_GPU_LAYOUT.count,
        },
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
  const pipelineLayout = device.createPipelineLayout({
    label: 'recipe-density-v2-pipeline-layout',
    bindGroupLayouts: [inputLayout, outputLayout],
  });
  const moduleStarted = performance.now();
  const module = device.createShaderModule({ label: 'recipe-density-v2-empty-module', code: source });
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
    pipelineLayout,
    pipeline,
    source,
    creation: { shaderModuleCreateCpuMs, pipelineCreateCpuMs, sourceLength: source.length },
    createPipeline(nextWorkgroup) {
      const validated = validateWorkgroup(device.limits, nextWorkgroup);
      return device.createComputePipeline(descriptor(pipelineLayout, module, validated));
    },
  };
}
