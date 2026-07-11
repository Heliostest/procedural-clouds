import type { DensityProducerCandidate } from './contracts';

export const RECIPE_V2_UNAVAILABLE_REASON = 'recipe-v2-not-implemented';

export class RecipeDensityV2Adapter implements DensityProducerCandidate {
  readonly kind = 'recipe-v2' as const;
  readonly availability = 'unavailable' as const;
  readonly reason = RECIPE_V2_UNAVAILABLE_REASON;
}
