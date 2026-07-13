import { MAX_BODIES } from '../params';
import { bodyToRenderSpace, metersToWorldXZ, metersToWorldY, normalizedSceneScale } from '../space';
import type { DensityFrameInput } from './contracts';
import {
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_FRAME_GPU_LAYOUT,
  DENSITY_V2_FRAME_FLAGS,
  createDensityV2RecordBuffer,
  densityV2LayoutField,
  writeDensityV2F32,
  writeDensityV2U32,
} from './recipeV2Layout';
import { densityV2GenusId, densityV2RecipeSupport } from './recipeV2Recipes';

export type DensityV2Vec3 = readonly [number, number, number];
export type DensityV2Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export interface DensityV2ActiveBody {
  readonly sourceIndex: number;
  readonly compactIndex: number;
  readonly genusId: number;
  readonly supportCenter: DensityV2Vec3;
  readonly supportHalfExtents: DensityV2Vec3;
  readonly supportRotation: DensityV2Mat3;
  readonly supportAabbMin: DensityV2Vec3;
  readonly supportAabbMax: DensityV2Vec3;
}

export interface DensityV2PackedFrame {
  readonly frame: ArrayBuffer;
  readonly bodies: ArrayBuffer;
  readonly activeBodyCount: number;
  readonly invalidGenusCount: number;
  readonly truncatedActiveCount: number;
  readonly sourceIndices: readonly number[];
  readonly activeBodies: readonly DensityV2ActiveBody[];
  readonly volumeMin: DensityV2Vec3;
  readonly volumeExtent: DensityV2Vec3;
}

type Quaternion = readonly [number, number, number, number];

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function densityV2EulerToQuaternion(euler: readonly [number, number, number]): Quaternion {
  const hx = euler[0] * 0.5;
  const hy = euler[1] * 0.5;
  const hz = euler[2] * 0.5;
  const qx: Quaternion = [Math.sin(hx), 0, 0, Math.cos(hx)];
  const qy: Quaternion = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qz: Quaternion = [0, 0, Math.sin(hz), Math.cos(hz)];
  const q = multiplyQuaternion(multiplyQuaternion(qx, qy), qz);
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(length) || length <= 0) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

