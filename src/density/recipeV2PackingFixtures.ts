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
] as const);

function body(id: string, type: string): CloudBody {
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

const MOD: BodyMod = Object.freeze({ coverageMul: 1, densityScale: 1, morph: 0 });
const WIND: WindAdvectionSample = Object.freeze({ offsetM: [0, 0] as const, morphTime: 0 });

function input(bodies: readonly CloudBody[]): DensityFrameInput {
  return {
    frameIndex: 1,
    elapsedSeconds: 1,
    sceneTimeSeconds: 1,
    params: createDefaultParams(),
    bodies,
    bodyMods: bodies.map(() => MOD),
    windSamples: bodies.map(() => WIND),
    sceneRevision: 1,
  };
}

export function verifyDensityV2PackingFixtures(): void {
  const cases = [
    { id: 'no-cloud', frame: input([]), active: 0, invalid: 0 },
    { id: 'single-body', frame: input([body('A', 'cumulus')]), active: 1, invalid: 0 },
    { id: 'multi-body', frame: input([body('A', 'cumulus'), body('B', 'cirrus')]), active: 2, invalid: 0 },
    { id: 'invalid-genus', frame: input([body('X', 'not-a-genus')]), active: 0, invalid: 1 },
  ] as const;
  for (const fixture of cases) {
    const packed = packDensityV2Frame(fixture.frame, 96);
    if (packed.activeBodyCount !== fixture.active || packed.invalidGenusCount !== fixture.invalid) {
      throw new Error(`Density V2 packing fixture failed: ${fixture.id}`);
    }
    if (fixture.id === 'invalid-genus') {
      const ids = densityV2LayoutField(DENSITY_BODY_GPU_LAYOUT, 'ids');
      const packedIds = new Uint32Array(packed.bodies, ids.byteOffset, 4);
      if (packedIds[2] !== 0 || packedIds[3] !== 1) {
        throw new Error('Density V2 invalid genus fixture did not disable the body');
      }
    }
  }
}
