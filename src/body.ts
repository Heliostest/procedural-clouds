import { evalLifecycleMod, type LifecycleEnvelope, type BodyMod } from './lifecycle';
import { applyGenusDefaults, CLOUD_GENERA, genusProfile, type CloudGenus } from './genusProfile';
import { CLOUD_PRESETS } from './params';

export type BodyShape = 'rect';

export interface BodyLife {
  enabled: boolean;
  birth: number;
  grow: number;
  decay: number;
  death: number;
  peak: number;
}

export interface CloudBody {
  id: string;
  shape: BodyShape;
  bounds: number[];
  feather: number;
  base: number;
  thickness: number;
  type: string;
  placementLocked: boolean;
  coverage: number;
  densityScale: number;
  windDeg: number;
  windSpeedMps: number;
  morphRate: number;
  rot: [number, number, number];
  life: BodyLife;
}

export const GIZMO_AXIS_LEN = 1.8;
export const GIZMO_RING_RADIUS = 1.3;

export function legacyBoundsToRect(shape: string, bounds: number[]): number[] {
  if (shape === 'circle' && bounds.length >= 3) {
    const [cx, cz, r] = bounds;
    return [cx - r, cz - r, cx + r, cz + r];
  }
  if (bounds.length >= 4) return bounds.slice(0, 4);
  return [-800, -800, 800, 800];
}

export function bodyCenterXZ(b: CloudBody): [number, number] {
  return [(b.bounds[0] + b.bounds[2]) / 2, (b.bounds[1] + b.bounds[3]) / 2];
}

export function bodyTopY(b: CloudBody, boxHeight: number): number {
  return Math.min(boxHeight, b.base + Math.max(0.02, b.thickness));
}

export function bodyCenterWorld(b: CloudBody, boxHeight: number): [number, number, number] {
  const [cx, cz] = bodyCenterXZ(b);
  const cy = (b.base + bodyTopY(b, boxHeight)) / 2;
  return [cx, cy, cz];
}

export function defaultLife(): BodyLife {
  return { enabled: false, birth: 2, grow: 32, decay: 60, death: 90, peak: 1.0 };
}

function lifeEnvelope(life: BodyLife): LifecycleEnvelope | undefined {
  if (!life.enabled) return undefined;
  const g = Math.max(life.birth, life.grow);
  const dc = Math.max(g, life.decay);
  const dt = Math.max(dc, life.death);
  return { birth: life.birth, grow: g, mature: dc, decay: dc, death: dt, peakDensity: life.peak };
}

export function evalBodyMod(body: CloudBody, t: number): BodyMod {
  return evalLifecycleMod(lifeEnvelope(body.life), t);
}

export function geometrySignature(bodies: CloudBody[]): string {
  return bodies.map((b) => `${b.id}:${b.bounds.join(',')}:${b.feather}`).join('|');
}

export interface BodyStore {
  list(): CloudBody[];
  add(): CloudBody;
  setType(id: string, type: string): void;
  applyTypeDefaults(id: string): void;
  remove(id: string): void;
  update(id: string, patch: Partial<CloudBody>): void;
}

const PLACEMENT_KEYS = new Set<keyof CloudBody>(['bounds', 'feather', 'base', 'thickness']);

function createBody(id: string): CloudBody {
  const body: CloudBody = {
    id,
    shape: 'rect',
    bounds: [-800, -800, 800, 800],
    feather: 300,
    base: 1000,
    thickness: 1500,
    type: 'cumulus',
    placementLocked: false,
    coverage: 0.7,
    densityScale: 1,
    windDeg: 45,
    windSpeedMps: 10,
    morphRate: 0.05,
    rot: [0, 0, 0],
    life: defaultLife(),
  };
  applyGenusDefaults(body, 12000);
  return body;
}

export function createBodyStore(initial: CloudBody[], getCloudHeightM: () => number = () => 12000): BodyStore {
  const bodies = initial.slice();
  let counter = bodies.length;
  return {
    list: () => bodies,
    add() {
      const body = createBody(`B${++counter}`);
      applyGenusDefaults(body, getCloudHeightM());
      bodies.push(body);
      return body;
    },
    setType(id, type) {
      const b = bodies.find((x) => x.id === id);
      if (!b) return;
      b.type = type;
      if (!b.placementLocked) applyGenusDefaults(b, getCloudHeightM());
    },
    applyTypeDefaults(id) {
      const b = bodies.find((x) => x.id === id);
      if (b) applyGenusDefaults(b, getCloudHeightM());
    },
    remove(id) {
      const i = bodies.findIndex((b) => b.id === id);
      if (i >= 0) bodies.splice(i, 1);
    },
    update(id, patch) {
      const b = bodies.find((x) => x.id === id);
      if (!b) return;
      Object.assign(b, patch);
      if (Object.keys(patch).some((key) => PLACEMENT_KEYS.has(key as keyof CloudBody))) {
        b.placementLocked = true;
      }
    },
  };
}

