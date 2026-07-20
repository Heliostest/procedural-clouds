import { MAX_BODIES } from '../params';
import type { DensityV2ActiveBody, DensityV2Mat3, DensityV2PackedFrame, DensityV2Vec3 } from './recipeV2Packing';

export const DENSITY_BRICK_RECORD_VERSION = 1;
export const DENSITY_BRICK_RECORD_STRIDE = 160;
export const DENSITY_BRICK_RECORD_BYTES = DENSITY_BRICK_RECORD_STRIDE * MAX_BODIES;
export const DENSITY_BRICK_PAGE_EDGE = 8;
export const DENSITY_BRICK_GUTTER = 2;
export const DENSITY_BRICK_CANDIDATE_LIMIT = 4;
export const DENSITY_BRICK_CANDIDATE_ENTRY_BYTES = 8;
export const DENSITY_BRICK_CANDIDATE_META_BYTES = 32;
export const DENSITY_BRICK_GPU_GENERATION_MASK = 0x00ff_ffff;

export type DensityStorageMode = 'global-only' | 'hierarchical';
export type DensityBrickLogicalEdge = 24 | 32 | 48 | 64;
export type DensityBrickPhysicalEdge = 32 | 40 | 56 | 72;
export type DensityBrickAtlasFormat = 'r16float' | 'rgba16float' | 'rgba8unorm';

export interface DensityBrickAtlasProfile {
  readonly id: 'r16float-160' | 'rgba16float-96' | 'rgba8unorm-128-diagnostic';
  readonly format: DensityBrickAtlasFormat;
  readonly dimension: 160 | 128 | 96;
  readonly bytesPerVoxel: 2 | 4 | 8;
  readonly residentBytes: number;
}

export const DENSITY_BRICK_ATLAS_PROFILES = Object.freeze({
  preferred: Object.freeze({
    id: 'r16float-160',
    format: 'r16float',
    dimension: 160,
    bytesPerVoxel: 2,
    residentBytes: 160 ** 3 * 2 * 2,
  } satisfies DensityBrickAtlasProfile),
  fallback: Object.freeze({
    id: 'rgba16float-96',
    format: 'rgba16float',
    dimension: 96,
    bytesPerVoxel: 8,
    residentBytes: 96 ** 3 * 8 * 2,
  } satisfies DensityBrickAtlasProfile),
  // Evidence-only capacity/quantization profile. It is never selected by the
  // automatic preferred -> fallback creation path.
  diagnostic: Object.freeze({
    id: 'rgba8unorm-128-diagnostic',
    format: 'rgba8unorm',
    dimension: 128,
    bytesPerVoxel: 4,
    residentBytes: 128 ** 3 * 4 * 2,
  } satisfies DensityBrickAtlasProfile),
});

export const DENSITY_BRICK_LOGICAL_EDGES = Object.freeze([24, 32, 48, 64] as const);

const PHYSICAL_EDGE_BY_LOGICAL: Readonly<Record<DensityBrickLogicalEdge, DensityBrickPhysicalEdge>> = Object.freeze({
  24: 32,
  32: 40,
  48: 56,
  64: 72,
});

export interface DensityBrickLodState {
  readonly logicalEdge: DensityBrickLogicalEdge;
  readonly score: number;
}

export interface DensityBrickAllocation {
  readonly compactIndex: number;
  readonly genusId: number;
  readonly bodyId: string;
  readonly stableSeed: number;
  readonly logicalEdge: DensityBrickLogicalEdge;
  readonly physicalEdge: DensityBrickPhysicalEdge;
  readonly origin: readonly [number, number, number];
  readonly padding: number;
  readonly requestedLogicalEdge: DensityBrickLogicalEdge;
  readonly downgraded: boolean;
  readonly supportCenter: DensityV2Vec3;
  readonly supportHalfExtents: DensityV2Vec3;
  readonly supportRotation: DensityV2Mat3;
  readonly supportAabbMin: DensityV2Vec3;
  readonly supportAabbMax: DensityV2Vec3;
}

