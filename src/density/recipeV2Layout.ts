import { MAX_BODIES } from '../params';

export const DENSITY_V2_LAYOUT_VERSION = 1;
export const DENSITY_V2_RECIPE_COUNT = 10;
export const DENSITY_FRAME_GPU_SIZE = 64;
export const DENSITY_BODY_GPU_SIZE = 128;
export const DENSITY_RECIPE_GPU_SIZE = 256;

export type DensityV2ScalarKind = 'f32' | 'u32';

export interface DensityV2LayoutField {
  readonly name: string;
  readonly kind: DensityV2ScalarKind;
  readonly lane: number;
  readonly byteOffset: number;
  readonly byteSize: 16;
  readonly alignment: 16;
}

export interface DensityV2RecordLayout {
  readonly name: string;
  readonly version: number;
  readonly stride: number;
  readonly count: number;
  readonly fields: readonly DensityV2LayoutField[];
}

function field(name: string, kind: DensityV2ScalarKind, lane: number): DensityV2LayoutField {
  return Object.freeze({
    name,
    kind,
    lane,
    byteOffset: lane * 16,
    byteSize: 16,
    alignment: 16,
  });
}

function record(
  name: string,
  stride: number,
  count: number,
  fields: readonly DensityV2LayoutField[],
): DensityV2RecordLayout {
  return Object.freeze({
    name,
    version: DENSITY_V2_LAYOUT_VERSION,
    stride,
    count,
    fields: Object.freeze([...fields]),
  });
}

export const DENSITY_FRAME_GPU_LAYOUT = record('DensityFrameGPU', DENSITY_FRAME_GPU_SIZE, 1, [
  field('volumeMin', 'f32', 0),
  field('volumeExtent', 'f32', 1),
  field('timingAndScale', 'f32', 2),
  field('countsAndFlags', 'u32', 3),
]);

export const DENSITY_BODY_GPU_LAYOUT = record('DensityBodyGPU', DENSITY_BODY_GPU_SIZE, MAX_BODIES, [
  field('boundsXZ', 'f32', 0),
  field('heightDensity', 'f32', 1),
  field('coverageLifecycle', 'f32', 2),
  field('transport', 'f32', 3),
  field('rotation', 'f32', 4),
  field('localScaleAndFeather', 'f32', 5),
  field('ids', 'u32', 6),
  field('reserved', 'f32', 7),
]);

export const DENSITY_RECIPE_GPU_LAYOUT = record('DensityRecipeGPU', DENSITY_RECIPE_GPU_SIZE, DENSITY_V2_RECIPE_COUNT, [
  field('identityAndModes', 'u32', 0),
  field('detailAttachmentCosts', 'u32', 1),
  field('sampleLimits', 'u32', 2),
  field('domain0', 'f32', 3),
  field('domain1', 'f32', 4),
  field('support0', 'f32', 5),
  field('vertical0', 'f32', 6),
  field('vertical1', 'f32', 7),
  field('topology0', 'f32', 8),
  field('topology1', 'f32', 9),
  field('topology2', 'f32', 10),
  field('detail0', 'f32', 11),
  field('detail1', 'f32', 12),
  field('attachment0', 'f32', 13),
  field('finalize0', 'f32', 14),
  field('reserved0', 'f32', 15),
]);

export const DENSITY_V2_LAYOUTS = Object.freeze([
  DENSITY_FRAME_GPU_LAYOUT,
  DENSITY_BODY_GPU_LAYOUT,
  DENSITY_RECIPE_GPU_LAYOUT,
]);

export const DENSITY_V2_RECORD_BYTES = DENSITY_FRAME_GPU_SIZE
  + DENSITY_BODY_GPU_SIZE * MAX_BODIES
  + DENSITY_RECIPE_GPU_SIZE * DENSITY_V2_RECIPE_COUNT;

export function densityV2LayoutField(
  layout: DensityV2RecordLayout,
  name: string,
): DensityV2LayoutField {
  const result = layout.fields.find((candidate) => candidate.name === name);
  if (!result) throw new Error(`Density V2 layout field not found: ${layout.name}.${name}`);
  return result;
}

