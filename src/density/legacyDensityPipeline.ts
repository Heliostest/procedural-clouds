import { buildLegacyDensityCacheShaderSource, densityShaderSourceLength } from '../rendering/densityShaderSources';

export interface LegacyDensityPipelineCreationStats {
  shaderModuleCreateCpuMs: number;
  pipelineCreateCpuMs: number;
  sourceLength: number;
}

export interface LegacyDensityPipelineResources {
  readonly module: GPUShaderModule;
  readonly pipeline: GPUComputePipeline;
  readonly creation: LegacyDensityPipelineCreationStats;
  createPipeline(workgroup: readonly [number, number, number]): GPUComputePipeline;
}

function pipelineDescriptor(
  module: GPUShaderModule,
  workgroup: readonly [number, number, number],
): GPUComputePipelineDescriptor {
  return {
    label: 'legacy-density-cache-compute',
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'cs',
      constants: { wg_x: workgroup[0], wg_y: workgroup[1], wg_z: workgroup[2] },
    },
  };
}

export async function createLegacyDensityPipelineResources(
  device: GPUDevice,
  workgroup: readonly [number, number, number],
): Promise<LegacyDensityPipelineResources> {
  const source = buildLegacyDensityCacheShaderSource();
  const moduleStarted = performance.now();
  const module = device.createShaderModule({
    label: 'legacy-density-cache-module',
    code: source,
  });
  const shaderModuleCreateCpuMs = performance.now() - moduleStarted;
  const pipelineStarted = performance.now();
  let pipeline: GPUComputePipeline;
  try {
    pipeline = await device.createComputePipelineAsync(pipelineDescriptor(module, workgroup));
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`legacy-density-pipeline-create-failed: ${reason}`);
  }
  const pipelineCreateCpuMs = performance.now() - pipelineStarted;
  return {
    module,
    pipeline,
    creation: {
      shaderModuleCreateCpuMs,
      pipelineCreateCpuMs,
      sourceLength: densityShaderSourceLength('legacy-cache'),
    },
    createPipeline(nextWorkgroup) {
      return device.createComputePipeline(pipelineDescriptor(module, nextWorkgroup));
    },
  };
}
