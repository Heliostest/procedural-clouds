import { evalLifecycleMod, type LifecycleEnvelope, type BodyMod } from './lifecycle';
import { applyGenusDefaults } from './genusProfile';

export type BodyShape =
  | 'rect'
  | 'circle'
  | 'sphere'
  | 'cube'
  | 'octahedron'
  | 'tetrahedron'
  | 'dodecahedron'
  | 'icosahedron'
  | 'torus';

export const SOLID_SHAPES: BodyShape[] = [
  'sphere', 'cube', 'octahedron', 'tetrahedron', 'dodecahedron', 'icosahedron', 'torus',
];

export function isSolidShape(s: BodyShape): boolean {
  return s !== 'rect' && s !== 'circle';
}

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

export function bodyCenterXZ(b: CloudBody): [number, number] {
  if (b.shape === 'rect') {
    return [(b.bounds[0] + b.bounds[2]) / 2, (b.bounds[1] + b.bounds[3]) / 2];
  }
  return [b.bounds[0], b.bounds[1]];
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
  return bodies.map((b) => `${b.id}:${b.shape}:${b.bounds.join(',')}:${b.feather}`).join('|');
}

export interface BodyStore {
  list(): CloudBody[];
  add(shape: BodyShape): CloudBody;
  setShape(id: string, shape: BodyShape): void;
  setType(id: string, type: string): void;
  applyTypeDefaults(id: string): void;
  remove(id: string): void;
  update(id: string, patch: Partial<CloudBody>): void;
}

const PLACEMENT_KEYS = new Set<keyof CloudBody>(['bounds', 'feather', 'base', 'thickness']);

function createBody(id: string, shape: BodyShape): CloudBody {
  const body: CloudBody = {
    id,
    shape,
    bounds: shape === 'rect' ? [-800, -800, 800, 800] : [0, 0, 800, 0],
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
    add(shape) {
      const body = createBody(`B${++counter}`, shape);
      applyGenusDefaults(body, getCloudHeightM());
      bodies.push(body);
      return body;
    },
    setShape(id, shape) {
      const b = bodies.find((x) => x.id === id);
      if (!b) return;
      const wasRect = b.shape === 'rect';
      const willRect = shape === 'rect';
      if (wasRect && !willRect) {
        const cx = (b.bounds[0] + b.bounds[2]) / 2;
        const cz = (b.bounds[1] + b.bounds[3]) / 2;
        const r = Math.max((b.bounds[2] - b.bounds[0]) / 2, (b.bounds[3] - b.bounds[1]) / 2);
        b.bounds = [cx, cz, r, 0];
      } else if (!wasRect && willRect) {
        const [cx, cz, r] = b.bounds;
        b.bounds = [cx - r, cz - r, cx + r, cz + r];
      }
      b.shape = shape;
      b.placementLocked = true;
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

export function createDefaultBodies(): CloudBody[] {
  return [
    { id: 'B1', shape: 'rect', bounds: [-3500, -1500, -500, 1500], feather: 1500, base: 1000, thickness: 1500, type: 'cumulus', placementLocked: true, coverage: 0.75, densityScale: 1.0, windDeg: 45, windSpeedMps: 5, morphRate: 0.05, rot: [0, 0, 0], life: defaultLife() },
    { id: 'B2', shape: 'circle', bounds: [2000, 1000, 1600, 0], feather: 1500, base: 2500, thickness: 2500, type: 'altocumulus', placementLocked: true, coverage: 0.55, densityScale: 1.0, windDeg: 60, windSpeedMps: 10, morphRate: 0.08, rot: [0, 0, 0], life: defaultLife() },
    { id: 'B3', shape: 'circle', bounds: [0, -2000, 2200, 0], feather: 1800, base: 7000, thickness: 5000, type: 'cirrus', placementLocked: true, coverage: 0.4, densityScale: 1.0, windDeg: 80, windSpeedMps: 20, morphRate: 0.1, rot: [0, 0, 0], life: defaultLife() },
  ];
}