const DEFAULT_DEMO_HALF_EXTENT_M = Math.max(
  ...CLOUD_GENERA.map((genus) => genusProfile(genus).defaultHorizontalHalfExtentM),
);
const DEFAULT_BODY_PITCH_M = DEFAULT_DEMO_HALF_EXTENT_M * 2 + 8000;

const DEFAULT_BODY_CENTERS: Record<CloudGenus, readonly [number, number]> = {
  cumulus: [-2 * DEFAULT_BODY_PITCH_M, -0.5 * DEFAULT_BODY_PITCH_M],
  stratus: [-1 * DEFAULT_BODY_PITCH_M, -0.5 * DEFAULT_BODY_PITCH_M],
  stratocumulus: [0, -0.5 * DEFAULT_BODY_PITCH_M],
  cumulonimbus: [1 * DEFAULT_BODY_PITCH_M, -0.5 * DEFAULT_BODY_PITCH_M],
  altocumulus: [2 * DEFAULT_BODY_PITCH_M, -0.5 * DEFAULT_BODY_PITCH_M],
  altostratus: [-2 * DEFAULT_BODY_PITCH_M, 0.5 * DEFAULT_BODY_PITCH_M],
  nimbostratus: [-1 * DEFAULT_BODY_PITCH_M, 0.5 * DEFAULT_BODY_PITCH_M],
  cirrus: [0, 0.5 * DEFAULT_BODY_PITCH_M],
  cirrostratus: [1 * DEFAULT_BODY_PITCH_M, 0.5 * DEFAULT_BODY_PITCH_M],
  cirrocumulus: [2 * DEFAULT_BODY_PITCH_M, 0.5 * DEFAULT_BODY_PITCH_M],
};

const DEFAULT_BODY_WIND: Record<CloudGenus, { windDeg: number; windSpeedMps: number; morphRate: number }> = {
  cumulus: { windDeg: 45, windSpeedMps: 5, morphRate: 0.05 },
  stratus: { windDeg: 50, windSpeedMps: 4, morphRate: 0.03 },
  stratocumulus: { windDeg: 55, windSpeedMps: 6, morphRate: 0.05 },
  cumulonimbus: { windDeg: 40, windSpeedMps: 8, morphRate: 0.07 },
  altocumulus: { windDeg: 60, windSpeedMps: 10, morphRate: 0.08 },
  altostratus: { windDeg: 65, windSpeedMps: 12, morphRate: 0.04 },
  nimbostratus: { windDeg: 50, windSpeedMps: 7, morphRate: 0.04 },
  cirrus: { windDeg: 80, windSpeedMps: 20, morphRate: 0.1 },
  cirrostratus: { windDeg: 85, windSpeedMps: 22, morphRate: 0.06 },
  cirrocumulus: { windDeg: 75, windSpeedMps: 18, morphRate: 0.09 },
};

export function createDefaultBodies(cloudHeightM = 12000): CloudBody[] {
  const half = DEFAULT_DEMO_HALF_EXTENT_M;
  return CLOUD_GENERA.map((type, i) => {
    const [cx, cz] = DEFAULT_BODY_CENTERS[type];
    const profile = genusProfile(type);
    const preset = CLOUD_PRESETS[type];
    const wind = DEFAULT_BODY_WIND[type];
    const body: CloudBody = {
      id: `B${i + 1}`,
      shape: 'rect',
      bounds: [cx, cz, cx, cz],
      feather: Math.max(400, half * 0.35),
      base: profile.defaultBaseM,
      thickness: profile.defaultThicknessM,
      type,
      placementLocked: true,
      coverage: preset.coverage,
      densityScale: 1,
      windDeg: wind.windDeg,
      windSpeedMps: wind.windSpeedMps,
      morphRate: wind.morphRate,
      rot: [0, 0, 0],
      life: defaultLife(),
    };
    applyGenusDefaults(body, cloudHeightM);
    body.bounds = [cx - half, cz - half, cx + half, cz + half];
    body.feather = Math.max(400, half * 0.35);
    body.placementLocked = true;
    return body;
  });
}