export interface DensityBrickLayout {
  readonly profile: DensityBrickAtlasProfile;
  readonly generation: number;
  readonly allocations: readonly (DensityBrickAllocation | null)[];
  readonly lodStates: ReadonlyMap<number, DensityBrickLodState>;
  readonly residentCount: number;
  readonly nonresidentCount: number;
  readonly requestedVoxels: number;
  readonly allocatedVoxels: number;
  readonly wastedVoxels: number;
  readonly signature: string;
}

export interface DensityBrickLayoutReconciliation {
  readonly layout: DensityBrickLayout;
  readonly allocationChanged: boolean;
}

export function reconcileDensityBrickLayout(
  current: DensityBrickLayout | null,
  next: DensityBrickLayout,
  currentGeneration: number,
): DensityBrickLayoutReconciliation {
  const allocationChanged = current?.signature !== next.signature;
  if (allocationChanged) return Object.freeze({ layout: next, allocationChanged: true });
  return Object.freeze({
    layout: Object.freeze({ ...next, generation: currentGeneration }),
    allocationChanged: false,
  });
}

export interface DensityBrickCandidateStats {
  readonly grid: readonly [number, number, number];
  readonly entryCount: number;
  readonly bytes: number;
  readonly completeTiles: number;
  readonly overflowTiles: number;
  readonly incompleteTiles: number;
  readonly candidateMemberships: number;
  readonly averageCandidates: number;
  readonly maxCandidates: number;
}

export interface DensityBrickCandidateGrid {
  readonly words: Uint32Array;
  readonly stats: DensityBrickCandidateStats;
  readonly generation: number;
  readonly resolution: number;
  readonly workgroup: readonly [number, number, number];
}

export function densityBrickEncodedGeneration(generation: number): number {
  return Math.max(0, Math.round(generation)) & DENSITY_BRICK_GPU_GENERATION_MASK;
}

export function packDensityBrickCandidateMeta(candidate: DensityBrickCandidateGrid): Uint32Array {
  return new Uint32Array([
    candidate.stats.grid[0],
    candidate.stats.grid[1],
    candidate.stats.grid[2],
    densityBrickEncodedGeneration(candidate.generation),
    candidate.resolution,
    candidate.workgroup[0],
    candidate.workgroup[1],
    candidate.workgroup[2],
  ]);
}

function finiteVec3(value: readonly number[]): value is DensityV2Vec3 {
  return value.length === 3 && value.every(Number.isFinite);
}

function topologyScore(genusId: number): number {
  if (genusId === 9) return 0.095; // Cc: smallest cells / strongest ripple.
  if (genusId === 4) return 0.06; // Ac.
  if (genusId === 2) return 0.035; // Sc.
  if (genusId === 0) return 0.028; // Cumulus billow proxy.
  return 0.018;
}

function edgeForScore(score: number): DensityBrickLogicalEdge {
  if (score >= 0.085) return 64;
  if (score >= 0.05) return 48;
  if (score >= 0.025) return 32;
  return 24;
}

export function densityBrickDesiredLod(
  body: DensityV2ActiveBody,
  cameraPosition: DensityV2Vec3,
  previous?: DensityBrickLodState,
): DensityBrickLodState {
  const maxExtent = Math.max(...body.supportHalfExtents) * 2;
  const distance = Math.hypot(
    cameraPosition[0] - body.supportCenter[0],
    cameraPosition[1] - body.supportCenter[1],
    cameraPosition[2] - body.supportCenter[2],
  );
  const projectedSize = maxExtent / Math.max(distance, maxExtent * 0.25, 1e-4);
  const score = Math.max(projectedSize * 0.35, topologyScore(body.genusId));
  let logicalEdge = edgeForScore(score);
  if (previous) {
    const previousEdge = previous.logicalEdge;
    const targetEdge = edgeForScore(score);
    if (targetEdge > previousEdge) {
      const upgradeThreshold = previousEdge === 24 ? 0.02875 : previousEdge === 32 ? 0.0575 : 0.09775;
      logicalEdge = score >= upgradeThreshold ? targetEdge : previousEdge;
    } else if (targetEdge < previousEdge) {
      const downgradeThreshold = previousEdge === 64 ? 0.07225 : previousEdge === 48 ? 0.0425 : 0.02125;
      logicalEdge = score < downgradeThreshold ? targetEdge : previousEdge;
    }
  }
  return Object.freeze({ logicalEdge, score });
}

