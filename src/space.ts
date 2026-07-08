import type { CloudBody } from './body';
import type { WindOffsetM } from './wind';

export interface SceneScale {
  verticalMetersPerWorldUnit: number;
  horizontalMetersPerWorldUnit: number;
}

export const DEFAULT_SCENE_SCALE: SceneScale = {
  verticalMetersPerWorldUnit: 1000,
  horizontalMetersPerWorldUnit: 1000,
};

export function isValidMetersPerWorldUnit(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function normalizedSceneScale(scale: SceneScale): SceneScale {
  return {
    verticalMetersPerWorldUnit: isValidMetersPerWorldUnit(scale.verticalMetersPerWorldUnit)
      ? scale.verticalMetersPerWorldUnit
      : DEFAULT_SCENE_SCALE.verticalMetersPerWorldUnit,
    horizontalMetersPerWorldUnit: isValidMetersPerWorldUnit(scale.horizontalMetersPerWorldUnit)
      ? scale.horizontalMetersPerWorldUnit
      : DEFAULT_SCENE_SCALE.horizontalMetersPerWorldUnit,
  };
}

export function metersToWorldY(meters: number, scale: SceneScale): number {
  return meters / normalizedSceneScale(scale).verticalMetersPerWorldUnit;
}

export function metersToWorldXZ(meters: number, scale: SceneScale): number {
  return meters / normalizedSceneScale(scale).horizontalMetersPerWorldUnit;
}

export function worldToMetersY(world: number, scale: SceneScale): number {
  return world * normalizedSceneScale(scale).verticalMetersPerWorldUnit;
}

export function worldToMetersXZ(world: number, scale: SceneScale): number {
  return world * normalizedSceneScale(scale).horizontalMetersPerWorldUnit;
}

export function bodyToRenderSpace(body: CloudBody, scale: SceneScale): CloudBody {
  const bounds = body.bounds.map((v) => metersToWorldXZ(v, scale));
  return {
    ...body,
    bounds,
    feather: metersToWorldXZ(body.feather, scale),
    base: metersToWorldY(body.base, scale),
    thickness: metersToWorldY(body.thickness, scale),
    rot: [body.rot[0], body.rot[1], body.rot[2]],
    life: { ...body.life },
  };
}

export function bodyToTransportedRenderSpace(body: CloudBody, offsetM: WindOffsetM, scale: SceneScale): CloudBody {
  const worldBody = bodyToRenderSpace(body, scale);
  const dx = metersToWorldXZ(offsetM[0], scale);
  const dz = metersToWorldXZ(offsetM[1], scale);
  const bounds = worldBody.bounds.map((v, i) => v + (i % 2 === 0 ? dx : dz));
  return { ...worldBody, bounds };
}
