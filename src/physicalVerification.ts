import { createBodyStore, defaultLife, type CloudBody } from './body';
import { enforcePlacement } from './genusProfile';
import { BODY_BASE, CLOUD_PRESETS, PARAMS_FLOAT_COUNT, PARAM_OFFSETS, packBodies, packParams } from './params';
import { parseScenario, serializeScenario } from './scenario';
import { DEFAULT_SCENE_SCALE } from './space';

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-5) {
    throw new Error(`physical verification: ${label} expected ${expected}, got ${actual}`);
  }
}

export function verifyPhysicalContracts(): void {
  const legacy = {
    duration: 10,
    bodies: {
      A: { shape: 'circle', bounds: [1.5, -2, 2.2, 0], feather: 1.8, base: 3.2, thickness: 1.6, type: 'cirrus' },
    },
    events: [{ t: 0, bodyId: 'A', base: 3.4, thickness: 1.4, coverage: 1 }],
  };
  const migrated = parseScenario(legacy, DEFAULT_SCENE_SCALE);
  assertClose(migrated.bodies.A.base, 3200, 'legacy body base migration');
  assertClose(migrated.bodies.A.thickness, 1600, 'legacy body thickness migration');
  assertClose(migrated.bodies.A.bounds[0], 1500, 'legacy X migration');
  assertClose(migrated.events[0].base ?? 0, 3400, 'legacy event base migration');

  const roundTripped = parseScenario(serializeScenario(migrated), DEFAULT_SCENE_SCALE);
  assertClose(roundTripped.bodies.A.base, migrated.bodies.A.base, 'v2 body base round trip');
  assertClose(roundTripped.events[0].thickness ?? 0, migrated.events[0].thickness ?? 0, 'v2 event thickness round trip');

  const body: CloudBody = {
    id: 'A',
    shape: 'circle',
    bounds: migrated.bodies.A.bounds,
    feather: migrated.bodies.A.feather,
    base: migrated.bodies.A.base,
    thickness: migrated.bodies.A.thickness,
    type: 'cirrus',
    placementLocked: true,
    coverage: 1,
    densityScale: 1,
    windDeg: 0,
    windSpeed: 0,
    morphRate: 0,
    rot: [0, 0, 0],
    life: defaultLife(),
  };
  const packed = new Float32Array(PARAMS_FLOAT_COUNT);
  packParams(packed, { cloudHeight: 12 });
  packBodies(packed, [body], undefined, DEFAULT_SCENE_SCALE);
  assertClose(packed[BODY_BASE], 3.2, 'packed body base');
  assertClose(packed[BODY_BASE + 1], 4.8, 'packed body top');
  assertClose(packed[BODY_BASE + 12], 1.5, 'packed footprint X');
  assertClose(packed[PARAM_OFFSETS.cloudHeight], 12, 'packed scene ceiling');

  body.base = 100;
  body.thickness = 9000;
  enforcePlacement(body, 12000);
  assertClose(body.base, 5000, 'cirrus enforced base');
  if (body.base + body.thickness > 12000) {
    throw new Error('physical verification: enforced body exceeds scene ceiling');
  }

  const unlocked = { ...body, id: 'B1', type: 'cumulus', base: 1000, thickness: 1500, placementLocked: false, bounds: [-800, -800, 800, 800], shape: 'rect' as const };
  const store = createBodyStore([unlocked], () => 12000);
  store.setType('B1', 'cirrus');
  assertClose(unlocked.base, 7000, 'unlocked genus default base');
  store.update('B1', { base: 6100 });
  store.setType('B1', 'stratus');
  assertClose(unlocked.base, 6100, 'locked placement preservation');
  store.applyTypeDefaults('B1');
  assertClose(unlocked.base, 300, 'explicit genus placement reset');
  if (unlocked.placementLocked) throw new Error('physical verification: placement reset must unlock body');

  for (const [name, preset] of Object.entries(CLOUD_PRESETS)) {
    assertClose(preset.altBase, 0, `${name} altBase migration`);
    assertClose(preset.altTop, 1, `${name} altTop migration`);
  }
}
