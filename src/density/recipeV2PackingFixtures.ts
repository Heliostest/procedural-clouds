import type { CloudBody } from '../body';
import type { BodyMod } from '../lifecycle';
import { createDefaultParams } from '../params';
import type { WindAdvectionSample } from '../wind';
import type { DensityFrameInput } from './contracts';
import { DENSITY_BODY_GPU_LAYOUT, densityV2LayoutField } from './recipeV2Layout';
import { packDensityV2Frame } from './recipeV2Packing';

export const DENSITY_V2_PACKING_FIXTURE_IDS = Object.freeze([
  'no-cloud',
  'single-body',
  'multi-body',
  'invalid-genus',
  'invalid-before-valid',
  'zero-coverage-before-valid',
] as const);

export function densityV2FixtureBody(id: string, type: string): CloudBody {
  return {
    id,
    shape: 'rect',
    bounds: [-800, -800, 800, 800],
    feather: 300,
    base: 1000,
    thickness: 1500,
    type,
    placementLocked: false,
    coverage: 0.7,
    densityScale: 1,
    windDeg: 45,
    windSpeedMps: 10,
    morphRate: 0.05,
    rot: [0, 0, 0],
    life: { enabled: false, birth: 2, grow: 32, decay: 60, death: 90, peak: 1 },
  };
}

export const DENSITY_V2_FIXTURE_MOD: BodyMod = Object.freeze({ coverageMul: 1, densityScale: 1, morph: 0 });
export const DENSITY_V2_FIXTURE_WIND: WindAdvectionSample = Object.freeze({ offsetM: [0, 0] as const, morphTime: 0 });

export function densityV2FixtureInput(bodies: readonly CloudBody[]): DensityFrameInput {
  return {
    frameIndex: 1,
    elapsedSeconds: 1,
    sceneTimeSeconds: 1,
    params: createDefaultParams(),
    bodies,
    bodyMods: bodies.map(() => DENSITY_V2_FIXTURE_MOD),
    windSamples: bodies.map(() => DENSITY_V2_FIXTURE_WIND),
    sceneRevision: 1,
  };
}

function assertZeroTail(buffer: ArrayBuffer, activeBodyCount: number): void {
  const bytes = new Uint8Array(buffer);
  const start = activeBodyCount * DENSITY_BODY_GPU_LAYOUT.stride;
  if (bytes.slice(start).some((value) => value !== 0)) {
    throw new Error('Density V2 inactive Body tail is not zero');
  }
}

export function verifyDensityV2PackingFixtures(): void {
  const invalid = densityV2FixtureBody('X', 'not-a-genus');
  const zeroCoverage = { ...densityV2FixtureBody('Z', 'stratus'), coverage: 0 };
  const cases = [
    { id: 'no-cloud', frame: densityV2FixtureInput([]), active: 0, invalid: 0, sources: [] },
    { id: 'single-body', frame: densityV2FixtureInput([densityV2FixtureBody('A', 'cumulus')]), active: 1, invalid: 0, sources: [0] },
    { id: 'multi-body', frame: densityV2FixtureInput([densityV2FixtureBody('A', 'cumulus'), densityV2FixtureBody('B', 'cirrus')]), active: 2, invalid: 0, sources: [0, 1] },
    { id: 'invalid-genus', frame: densityV2FixtureInput([invalid]), active: 0, invalid: 1, sources: [] },
    { id: 'invalid-before-valid', frame: densityV2FixtureInput([invalid, densityV2FixtureBody('A', 'cumulus')]), active: 1, invalid: 1, sources: [1] },
    { id: 'zero-coverage-before-valid', frame: densityV2FixtureInput([zeroCoverage, densityV2FixtureBody('B', 'cirrus')]), active: 1, invalid: 0, sources: [1] },
  ] as const;
  for (const fixture of cases) {
    const packed = packDensityV2Frame(fixture.frame, 96);
    if (packed.activeBodyCount !== fixture.active || packed.invalidGenusCount !== fixture.invalid) {
      throw new Error(`Density V2 packing fixture failed: ${fixture.id}`);
    }
    if (packed.sourceIndices.join(',') !== fixture.sources.join(',')) {
      throw new Error(`Density V2 active prefix source order failed: ${fixture.id}`);
    }
    assertZeroTail(packed.bodies, packed.activeBodyCount);
  }
  const lifecycleBody = { ...densityV2FixtureBody('L', 'stratus'), densityScale: 1.4 };
  const lifecycleInput = {
    ...densityV2FixtureInput([lifecycleBody]),
    bodyMods: [{ coverageMul: 0.8, densityScale: 0.5, morph: 0.25 }],
  };
  const lifecyclePacked = packDensityV2Frame(lifecycleInput, 96);
  const heightDensity = new Float32Array(
    lifecyclePacked.bodies,
    densityV2LayoutField(DENSITY_BODY_GPU_LAYOUT, 'heightDensity').byteOffset,
    4,
  );
  const coverageLifecycle = new Float32Array(
    lifecyclePacked.bodies,
    densityV2LayoutField(DENSITY_BODY_GPU_LAYOUT, 'coverageLifecycle').byteOffset,
    4,
  );
  if (Math.abs(heightDensity[2] - 1.4) > 1e-6 || Math.abs(coverageLifecycle[1] - 0.5) > 1e-6) {
    throw new Error('Density V2 lifecycle density must be packed exactly once');
  }
}
