import {
  DENSITY_BRICK_ATLAS_PROFILES,
  DENSITY_BRICK_RECORD_BYTES,
  DENSITY_BRICK_RECORD_STRIDE,
  buildDensityBrickCandidateGrid,
  buildDensityBrickLayout,
  packDensityBrickRecords,
  type DensityBrickCandidateGrid,
  type DensityBrickLayout,
} from './bodyLocalBricks';
import { densityV2FixtureBody, densityV2FixtureInput } from './recipeV2PackingFixtures';
import { packDensityV2Frame, type DensityV2PackedFrame, type DensityV2Vec3 } from './recipeV2Packing';

function overlaps(
  a: { origin: readonly [number, number, number]; physicalEdge: number },
  b: { origin: readonly [number, number, number]; physicalEdge: number },
): boolean {
  return a.origin[0] < b.origin[0] + b.physicalEdge && a.origin[0] + a.physicalEdge > b.origin[0]
    && a.origin[1] < b.origin[1] + b.physicalEdge && a.origin[1] + a.physicalEdge > b.origin[1]
    && a.origin[2] < b.origin[2] + b.physicalEdge && a.origin[2] + a.physicalEdge > b.origin[2];
}

function assertValidAllocations(layout: DensityBrickLayout): void {
  const resident = layout.allocations.flatMap((allocation) => allocation ? [allocation] : []);
  for (let i = 0; i < resident.length; i++) {
    const a = resident[i];
    if (a.origin.some((origin) => origin % 8 !== 0)
      || a.origin.some((origin) => origin < 0 || origin + a.physicalEdge > layout.profile.dimension)) {
      throw new Error('Density brick fixture allocation is not page aligned or in bounds');
    }
    for (let j = i + 1; j < resident.length; j++) {
      if (overlaps(a, resident[j])) throw new Error('Density brick fixture allocations overlap');
    }
  }
}

function intersects(aMin: DensityV2Vec3, aMax: DensityV2Vec3, bMin: DensityV2Vec3, bMax: DensityV2Vec3): boolean {
  return aMin[0] <= bMax[0] && aMax[0] >= bMin[0]
    && aMin[1] <= bMax[1] && aMax[1] >= bMin[1]
    && aMin[2] <= bMax[2] && aMax[2] >= bMin[2];
}

function assertNoCandidateFalseNegative(
  packed: DensityV2PackedFrame,
  candidates: DensityBrickCandidateGrid,
): void {
  const grid = candidates.stats.grid;
  const tileExtent: DensityV2Vec3 = [
    packed.volumeExtent[0] / grid[0],
    packed.volumeExtent[1] / grid[1],
    packed.volumeExtent[2] / grid[2],
  ];
  let entry = 0;
  for (let z = 0; z < grid[2]; z++) {
    for (let y = 0; y < grid[1]; y++) {
      for (let x = 0; x < grid[0]; x++, entry++) {
        const tileMin: DensityV2Vec3 = [
          packed.volumeMin[0] + tileExtent[0] * x,
          packed.volumeMin[1] + tileExtent[1] * y,
          packed.volumeMin[2] + tileExtent[2] * z,
        ];
        const tileMax: DensityV2Vec3 = [
          tileMin[0] + tileExtent[0],
          tileMin[1] + tileExtent[1],
          tileMin[2] + tileExtent[2],
        ];
        const packedIndices = candidates.words[entry * 2];
        const metadata = candidates.words[entry * 2 + 1];
        const count = metadata & 7;
        const overflow = (metadata & 8) !== 0;
        for (const body of packed.activeBodies) {
          if (!intersects(tileMin, tileMax, body.supportAabbMin, body.supportAabbMax) || overflow) continue;
          const indices = Array.from({ length: count }, (_, index) => (packedIndices >> (index * 8)) & 0xff);
          if (!indices.includes(body.compactIndex)) {
            throw new Error(`Density brick candidate false-negative at tile ${x},${y},${z} for Body ${body.compactIndex}`);
          }
        }
      }
    }
  }
}

