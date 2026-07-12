import atlasGeneratorSource from '../../shaders/density-shared-atlas.wgsl?raw';
import macroGeneratorSource from '../../shaders/density-shared-macro.wgsl?raw';
import type {
  DensitySharedFieldDiagnostics,
  DensitySharedFieldFormatEvidence,
  DensitySharedFieldStats,
} from './contracts';
import {
  DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
  DENSITY_SHARED_FIELD_MAX_BYTES,
  densitySharedFieldSignature,
  estimateDensitySharedFieldBudget,
  planDensitySharedFieldRebuild,
  validateDensitySharedFieldConfig,
  verifyDensitySharedFieldConfigFixtures,
  type DensitySharedFieldConfig,
  type DensitySharedFieldFormat,
} from './densitySharedFieldConfig';

const ATLAS_WORKGROUP = 4;
const MACRO_WORKGROUP = 8;

export interface DensitySharedFieldEncodeContext {
  atlasTimestampWrites?: GPUComputePassTimestampWrites;
  macroTimestampWrites?: GPUComputePassTimestampWrites;
}

async function scopedValidation(
  device: GPUDevice,
  operation: () => void,
): Promise<string> {
  device.pushErrorScope('validation');
  let thrown = '';
  try {
    operation();
  } catch (error: unknown) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  const validation = await device.popErrorScope();
  return thrown || validation?.message || '';
}

async function probeFormat(
  device: GPUDevice,
  format: DensitySharedFieldFormat,
): Promise<DensitySharedFieldFormatEvidence> {
  const budget = estimateDensitySharedFieldBudget(format);
  const textures: { storage: GPUTexture | null; sampled: GPUTexture | null } = {
    storage: null,
    sampled: null,
  };
  let storageWritable = false;
  let filterSampled = false;
  const reasons: string[] = [];
  const storageReason = await scopedValidation(device, () => {
    textures.storage = device.createTexture({
      label: `density-shared-format-probe-storage-${format}`,
      size: [1, 1, 1],
      dimension: '3d',
      format,
      usage: GPUTextureUsage.STORAGE_BINDING,
    });
    const layout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format, viewDimension: '3d' },
      }],
    });
    device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: textures.storage.createView({ dimension: '3d' }) }],
    });
  });
  storageWritable = storageReason === '';
  if (storageReason) reasons.push(`storage:${storageReason}`);

  const sampleReason = await scopedValidation(device, () => {
    textures.sampled = device.createTexture({
      label: `density-shared-format-probe-sampled-${format}`,
      size: [1, 1, 1],
      dimension: '3d',
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '3d' },
        },
      ],
    });
    device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: textures.sampled.createView({ dimension: '3d' }) },
      ],
    });
  });
  filterSampled = sampleReason === '';
  if (sampleReason) reasons.push(`sample:${sampleReason}`);
  textures.storage?.destroy();
  textures.sampled?.destroy();
  return {
    format,
    storageWritable,
    filterSampled,
    bytes: budget.payloadBytes,
    channelCount: budget.channelCount,
    reason: reasons.join('; '),
  };
}

async function createComputePipelineChecked(
  device: GPUDevice,
  descriptor: GPUComputePipelineDescriptor,
  label: string,
): Promise<GPUComputePipeline> {
  device.pushErrorScope('validation');
  let pipeline: GPUComputePipeline | null = null;
  let thrown = '';
  try {
    pipeline = await device.createComputePipelineAsync(descriptor);
  } catch (error: unknown) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  const validation = await device.popErrorScope();
  if (!pipeline || thrown || validation) {
    throw new Error(`${label}: ${thrown || validation?.message || 'unknown-error'}`);
  }
  return pipeline;
}