function rangeFree(
  occupancy: Uint8Array,
  pagesPerAxis: number,
  origin: readonly [number, number, number],
  pageEdge: number,
): boolean {
  for (let z = origin[2]; z < origin[2] + pageEdge; z++) {
    for (let y = origin[1]; y < origin[1] + pageEdge; y++) {
      for (let x = origin[0]; x < origin[0] + pageEdge; x++) {
        if (occupancy[x + pagesPerAxis * (y + pagesPerAxis * z)] !== 0) return false;
      }
    }
  }
  return true;
}

function markRange(
  occupancy: Uint8Array,
  pagesPerAxis: number,
  origin: readonly [number, number, number],
  pageEdge: number,
): void {
  for (let z = origin[2]; z < origin[2] + pageEdge; z++) {
    for (let y = origin[1]; y < origin[1] + pageEdge; y++) {
      for (let x = origin[0]; x < origin[0] + pageEdge; x++) {
        occupancy[x + pagesPerAxis * (y + pagesPerAxis * z)] = 1;
      }
    }
  }
}

function firstFit(
  occupancy: Uint8Array,
  pagesPerAxis: number,
  physicalEdge: DensityBrickPhysicalEdge,
): readonly [number, number, number] | null {
  const pages = physicalEdge / DENSITY_BRICK_PAGE_EDGE;
  for (let z = 0; z <= pagesPerAxis - pages; z++) {
    for (let y = 0; y <= pagesPerAxis - pages; y++) {
      for (let x = 0; x <= pagesPerAxis - pages; x++) {
        const pageOrigin = [x, y, z] as const;
        if (!rangeFree(occupancy, pagesPerAxis, pageOrigin, pages)) continue;
        markRange(occupancy, pagesPerAxis, pageOrigin, pages);
        return [x * DENSITY_BRICK_PAGE_EDGE, y * DENSITY_BRICK_PAGE_EDGE, z * DENSITY_BRICK_PAGE_EDGE];
      }
    }
  }
  return null;
}

function allocationSignaturePart(allocation: DensityBrickAllocation | null): string {
  if (!allocation) return 'x';
  return [
    allocation.compactIndex,
    `${allocation.bodyId.length}:${allocation.bodyId}`,
    allocation.stableSeed,
    allocation.genusId,
    allocation.logicalEdge,
    allocation.origin.join(','),
  ].join(':');
}

interface DensityBrickPlanningBody {
  readonly body: DensityV2ActiveBody;
  readonly desired: DensityBrickLodState;
}

function brickPlanningPriority(a: DensityBrickPlanningBody, b: DensityBrickPlanningBody): number {
  return b.desired.score - a.desired.score
    || topologyScore(b.body.genusId) - topologyScore(a.body.genusId)
    || a.body.compactIndex - b.body.compactIndex;
}

function tryPackTargetEdges(
  planningBodies: readonly DensityBrickPlanningBody[],
  targets: ReadonlyMap<number, DensityBrickLogicalEdge>,
  pagesPerAxis: number,
): ReadonlyMap<number, readonly [number, number, number]> | null {
  const occupancy = new Uint8Array(pagesPerAxis ** 3);
  const origins = new Map<number, readonly [number, number, number]>();
  for (const { body } of [...planningBodies].sort(brickPlanningPriority)) {
    const target = targets.get(body.compactIndex);
    if (!target) return null;
    const origin = firstFit(occupancy, pagesPerAxis, PHYSICAL_EDGE_BY_LOGICAL[target]);
    if (!origin) return null;
    origins.set(body.compactIndex, origin);
  }
  return origins;
}

