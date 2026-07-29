import type { DensitySharedFieldDiagnostics } from '../density/contracts';

export interface DensityDetailResources {
  readonly available: boolean;
  readonly reason: string;
  readonly layoutVersion: 1;
  readonly generation: number;
  readonly format: 'rgba8unorm';
  readonly atlasDimension: 64;
  readonly macroDimension: 256;
  readonly sampler: GPUSampler | null;
  readonly baseView: GPUTextureView | null;
  readonly detailView: GPUTextureView | null;
  readonly macroView: GPUTextureView | null;
}

const unavailable = (reason: string): DensityDetailResources => ({
  available: false,
  reason,
  layoutVersion: 1,
  generation: 0,
  format: 'rgba8unorm',
  atlasDimension: 64,
  macroDimension: 256,
  sampler: null,
  baseView: null,
  detailView: null,
  macroView: null,
});

export function createDensityDetailResources(
  diagnostics: DensitySharedFieldDiagnostics | null,
  unavailableReason = 'shared-fields-unavailable',
): DensityDetailResources {
  if (!diagnostics || !diagnostics.available) return unavailable(unavailableReason);
  return {
    available: true,
    reason: '',
    layoutVersion: 1,
    generation: diagnostics.generation,
    format: diagnostics.format,
    atlasDimension: diagnostics.atlasDimension,
    macroDimension: diagnostics.macroDimension,
    sampler: diagnostics.sampler,
    baseView: diagnostics.baseView,
    detailView: diagnostics.detailView,
    macroView: diagnostics.macroView,
  };
}