export class DensitySharedFields {
  private config: DensitySharedFieldConfig;
  private signature: string;
  private readonly queue: GPUQueue;
  private readonly configBuffer: GPUBuffer;
  private readonly baseTexture: GPUTexture;
  private readonly detailTexture: GPUTexture;
  private readonly macroTexture: GPUTexture;
  private readonly baseView: GPUTextureView;
  private readonly detailView: GPUTextureView;
  private readonly macroView: GPUTextureView;
  private readonly sampler: GPUSampler;
  private readonly atlasPipeline: GPUComputePipeline;
  private readonly macroPipeline: GPUComputePipeline;
  private readonly atlasBindGroup: GPUBindGroup;
  private readonly macroBindGroup: GPUBindGroup;
  private readonly samplingBindGroup: GPUBindGroup;
  private status: DensitySharedFieldStats['status'] = 'pending-generation';
  private generation = 0;
  private atlasGeneration = 0;
  private macroGeneration = 0;
  private atlasBuildCount = 0;
  private macroBuildCount = 0;
  private atlasBuildReason = 'initial';
  private macroBuildReason = 'initial';
  private atlasPending = true;
  private macroPending = true;
  private atlasRan = false;
  private macroRan = false;
  private buildEncodeCpuMs = 0;
  private atlasGpuMs: number | null = null;
  private macroGpuMs: number | null = null;
  private gpuTimingError = 'not-sampled';
  private failureReason = '';
  private destroyed = false;

  private constructor(
    config: DensitySharedFieldConfig,
    queue: GPUQueue,
    resources: {
      configBuffer: GPUBuffer;
      baseTexture: GPUTexture;
      detailTexture: GPUTexture;
      macroTexture: GPUTexture;
      baseView: GPUTextureView;
      detailView: GPUTextureView;
      macroView: GPUTextureView;
      sampler: GPUSampler;
      atlasPipeline: GPUComputePipeline;
      macroPipeline: GPUComputePipeline;
      atlasBindGroup: GPUBindGroup;
      macroBindGroup: GPUBindGroup;
      samplingBindGroup: GPUBindGroup;
    },
    private readonly createCpuMs: number,
    private readonly formatEvidence: readonly DensitySharedFieldFormatEvidence[],
  ) {
    this.config = config;
    this.signature = densitySharedFieldSignature(config);
    this.queue = queue;
    this.configBuffer = resources.configBuffer;
    this.baseTexture = resources.baseTexture;
    this.detailTexture = resources.detailTexture;
    this.macroTexture = resources.macroTexture;
    this.baseView = resources.baseView;
    this.detailView = resources.detailView;
    this.macroView = resources.macroView;
    this.sampler = resources.sampler;
    this.atlasPipeline = resources.atlasPipeline;
    this.macroPipeline = resources.macroPipeline;
    this.atlasBindGroup = resources.atlasBindGroup;
    this.macroBindGroup = resources.macroBindGroup;
    this.samplingBindGroup = resources.samplingBindGroup;
  }

