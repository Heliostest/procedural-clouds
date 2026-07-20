import {
  DENSITY_BRICK_ATLAS_PROFILES,
  DENSITY_BRICK_CANDIDATE_META_BYTES,
  DENSITY_BRICK_RECORD_BYTES,
  DENSITY_BRICK_RECORD_STRIDE,
  buildDensityBrickCandidateGrid,
  buildDensityBrickLayout,
  packDensityBrickRecords,
  packDensityBrickCandidateMeta,
  reconcileDensityBrickLayout,
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

function readF32Lane(buffer: ArrayBuffer, record: number, lane: number): readonly number[] {
  return Array.from(new Float32Array(buffer, record * DENSITY_BRICK_RECORD_STRIDE + lane * 16, 4));
}

function assertTexelCenterRoundTrip(layout: DensityBrickLayout, records: ArrayBuffer): void {
  for (const allocation of layout.allocations) {
    if (!allocation) continue;
    const record = allocation.compactIndex;
    const worldToLocal = [
      readF32Lane(records, record, 5),
      readF32Lane(records, record, 6),
      readF32Lane(records, record, 7),
    ];
    const atlasScale = readF32Lane(records, record, 8);
    const atlasBias = readF32Lane(records, record, 9);
    const logicalIndices = [0, Math.floor(allocation.logicalEdge / 2), allocation.logicalEdge - 1];
    const local01 = logicalIndices.map((index) => (index + 0.5) / allocation.logicalEdge);
    const localSupport = local01.map((value, axis) => (
      (value * 2 - 1) * allocation.supportHalfExtents[axis]!
    ));
    const rotation = allocation.supportRotation;
    const world = allocation.supportCenter.map((center, axis) => center
      + rotation[axis * 3]! * localSupport[0]!
      + rotation[axis * 3 + 1]! * localSupport[1]!
      + rotation[axis * 3 + 2]! * localSupport[2]!) as [number, number, number];
    for (let axis = 0; axis < 3; axis++) {
      const reconstructedLocal = worldToLocal[axis]![0]! * world[0]
        + worldToLocal[axis]![1]! * world[1]
        + worldToLocal[axis]![2]! * world[2]
        + worldToLocal[axis]![3]!;
      const atlasUv = reconstructedLocal * atlasScale[axis]! + atlasBias[axis]!;
      const expectedUv = (
        allocation.origin[axis]!
        + allocation.padding
        + logicalIndices[axis]!
        + 0.5
      ) / layout.profile.dimension;
      if (Math.abs(reconstructedLocal - local01[axis]!) > 2e-5
        || Math.abs(atlasUv - expectedUv) > 2e-5) {
        throw new Error(`Density brick texel-center round trip failed for record ${record}, axis ${axis}`);
      }
    }
  }
}

function assertNoCandidateFalseNegative(
  packed: DensityV2PackedFrame,
  candidates: DensityBrickCandidateGrid,
): void {
  const grid = candidates.stats.grid;
  const voxelExtent: DensityV2Vec3 = [
    packed.volumeExtent[0] / candidates.resolution,
    packed.volumeExtent[1] / candidates.resolution,
    packed.volumeExtent[2] / candidates.resolution,
  ];
  let entry = 0;
  for (let z = 0; z < grid[2]; z++) {
    for (let y = 0; y < grid[1]; y++) {
      for (let x = 0; x < grid[0]; x++, entry++) {
        const tileMin: DensityV2Vec3 = [
          packed.volumeMin[0] + voxelExtent[0] * x * candidates.workgroup[0],
          packed.volumeMin[1] + voxelExtent[1] * y * candidates.workgroup[1],
          packed.volumeMin[2] + voxelExtent[2] * z * candidates.workgroup[2],
        ];
        const tileMax: DensityV2Vec3 = [
          packed.volumeMin[0] + voxelExtent[0]
            * Math.min((x + 1) * candidates.workgroup[0], candidates.resolution),
          packed.volumeMin[1] + voxelExtent[1]
            * Math.min((y + 1) * candidates.workgroup[1], candidates.resolution),
          packed.volumeMin[2] + voxelExtent[2]
            * Math.min((z + 1) * candidates.workgroup[2], candidates.resolution),
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
  assertTexelCenterRoundTrip(layout, records);
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
  const candidateMeta = packDensityBrickCandidateMeta(candidates);
  if (candidateMeta.byteLength !== DENSITY_BRICK_CANDIDATE_META_BYTES
    || candidateMeta.join(',') !== '12,12,24,7,96,8,8,4') {
    throw new Error('Density brick candidate metadata does not preserve the published grid/generation');
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
  const movedReconciliation = reconcileDensityBrickLayout(stillLayout, movedLayout, stillLayout.generation);
  const stillRecords = packDensityBrickRecords(stillLayout, 20);
  const movedRecords = packDensityBrickRecords(movedReconciliation.layout, 21);
  if (movedReconciliation.allocationChanged
    || movedReconciliation.layout.generation !== stillLayout.generation
    || new Uint32Array(movedRecords, 0, 4)[3] !== stillLayout.generation
    || readF32Lane(stillRecords, 0, 5).join(',') === readF32Lane(movedRecords, 0, 5).join(',')
    || readF32Lane(stillRecords, 0, 8).join(',') !== readF32Lane(movedRecords, 0, 8).join(',')
    || readF32Lane(stillRecords, 0, 9).join(',') !== readF32Lane(movedRecords, 0, 9).join(',')) {
    throw new Error('Stable density brick allocation did not refresh current Support while preserving generation/origin');
  }

  const rotationBody = {
    ...movingBody,
    rot: [0.18, 0.42, 0.11] as [number, number, number],
  };
  const rotationLayout = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([rotationBody]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 10,
  });
  const rotationReconciliation = reconcileDensityBrickLayout(stillLayout, rotationLayout, stillLayout.generation);
  const rotationRecords = packDensityBrickRecords(rotationReconciliation.layout, 22);
  if (rotationReconciliation.allocationChanged
    || rotationReconciliation.layout.generation !== stillLayout.generation
    || rotationReconciliation.layout.allocations[0]?.supportRotation.join(',')
      === stillLayout.allocations[0]?.supportRotation.join(',')
    || readF32Lane(stillRecords, 0, 5).join(',') === readF32Lane(rotationRecords, 0, 5).join(',')) {
    throw new Error('Stable density brick allocation did not refresh rotation payload');
  }

  const expandedLayout = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([
      movingBody,
      densityV2FixtureBody('added-altocumulus', 'altocumulus'),
    ]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 10,
  });
  const expandedReconciliation = reconcileDensityBrickLayout(stillLayout, expandedLayout, stillLayout.generation);
  if (!expandedReconciliation.allocationChanged || expandedReconciliation.layout.generation !== 10) {
    throw new Error('Density brick allocation topology change did not advance to the candidate generation');
  }

  const reorderA = densityV2FixtureBody('stable-order-a', 'altocumulus');
  const reorderB = densityV2FixtureBody('stable-order-b', 'altocumulus');
  const orderedLayout = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([reorderA, reorderB]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 11,
  });
  const reorderedIdentityLayout = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([reorderB, reorderA]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 12,
  });
  if (orderedLayout.signature === reorderedIdentityLayout.signature) {
    throw new Error('Density brick allocation signature ignored stable Body identity during compact-prefix reorder');
  }

  // These IDs intentionally collide under the 32-bit GPU phase seed. CPU
  // allocation identity must retain the exact Body ID so a reorder cannot
  // publish old atlas content under a different Body merely because hashes collide.
  const collisionA = densityV2FixtureBody('body-ifzqfp-71wyk0', 'altocumulus');
  const collisionB = densityV2FixtureBody('body-1l0zvg9-hjjpj8', 'altocumulus');
  const collisionOrdered = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([collisionA, collisionB]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 13,
  });
  const collisionReordered = buildDensityBrickLayout({
    packed: packDensityV2Frame(densityV2FixtureInput([collisionB, collisionA]), 96),
    profile: DENSITY_BRICK_ATLAS_PROFILES.fallback,
    cameraPosition: [0, 4_000, 9_000],
    generation: 14,
  });
  if (collisionOrdered.allocations[0]?.stableSeed !== collisionOrdered.allocations[1]?.stableSeed
    || collisionOrdered.signature === collisionReordered.signature) {
    throw new Error('Density brick allocation identity collapsed colliding Body IDs');
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
  assertTexelCenterRoundTrip(rotatedLayout, packDensityBrickRecords(rotatedLayout, 13));
  assertNoCandidateFalseNegative(rotatedPacked, rotatedCandidates);

  const nonDivisibleCandidates = buildDensityBrickCandidateGrid({
    packed: rotatedPacked,
    layout: rotatedLayout,
    resolution: 10,
    workgroup: [4, 3, 6],
  });
  if (nonDivisibleCandidates.stats.grid.join('x') !== '3x4x2'
    || packDensityBrickCandidateMeta(nonDivisibleCandidates).join(',') !== '3,4,2,12,10,4,3,6') {
    throw new Error('Density brick non-divisible candidate metadata changed');
  }
  assertNoCandidateFalseNegative(rotatedPacked, nonDivisibleCandidates);

  const wrappedLayout = Object.freeze({ ...rotatedLayout, generation: 0x0100_0000 });
  const wrappedCandidates = buildDensityBrickCandidateGrid({
    packed: rotatedPacked,
    layout: wrappedLayout,
    resolution: 96,
    workgroup: [8, 8, 4],
  });
  const wrappedRecords = packDensityBrickRecords(wrappedLayout, 14);
  const firstCompleteEntry = Array.from({ length: wrappedCandidates.stats.entryCount }, (_, index) => index)
    .find((index) => (wrappedCandidates.words[index * 2 + 1]! & 16) !== 0);
  if (firstCompleteEntry === undefined
    || (wrappedCandidates.words[firstCompleteEntry * 2 + 1]! >>> 8) !== 0
    || packDensityBrickCandidateMeta(wrappedCandidates)[3] !== 0
    || new Uint32Array(wrappedRecords, 0, 4)[3] !== 0
    || new Uint32Array(wrappedRecords, 32, 4)[1] !== 0) {
    throw new Error('Density brick GPU generation encoding diverged at the 24-bit wrap boundary');
  }
}