export function verifyDensityBodyLocalBrickFixtures(): void {
  const genera = ['stratocumulus', 'altocumulus', 'cirrocumulus', 'cumulus', 'stratus'];
  const bodies = genera.map((genus, index) => ({
    ...densityV2FixtureBody(`brick-${index}`, genus),
    bounds: [-1_200, -1_200, 1_200, 1_200] as [number, number, number, number],
  }));
  const packed = packDensityV2Frame({
    ...densityV2FixtureInput(bodies),
    cameraPosition: [0, 4_000, 9_000],
  }, 96);
  const layout = buildDensityBrickLayout({
    packed,
    profile: DENSITY_BRICK_ATLAS_PROFILES.preferred,
    cameraPosition: [0, 4_000, 9_000],
    generation: 7,
  });
  assertValidAllocations(layout);
  const repeatedLayout = buildDensityBrickLayout({
    packed,
    profile: DENSITY_BRICK_ATLAS_PROFILES.preferred,
    cameraPosition: [0, 4_000, 9_000],
    generation: 7,
  });
  if (layout.signature !== repeatedLayout.signature
    || JSON.stringify(layout.allocations) !== JSON.stringify(repeatedLayout.allocations)) {
    throw new Error('Density brick allocation is not deterministic for identical inputs');
  }
  const records = packDensityBrickRecords(layout, 11);
  if (records.byteLength !== DENSITY_BRICK_RECORD_BYTES || records.byteLength !== 1_920) {
    throw new Error('Density brick fixture record ABI changed');
  }
  const inactiveTail = new Uint8Array(records, bodies.length * DENSITY_BRICK_RECORD_STRIDE);
  if (inactiveTail.some((value) => value !== 0)) {
    throw new Error('Density brick record inactive tail is not deterministically zero');
  }
  if (layout.profile.residentBytes > 16 * 1024 * 1024
    || layout.profile.residentBytes * 2 > 32 * 1024 * 1024) {
    throw new Error('Density brick fixture exceeds resident or rebuild-peak budget');
  }
  const candidates = buildDensityBrickCandidateGrid({
    packed,
    layout,
    resolution: 96,
    workgroup: [8, 8, 4],
  });
  if (candidates.stats.grid.join('x') !== '12x12x24'
    || candidates.stats.entryCount !== 3_456
    || candidates.stats.bytes !== 27_648) {
    throw new Error('Density brick fixture default candidate grid budget changed');
  }
  if (candidates.stats.overflowTiles <= 0 || candidates.stats.maxCandidates !== 5) {
    throw new Error('Density brick fixture must classify five-body overlap as overflow');
  }
  assertNoCandidateFalseNegative(packed, candidates);

  const cellularBodies = ['stratocumulus', 'altocumulus', 'cirrocumulus'].map((genus, index) => ({
    ...densityV2FixtureBody(`cellular-${index}`, genus),
    bounds: [index * 3_000 - 1_200, -1_200, index * 3_000 + 1_200, 1_200] as [number, number, number, number],
  }));
  const fallbackPacked = packDensityV2Frame(densityV2FixtureInput(cellularBodies), 96);
  const fallbackLayout = buildDensityBrickLayout({
    packed: fallbackPacked,
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [3_000, 4_000, 9_000],
    generation: 8,
  });
  if (fallbackLayout.residentCount !== 3 || fallbackLayout.nonresidentCount !== 0
    || fallbackLayout.allocations.filter(Boolean).every((allocation) => allocation?.logicalEdge === 24)) {
    throw new Error('Density brick fallback atlas must keep the three Cellular scale bodies resident and upgrade priority LODs');
  }
  assertValidAllocations(fallbackLayout);
  for (const reordered of [cellularBodies.slice(0, 2), [...cellularBodies].reverse()]) {
    const reorderedLayout = buildDensityBrickLayout({
      packed: packDensityV2Frame(densityV2FixtureInput(reordered), 96),
      profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
      cameraPosition: [3_000, 4_000, 9_000],
      generation: 8,
    });
    if (reorderedLayout.residentCount !== reordered.length) {
      throw new Error('Density brick add/remove/reorder fixture lost a supported resident Body');
    }
    assertValidAllocations(reorderedLayout);
  }

  const movingBody = densityV2FixtureBody('moving-cirrocumulus', 'cirrocumulus');
  const stillPacked = packDensityV2Frame(densityV2FixtureInput([movingBody]), 96);
  const movedPacked = packDensityV2Frame({
    ...densityV2FixtureInput([movingBody]),
    windSamples: [{ offsetM: [250, 125], morphTime: 0 }],
  }, 96);
  const stillLayout = buildDensityBrickLayout({
    packed: stillPacked,
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 9,
  });
  const movedLayout = buildDensityBrickLayout({
    packed: movedPacked,
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 10,
  });
  if (stillLayout.signature !== movedLayout.signature
    || stillLayout.allocations[0]?.supportCenter.join(',') === movedLayout.allocations[0]?.supportCenter.join(',')) {
    throw new Error('Wind must refresh brick content/records without forcing an allocation-generation rebuild');
  }

  const rotated = {
    ...densityV2FixtureBody('rotated-edge-altocumulus', 'altocumulus'),
    bounds: [29_000, -1_200, 31_800, 1_200] as [number, number, number, number],
    rot: [0.18, 0.42, 0.11] as [number, number, number],
  };
  const rotatedPacked = packDensityV2Frame({
    ...densityV2FixtureInput([rotated, movingBody]),
    windSamples: [
      { offsetM: [450, -275], morphTime: 0.5 },
      { offsetM: [-320, 180], morphTime: 0.25 },
    ],
  }, 96);
  const rotatedLayout = buildDensityBrickLayout({
    packed: rotatedPacked,
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [10_000, 4_000, 9_000],
    generation: 12,
  });
  const rotatedCandidates = buildDensityBrickCandidateGrid({
    packed: rotatedPacked,
    layout: rotatedLayout,
    resolution: 96,
    workgroup: [8, 8, 4],
  });
  assertNoCandidateFalseNegative(rotatedPacked, rotatedCandidates);
}