export function densityV2QuaternionMatrix(q: Quaternion): DensityV2Mat3 {
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

function rotatedAabbHalfExtents(rotation: DensityV2Mat3, half: DensityV2Vec3): DensityV2Vec3 {
  return [
    Math.abs(rotation[0]) * half[0] + Math.abs(rotation[1]) * half[1] + Math.abs(rotation[2]) * half[2],
    Math.abs(rotation[3]) * half[0] + Math.abs(rotation[4]) * half[1] + Math.abs(rotation[5]) * half[2],
    Math.abs(rotation[6]) * half[0] + Math.abs(rotation[7]) * half[1] + Math.abs(rotation[8]) * half[2],
  ];
}

export function setDensityV2TileMaskFlag(frame: ArrayBuffer, enabled: boolean): void {
  const field = densityV2LayoutField(DENSITY_FRAME_GPU_LAYOUT, 'countsAndFlags');
  const lane = new Uint32Array(frame, field.byteOffset, 4);
  lane[3] = enabled
    ? lane[3] | DENSITY_V2_FRAME_FLAGS.tileMaskEnabled
    : lane[3] & ~DENSITY_V2_FRAME_FLAGS.tileMaskEnabled;
}

export function packDensityV2Frame(input: DensityFrameInput, resolution: number): DensityV2PackedFrame {
  const frame = createDensityV2RecordBuffer(DENSITY_FRAME_GPU_LAYOUT);
  const bodies = createDensityV2RecordBuffer(DENSITY_BODY_GPU_LAYOUT);
  const scale = normalizedSceneScale(input.params);
  const boxHalfExtent = metersToWorldXZ(input.params.boxHalfExtent, scale);
  const cloudHeight = metersToWorldY(input.params.cloudHeight, scale);
  const volumeMin: DensityV2Vec3 = [-boxHalfExtent, 0, -boxHalfExtent];
  const volumeExtent: DensityV2Vec3 = [boxHalfExtent * 2, cloudHeight, boxHalfExtent * 2];
  const normalizedRes = Math.max(1, Math.round(resolution));
  const halfVoxel: DensityV2Vec3 = [
    volumeExtent[0] / normalizedRes * 0.5,
    volumeExtent[1] / normalizedRes * 0.5,
    volumeExtent[2] / normalizedRes * 0.5,
  ];
  const epsilon = Math.max(1e-6, Math.max(...volumeExtent) / normalizedRes * 1e-4);
  const activeBodies: DensityV2ActiveBody[] = [];
  const sourceIndices: number[] = [];
  let invalidGenusCount = 0;
  let truncatedActiveCount = 0;

  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'volumeMin', [...volumeMin, 0]);
  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'volumeExtent', [...volumeExtent, input.sceneTimeSeconds]);
  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'timingAndScale', [
    input.elapsedSeconds,
    input.sceneTimeSeconds,
    scale.horizontalMetersPerWorldUnit,
    scale.verticalMetersPerWorldUnit,
  ]);

  for (let sourceIndex = 0; sourceIndex < input.bodies.length; sourceIndex++) {
    const source = input.bodies[sourceIndex];
    const mod = input.bodyMods[sourceIndex] ?? { coverageMul: 1, densityScale: 1, morph: 0 };
    const wind = input.windSamples[sourceIndex] ?? { offsetM: [0, 0] as const, morphTime: 0 };
    const genusId = densityV2GenusId(source.type);
    const validGenus = genusId >= 0;
    if (!validGenus) invalidGenusCount++;
    const body = bodyToRenderSpace(source, scale);
    const finiteGeometry = body.bounds.length >= 4
      && body.bounds.slice(0, 4).every(Number.isFinite)
      && Number.isFinite(body.base)
      && Number.isFinite(body.thickness)
      && body.thickness > 0
      && Number.isFinite(body.feather)
      && body.feather >= 0
      && body.rot.every(Number.isFinite);
    const coverage = source.coverage * mod.coverageMul;
    const density = source.densityScale;
    const lifecycleDensity = mod.densityScale;
    const finiteStrength = Number.isFinite(coverage) && Number.isFinite(density)
      && Number.isFinite(lifecycleDensity) && Number.isFinite(mod.morph)
      && coverage > 0 && density > 0 && lifecycleDensity > 0;
    if (!validGenus || !finiteGeometry || !finiteStrength) continue;
    const minX = body.bounds[0]; const minZ = body.bounds[1];
    const maxX = body.bounds[2]; const maxZ = body.bounds[3];
    const top = Math.min(cloudHeight, body.base + body.thickness);
    if (top <= body.base) continue;
    if (activeBodies.length >= MAX_BODIES) {
      truncatedActiveCount++;
      continue;
    }

    const compactIndex = activeBodies.length;
    const width = Math.max(0, maxX - minX);
    const depth = Math.max(0, maxZ - minZ);
    const height = top - body.base;
    const windX = Number.isFinite(wind.offsetM[0]) ? metersToWorldXZ(wind.offsetM[0], scale) : 0;
    const windZ = Number.isFinite(wind.offsetM[1]) ? metersToWorldXZ(wind.offsetM[1], scale) : 0;
    const quaternion = densityV2EulerToQuaternion(body.rot);
    const rotation = densityV2QuaternionMatrix(quaternion);
    const support = densityV2RecipeSupport(genusId);
    const supportMinY = body.base - height * support.maxLowerExtensionFraction;
    const supportMaxY = top + height * support.maxUpperExtensionFraction;
    const originalCenter: DensityV2Vec3 = [
      (minX + maxX) * 0.5 + windX,
      (body.base + top) * 0.5,
      (minZ + maxZ) * 0.5 + windZ,
    ];
    const supportCenterOffsetY = (supportMinY + supportMaxY) * 0.5 - originalCenter[1];
    const supportCenter: DensityV2Vec3 = [
      originalCenter[0] + rotation[1] * supportCenterOffsetY,
      originalCenter[1] + rotation[4] * supportCenterOffsetY,
      originalCenter[2] + rotation[7] * supportCenterOffsetY,
    ];
    const supportHalfExtents: DensityV2Vec3 = [
      width * 0.5 * support.maxHorizontalScale + body.feather * support.maxFeatherScale,
      (supportMaxY - supportMinY) * 0.5,
      depth * 0.5 * support.maxHorizontalScale + body.feather * support.maxFeatherScale,
    ];
    const rotatedHalf = rotatedAabbHalfExtents(rotation, supportHalfExtents);
    const supportAabbMin: DensityV2Vec3 = [
      supportCenter[0] - rotatedHalf[0] - halfVoxel[0] - epsilon,
      supportCenter[1] - rotatedHalf[1] - halfVoxel[1] - epsilon,
      supportCenter[2] - rotatedHalf[2] - halfVoxel[2] - epsilon,
    ];
    const supportAabbMax: DensityV2Vec3 = [
      supportCenter[0] + rotatedHalf[0] + halfVoxel[0] + epsilon,
      supportCenter[1] + rotatedHalf[1] + halfVoxel[1] + epsilon,
      supportCenter[2] + rotatedHalf[2] + halfVoxel[2] + epsilon,
    ];

    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'boundsXZ', [minX, minZ, maxX, maxZ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'heightDensity', [
      body.base, top, density, body.feather,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'coverageLifecycle', [
      coverage, lifecycleDensity, mod.morph, 1,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'transport', [
      windX, windZ, Number.isFinite(wind.morphTime) ? wind.morphTime : 0, 0,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'rotation', quaternion);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'localScaleAndFeather', [
      width * 0.5, height * 0.5, depth * 0.5, body.feather,
    ]);
    writeDensityV2U32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'ids', [genusId, genusId, 1, 0]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, compactIndex, 'reserved', [0, 0, 0, 0]);
    activeBodies.push({
      sourceIndex,
      compactIndex,
      genusId,
      supportCenter,
      supportHalfExtents,
      supportRotation: rotation,
      supportAabbMin,
      supportAabbMax,
    });
    sourceIndices.push(sourceIndex);
  }

  const flags = invalidGenusCount > 0 ? DENSITY_V2_FRAME_FLAGS.invalidGenus : 0;
  writeDensityV2U32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'countsAndFlags', [
    normalizedRes,
    activeBodies.length,
    Math.max(0, Math.round(input.frameIndex)),
    flags,
  ]);
  return {
    frame,
    bodies,
    activeBodyCount: activeBodies.length,
    invalidGenusCount,
    truncatedActiveCount,
    sourceIndices,
    activeBodies,
    volumeMin,
    volumeExtent,
  };
}