export function buildDensityBrickLayout(options: {
  packed: DensityV2PackedFrame;
  profile: DensityBrickAtlasProfile;
  cameraPosition: DensityV2Vec3;
  previousLods?: ReadonlyMap<number, DensityBrickLodState>;
  generation: number;
}): DensityBrickLayout {
  const { packed, profile, cameraPosition, previousLods, generation } = options;
  if (profile.dimension % DENSITY_BRICK_PAGE_EDGE !== 0) {
    throw new Error(`Density brick atlas dimension is not page aligned: ${profile.dimension}`);
  }
  if (profile.residentBytes > 16 * 1024 * 1024) {
    throw new Error(`Density brick profile exceeds resident budget: ${profile.residentBytes}`);
  }
  if (!finiteVec3(cameraPosition)) throw new Error('Density brick camera position must be finite');
  const pagesPerAxis = profile.dimension / DENSITY_BRICK_PAGE_EDGE;
  const allocations: Array<DensityBrickAllocation | null> = Array.from({ length: MAX_BODIES }, () => null);
  const lodStates = new Map<number, DensityBrickLodState>();
  let requestedVoxels = 0;
  let allocatedVoxels = 0;
  let wastedVoxels = 0;
  let residentCount = 0;
  const planningBodies: DensityBrickPlanningBody[] = [];
  for (const body of packed.activeBodies) {
    if (!supportedGenus(body.genusId)) continue;
    const previous = previousLods?.get(body.compactIndex);
    const desired = densityBrickDesiredLod(body, cameraPosition, previous);
    lodStates.set(body.compactIndex, desired);
    requestedVoxels += PHYSICAL_EDGE_BY_LOGICAL[desired.logicalEdge] ** 3;
    planningBodies.push({ body, desired });
  }

  // Start with a resident 24^3 brick for every supported Body, then spend the
  // remaining atlas capacity on deterministic, priority-ordered upgrades. This
  // avoids a single early 64^3 request monopolising the 96^3 fallback atlas and
  // forcing every later Body back to the coarse world grid.
  const targets = new Map<number, DensityBrickLogicalEdge>();
  for (const { body } of planningBodies) targets.set(body.compactIndex, 24);
  let origins = tryPackTargetEdges(planningBodies, targets, pagesPerAxis);
  if (origins) {
    for (const planningBody of [...planningBodies].sort(brickPlanningPriority)) {
      for (const candidate of DENSITY_BRICK_LOGICAL_EDGES) {
        const current = targets.get(planningBody.body.compactIndex) ?? 24;
        if (candidate <= current || candidate > planningBody.desired.logicalEdge) continue;
        const trialTargets = new Map(targets);
        trialTargets.set(planningBody.body.compactIndex, candidate);
        const trialOrigins = tryPackTargetEdges(planningBodies, trialTargets, pagesPerAxis);
        if (!trialOrigins) break;
        targets.set(planningBody.body.compactIndex, candidate);
        origins = trialOrigins;
      }
    }
  } else {
    // The approved profiles fit the current MAX_BODIES set at the minimum tier,
    // but retain a deterministic partial-residency path for future constraints.
    const occupancy = new Uint8Array(pagesPerAxis ** 3);
    const partialOrigins = new Map<number, readonly [number, number, number]>();
    for (const { body } of [...planningBodies].sort(brickPlanningPriority)) {
      const origin = firstFit(occupancy, pagesPerAxis, PHYSICAL_EDGE_BY_LOGICAL[24]);
      if (origin) partialOrigins.set(body.compactIndex, origin);
    }
    origins = partialOrigins;
  }

  for (const { body, desired } of planningBodies) {
    const logicalEdge = targets.get(body.compactIndex) ?? 24;
    const origin = origins.get(body.compactIndex);
    if (!origin) continue;
    const physicalEdge = PHYSICAL_EDGE_BY_LOGICAL[logicalEdge];
    const padding = (physicalEdge - logicalEdge) / 2;
    const allocation: DensityBrickAllocation = Object.freeze({
      compactIndex: body.compactIndex,
      genusId: body.genusId,
      bodyId: body.bodyId,
      stableSeed: body.stableSeed,
      logicalEdge,
      physicalEdge,
      origin,
      padding,
      requestedLogicalEdge: desired.logicalEdge,
      downgraded: logicalEdge !== desired.logicalEdge,
      supportCenter: body.supportCenter,
      supportHalfExtents: body.supportHalfExtents,
      supportRotation: body.supportRotation,
      supportAabbMin: body.supportAabbMin,
      supportAabbMax: body.supportAabbMax,
    });
    allocations[body.compactIndex] = allocation;
    allocatedVoxels += physicalEdge ** 3;
    wastedVoxels += physicalEdge ** 3 - logicalEdge ** 3;
    residentCount++;
  }
  const signature = `${profile.id}|${allocations.map(allocationSignaturePart).join('|')}`;
  return Object.freeze({
    profile,
    generation,
    allocations: Object.freeze(allocations),
    lodStates,
    residentCount,
    nonresidentCount: planningBodies.length - residentCount,
    requestedVoxels,
    allocatedVoxels,
    wastedVoxels,
    signature,
  });
}

