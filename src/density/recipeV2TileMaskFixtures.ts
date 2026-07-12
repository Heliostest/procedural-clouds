import { createDefaultParams } from '../params';
import { densityV2FixtureBody, densityV2FixtureInput } from './recipeV2PackingFixtures';
import { packDensityV2Frame } from './recipeV2Packing';
import {
  DENSITY_V2_MAX_TILE_MASK_BYTES,
  DENSITY_V2_MAX_TILE_MASK_TILES,
  buildDensityV2TileMask,
  densityV2TileMaskSignature,
  verifyDensityV2TileMaskNoFalseNegatives,
} from './recipeV2TileMask';

export const DENSITY_V2_TILE_FIXTURE_IDS = Object.freeze([
  'default-grid',
  'no-body',
  'rotated-wind-cb',
  'non-divisible-grid',
  'invalid-before-valid',
  'extreme-budget-fallback',
] as const);

export function verifyDensityV2TileMaskFixtures(): void {
  const single = packDensityV2Frame(densityV2FixtureInput([densityV2FixtureBody('A', 'cumulus')]), 96);
  const defaultResult = buildDensityV2TileMask({ resolution: 96, workgroup: [8, 8, 4], packed: single });
  if (defaultResult.grid.join('x') !== '12x12x24'
    || defaultResult.tileCount !== 3456
    || defaultResult.requiredMaskBytes !== 13_824
    || defaultResult.cpuBroadPhaseTests > 41_472) {
    throw new Error('Density V2 default tile-grid fixture failed');
  }

  const noBody = packDensityV2Frame(densityV2FixtureInput([]), 12);
  const noBodyResult = buildDensityV2TileMask({ resolution: 12, workgroup: [4, 3, 2], packed: noBody });
  if (noBodyResult.emptyTileCount !== noBodyResult.tileCount || noBodyResult.candidateMemberships !== 0) {
    throw new Error('Density V2 no-body tile fixture failed');
  }

  const cb = densityV2FixtureBody('CB', 'cumulonimbus');
  cb.rot = [0.35, 0.6, -0.2];
  cb.feather = 900;
  const cbBaseInput = densityV2FixtureInput([cb]);
  const cbInput = {
    ...cbBaseInput,
    windSamples: [{ offsetM: [2400, -1800] as const, morphTime: 3 }],
  };
  const cbPacked = packDensityV2Frame(cbInput, 12);
  const cbOptions = { resolution: 12, workgroup: [4, 3, 2] as const, packed: cbPacked };
  const cbResult = buildDensityV2TileMask(cbOptions);
  verifyDensityV2TileMaskNoFalseNegatives(cbResult, cbOptions);
  if (cbPacked.activeBodies[0].supportHalfExtents[0] <= 2) {
    throw new Error('Density V2 Cb anvil support fixture is not expanded');
  }

  const params = createDefaultParams();
  params.boxHalfExtent = 8000;
  const edgeInput = { ...densityV2FixtureInput([densityV2FixtureBody('E', 'cirrus')]), params };
  const edgePacked = packDensityV2Frame(edgeInput, 10);
  const edgeOptions = { resolution: 10, workgroup: [4, 3, 6] as const, packed: edgePacked };
  const edgeResult = buildDensityV2TileMask(edgeOptions);
  if (edgeResult.grid.join('x') !== '3x4x2') throw new Error('Density V2 non-divisible grid fixture failed');
  verifyDensityV2TileMaskNoFalseNegatives(edgeResult, edgeOptions);

  const invalidPacked = packDensityV2Frame(densityV2FixtureInput([
    densityV2FixtureBody('X', 'invalid'),
    densityV2FixtureBody('V', 'stratus'),
  ]), 12);
  const invalidResult = buildDensityV2TileMask({ resolution: 12, workgroup: [4, 3, 2], packed: invalidPacked });
  if (invalidPacked.sourceIndices[0] !== 1
    || invalidResult.words.some((word) => (word & ~1) !== 0)) {
    throw new Error('Density V2 invalid-before-valid tile bit fixture failed');
  }

  const fallback = buildDensityV2TileMask({ resolution: 256, workgroup: [1, 1, 1], packed: single });
  if (fallback.enabled
    || fallback.tileCount !== 16_777_216
    || fallback.words.length !== 1
    || !fallback.fallbackReason.startsWith('disabled-budget')) {
    throw new Error('Density V2 extreme tile budget fixture failed');
  }
  if (DENSITY_V2_MAX_TILE_MASK_TILES * 4 !== DENSITY_V2_MAX_TILE_MASK_BYTES) {
    throw new Error('Density V2 tile budget constants are inconsistent');
  }

  const signature = densityV2TileMaskSignature({ resolution: 12, workgroup: [4, 3, 2], packed: cbPacked });
  const movedBaseInput = densityV2FixtureInput([cb]);
  const movedInput = {
    ...movedBaseInput,
    windSamples: [{ offsetM: [2500, -1800] as const, morphTime: 3 }],
  };
  const movedPacked = packDensityV2Frame(movedInput, 12);
  const movedSignature = densityV2TileMaskSignature({ resolution: 12, workgroup: [4, 3, 2], packed: movedPacked });
  if (signature === movedSignature) throw new Error('Density V2 tile signature ignored wind transport');
}
