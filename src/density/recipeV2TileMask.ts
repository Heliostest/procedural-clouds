import { MAX_BODIES } from '../params';
import type { DensityV2ActiveBody, DensityV2PackedFrame, DensityV2Vec3 } from './recipeV2Packing';

export const DENSITY_V2_MAX_TILE_MASK_TILES = 262_144;
export const DENSITY_V2_MAX_TILE_MASK_BYTES = 1_048_576;
export const DENSITY_V2_MAX_TILE_BODY_TESTS = DENSITY_V2_MAX_TILE_MASK_TILES * MAX_BODIES;
export const DENSITY_V2_TILE_MASK_VERSION = 1;

export interface DensityV2TileMaskDeviceLimits {
  readonly maxStorageBufferBindingSize: number;
  readonly maxBufferSize: number;
}

export interface DensityV2TileMaskBuildOptions {
  readonly resolution: number;
  readonly workgroup: readonly [number, number, number];
  readonly packed: DensityV2PackedFrame;
  readonly deviceLimits?: DensityV2TileMaskDeviceLimits;
  readonly forceDenseFallback?: boolean;
}

export interface DensityV2TileMaskResult {
  readonly enabled: boolean;
  readonly fallbackReason: string;
  readonly words: Uint32Array;
  readonly grid: readonly [number, number, number];
  readonly tileCount: number;
  readonly requiredMaskBytes: number;
  readonly maskBytes: number;
  readonly emptyTileCount: number;
  readonly occupiedTileCount: number;
  readonly candidateMemberships: number;
  readonly averageCandidates: number;
  readonly maxCandidates: number;
  readonly denseTileBodyPairs: number;
  readonly maskedTileBodyPairs: number;
  readonly denseVoxelBodyUpperBound: number;
  readonly maskedVoxelBodyUpperBound: number;
  readonly culledRatio: number;
  readonly cpuBroadPhaseTests: number;
  readonly buildCpuMs: number;
  readonly signature: string;
}

