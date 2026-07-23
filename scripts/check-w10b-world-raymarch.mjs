import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'src/rendering/worldRaymarch.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`W10B world-raymarch contract failed: ${message}`);
}

function near(actual, expected, epsilon = 1e-9) {
  return Math.abs(actual - expected) <= epsilon;
}

for (const contract of [
  'MAX_WORLD_RAYMARCH_SUPPORTS = 24',
  'buildWorldRaymarchSupports',
  'mergeBodySupportSnapshots',
  'metersPerRayT',
  'metersToRayDelta',
  'clampWorldStepMeters',
  'perspectiveStepMeters',
  'voxelPadding',
  'boundingSphereRadius',
]) {
  assert(source.includes(contract), `module source is missing ${contract}`);
}

const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const {
  MAX_WORLD_RAYMARCH_SUPPORTS,
  buildWorldRaymarchSupports,
  clampWorldStepMeters,
  mergeBodySupportSnapshots,
  metersPerRayT,
  metersToRayDelta,
  perspectiveStepMeters,
} = module;

assert(MAX_WORLD_RAYMARCH_SUPPORTS === 24, 'public Support limit changed');

const scale = Object.freeze({
  horizontalMetersPerWorldUnit: 1000,
  verticalMetersPerWorldUnit: 500,
});
const zeroWind = Object.freeze({ offsetM: Object.freeze([0, 0]), morphTime: 0 });

function body(id, overrides = {}) {
  return {
    id,
    shape: 'rect',
    bounds: [-1000, -2000, 1000, 2000],
    feather: 100,
    base: 500,
    thickness: 1000,
    type: 'cumulus',
    placementLocked: false,
    coverage: 1,
    densityScale: 1,
    windDeg: 0,
    windSpeedMps: 0,
    morphRate: 0,
    rot: [0, 0, 0],
    life: { enabled: false, birth: 0, grow: 0, decay: 0, death: 0, peak: 1 },
    ...overrides,
  };
}

function build(bodies, windSamples, overrides = {}) {
  return buildWorldRaymarchSupports({
    bodies,
    windSamples,
    sceneScale: scale,
    boxHalfExtentM: 10_000,
    cloudHeightM: 5_000,
    densityResolution: 100,
    ...overrides,
  });
}

// A full density voxel must surround the public conservative envelope. The
// anisotropic fixture has voxel size (0.2, 0.1, 0.2) render-world units; XZ
// covers the max-axis 1.5x Recipe envelope and Y covers -0.05H/+0.10H.
const baseSupport = build([body('base')], [zeroWind])[0];
assert(baseSupport !== undefined, 'basic body did not produce Support');
for (const [actual, expected, label] of [
  [baseSupport.min[0], -3.3, 'min x'],
  [baseSupport.max[0], 3.3, 'max x'],
  [baseSupport.min[1], 0.8, 'min y'],
  [baseSupport.max[1], 3.3, 'max y'],
  [baseSupport.min[2], -3.3, 'min z'],
  [baseSupport.max[2], 3.3, 'max z'],
]) {
  assert(near(actual, expected), `feather/voxel padding changed at ${label}: ${actual}`);
}

// Rotation, feather and wind must all be contained. For a +90-degree Z
// rotation the known forward transform is (x,y,z) -> (-y,x,z).
const rotatedBody = body('rotated', {
  bounds: [-2000, -250, 2000, 250],
  feather: 250,
  base: 3000,
  thickness: 1000,
  rot: [0, 0, Math.PI / 2],
});
const rotatedSupport = build(
  [rotatedBody],
  [{ offsetM: [1500, -500], morphTime: 3 }],
  { boxHalfExtentM: 20_000, cloudHeightM: 10_000 },
)[0];
assert(rotatedSupport !== undefined, 'rotated/wind body did not produce Support');
const rotatedCenter = [1.45, 7, -0.5];
const rotatedLocalHalf = [3.25, 1.15, 3.25];
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const local = [
        rotatedLocalHalf[0] * sx,
        rotatedLocalHalf[1] * sy,
        rotatedLocalHalf[2] * sz,
      ];
      const point = [
        rotatedCenter[0] - local[1],
        rotatedCenter[1] + local[0],
        rotatedCenter[2] + local[2],
      ];
      for (let axis = 0; axis < 3; axis++) {
        assert(
          point[axis] >= rotatedSupport.min[axis] - 1e-9
            && point[axis] <= rotatedSupport.max[axis] + 1e-9,
          `rotated/feather/wind corner leaked on axis ${axis}`,
        );
      }
    }
  }
}
const rotatedWithoutWind = build(
  [rotatedBody],
  [zeroWind],
  { boxHalfExtentM: 20_000, cloudHeightM: 10_000 },
)[0];
assert(rotatedWithoutWind !== undefined, 'zero-wind rotated fixture did not produce Support');
assert(
  near(rotatedSupport.min[0] - rotatedWithoutWind.min[0], 1.5)
    && near(rotatedSupport.max[0] - rotatedWithoutWind.max[0], 1.5),
  'wind X offset was not applied',
);
assert(
  near(rotatedSupport.min[2] - rotatedWithoutWind.min[2], -0.5)
    && near(rotatedSupport.max[2] - rotatedWithoutWind.max[2], -0.5),
  'wind Z offset was not applied',
);

