import { MAX_BODIES } from '../params';
import { bodyToRenderSpace, metersToWorldXZ, metersToWorldY, normalizedSceneScale } from '../space';
import type { DensityFrameInput } from './contracts';
import {
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_FRAME_GPU_LAYOUT,
  createDensityV2RecordBuffer,
  writeDensityV2F32,
  writeDensityV2U32,
} from './recipeV2Layout';
import { densityV2GenusId } from './recipeV2Recipes';

export interface DensityV2PackedFrame {
  readonly frame: ArrayBuffer;
  readonly bodies: ArrayBuffer;
  readonly activeBodyCount: number;
  readonly invalidGenusCount: number;
}

export function packDensityV2Frame(input: DensityFrameInput, resolution: number): DensityV2PackedFrame {
  const frame = createDensityV2RecordBuffer(DENSITY_FRAME_GPU_LAYOUT);
  const bodies = createDensityV2RecordBuffer(DENSITY_BODY_GPU_LAYOUT);
  const scale = normalizedSceneScale(input.params);
  const boxHalfExtent = metersToWorldXZ(input.params.boxHalfExtent, scale);
  const cloudHeight = metersToWorldY(input.params.cloudHeight, scale);
  const bodyCount = Math.min(input.bodies.length, MAX_BODIES);
  let activeBodyCount = 0;
  let invalidGenusCount = 0;

  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'volumeMin', [-boxHalfExtent, 0, -boxHalfExtent, 0]);
  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'volumeExtent', [
    boxHalfExtent * 2,
    cloudHeight,
    boxHalfExtent * 2,
    input.sceneTimeSeconds,
  ]);
  writeDensityV2F32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'timingAndScale', [
    input.elapsedSeconds,
    input.sceneTimeSeconds,
    scale.horizontalMetersPerWorldUnit,
    scale.verticalMetersPerWorldUnit,
  ]);

  for (let index = 0; index < bodyCount; index++) {
    const source = input.bodies[index];
    const mod = input.bodyMods[index] ?? { coverageMul: 1, densityScale: 1, morph: 0 };
    const wind = input.windSamples[index] ?? { offsetM: [0, 0] as const, morphTime: 0 };
    const genusId = densityV2GenusId(source.type);
    const body = bodyToRenderSpace(source, scale);
    const validGenus = genusId >= 0;
    const finiteGeometry = body.bounds.length >= 4
      && body.bounds.slice(0, 4).every(Number.isFinite)
      && Number.isFinite(body.base)
      && Number.isFinite(body.thickness)
      && body.thickness > 0;
    const enabled = validGenus && finiteGeometry && mod.densityScale > 0 && source.densityScale > 0;
    if (!validGenus) invalidGenusCount++;
    if (enabled) activeBodyCount++;
    const safeGenusId = validGenus ? genusId : 0;
    const minX = finiteGeometry ? body.bounds[0] : 0;
    const minZ = finiteGeometry ? body.bounds[1] : 0;
    const maxX = finiteGeometry ? body.bounds[2] : 0;
    const maxZ = finiteGeometry ? body.bounds[3] : 0;
    const top = finiteGeometry ? Math.min(cloudHeight, body.base + body.thickness) : 0;
    const width = Math.max(0, maxX - minX);
    const depth = Math.max(0, maxZ - minZ);
    const windX = Number.isFinite(wind.offsetM[0]) ? metersToWorldXZ(wind.offsetM[0], scale) : 0;
    const windZ = Number.isFinite(wind.offsetM[1]) ? metersToWorldXZ(wind.offsetM[1], scale) : 0;

    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'boundsXZ', [minX, minZ, maxX, maxZ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'heightDensity', [
      finiteGeometry ? body.base : 0,
      top,
      enabled ? source.densityScale * mod.densityScale : 0,
      Math.max(0, body.feather),
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'coverageLifecycle', [
      enabled ? Math.max(0, source.coverage * mod.coverageMul) : 0,
      enabled ? mod.densityScale : 0,
      Number.isFinite(mod.morph) ? mod.morph : 0,
      enabled ? 1 : 0,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'transport', [
      windX,
      windZ,
      Number.isFinite(wind.morphTime) ? wind.morphTime : 0,
      0,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'rotation', [
      Number.isFinite(body.rot[0]) ? body.rot[0] : 0,
      Number.isFinite(body.rot[1]) ? body.rot[1] : 0,
      Number.isFinite(body.rot[2]) ? body.rot[2] : 0,
      0,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'localScaleAndFeather', [
      width * 0.5,
      Math.max(0, top - (finiteGeometry ? body.base : 0)) * 0.5,
      depth * 0.5,
      Math.max(0, body.feather),
    ]);
    writeDensityV2U32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'ids', [
      safeGenusId,
      safeGenusId,
      enabled ? 1 : 0,
      validGenus ? 0 : 1,
    ]);
    writeDensityV2F32(bodies, DENSITY_BODY_GPU_LAYOUT, index, 'reserved', [0, 0, 0, 0]);
  }

  writeDensityV2U32(frame, DENSITY_FRAME_GPU_LAYOUT, 0, 'countsAndFlags', [
    Math.max(1, Math.round(resolution)),
    activeBodyCount,
    Math.max(0, Math.round(input.frameIndex)),
    invalidGenusCount > 0 ? 1 : 0,
  ]);
  return { frame, bodies, activeBodyCount, invalidGenusCount };
}