function orientedWorldToLocalRows(allocation: DensityBrickAllocation): readonly [number[], number[], number[]] {
  const rotation = allocation.supportRotation;
  const half = allocation.supportHalfExtents;
  const center = allocation.supportCenter;
  const rows = [
    [rotation[0] / (2 * half[0]), rotation[3] / (2 * half[0]), rotation[6] / (2 * half[0])],
    [rotation[1] / (2 * half[1]), rotation[4] / (2 * half[1]), rotation[7] / (2 * half[1])],
    [rotation[2] / (2 * half[2]), rotation[5] / (2 * half[2]), rotation[8] / (2 * half[2])],
  ];
  return rows.map((row) => [
    row[0], row[1], row[2], 0.5 - row[0] * center[0] - row[1] * center[1] - row[2] * center[2],
  ]) as unknown as readonly [number[], number[], number[]];
}

function writeU32Lane(buffer: ArrayBuffer, record: number, lane: number, values: readonly number[]): void {
  new Uint32Array(buffer, record * DENSITY_BRICK_RECORD_STRIDE + lane * 16, 4).set(values);
}

function writeF32Lane(buffer: ArrayBuffer, record: number, lane: number, values: readonly number[]): void {
  if (!values.every(Number.isFinite)) throw new Error(`Density brick record ${record}:${lane} contains non-finite values`);
  new Float32Array(buffer, record * DENSITY_BRICK_RECORD_STRIDE + lane * 16, 4).set(values);
}