// Current and previous snapshots are unioned by Body id. Previous-only Bodies
// remain, which covers deletion and edits until the consumer advances history.
const movingBody = body('moving');
const current = build([movingBody], [{ offsetM: [1000, 0], morphTime: 1 }]);
const previous = build(
  [movingBody, body('deleted', { bounds: [4000, 4000, 5000, 5000] })],
  [{ offsetM: [-1000, 0], morphTime: 0 }, zeroWind],
);
const temporalSupports = mergeBodySupportSnapshots(current, previous);
assert(temporalSupports.length === 2, 'current/previous snapshots were not merged by Body id');
const moving = temporalSupports.find((support) => support.bodyId === 'moving');
assert(moving !== undefined, 'moving Body vanished from merged snapshot');
assert(moving.min[0] <= previous[0].min[0] && moving.max[0] >= current[0].max[0], 'old/new motion envelope leaked');
assert(temporalSupports.some((support) => support.bodyId === 'deleted'), 'previous-only deleted Body was dropped');

// More than 24 records must coalesce, not truncate geometry. This checks both
// the public limit and containment of the final Body in the overflow envelope.
const crowdedBodies = Array.from({ length: 30 }, (_, index) => {
  const x = -7000 + index * 500;
  return body(`crowded-${index}`, { bounds: [x, -50, x + 100, 50], feather: 25 });
});
const crowded = build(crowdedBodies, crowdedBodies.map(() => zeroWind));
assert(crowded.length === 24, 'current snapshot did not enforce the 24-record limit');
const lastCenterWorld = (-7000 + 29 * 500 + 50) / scale.horizontalMetersPerWorldUnit;
assert(
  crowded.some((support) => support.min[0] <= lastCenterWorld && support.max[0] >= lastCenterWorld),
  'overflow coalescing dropped the final Body Support',
);

const finiteFixture = build(
  [body('invalid', { bounds: [Number.NaN, 0, 1, 1] }), body('finite')],
  [{ offsetM: [0, 0], morphTime: 0 }, { offsetM: [Number.POSITIVE_INFINITY, Number.NaN], morphTime: 0 }],
);
assert(finiteFixture.length === 1, 'invalid geometry should not create an unusable Support');
assert(
  finiteFixture.every((support) => [...support.min, ...support.max].every(Number.isFinite)),
  'Support output contains a non-finite coordinate',
);

// Physical/render-ray conversions must respect horizontal/vertical anisotropy.
assert(near(metersPerRayT([1, 0, 0], scale), 1000), 'horizontal metres-per-t is incorrect');
assert(near(metersPerRayT([0, 1, 0], scale), 500), 'vertical metres-per-t is incorrect');
const invSqrt2 = 1 / Math.sqrt(2);
const diagonalExpected = Math.hypot(1000 * invSqrt2, 500 * invSqrt2);
assert(
  near(metersPerRayT([invSqrt2, invSqrt2, 0], scale), diagonalExpected),
  'diagonal anisotropic metres-per-t is incorrect',
);
assert(near(metersToRayDelta(2000, [1, 0, 0], scale), 2), 'horizontal metre-to-delta conversion is incorrect');
assert(near(metersToRayDelta(2000, [0, 1, 0], scale), 4), 'vertical metre-to-delta conversion is incorrect');

assert(clampWorldStepMeters(50, 100, 250) === 100, 'minimum world step clamp failed');
assert(clampWorldStepMeters(400, 100, 250) === 250, 'maximum world step clamp failed');
assert(clampWorldStepMeters(150, 100, 250, 40) === 40, 'remaining max-distance clamp failed');
assert(perspectiveStepMeters(10_000, 100, 250, 0.003) === 103, 'perspective growth is incorrect');
assert(perspectiveStepMeters(1_000_000, 100, 250, 0.003) === 250, 'perspective max-step clamp failed');
assert(perspectiveStepMeters(1_000_000, 100, 250, 0.003, 35) === 35, 'perspective max-distance clamp failed');
assert(metersToRayDelta(100, [0, 0, 0], scale) === 0, 'degenerate ray must return a finite zero delta');

for (const value of [
  metersPerRayT([Number.NaN, 0, 0], scale),
  metersToRayDelta(Number.POSITIVE_INFINITY, [1, 0, 0], scale),
  clampWorldStepMeters(Number.NaN, Number.NaN, Number.NaN),
  perspectiveStepMeters(Number.NaN, Number.NaN, Number.NaN, Number.NaN),
]) {
  assert(Number.isFinite(value), 'ray-step helper returned a non-finite value');
}

console.log('W10B conservative Body Support and anisotropic world-step fixtures passed');
