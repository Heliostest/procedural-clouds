import { evalRegionMod, type LifecycleEnvelope, type RegionMod } from './lifecycle';

export type BodyShape = 'rect' | 'circle';

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
  coverage: number;
  densityScale: number;
  windDeg: number;
  windSpeed: number;
  morphRate: number;
  life: BodyLife;
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

export function evalBodyMod(body: CloudBody, t: number): RegionMod {
  return evalRegionMod(lifeEnvelope(body.life), t);
}

export function geometrySignature(bodies: CloudBody[]): string {
  return bodies.map((b) => `${b.id}:${b.shape}:${b.bounds.join(',')}:${b.feather}`).join('|');
}

export interface BodyStore {
  list(): CloudBody[];
  add(shape: BodyShape): CloudBody;
  remove(id: string): void;
  update(id: string, patch: Partial<CloudBody>): void;
}

export function createBodyStore(initial: CloudBody[]): BodyStore {
  const bodies = initial.slice();
  let counter = bodies.length;
  return {
    list: () => bodies,
    add(shape) {
      const id = `B${++counter}`;
      const body: CloudBody = shape === 'rect'
        ? { id, shape, bounds: [-1.5, -1.5, 1.5, 1.5], feather: 1.5, base: 0.0, thickness: 0.4, type: 'cumulus', coverage: 0.7, densityScale: 1.0, windDeg: 45, windSpeed: 0.15, morphRate: 0.05, life: defaultLife() }
        : { id, shape, bounds: [0, 0, 1.8, 0], feather: 1.5, base: 0.0, thickness: 0.4, type: 'cumulus', coverage: 0.7, densityScale: 1.0, windDeg: 45, windSpeed: 0.15, morphRate: 0.05, life: defaultLife() };
      bodies.push(body);
      return body;
    },
    remove(id) {
      const i = bodies.findIndex((b) => b.id === id);
      if (i >= 0) bodies.splice(i, 1);
    },
    update(id, patch) {
      const b = bodies.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    },
  };
}

export function createDefaultBodies(): CloudBody[] {
  return [
    { id: 'B1', shape: 'rect', bounds: [-3.5, -1.5, -0.5, 1.5], feather: 1.5, base: 0.0, thickness: 0.4, type: 'cumulus', coverage: 0.75, densityScale: 1.0, windDeg: 45, windSpeed: 0.15, morphRate: 0.05, life: defaultLife() },
    { id: 'B2', shape: 'circle', bounds: [2.0, 1.0, 1.6, 0], feather: 1.5, base: 0.45, thickness: 0.2, type: 'altocumulus', coverage: 0.55, densityScale: 1.0, windDeg: 60, windSpeed: 0.3, morphRate: 0.08, life: defaultLife() },
    { id: 'B3', shape: 'circle', bounds: [0.0, -2.0, 2.2, 0], feather: 1.8, base: 0.76, thickness: 0.22, type: 'cirrus', coverage: 0.4, densityScale: 1.0, windDeg: 80, windSpeed: 0.6, morphRate: 0.1, life: defaultLife() },
  ];
}