export function packDensityBrickRecords(
  layout: DensityBrickLayout,
  contentRevision: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(DENSITY_BRICK_RECORD_BYTES);
  const encodedGeneration = densityBrickEncodedGeneration(layout.generation);
  for (const allocation of layout.allocations) {
    if (!allocation) continue;
    const index = allocation.compactIndex;
    const rows = orientedWorldToLocalRows(allocation);
    const atlasScale = allocation.logicalEdge / layout.profile.dimension;
    const atlasBias = allocation.origin.map((origin) => (
      origin + allocation.padding
    ) / layout.profile.dimension) as [number, number, number];
    writeU32Lane(buffer, index, 0, [1, index, allocation.genusId, encodedGeneration]);
    writeU32Lane(buffer, index, 1, [
      allocation.logicalEdge,
      allocation.physicalEdge,
      allocation.origin[0],
      allocation.origin[1],
    ]);
    writeU32Lane(buffer, index, 2, [
      allocation.origin[2],
      encodedGeneration,
      Math.max(0, Math.round(contentRevision)),
      allocation.requestedLogicalEdge,
    ]);
    writeF32Lane(buffer, index, 3, [...allocation.supportAabbMin, 0]);
    writeF32Lane(buffer, index, 4, [...allocation.supportAabbMax, 0]);
    writeF32Lane(buffer, index, 5, rows[0]);
    writeF32Lane(buffer, index, 6, rows[1]);
    writeF32Lane(buffer, index, 7, rows[2]);
    writeF32Lane(buffer, index, 8, [atlasScale, atlasScale, atlasScale, layout.profile.dimension]);
    writeF32Lane(buffer, index, 9, [...atlasBias, allocation.padding]);
  }
  return buffer;
}

export function buildDensityBrickWgslAbi(): string {
  return `
// density-brick-record-version:${DENSITY_BRICK_RECORD_VERSION}
struct DensityBrickRecordGPU {
  header : vec4u,
  edgesAndOrigin : vec4u,
  originAndGeneration : vec4u,
  supportMin : vec4f,
  supportMax : vec4f,
  worldToLocal0 : vec4f,
  worldToLocal1 : vec4f,
  worldToLocal2 : vec4f,
  atlasScale : vec4f,
  atlasBias : vec4f,
};
const DENSITY_BRICK_RECORD_COUNT : u32 = ${MAX_BODIES}u;
const DENSITY_BRICK_CANDIDATE_LIMIT : u32 = ${DENSITY_BRICK_CANDIDATE_LIMIT}u;
`;
}

function aabbIntersects(
  aMin: DensityV2Vec3,
  aMax: DensityV2Vec3,
  bMin: DensityV2Vec3,
  bMax: DensityV2Vec3,
): boolean {
  return aMin[0] <= bMax[0] && aMax[0] >= bMin[0]
    && aMin[1] <= bMax[1] && aMax[1] >= bMin[1]
    && aMin[2] <= bMax[2] && aMax[2] >= bMin[2];
}

function supportedGenus(genusId: number): boolean {
  return genusId === 0 || genusId === 1 || genusId === 2 || genusId === 4
    || genusId === 5 || genusId === 6 || genusId === 8 || genusId === 9;
}