export function createDensityV2RecordBuffer(layout: DensityV2RecordLayout): ArrayBuffer {
  return new ArrayBuffer(layout.stride * layout.count);
}

export function writeDensityV2F32(
  buffer: ArrayBuffer,
  layout: DensityV2RecordLayout,
  recordIndex: number,
  name: string,
  values: readonly [number, number, number, number],
): void {
  writeDensityV2Lane(buffer, layout, recordIndex, name, values, 'f32');
}

export function writeDensityV2U32(
  buffer: ArrayBuffer,
  layout: DensityV2RecordLayout,
  recordIndex: number,
  name: string,
  values: readonly [number, number, number, number],
): void {
  writeDensityV2Lane(buffer, layout, recordIndex, name, values, 'u32');
}

function writeDensityV2Lane(
  buffer: ArrayBuffer,
  layout: DensityV2RecordLayout,
  recordIndex: number,
  name: string,
  values: readonly [number, number, number, number],
  kind: DensityV2ScalarKind,
): void {
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= layout.count) {
    throw new Error(`Density V2 ${layout.name} record index out of range: ${recordIndex}`);
  }
  const target = densityV2LayoutField(layout, name);
  if (target.kind !== kind) {
    throw new Error(`Density V2 ${layout.name}.${name} expects ${target.kind}, received ${kind}`);
  }
  const byteOffset = recordIndex * layout.stride + target.byteOffset;
  if (kind === 'f32') {
    for (const value of values) {
      if (!Number.isFinite(value)) throw new Error(`Density V2 ${layout.name}.${name} must be finite`);
    }
    new Float32Array(buffer, byteOffset, 4).set(values);
    return;
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new Error(`Density V2 ${layout.name}.${name} must contain u32 values`);
    }
  }
  new Uint32Array(buffer, byteOffset, 4).set(values);
}

export function densityV2WgslStruct(layout: DensityV2RecordLayout): string {
  const fields = layout.fields.map((entry) => {
    const type = entry.kind === 'f32' ? 'vec4f' : 'vec4u';
    return `  ${entry.name} : ${type},`;
  }).join('\n');
  return `struct ${layout.name} {\n${fields}\n};`;
}

export function buildDensityV2WgslAbi(): string {
  return [
    `// density-v2-layout-version:${DENSITY_V2_LAYOUT_VERSION}`,
    densityV2WgslStruct(DENSITY_FRAME_GPU_LAYOUT),
    densityV2WgslStruct(DENSITY_BODY_GPU_LAYOUT),
    densityV2WgslStruct(DENSITY_RECIPE_GPU_LAYOUT),
    `const DENSITY_V2_MAX_BODIES : u32 = ${MAX_BODIES}u;`,
    `const DENSITY_V2_RECIPE_COUNT : u32 = ${DENSITY_V2_RECIPE_COUNT}u;`,
  ].join('\n\n');
}

export function verifyDensityV2Layouts(): void {
  for (const layout of DENSITY_V2_LAYOUTS) {
    if (layout.version !== DENSITY_V2_LAYOUT_VERSION) throw new Error(`${layout.name} version mismatch`);
    if (layout.stride % 16 !== 0) throw new Error(`${layout.name} stride is not 16-byte aligned`);
    if (layout.fields.length * 16 !== layout.stride) throw new Error(`${layout.name} fields do not fill stride`);
    const lanes = new Set<number>();
    for (const entry of layout.fields) {
      if (entry.byteOffset !== entry.lane * 16 || entry.byteSize !== 16 || entry.alignment !== 16) {
        throw new Error(`${layout.name}.${entry.name} has invalid lane alignment`);
      }
      if (lanes.has(entry.lane)) throw new Error(`${layout.name} duplicates lane ${entry.lane}`);
      lanes.add(entry.lane);
    }
  }
  if (DENSITY_BODY_GPU_LAYOUT.count !== MAX_BODIES) throw new Error('Density V2 body count mismatch');
  if (DENSITY_RECIPE_GPU_LAYOUT.count !== 10) throw new Error('Density V2 recipe count mismatch');
}