  static async create(
    device: GPUDevice,
    samplingLayout: GPUBindGroupLayout,
    requested: Readonly<DensitySharedFieldConfig> = DEFAULT_DENSITY_SHARED_FIELD_CONFIG,
  ): Promise<DensitySharedFields> {
    const started = performance.now();
    verifyDensitySharedFieldConfigFixtures();
    const config = validateDensitySharedFieldConfig(requested, device.limits);
    const formatEvidence: DensitySharedFieldFormatEvidence[] = [];
    for (const format of ['rgba8unorm', 'r16float', 'rgba16float'] as const) {
      formatEvidence.push(await probeFormat(device, format));
    }
    const defaultEvidence = formatEvidence[0];
    if (!defaultEvidence.storageWritable || !defaultEvidence.filterSampled) {
      throw new Error(`density-shared-field-default-format-unsupported: ${defaultEvidence.reason}`);
    }
    const pendingDestroy: Array<{ destroy(): void }> = [];
    try {
      const configBuffer = device.createBuffer({
      label: 'density-shared-field-config',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      pendingDestroy.push(configBuffer);
      device.queue.writeBuffer(configBuffer, 0, new Uint32Array([
      config.atlasDimension,
      config.macroDimension,
      config.atlasSeed,
      config.macroSeed,
      ]));
      const atlasTexture = (label: string): GPUTexture => device.createTexture({
      label,
      size: [config.atlasDimension, config.atlasDimension, config.atlasDimension],
      dimension: '3d',
      format: config.format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
      const baseTexture = atlasTexture('density-shared-base-atlas');
      const detailTexture = atlasTexture('density-shared-detail-atlas');
      pendingDestroy.push(baseTexture, detailTexture);
      const macroTexture = device.createTexture({
      label: 'density-shared-macro-field',
      size: [config.macroDimension, config.macroDimension],
      format: config.format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
      pendingDestroy.push(macroTexture);
      const baseView = baseTexture.createView({ dimension: '3d' });
      const detailView = detailTexture.createView({ dimension: '3d' });
      const macroView = macroTexture.createView({ dimension: '2d' });
      const sampler = device.createSampler({
      label: 'density-shared-repeat-linear-sampler',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      addressModeW: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'nearest',
      });

      const atlasLayout = device.createBindGroupLayout({
      label: 'density-shared-atlas-generator-layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: config.format, viewDimension: '3d' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: config.format, viewDimension: '3d' },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 16 } },
      ],
      });
      const macroLayout = device.createBindGroupLayout({
      label: 'density-shared-macro-generator-layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: config.format, viewDimension: '2d' },
        },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 16 } },
      ],
      });
      const atlasModule = device.createShaderModule({ label: 'density-shared-atlas-generator', code: atlasGeneratorSource });
      const macroModule = device.createShaderModule({ label: 'density-shared-macro-generator', code: macroGeneratorSource });
      const atlasPipeline = await createComputePipelineChecked(device, {
      label: 'density-shared-atlas-generator-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [atlasLayout] }),
      compute: { module: atlasModule, entryPoint: 'csDensitySharedAtlas' },
    }, 'density-shared-atlas-pipeline-create-failed');
      const macroPipeline = await createComputePipelineChecked(device, {
      label: 'density-shared-macro-generator-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [macroLayout] }),
      compute: { module: macroModule, entryPoint: 'csDensitySharedMacro' },
    }, 'density-shared-macro-pipeline-create-failed');
      const atlasBindGroup = device.createBindGroup({
      label: 'density-shared-atlas-generator-bindings',
      layout: atlasLayout,
      entries: [
        { binding: 0, resource: baseView },
        { binding: 1, resource: detailView },
        { binding: 2, resource: { buffer: configBuffer } },
      ],
      });
      const macroBindGroup = device.createBindGroup({
      label: 'density-shared-macro-generator-bindings',
      layout: macroLayout,
      entries: [
        { binding: 0, resource: macroView },
        { binding: 1, resource: { buffer: configBuffer } },
      ],
      });
      const samplingBindGroup = device.createBindGroup({
      label: 'density-shared-sampled-bindings',
      layout: samplingLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: baseView },
        { binding: 2, resource: detailView },
        { binding: 3, resource: macroView },
      ],
      });
      const result = new DensitySharedFields(config, device.queue, {
        configBuffer,
        baseTexture,
        detailTexture,
        macroTexture,
        baseView,
        detailView,
        macroView,
        sampler,
        atlasPipeline,
        macroPipeline,
        atlasBindGroup,
        macroBindGroup,
        samplingBindGroup,
      }, performance.now() - started, formatEvidence);
      if (!device.features.has('timestamp-query')) {
        result.recordGpuTiming(null, null, 'timestamp-query-unavailable');
      }
      pendingDestroy.length = 0;
      return result;
    } catch (error: unknown) {
      for (const resource of pendingDestroy.reverse()) resource.destroy();
      throw error;
    }
  }

  encodePending(encoder: GPUCommandEncoder, context: DensitySharedFieldEncodeContext = {}): void {
    this.assertAlive();
    const started = performance.now();
    this.atlasRan = false;
    this.macroRan = false;
    try {
      if (this.atlasPending) {
        const pass = encoder.beginComputePass(context.atlasTimestampWrites
          ? { label: 'density-shared-atlas-generation-pass', timestampWrites: context.atlasTimestampWrites }
          : { label: 'density-shared-atlas-generation-pass' });
        pass.setPipeline(this.atlasPipeline);
        pass.setBindGroup(0, this.atlasBindGroup);
        pass.dispatchWorkgroups(
          Math.ceil(this.config.atlasDimension / ATLAS_WORKGROUP),
          Math.ceil(this.config.atlasDimension / ATLAS_WORKGROUP),
          Math.ceil(this.config.atlasDimension / ATLAS_WORKGROUP),
        );
        pass.end();
        this.atlasPending = false;
        this.atlasRan = true;
        this.atlasBuildCount++;
        this.atlasGeneration++;
      }
      if (this.macroPending) {
        const pass = encoder.beginComputePass(context.macroTimestampWrites
          ? { label: 'density-shared-macro-generation-pass', timestampWrites: context.macroTimestampWrites }
          : { label: 'density-shared-macro-generation-pass' });
        pass.setPipeline(this.macroPipeline);
        pass.setBindGroup(0, this.macroBindGroup);
        pass.dispatchWorkgroups(
          Math.ceil(this.config.macroDimension / MACRO_WORKGROUP),
          Math.ceil(this.config.macroDimension / MACRO_WORKGROUP),
        );
        pass.end();
        this.macroPending = false;
        this.macroRan = true;
        this.macroBuildCount++;
        this.macroGeneration++;
      }
      if (this.atlasRan || this.macroRan) this.generation++;
      if (!this.atlasPending && !this.macroPending) this.status = 'ready';
    } catch (error: unknown) {
      this.status = 'failed';
      this.failureReason = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.buildEncodeCpuMs += performance.now() - started;
    }
  }

  setConfig(requested: Readonly<DensitySharedFieldConfig>): void {
    this.assertAlive();
    const next = validateDensitySharedFieldConfig(requested);
    const nextSignature = densitySharedFieldSignature(next);
    if (nextSignature === this.signature) return;
    const plan = planDensitySharedFieldRebuild(this.config, next);
    this.config = next;
    this.signature = nextSignature;
    this.queue.writeBuffer(this.configBuffer, 0, new Uint32Array([
      next.atlasDimension,
      next.macroDimension,
      next.atlasSeed,
      next.macroSeed,
    ]));
    if (plan.atlas) {
      this.atlasPending = true;
      this.atlasBuildReason = plan.reason;
      this.atlasGpuMs = null;
    }
    if (plan.macro) {
      this.macroPending = true;
      this.macroBuildReason = plan.reason;
      this.macroGpuMs = null;
    }
    if (plan.atlas || plan.macro) this.status = 'pending-generation';
  }

  getSamplingBindGroup(): GPUBindGroup {
    this.assertAlive();
    return this.samplingBindGroup;
  }

  getDiagnostics(): DensitySharedFieldDiagnostics | null {
    if (this.destroyed || this.status !== 'ready') return null;
    return {
      available: true,
      format: this.config.format,
      atlasDimension: this.config.atlasDimension,
      macroDimension: this.config.macroDimension,
      generation: this.generation,
      sampler: this.sampler,
      baseView: this.baseView,
      detailView: this.detailView,
      macroView: this.macroView,
    };
  }

  getStats(): DensitySharedFieldStats {
    const budget = estimateDensitySharedFieldBudget(
      this.config.format,
      this.config.atlasDimension,
      this.config.macroDimension,
    );
    return {
      status: this.status,
      format: this.config.format,
      atlasDimension: this.config.atlasDimension,
      macroDimension: this.config.macroDimension,
      payloadBytes: budget.payloadBytes,
      peakBudgetBytes: DENSITY_SHARED_FIELD_MAX_BYTES,
      resourceCount: this.destroyed ? 0 : 3,
      generation: this.generation,
      atlasGeneration: this.atlasGeneration,
      macroGeneration: this.macroGeneration,
      atlasBuildCount: this.atlasBuildCount,
      macroBuildCount: this.macroBuildCount,
      atlasBuildReason: this.atlasBuildReason,
      macroBuildReason: this.macroBuildReason,
      atlasRan: this.atlasRan,
      macroRan: this.macroRan,
      createCpuMs: this.createCpuMs,
      buildEncodeCpuMs: this.buildEncodeCpuMs,
      atlasGpuMs: this.atlasGpuMs,
      macroGpuMs: this.macroGpuMs,
      gpuTimingError: this.gpuTimingError,
      failureReason: this.failureReason,
      formatEvidence: this.formatEvidence,
    };
  }

  recordGpuTiming(atlasMs: number | null, macroMs: number | null, error = ''): void {
    if (this.destroyed) return;
    this.atlasGpuMs = atlasMs;
    this.macroGpuMs = macroMs;
    this.gpuTimingError = error;
  }

  markDeviceLost(reason: string): void {
    if (this.destroyed) return;
    this.status = 'failed';
    this.failureReason = reason;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.baseTexture.destroy();
    this.detailTexture.destroy();
    this.macroTexture.destroy();
    this.configBuffer.destroy();
    this.status = 'destroyed';
  }

  private assertAlive(): void {
    if (this.destroyed || this.status === 'failed') {
      throw new Error(`density-shared-fields-unavailable:${this.status}:${this.signature}`);
    }
  }
}

export async function createDensitySharedFields(
  device: GPUDevice,
  samplingLayout: GPUBindGroupLayout,
): Promise<DensitySharedFields> {
  return DensitySharedFields.create(device, samplingLayout);
}
