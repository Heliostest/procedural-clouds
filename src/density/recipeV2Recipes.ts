import { CLOUD_GENERA, type CloudGenus } from '../genusProfile';
import {
  DENSITY_RECIPE_GPU_LAYOUT,
  DENSITY_V2_RECIPE_COUNT,
  createDensityV2RecordBuffer,
  writeDensityV2F32,
  writeDensityV2U32,
} from './recipeV2Layout';

export const DENSITY_V2_VERTICAL_PROFILE = Object.freeze({
  thinSheet: 0,
  softLayer: 1,
  flatBaseDome: 2,
  cellularLayer: 3,
  tower: 4,
} as const);

export const DENSITY_V2_TOPOLOGY_FAMILY = Object.freeze({
  stratiform: 0,
  billow: 1,
  cellular: 2,
  convective: 3,
  fiber: 4,
} as const);

export interface GenusRecipeDescriptor {
  readonly genus: CloudGenus;
  readonly genusId: number;
  readonly placementProfileId: string;
  readonly densityRecipeId: number;
  readonly opticalProfileId: string;
  readonly verticalProfile: number;
  readonly topologyFamily: number;
}

const RECIPE_MODES: Readonly<Record<CloudGenus, readonly [number, number]>> = Object.freeze({
  cumulus: [DENSITY_V2_VERTICAL_PROFILE.flatBaseDome, DENSITY_V2_TOPOLOGY_FAMILY.billow],
  stratus: [DENSITY_V2_VERTICAL_PROFILE.thinSheet, DENSITY_V2_TOPOLOGY_FAMILY.stratiform],
  stratocumulus: [DENSITY_V2_VERTICAL_PROFILE.cellularLayer, DENSITY_V2_TOPOLOGY_FAMILY.cellular],
  cumulonimbus: [DENSITY_V2_VERTICAL_PROFILE.tower, DENSITY_V2_TOPOLOGY_FAMILY.convective],
  altocumulus: [DENSITY_V2_VERTICAL_PROFILE.cellularLayer, DENSITY_V2_TOPOLOGY_FAMILY.cellular],
  altostratus: [DENSITY_V2_VERTICAL_PROFILE.softLayer, DENSITY_V2_TOPOLOGY_FAMILY.stratiform],
  nimbostratus: [DENSITY_V2_VERTICAL_PROFILE.softLayer, DENSITY_V2_TOPOLOGY_FAMILY.stratiform],
  cirrus: [DENSITY_V2_VERTICAL_PROFILE.thinSheet, DENSITY_V2_TOPOLOGY_FAMILY.fiber],
  cirrostratus: [DENSITY_V2_VERTICAL_PROFILE.thinSheet, DENSITY_V2_TOPOLOGY_FAMILY.stratiform],
  cirrocumulus: [DENSITY_V2_VERTICAL_PROFILE.cellularLayer, DENSITY_V2_TOPOLOGY_FAMILY.cellular],
});

export const GENUS_RECIPE_DESCRIPTORS: readonly GenusRecipeDescriptor[] = Object.freeze(
  CLOUD_GENERA.map((genus, genusId) => {
    const [verticalProfile, topologyFamily] = RECIPE_MODES[genus];
    return Object.freeze({
      genus,
      genusId,
      placementProfileId: `temperate-demo-v1:${genus}`,
      densityRecipeId: genusId,
      opticalProfileId: genus,
      verticalProfile,
      topologyFamily,
    });
  }),
);

export function densityV2GenusId(value: string): number {
  return CLOUD_GENERA.indexOf(value as CloudGenus);
}

export function packDensityRecipeV2Table(): ArrayBuffer {
  verifyDensityRecipeV2Table();
  const buffer = createDensityV2RecordBuffer(DENSITY_RECIPE_GPU_LAYOUT);
  for (const recipe of GENUS_RECIPE_DESCRIPTORS) {
    writeDensityV2U32(buffer, DENSITY_RECIPE_GPU_LAYOUT, recipe.densityRecipeId, 'identityAndModes', [
      recipe.genusId,
      0,
      recipe.verticalProfile,
      recipe.topologyFamily,
    ]);
    writeDensityV2U32(buffer, DENSITY_RECIPE_GPU_LAYOUT, recipe.densityRecipeId, 'detailAttachmentCosts', [0, 0, 0, 0]);
    writeDensityV2U32(buffer, DENSITY_RECIPE_GPU_LAYOUT, recipe.densityRecipeId, 'sampleLimits', [0, 0, 0, 0]);
    for (const field of DENSITY_RECIPE_GPU_LAYOUT.fields) {
      if (field.kind === 'f32') {
        writeDensityV2F32(buffer, DENSITY_RECIPE_GPU_LAYOUT, recipe.densityRecipeId, field.name, [0, 0, 0, 0]);
      }
    }
  }
  return buffer;
}

export function verifyDensityRecipeV2Table(): void {
  if (GENUS_RECIPE_DESCRIPTORS.length !== DENSITY_V2_RECIPE_COUNT) {
    throw new Error(`Density V2 recipe count mismatch: ${GENUS_RECIPE_DESCRIPTORS.length}`);
  }
  const ids = new Set<number>();
  const genera = new Set<string>();
  for (const recipe of GENUS_RECIPE_DESCRIPTORS) {
    if (ids.has(recipe.genusId) || recipe.genusId !== recipe.densityRecipeId) {
      throw new Error(`Density V2 duplicate or mismatched recipe id: ${recipe.genusId}`);
    }
    if (genera.has(recipe.genus)) throw new Error(`Density V2 duplicate genus: ${recipe.genus}`);
    if (!Number.isInteger(recipe.verticalProfile) || !Number.isInteger(recipe.topologyFamily)) {
      throw new Error(`Density V2 recipe modes must be integers: ${recipe.genus}`);
    }
    ids.add(recipe.genusId);
    genera.add(recipe.genus);
  }
  for (let index = 0; index < DENSITY_V2_RECIPE_COUNT; index++) {
    if (!ids.has(index)) throw new Error(`Density V2 missing recipe id: ${index}`);
  }
}
