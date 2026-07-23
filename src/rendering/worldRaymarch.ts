import type { CloudBody } from '../body';
import type { SceneScale } from '../space';
import type { WindAdvectionSample } from '../wind';

export const MAX_WORLD_RAYMARCH_SUPPORTS = 24;

const DEFAULT_METERS_PER_WORLD_UNIT = 1000;
const OVERFLOW_SUPPORT_ID = '__world-raymarch-overflow__';

export type WorldRaymarchVec3 = readonly [number, number, number];

/**
 * A conservative render-world AABB. It is intentionally independent of any
 * producer-private tile/candidate representation so it can be consumed by all
 * density paths, including Legacy and global-only fallbacks.
 */
export interface WorldRaymarchBodySupport {
  readonly bodyId: string;
  readonly min: WorldRaymarchVec3;
  readonly max: WorldRaymarchVec3;
}

export interface BuildWorldRaymarchSupportsInput {
  readonly bodies: readonly CloudBody[];
  readonly windSamples: readonly WindAdvectionSample[];
  readonly sceneScale: SceneScale;
  readonly boxHalfExtentM: number;
  readonly cloudHeightM: number;
  readonly densityResolution: number;
}

type Quaternion = readonly [number, number, number, number];
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedScale(scale: SceneScale): SceneScale {
  return {
    horizontalMetersPerWorldUnit: positiveFinite(
      scale.horizontalMetersPerWorldUnit,
      DEFAULT_METERS_PER_WORLD_UNIT,
    ),
    verticalMetersPerWorldUnit: positiveFinite(
      scale.verticalMetersPerWorldUnit,
      DEFAULT_METERS_PER_WORLD_UNIT,
    ),
  };
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function eulerToMatrix(euler: readonly [number, number, number]): Mat3 {
  const ex = Number.isFinite(euler[0]) ? euler[0] : 0;
  const ey = Number.isFinite(euler[1]) ? euler[1] : 0;
  const ez = Number.isFinite(euler[2]) ? euler[2] : 0;
  const qx: Quaternion = [Math.sin(ex * 0.5), 0, 0, Math.cos(ex * 0.5)];
  const qy: Quaternion = [0, Math.sin(ey * 0.5), 0, Math.cos(ey * 0.5)];
  const qz: Quaternion = [0, 0, Math.sin(ez * 0.5), Math.cos(ez * 0.5)];
  const raw = multiplyQuaternion(multiplyQuaternion(qx, qy), qz);
  const length = Math.hypot(raw[0], raw[1], raw[2], raw[3]);
  const q: Quaternion = Number.isFinite(length) && length > Number.EPSILON
    ? [raw[0] / length, raw[1] / length, raw[2] / length, raw[3] / length]
    : [0, 0, 0, 1];
  const [x, y, z, w] = q;
  const xx = x * x; const yy = y * y; const zz = z * z;
  const xy = x * y; const xz = x * z; const yz = y * z;
  const wx = w * x; const wy = w * y; const wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

function rotatedAabbHalfExtents(rotation: Mat3, half: WorldRaymarchVec3): WorldRaymarchVec3 {
  const projected: WorldRaymarchVec3 = [
    Math.abs(rotation[0]) * half[0] + Math.abs(rotation[1]) * half[1] + Math.abs(rotation[2]) * half[2],
    Math.abs(rotation[3]) * half[0] + Math.abs(rotation[4]) * half[1] + Math.abs(rotation[5]) * half[2],
    Math.abs(rotation[6]) * half[0] + Math.abs(rotation[7]) * half[1] + Math.abs(rotation[8]) * half[2],
  ];
  if (projected.every(Number.isFinite)) return projected;

  // A sphere is looser than the OBB projection but remains conservative if a
  // pathological finite Euler input defeats the tighter calculation.
  const boundingSphereRadius = Math.hypot(half[0], half[1], half[2]);
  return [boundingSphereRadius, boundingSphereRadius, boundingSphereRadius];
}

function finiteSupport(support: WorldRaymarchBodySupport): WorldRaymarchBodySupport | undefined {
  if (![...support.min, ...support.max].every(Number.isFinite)) return undefined;
  return {
    bodyId: support.bodyId,
    min: [
      Math.min(support.min[0], support.max[0]),
      Math.min(support.min[1], support.max[1]),
      Math.min(support.min[2], support.max[2]),
    ],
    max: [
      Math.max(support.min[0], support.max[0]),
      Math.max(support.min[1], support.max[1]),
      Math.max(support.min[2], support.max[2]),
    ],
  };
}

function unionSupport(
  left: WorldRaymarchBodySupport,
  right: WorldRaymarchBodySupport,
  bodyId: string,
): WorldRaymarchBodySupport {
  return {
    bodyId,
    min: [
      Math.min(left.min[0], right.min[0]),
      Math.min(left.min[1], right.min[1]),
      Math.min(left.min[2], right.min[2]),
    ],
    max: [
      Math.max(left.max[0], right.max[0]),
      Math.max(left.max[1], right.max[1]),
      Math.max(left.max[2], right.max[2]),
    ],
  };
}

function capSupports(
  supports: readonly WorldRaymarchBodySupport[],
  requestedMax: number,
): WorldRaymarchBodySupport[] {
  const maxSupports = Math.min(
    MAX_WORLD_RAYMARCH_SUPPORTS,
    Math.max(0, Number.isFinite(requestedMax) ? Math.floor(requestedMax) : MAX_WORLD_RAYMARCH_SUPPORTS),
  );
  if (maxSupports === 0 || supports.length === 0) return [];
  if (supports.length <= maxSupports) return supports.map((support) => ({ ...support }));

  const retained = supports.slice(0, maxSupports - 1).map((support) => ({ ...support }));
  let overflow = supports[maxSupports - 1];
  for (let index = maxSupports; index < supports.length; index++) {
    overflow = unionSupport(overflow, supports[index], OVERFLOW_SUPPORT_ID);
  }
  retained.push({ ...overflow, bodyId: OVERFLOW_SUPPORT_ID });
  return retained;
}

/**
 * Builds the current public Body Support snapshot. A full density voxel is
 * padded on every face (not merely half a voxel), and all output is clipped to
 * the renderable cloud volume because density outside that volume is never
 * sampled by the primary ray.
 */
export function buildWorldRaymarchSupports(
  input: BuildWorldRaymarchSupportsInput,
): WorldRaymarchBodySupport[] {
  const scale = normalizedScale(input.sceneScale);
  const boxHalfExtentM = positiveFinite(input.boxHalfExtentM, 0);
  const cloudHeightM = positiveFinite(input.cloudHeightM, 0);
  if (boxHalfExtentM <= 0 || cloudHeightM <= 0) return [];

  const halfWorld = boxHalfExtentM / scale.horizontalMetersPerWorldUnit;
  const heightWorld = cloudHeightM / scale.verticalMetersPerWorldUnit;
  const resolution = Math.max(
    1,
    Number.isFinite(input.densityResolution) ? Math.floor(input.densityResolution) : 1,
  );
  const volumeMin: WorldRaymarchVec3 = [-halfWorld, 0, -halfWorld];
  const volumeMax: WorldRaymarchVec3 = [halfWorld, heightWorld, halfWorld];
  const voxelPadding: WorldRaymarchVec3 = [
    (halfWorld * 2) / resolution,
    heightWorld / resolution,
    (halfWorld * 2) / resolution,
  ];
  const supports: WorldRaymarchBodySupport[] = [];

  for (let index = 0; index < input.bodies.length; index++) {
    const body = input.bodies[index];
    if (body.bounds.length < 4 || !body.bounds.slice(0, 4).every(Number.isFinite)) continue;
    if (!Number.isFinite(body.base) || !Number.isFinite(body.thickness) || body.thickness <= 0) continue;

    const minXM = Math.min(body.bounds[0], body.bounds[2]);
    const maxXM = Math.max(body.bounds[0], body.bounds[2]);
    const minZM = Math.min(body.bounds[1], body.bounds[3]);
    const maxZM = Math.max(body.bounds[1], body.bounds[3]);
    const featherM = Number.isFinite(body.feather) ? Math.max(0, body.feather) : 0;
    const wind = input.windSamples[index];
    const windXM = Number.isFinite(wind?.offsetM[0]) ? wind.offsetM[0] : 0;
    const windZM = Number.isFinite(wind?.offsetM[1]) ? wind.offsetM[1] : 0;
    const baseWorld = body.base / scale.verticalMetersPerWorldUnit;
    const topWorld = (body.base + body.thickness) / scale.verticalMetersPerWorldUnit;
    const heightWorldBody = Math.abs(topWorld - baseWorld);
    const rotation = eulerToMatrix(body.rot);
    const originalCenter: WorldRaymarchVec3 = [
      ((minXM + maxXM) * 0.5 + windXM) / scale.horizontalMetersPerWorldUnit,
      (baseWorld + topWorld) * 0.5,
      ((minZM + maxZM) * 0.5 + windZM) / scale.horizontalMetersPerWorldUnit,
    ];
    // This public envelope covers both the Legacy max-axis footprint and the
    // widest current V2 Recipe support. It deliberately does not use
    // producer-private recipe/candidate records: unknown genera inherit the
    // same conservative 1.5x / -0.05H / +0.10H bounds.
    const supportMinY = baseWorld - heightWorldBody * 0.05;
    const supportMaxY = topWorld + heightWorldBody * 0.10;
    const supportCenterOffsetY = (supportMinY + supportMaxY) * 0.5 - originalCenter[1];
    const center: WorldRaymarchVec3 = [
      originalCenter[0] + rotation[1] * supportCenterOffsetY,
      originalCenter[1] + rotation[4] * supportCenterOffsetY,
      originalCenter[2] + rotation[7] * supportCenterOffsetY,
    ];
    const maxHorizontalHalfM = Math.max(maxXM - minXM, maxZM - minZM) * 0.5;
    const localHalf: WorldRaymarchVec3 = [
      (maxHorizontalHalfM * 1.5 + featherM) / scale.horizontalMetersPerWorldUnit,
      (supportMaxY - supportMinY) * 0.5,
      (maxHorizontalHalfM * 1.5 + featherM) / scale.horizontalMetersPerWorldUnit,
    ];
    if (![...center, ...localHalf].every(Number.isFinite)) {
      supports.push({ bodyId: body.id, min: volumeMin, max: volumeMax });
      continue;
    }

    const rotatedHalf = rotatedAabbHalfExtents(rotation, localHalf);
    const rawMin: WorldRaymarchVec3 = [
      center[0] - rotatedHalf[0] - voxelPadding[0],
      center[1] - rotatedHalf[1] - voxelPadding[1],
      center[2] - rotatedHalf[2] - voxelPadding[2],
    ];
    const rawMax: WorldRaymarchVec3 = [
      center[0] + rotatedHalf[0] + voxelPadding[0],
      center[1] + rotatedHalf[1] + voxelPadding[1],
      center[2] + rotatedHalf[2] + voxelPadding[2],
    ];
    if (![...rawMin, ...rawMax].every(Number.isFinite)) {
      supports.push({ bodyId: body.id, min: volumeMin, max: volumeMax });
      continue;
    }

    const min: WorldRaymarchVec3 = [
      Math.max(volumeMin[0], rawMin[0]),
      Math.max(volumeMin[1], rawMin[1]),
      Math.max(volumeMin[2], rawMin[2]),
    ];
    const max: WorldRaymarchVec3 = [
      Math.min(volumeMax[0], rawMax[0]),
      Math.min(volumeMax[1], rawMax[1]),
      Math.min(volumeMax[2], rawMax[2]),
    ];
    if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) continue;
    supports.push({ bodyId: body.id, min, max });
  }

  return capSupports(supports, MAX_WORLD_RAYMARCH_SUPPORTS);
}

/**
 * Combines current and previous public snapshots. Matching Body ids are
 * unioned so edits/advection cannot open a one-frame false-negative gap;
 * previous-only entries remain to cover deletion/history transitions. If the
 * record budget is exceeded, the tail is coalesced into one conservative AABB.
 */
export function mergeBodySupportSnapshots(
  current: readonly WorldRaymarchBodySupport[],
  previous: readonly WorldRaymarchBodySupport[],
  maxSupports = MAX_WORLD_RAYMARCH_SUPPORTS,
): WorldRaymarchBodySupport[] {
  const merged: WorldRaymarchBodySupport[] = [];
  const indices = new Map<string, number>();

  for (const candidate of [...current, ...previous]) {
    const support = finiteSupport(candidate);
    if (!support) continue;
    const existingIndex = indices.get(support.bodyId);
    if (existingIndex === undefined) {
      indices.set(support.bodyId, merged.length);
      merged.push(support);
    } else {
      merged[existingIndex] = unionSupport(merged[existingIndex], support, support.bodyId);
    }
  }

  return capSupports(merged, maxSupports);
}

/** Physical metres traversed by one unit of render-space ray parameter t. */
export function metersPerRayT(direction: WorldRaymarchVec3, sceneScale: SceneScale): number {
  if (!direction.every(Number.isFinite)) return 0;
  const scale = normalizedScale(sceneScale);
  const meters = Math.hypot(
    direction[0] * scale.horizontalMetersPerWorldUnit,
    direction[1] * scale.verticalMetersPerWorldUnit,
    direction[2] * scale.horizontalMetersPerWorldUnit,
  );
  return Number.isFinite(meters) ? meters : 0;
}

/** Converts a physical distance into render-space ray parameter delta. */
export function metersToRayDelta(
  meters: number,
  direction: WorldRaymarchVec3,
  sceneScale: SceneScale,
): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  const metersPerT = metersPerRayT(direction, sceneScale);
  if (metersPerT <= Number.EPSILON) return 0;
  const delta = meters / metersPerT;
  return Number.isFinite(delta) ? delta : 0;
}