export function buildDensityBrickCandidateGrid(options: {
  packed: DensityV2PackedFrame;
  layout: DensityBrickLayout;
  resolution: number;
  workgroup: readonly [number, number, number];
}): DensityBrickCandidateGrid {
  const { packed, layout } = options;
  const resolution = Math.max(1, Math.round(options.resolution));
  const workgroup = options.workgroup.map((value) => Math.max(1, Math.round(value))) as [number, number, number];
  const grid = [
    Math.ceil(resolution / workgroup[0]),
    Math.ceil(resolution / workgroup[1]),
    Math.ceil(resolution / workgroup[2]),
  ] as const;
  const entryCount = grid[0] * grid[1] * grid[2];
  const words = new Uint32Array(entryCount * 2);
  const voxelExtent: DensityV2Vec3 = [
    packed.volumeExtent[0] / resolution,
    packed.volumeExtent[1] / resolution,
    packed.volumeExtent[2] / resolution,
  ];
  let completeTiles = 0;
  let overflowTiles = 0;
  let incompleteTiles = 0;
  let candidateMemberships = 0;
  let maxCandidates = 0;
  let entryIndex = 0;
  for (let z = 0; z < grid[2]; z++) {
    for (let y = 0; y < grid[1]; y++) {
      for (let x = 0; x < grid[0]; x++, entryIndex++) {
        const tileMin: DensityV2Vec3 = [
          packed.volumeMin[0] + voxelExtent[0] * x * workgroup[0],
          packed.volumeMin[1] + voxelExtent[1] * y * workgroup[1],
          packed.volumeMin[2] + voxelExtent[2] * z * workgroup[2],
        ];
        const tileMax: DensityV2Vec3 = [
          packed.volumeMin[0] + voxelExtent[0] * Math.min((x + 1) * workgroup[0], resolution),
          packed.volumeMin[1] + voxelExtent[1] * Math.min((y + 1) * workgroup[1], resolution),
          packed.volumeMin[2] + voxelExtent[2] * Math.min((z + 1) * workgroup[2], resolution),
        ];
        const candidates = packed.activeBodies.filter((body) => (
          supportedGenus(body.genusId)
          && aabbIntersects(tileMin, tileMax, body.supportAabbMin, body.supportAabbMax)
        ));
        candidateMemberships += candidates.length;
        maxCandidates = Math.max(maxCandidates, candidates.length);
        const overflow = candidates.length > DENSITY_BRICK_CANDIDATE_LIMIT;
        const resident = !overflow && candidates.every((body) => {
          const allocation = layout.allocations[body.compactIndex];
          return allocation !== null && allocation?.compactIndex === body.compactIndex;
        });
        const complete = !overflow && resident;
        const encoded = candidates.slice(0, DENSITY_BRICK_CANDIDATE_LIMIT);
        let packedIndices = 0xffff_ffff;
        for (let index = 0; index < encoded.length; index++) {
          packedIndices = (packedIndices & ~(0xff << (index * 8)))
            | ((encoded[index].compactIndex & 0xff) << (index * 8));
        }
        const count = Math.min(candidates.length, DENSITY_BRICK_CANDIDATE_LIMIT);
        const metadata = count
          | (overflow ? 1 << 3 : 0)
          | (complete ? 1 << 4 : 0)
          | (densityBrickEncodedGeneration(layout.generation) << 8);
        words[entryIndex * 2] = packedIndices >>> 0;
        words[entryIndex * 2 + 1] = metadata >>> 0;
        if (complete) completeTiles++;
        else if (overflow) overflowTiles++;
        else incompleteTiles++;
      }
    }
  }
  return Object.freeze({
    words,
    generation: layout.generation,
    resolution,
    workgroup: Object.freeze(workgroup),
    stats: Object.freeze({
      grid,
      entryCount,
      bytes: words.byteLength,
      completeTiles,
      overflowTiles,
      incompleteTiles,
      candidateMemberships,
      averageCandidates: entryCount > 0 ? candidateMemberships / entryCount : 0,
      maxCandidates,
    }),
  });
}

export function verifyDensityBrickContracts(): void {
  if (DENSITY_BRICK_RECORD_BYTES !== 1_920) throw new Error('Density brick record buffer must be 1,920 bytes');
  if (DENSITY_BRICK_ATLAS_PROFILES.preferred.residentBytes !== 16_384_000) {
    throw new Error('Preferred density brick profile byte budget changed');
  }
  if (DENSITY_BRICK_ATLAS_PROFILES.fallback.residentBytes !== 14_155_776) {
    throw new Error('Fallback density brick profile byte budget changed');
  }
  if (DENSITY_BRICK_ATLAS_PROFILES.preferred.residentBytes > 16 * 1024 * 1024
    || DENSITY_BRICK_ATLAS_PROFILES.fallback.residentBytes > 16 * 1024 * 1024) {
    throw new Error('Density brick resident profile exceeds 16 MiB');
  }
  for (const logical of DENSITY_BRICK_LOGICAL_EDGES) {
    const physical = PHYSICAL_EDGE_BY_LOGICAL[logical];
    if (physical < logical + DENSITY_BRICK_GUTTER * 2 || physical % DENSITY_BRICK_PAGE_EDGE !== 0) {
      throw new Error(`Density brick physical edge is invalid for ${logical}`);
    }
  }
}
