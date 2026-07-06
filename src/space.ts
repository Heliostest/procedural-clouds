import type { CloudBody } from './body';

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
  const bounds = body.bounds.slice();
  if (body.shape === 'rect') {
    for (let i = 0; i < 4; i++) bounds[i] = metersToWorldXZ(bounds[i], scale);
  } else {
    bounds[0] = metersToWorldXZ(bounds[0], scale);
    bounds[1] = metersToWorldXZ(bounds[1], scale);
    bounds[2] = metersToWorldXZ(bounds[2], scale);
  }
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
