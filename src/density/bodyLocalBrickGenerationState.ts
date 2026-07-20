export type DensityBrickAtlasIndex = 0 | 1;
export type DensityBrickAtlasWarmMask = 0 | 1 | 2 | 3;

export interface DensityBrickGenerationToken {
  readonly id: number;
  readonly generation: number;
}

export interface DensityBrickGenerationSnapshot<T> {
  readonly token: DensityBrickGenerationToken;
  readonly generation: number;
  readonly payload: T;
  readonly warmedAtlasMask: DensityBrickAtlasWarmMask;
  readonly atlasGenerations: readonly [number | null, number | null];
}

export type DensityBrickGenerationPhase =
  | 'inactive'
  | 'warming'
  | 'active'
  | 'rebuilding'
  | 'destroyed';

export interface DensityBrickGenerationStateSnapshot<T> {
  readonly phase: DensityBrickGenerationPhase;
  readonly active: DensityBrickGenerationSnapshot<T> | null;
  readonly staging: DensityBrickGenerationSnapshot<T> | null;
}

export type DensityBrickAtlasWarmReason =
  | 'warmed'
  | 'published'
  | 'duplicate'
  | 'stale-token'
  | 'no-staging'
  | 'invalid-index'
  | 'destroyed';

export interface DensityBrickAtlasWarmResult<T> {
  readonly accepted: boolean;
  readonly published: boolean;
  readonly reason: DensityBrickAtlasWarmReason;
  readonly active: T | null;
}

interface MutableDensityBrickGeneration<T> {
  readonly token: DensityBrickGenerationToken;
  readonly generation: number;
  readonly payload: T;
  warmedAtlasMask: DensityBrickAtlasWarmMask;
  readonly atlasGenerations: [number | null, number | null];
}

function sameToken(a: DensityBrickGenerationToken, b: DensityBrickGenerationToken): boolean {
  return a.id === b.id && a.generation === b.generation;
}

function snapshotGeneration<T>(
  value: MutableDensityBrickGeneration<T> | null,
): DensityBrickGenerationSnapshot<T> | null {
  if (!value) return null;
  return Object.freeze({
    token: value.token,
    generation: value.generation,
    payload: value.payload,
    warmedAtlasMask: value.warmedAtlasMask,
    atlasGenerations: Object.freeze([...value.atlasGenerations]) as readonly [number | null, number | null],
  });
}

/**
 * Pure publication state for a pair of density-brick cache atlases.
 *
 * Payload lifetime remains owned by the caller. Superseding a staging payload
 * invalidates its token but does not destroy the payload. Callers that own GPU
 * resources should read getStaging() before superseding, cancelling, or
 * deactivating so they can retire those resources themselves.
 */
export class DensityBrickGenerationState<T> {
  private active: MutableDensityBrickGeneration<T> | null = null;
  private staging: MutableDensityBrickGeneration<T> | null = null;
  private nextTokenId = 1;
  private destroyed = false;

  beginStaging(payload: T, generation: number): DensityBrickGenerationToken {
    if (this.destroyed) throw new Error('Cannot stage a density brick generation after destroy');
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error(`Density brick generation must be a non-negative safe integer: ${generation}`);
    }
    if (this.active && generation <= this.active.generation) {
      throw new Error(
        `Density brick staging generation ${generation} must be newer than active generation ${this.active.generation}`,
      );
    }
    const token = Object.freeze({ id: this.nextTokenId++, generation });
    this.staging = {
      token,
      generation,
      payload,
      warmedAtlasMask: 0,
      atlasGenerations: [null, null],
    };
    return token;
  }

  markAtlasWarm(
    token: DensityBrickGenerationToken,
    index: DensityBrickAtlasIndex,
  ): DensityBrickAtlasWarmResult<T> {
    if (this.destroyed) return this.warmResult(false, false, 'destroyed');
    if (index !== 0 && index !== 1) return this.warmResult(false, false, 'invalid-index');
    if (!this.staging) return this.warmResult(false, false, 'no-staging');
    if (!sameToken(this.staging.token, token)) return this.warmResult(false, false, 'stale-token');

    const bit = 1 << index;
    if ((this.staging.warmedAtlasMask & bit) !== 0) {
      return this.warmResult(false, false, 'duplicate');
    }
    this.staging.warmedAtlasMask = (this.staging.warmedAtlasMask | bit) as DensityBrickAtlasWarmMask;
    this.staging.atlasGenerations[index] = this.staging.generation;
    if (this.staging.warmedAtlasMask !== 3) return this.warmResult(true, false, 'warmed');

    const [atlas0Generation, atlas1Generation] = this.staging.atlasGenerations;
    if (atlas0Generation !== this.staging.generation || atlas1Generation !== this.staging.generation) {
      throw new Error('Density brick cache pair attempted to publish mixed generations');
    }
    this.active = this.staging;
    this.staging = null;
    return this.warmResult(true, true, 'published');
  }

  cancel(token?: DensityBrickGenerationToken): T | null {
    return this.discardStaging(token);
  }

  fail(token?: DensityBrickGenerationToken): T | null {
    return this.discardStaging(token);
  }

  deactivate(): { readonly active: T | null; readonly staging: T | null } {
    return this.clear(false);
  }

  deviceLost(): { readonly active: T | null; readonly staging: T | null } {
    return this.clear(false);
  }

  destroy(): { readonly active: T | null; readonly staging: T | null } {
    return this.clear(true);
  }

  getActive(): T | null {
    return this.active?.payload ?? null;
  }

  getStaging(): T | null {
    return this.staging?.payload ?? null;
  }

  snapshot(): DensityBrickGenerationStateSnapshot<T> {
    const phase: DensityBrickGenerationPhase = this.destroyed
      ? 'destroyed'
      : this.staging
        ? this.active ? 'rebuilding' : 'warming'
        : this.active ? 'active' : 'inactive';
    return Object.freeze({
      phase,
      active: snapshotGeneration(this.active),
      staging: snapshotGeneration(this.staging),
    });
  }

  private discardStaging(token?: DensityBrickGenerationToken): T | null {
    if (this.destroyed || !this.staging) return null;
    if (token && !sameToken(this.staging.token, token)) return null;
    const payload = this.staging.payload;
    this.staging = null;
    return payload;
  }

  private clear(markDestroyed: boolean): { readonly active: T | null; readonly staging: T | null } {
    const retired = Object.freeze({
      active: this.active?.payload ?? null,
      staging: this.staging?.payload ?? null,
    });
    this.active = null;
    this.staging = null;
    this.destroyed ||= markDestroyed;
    return retired;
  }

  private warmResult(
    accepted: boolean,
    published: boolean,
    reason: DensityBrickAtlasWarmReason,
  ): DensityBrickAtlasWarmResult<T> {
    return Object.freeze({ accepted, published, reason, active: this.getActive() });
  }
}