function popcount32(value: number): number {
  let v = value >>> 0;
  v -= (v >>> 1) & 0x5555_5555;
  v = (v & 0x3333_3333) + ((v >>> 2) & 0x3333_3333);
  return (((v + (v >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24;
}

function finiteLimit(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? value! : Number.MAX_SAFE_INTEGER;
}

function intersectsClosed(
  minA: DensityV2Vec3,
  maxA: DensityV2Vec3,
  minB: DensityV2Vec3,
  maxB: DensityV2Vec3,
): boolean {
  return minA[0] <= maxB[0] && maxA[0] >= minB[0]
    && minA[1] <= maxB[1] && maxA[1] >= minB[1]
    && minA[2] <= maxB[2] && maxA[2] >= minB[2];
}

function tileValidVoxelCount(
  tile: readonly [number, number, number],
  resolution: number,
  workgroup: readonly [number, number, number],
): number {
  return Math.max(0, Math.min(workgroup[0], resolution - tile[0] * workgroup[0]))
    * Math.max(0, Math.min(workgroup[1], resolution - tile[1] * workgroup[1]))
    * Math.max(0, Math.min(workgroup[2], resolution - tile[2] * workgroup[2]));
}

function tileWorldBounds(
  tile: readonly [number, number, number],
  resolution: number,
  workgroup: readonly [number, number, number],
  volumeMin: DensityV2Vec3,
  volumeExtent: DensityV2Vec3,
): readonly [DensityV2Vec3, DensityV2Vec3] {
  const voxelSize: DensityV2Vec3 = [
    volumeExtent[0] / resolution,
    volumeExtent[1] / resolution,
    volumeExtent[2] / resolution,
  ];
  const start = [
    tile[0] * workgroup[0],
    tile[1] * workgroup[1],
    tile[2] * workgroup[2],
  ] as const;
  const end = [
    Math.min(resolution, start[0] + workgroup[0]),
    Math.min(resolution, start[1] + workgroup[1]),
    Math.min(resolution, start[2] + workgroup[2]),
  ] as const;
  return [[
    volumeMin[0] + start[0] * voxelSize[0],
    volumeMin[1] + start[1] * voxelSize[1],
    volumeMin[2] + start[2] * voxelSize[2],
  ], [
    volumeMin[0] + end[0] * voxelSize[0],
    volumeMin[1] + end[1] * voxelSize[1],
    volumeMin[2] + end[2] * voxelSize[2],
  ]];
}

export function densityV2TileMaskSignature(options: DensityV2TileMaskBuildOptions): string {
  const { packed, resolution, workgroup } = options;
  const bodies = packed.activeBodies.map((body) => [
    body.sourceIndex,
    body.compactIndex,
    body.genusId,
    ...body.supportCenter,
    ...body.supportHalfExtents,
    ...body.supportRotation,
    ...body.supportAabbMin,
    ...body.supportAabbMax,
  ]);
  return JSON.stringify([
    DENSITY_V2_TILE_MASK_VERSION,
    resolution,
    ...workgroup,
    ...packed.volumeMin,
    ...packed.volumeExtent,
    packed.activeBodyCount,
    bodies,
    options.forceDenseFallback === true,
  ]);
}

function fallbackReason(options: DensityV2TileMaskBuildOptions, tileCount: number, requiredMaskBytes: number): string {
  if (options.forceDenseFallback) return 'forced-dense';
  if (tileCount > DENSITY_V2_MAX_TILE_MASK_TILES) return 'disabled-budget-tiles';
  if (requiredMaskBytes > DENSITY_V2_MAX_TILE_MASK_BYTES) return 'disabled-budget-bytes';
  if (tileCount * options.packed.activeBodyCount > DENSITY_V2_MAX_TILE_BODY_TESTS) return 'disabled-budget-tests';
  const limits = options.deviceLimits;
  if (requiredMaskBytes > finiteLimit(limits?.maxStorageBufferBindingSize)) return 'disabled-device-storage-binding';
  if (requiredMaskBytes > finiteLimit(limits?.maxBufferSize)) return 'disabled-device-buffer-size';
  return '';
}

export function buildDensityV2TileMask(options: DensityV2TileMaskBuildOptions): DensityV2TileMaskResult {
  const started = performance.now();
  const resolution = Math.max(1, Math.round(options.resolution));
  const workgroup = options.workgroup.map((value) => Math.max(1, Math.round(value))) as [number, number, number];
  const grid = [
    Math.ceil(resolution / workgroup[0]),
    Math.ceil(resolution / workgroup[1]),
    Math.ceil(resolution / workgroup[2]),
  ] as const;
  const tileCount = grid[0] * grid[1] * grid[2];
  const requiredMaskBytes = tileCount * 4;
  const reason = fallbackReason(options, tileCount, requiredMaskBytes);
  const activeBodyCount = Math.min(options.packed.activeBodyCount, MAX_BODIES);
  const denseTileBodyPairs = tileCount * activeBodyCount;
  const denseVoxelBodyUpperBound = resolution ** 3 * activeBodyCount;
  const signature = densityV2TileMaskSignature({ ...options, resolution, workgroup });

  if (reason) {
    return {
      enabled: false,
      fallbackReason: reason,
      words: new Uint32Array(1),
      grid,
      tileCount,
      requiredMaskBytes,
      maskBytes: 4,
      emptyTileCount: activeBodyCount === 0 ? tileCount : 0,
      occupiedTileCount: activeBodyCount === 0 ? 0 : tileCount,
      candidateMemberships: denseTileBodyPairs,
      averageCandidates: tileCount > 0 ? activeBodyCount : 0,
      maxCandidates: activeBodyCount,
      denseTileBodyPairs,
      maskedTileBodyPairs: denseTileBodyPairs,
      denseVoxelBodyUpperBound,
      maskedVoxelBodyUpperBound: denseVoxelBodyUpperBound,
      culledRatio: 0,
      cpuBroadPhaseTests: 0,
      buildCpuMs: performance.now() - started,
      signature,
    };
  }

  const words = new Uint32Array(Math.max(1, tileCount));
  let emptyTileCount = 0;
  let candidateMemberships = 0;
  let maxCandidates = 0;
  let maskedVoxelBodyUpperBound = 0;
  for (let z = 0; z < grid[2]; z++) {
    for (let y = 0; y < grid[1]; y++) {
      for (let x = 0; x < grid[0]; x++) {
        const tile = [x, y, z] as const;
        const [tileMin, tileMax] = tileWorldBounds(
          tile,
          resolution,
          workgroup,
          options.packed.volumeMin,
          options.packed.volumeExtent,
        );
        let mask = 0;
        for (const body of options.packed.activeBodies) {
          if (body.compactIndex >= MAX_BODIES) throw new Error('Density V2 tile mask body bit out of range');
          if (intersectsClosed(tileMin, tileMax, body.supportAabbMin, body.supportAabbMax)) {
            mask |= 1 << body.compactIndex;
          }
        }
        const index = x + grid[0] * (y + grid[1] * z);
        words[index] = mask >>> 0;
        const candidates = popcount32(mask);
        if (candidates === 0) emptyTileCount++;
        candidateMemberships += candidates;
        maxCandidates = Math.max(maxCandidates, candidates);
        maskedVoxelBodyUpperBound += tileValidVoxelCount(tile, resolution, workgroup) * candidates;
      }
    }
  }
  const occupiedTileCount = tileCount - emptyTileCount;
  return {
    enabled: true,
    fallbackReason: '',
    words,
    grid,
    tileCount,
    requiredMaskBytes,
    maskBytes: requiredMaskBytes,
    emptyTileCount,
    occupiedTileCount,
    candidateMemberships,
    averageCandidates: tileCount > 0 ? candidateMemberships / tileCount : 0,
    maxCandidates,
    denseTileBodyPairs,
    maskedTileBodyPairs: candidateMemberships,
    denseVoxelBodyUpperBound,
    maskedVoxelBodyUpperBound,
    culledRatio: denseVoxelBodyUpperBound > 0
      ? 1 - maskedVoxelBodyUpperBound / denseVoxelBodyUpperBound
      : 0,
    cpuBroadPhaseTests: tileCount * activeBodyCount,
    buildCpuMs: performance.now() - started,
    signature,
  };
}

export function densityV2SupportContains(body: DensityV2ActiveBody, point: DensityV2Vec3): boolean {
  const delta: DensityV2Vec3 = [
    point[0] - body.supportCenter[0],
    point[1] - body.supportCenter[1],
    point[2] - body.supportCenter[2],
  ];
  const m = body.supportRotation;
  const local: DensityV2Vec3 = [
    m[0] * delta[0] + m[3] * delta[1] + m[6] * delta[2],
    m[1] * delta[0] + m[4] * delta[1] + m[7] * delta[2],
    m[2] * delta[0] + m[5] * delta[1] + m[8] * delta[2],
  ];
  return Math.abs(local[0]) <= body.supportHalfExtents[0]
    && Math.abs(local[1]) <= body.supportHalfExtents[1]
    && Math.abs(local[2]) <= body.supportHalfExtents[2];
}

export function verifyDensityV2TileMaskNoFalseNegatives(
  result: DensityV2TileMaskResult,
  options: DensityV2TileMaskBuildOptions,
): void {
  if (!result.enabled) return;
  const resolution = Math.max(1, Math.round(options.resolution));
  const voxelSize: DensityV2Vec3 = [
    options.packed.volumeExtent[0] / resolution,
    options.packed.volumeExtent[1] / resolution,
    options.packed.volumeExtent[2] / resolution,
  ];
  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const point: DensityV2Vec3 = [
          options.packed.volumeMin[0] + (x + 0.5) * voxelSize[0],
          options.packed.volumeMin[1] + (y + 0.5) * voxelSize[1],
          options.packed.volumeMin[2] + (z + 0.5) * voxelSize[2],
        ];
        const tile = [
          Math.floor(x / options.workgroup[0]),
          Math.floor(y / options.workgroup[1]),
          Math.floor(z / options.workgroup[2]),
        ] as const;
        const word = result.words[tile[0] + result.grid[0] * (tile[1] + result.grid[1] * tile[2])];
        for (const body of options.packed.activeBodies) {
          if (densityV2SupportContains(body, point) && (word & (1 << body.compactIndex)) === 0) {
            throw new Error(`Density V2 tile mask false negative at ${x},${y},${z} body ${body.compactIndex}`);
          }
        }
      }
    }
  }
}
