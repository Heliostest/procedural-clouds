import type {
  DensityCacheProducer,
  DensityProducerCandidate,
  DensityProducerKind,
  DensityProducerSelection,
} from './contracts';

export interface DensityProducerSelectorOptions {
  legacy: DensityCacheProducer;
  recipeV2: DensityProducerCandidate;
}

export class DensityProducerSelector {
  private readonly legacy: DensityCacheProducer;
  private readonly recipeV2: DensityProducerCandidate;
  private requested: DensityProducerKind = 'legacy';
  private fallbackReason = '';
  private destroyed = false;

  constructor(options: DensityProducerSelectorOptions) {
    this.legacy = options.legacy;
    this.recipeV2 = options.recipeV2;
  }

  request(kind: DensityProducerKind): DensityCacheProducer {
    this.assertAlive();
    this.requested = kind;
    if (kind === 'recipe-v2') {
      this.fallbackReason = this.recipeV2.reason;
      return this.legacy;
    }
    this.fallbackReason = '';
    return this.legacy;
  }

  getActive(): DensityCacheProducer {
    this.assertAlive();
    return this.legacy;
  }

  getSelection(): DensityProducerSelection {
    return {
      requested: this.requested,
      active: 'legacy',
      fallbackReason: this.fallbackReason,
    };
  }

  handleDeviceLost(reason: GPUDeviceLostInfo): void {
    if (this.destroyed) return;
    this.legacy.handleDeviceLost(reason);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.legacy.destroy();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('DensityProducerSelector is destroyed');
  }
}