function assertGenerationFixture(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Density brick generation fixture failed: ${message}`);
}

export function verifyDensityBrickGenerationState(): void {
  const state = new DensityBrickGenerationState<{ readonly name: string }>();
  const initial = Object.freeze({ name: 'initial' });
  const initialToken = state.beginStaging(initial, 1);
  assertGenerationFixture(state.snapshot().phase === 'warming', 'initial pair must start warming');
  assertGenerationFixture(!state.markAtlasWarm(initialToken, 0).published, 'one warm atlas must not publish');
  assertGenerationFixture(state.getActive() === null, 'initial payload became visible before both atlases warmed');
  assertGenerationFixture(
    state.markAtlasWarm(initialToken, 0).reason === 'duplicate',
    'duplicate atlas completion was accepted',
  );
  assertGenerationFixture(state.markAtlasWarm(initialToken, 1).published, 'initial complete pair did not publish');
  assertGenerationFixture(state.getActive() === initial, 'initial active payload is incorrect');

  const superseded = Object.freeze({ name: 'superseded' });
  const supersededToken = state.beginStaging(superseded, 2);
  state.markAtlasWarm(supersededToken, 0);
  assertGenerationFixture(state.getActive() === initial, 'staging replaced a healthy active payload');
  const replacement = Object.freeze({ name: 'replacement' });
  const replacementToken = state.beginStaging(replacement, 3);
  state.markAtlasWarm(replacementToken, 1);
  assertGenerationFixture(
    state.markAtlasWarm(supersededToken, 1).reason === 'stale-token',
    'late completion from a superseded generation was accepted',
  );
  assertGenerationFixture(state.getActive() === initial, 'mixed generations published a cache pair');
  assertGenerationFixture(state.markAtlasWarm(replacementToken, 0).published, 'replacement pair did not publish atomically');
  const activeSnapshot = state.snapshot().active;
  assertGenerationFixture(
    activeSnapshot?.atlasGenerations[0] === 3 && activeSnapshot.atlasGenerations[1] === 3,
    'published cache pair contains mixed generation stamps',
  );

  const cancelled = Object.freeze({ name: 'cancelled' });
  const cancelledToken = state.beginStaging(cancelled, 4);
  state.markAtlasWarm(cancelledToken, 0);
  assertGenerationFixture(state.cancel(cancelledToken) === cancelled, 'cancel did not return the retired staging payload');
  assertGenerationFixture(state.getActive() === replacement, 'cancel discarded the healthy active payload');
  const failed = Object.freeze({ name: 'failed' });
  const failedToken = state.beginStaging(failed, 4);
  state.markAtlasWarm(failedToken, 1);
  assertGenerationFixture(state.fail(failedToken) === failed, 'failure did not return the retired staging payload');
  assertGenerationFixture(state.getActive() === replacement, 'failure discarded the healthy active payload');

  const lost = Object.freeze({ name: 'lost' });
  const lostToken = state.beginStaging(lost, 4);
  state.markAtlasWarm(lostToken, 0);
  const retired = state.deviceLost();
  assertGenerationFixture(retired.active === replacement && retired.staging === lost, 'device loss retired the wrong payloads');
  state.deviceLost();
  assertGenerationFixture(state.snapshot().phase === 'inactive', 'repeated device loss was not idempotent');
  assertGenerationFixture(
    state.markAtlasWarm(lostToken, 1).reason === 'no-staging',
    'completion after device loss resurrected a retired generation',
  );

  const recovered = Object.freeze({ name: 'recovered' });
  const recoveredToken = state.beginStaging(recovered, 1);
  state.markAtlasWarm(recoveredToken, 0);
  state.markAtlasWarm(recoveredToken, 1);
  state.deactivate();
  state.deactivate();
  assertGenerationFixture(state.snapshot().phase === 'inactive', 'deactivate was not idempotent');
  state.destroy();
  state.destroy();
  assertGenerationFixture(state.snapshot().phase === 'destroyed', 'destroy was not terminal and idempotent');
  assertGenerationFixture(
    state.markAtlasWarm(recoveredToken, 0).reason === 'destroyed',
    'destroyed state accepted an atlas completion',
  );
  let rejectedAfterDestroy = false;
  try {
    state.beginStaging(Object.freeze({ name: 'invalid' }), 2);
  } catch {
    rejectedAfterDestroy = true;
  }
  assertGenerationFixture(rejectedAfterDestroy, 'destroyed state accepted new staging work');
}