/**
 * Clamps a candidate physical step and never crosses the remaining ray-distance
 * budget. The remaining distance may therefore return a final step below min.
 */
export function clampWorldStepMeters(
  candidateMeters: number,
  minStepMeters: number,
  maxStepMeters: number,
  remainingDistanceMeters = Number.POSITIVE_INFINITY,
): number {
  const minimum = Number.isFinite(minStepMeters) ? Math.max(0, minStepMeters) : 0;
  const maximum = Number.isFinite(maxStepMeters) ? Math.max(minimum, maxStepMeters) : minimum;
  const candidate = Number.isFinite(candidateMeters) ? candidateMeters : minimum;
  const clamped = Math.min(maximum, Math.max(minimum, candidate));
  if (!Number.isFinite(remainingDistanceMeters)) return clamped;
  return Math.min(clamped, Math.max(0, remainingDistanceMeters));
}

/** Perspective growth per kilometre, bounded by min/max and ray distance. */
export function perspectiveStepMeters(
  distanceFromRayOriginMeters: number,
  minStepMeters: number,
  maxStepMeters: number,
  perspectiveStepScale: number,
  remainingDistanceMeters = Number.POSITIVE_INFINITY,
): number {
  const distance = Number.isFinite(distanceFromRayOriginMeters)
    ? Math.max(0, distanceFromRayOriginMeters)
    : 0;
  const scale = Number.isFinite(perspectiveStepScale) ? Math.max(0, perspectiveStepScale) : 0;
  const minimum = Number.isFinite(minStepMeters) ? Math.max(0, minStepMeters) : 0;
  return clampWorldStepMeters(
    minimum * (1 + scale * distance * 0.001),
    minimum,
    maxStepMeters,
    remainingDistanceMeters,
  );
}
