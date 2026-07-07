import { createBodyStore, defaultLife, type CloudBody } from './body';
import { enforcePlacement } from './genusProfile';
import { BODY_BASE, BODY_WIND_OFFSETS, CLOUD_PRESETS, PARAMS_FLOAT_COUNT, PARAM_OFFSETS, createDefaultParams, packBodies, packParams } from './params';
import { createPlayer, parseScenario, serializeScenario, type Scenario } from './scenario';
import { DEFAULT_SCENE_SCALE, bodyToTransportedRenderSpace } from './space';
import { createWindAdvectionController } from './wind';

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-5) {
    throw new Error(`physical verification: ${label} expected ${expected}, got ${actual}`);
  }
}

export function verifyPhysicalContracts(): void {
  const legacy = {
    duration: 10,
    wind: { dirDeg: 0, speed: 0.15 },
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
  assertClose(migrated.wind?.speed ?? 0, 150, 'legacy wind speed migration');

  const serialized = serializeScenario(migrated);
  const serializedJson = JSON.parse(serialized) as Record<string, unknown>;
  if (serializedJson.schemaVersion !== 3 || serializedJson.distanceUnit !== 'm' || serializedJson.windUnit !== 'm/s') {
    throw new Error('physical verification: scenario export must declare v3 distance and wind units');
  }
  const roundTripped = parseScenario(serialized, DEFAULT_SCENE_SCALE);
  assertClose(roundTripped.bodies.A.base, migrated.bodies.A.base, 'v3 body base round trip');
  assertClose(roundTripped.events[0].thickness ?? 0, migrated.events[0].thickness ?? 0, 'v3 event thickness round trip');
  assertClose(roundTripped.wind?.speed ?? 0, 150, 'v3 wind speed round trip');

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
    windSpeedMps: 10,
    morphRate: 0,
    rot: [0, 0, 0],
    life: defaultLife(),
  };
  const windController = createWindAdvectionController();
  windController.advance([body], 10);
  const windSamples = windController.samples([body]);
  assertClose(windSamples[0].offsetM[0], 100, '10 mps for 10 seconds');
  assertClose(windSamples[0].offsetM[1], 0, 'zero cross-wind displacement');
  const authorCenterX = body.bounds[0];
  const transportedBody = bodyToTransportedRenderSpace(body, windSamples[0].offsetM, DEFAULT_SCENE_SCALE);
  assertClose(transportedBody.bounds[0], authorCenterX / 1000 + 0.1, 'transported render-space body center');
  assertClose(body.bounds[0], authorCenterX, 'wind transport preserves author bounds');
  const packed = new Float32Array(PARAMS_FLOAT_COUNT);
  packParams(packed, { cloudHeight: 12 });
  packBodies(packed, [body], undefined, windSamples, DEFAULT_SCENE_SCALE);
  assertClose(packed[BODY_BASE], 3.2, 'packed body base');
  assertClose(packed[BODY_BASE + 1], 4.8, 'packed body top');
  assertClose(packed[BODY_BASE + 12], 1.5, 'packed footprint X');
  assertClose(packed[BODY_BASE + BODY_WIND_OFFSETS.advectionOffsetWorldX], 0.1, 'packed wind offset X');
  assertClose(packed[PARAM_OFFSETS.cloudHeight], 12, 'packed scene ceiling');
  if (!createDefaultParams().showAxes) throw new Error('physical verification: axes must be visible by default');

  windController.reset();
  body.windSpeedMps = 10;
  windController.advance([body], 5);
  body.windSpeedMps = 20;
  windController.advance([body], 5);
  assertClose(windController.samples([body])[0].offsetM[0], 150, 'wind speed change preserves prior displacement');

  const crossingScenario: Scenario = {
    schemaVersion: 3,
    distanceUnit: 'm',
    windUnit: 'm/s',
    duration: 10,
    wind: { dirDeg: 350, speed: 10 },
    bodies: {
      A: { shape: 'circle', bounds: [0, 0, 1000, 0], feather: 100, base: 1000, thickness: 1000, type: 'cumulus' },
    },
    events: [
      { t: 0, bodyId: 'A', coverage: 1, windDeg: 350, windSpeed: 10 },
      { t: 10, bodyId: 'A', coverage: 1, windDeg: 10, windSpeed: 10, ease: 'smooth' },
    ],
  };
  const crossingPlayer = createPlayer(crossingScenario);
  const directSample = crossingPlayer.sample(5);
  crossingPlayer.sample(2);
  crossingPlayer.sample(9);
  const repeatedSample = crossingPlayer.sample(5);
  const midDirection = directSample.bodies[0].windDeg;
  assertClose(Math.min(midDirection, 360 - midDirection), 0, '350 to 10 degree vector interpolation');
  assertClose(directSample.windSamples[0].offsetM[0], repeatedSample.windSamples[0].offsetM[0], 'scenario scrub deterministic X');
  assertClose(directSample.windSamples[0].offsetM[1], repeatedSample.windSamples[0].offsetM[1], 'scenario scrub deterministic Z');

  const v2 = parseScenario({
    schemaVersion: 2,
    distanceUnit: 'm',
    duration: 10,
    wind: { dirDeg: 0, speed: 0.15 },
    bodies: { A: { shape: 'circle', bounds: [0, 0, 1000, 0], feather: 100, base: 1000, thickness: 1000, type: 'cumulus' } },
    events: [],
  }, DEFAULT_SCENE_SCALE);
  assertClose(v2.wind?.speed ?? 0, 150, 'v2 world speed migration');

  let invalidWindUnitRejected = false;
  try {
    parseScenario({ ...crossingScenario, windUnit: 'knots' }, DEFAULT_SCENE_SCALE);
  } catch {
    invalidWindUnitRejected = true;
  }
  if (!invalidWindUnitRejected) throw new Error('physical verification: unknown wind unit must be rejected');

  windController.reset();
  body.windSpeedMps = 80;
  windController.advance([body], 3600);
  const longOffset = windController.samples([body])[0].offsetM[0];
  if (!Number.isFinite(longOffset)) throw new Error('physical verification: one-hour wind offset must stay finite');
  const longPacked = new Float32Array(PARAMS_FLOAT_COUNT);
  packParams(longPacked, { cloudHeight: 12 });
  packBodies(longPacked, [body], undefined, windController.samples([body]), DEFAULT_SCENE_SCALE);
  assertClose(longPacked[BODY_BASE + BODY_WIND_OFFSETS.advectionOffsetWorldX], 288, 'one-hour packed wind offset');

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
