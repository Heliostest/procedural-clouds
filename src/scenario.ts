import { defaultLife, type BodyShape, type CloudBody } from './body';

export type Ease = 'linear' | 'smooth';

export interface ScenarioBody {
  shape: BodyShape;
  bounds: number[];
  feather: number;
  base: number;
  thickness: number;
  type: string;
}

export interface ScenarioEvent {
  t: number;
  bodyId: string;
  coverage?: number;
  densityScale?: number;
  type?: string;
  base?: number;
  thickness?: number;
  windDeg?: number;
  windSpeed?: number;
  ease?: Ease;
}

export interface Scenario {
  duration: number;
  wind?: { dirDeg: number; speed: number };
  bodies: Record<string, ScenarioBody>;
  events: ScenarioEvent[];
}

export interface ScenarioSample {
  bodies: CloudBody[];
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

type NumKey = 'coverage' | 'densityScale' | 'base' | 'thickness' | 'windDeg' | 'windSpeed';

export function parseScenario(json: string | object): Scenario {
  const raw = typeof json === 'string' ? JSON.parse(json) : (json as Record<string, unknown>);
  if (!raw || typeof raw !== 'object') throw new Error('scenario: not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.duration !== 'number') throw new Error('scenario: missing duration');

  // Backward compat: old "regions" / "regionId".
  const rawBodies = (r.bodies ?? r.regions) as Record<string, Record<string, unknown>> | undefined;
  if (!rawBodies || typeof rawBodies !== 'object') throw new Error('scenario: missing bodies');
  if (!Array.isArray(r.events)) throw new Error('scenario: missing events');

  const bodies: Record<string, ScenarioBody> = {};
  for (const id of Object.keys(rawBodies)) {
    const sb = rawBodies[id];
    bodies[id] = {
      shape: (sb.shape as BodyShape) ?? 'rect',
      bounds: (sb.bounds as number[]) ?? [0, 0, 0, 0],
      feather: (sb.feather as number) ?? 1.5,
      base: (sb.base as number) ?? 0.0,
      thickness: (sb.thickness as number) ?? 0.4,
      type: (sb.type as string) ?? 'cumulus',
    };
  }

  const wind = (r.wind as { dirDeg?: number; speed?: number }) ?? { dirDeg: 0, speed: 0 };
  const events: ScenarioEvent[] = (r.events as Array<Record<string, unknown>>).map((e) => {
    const bodyId = (e.bodyId ?? e.regionId) as string;
    if (typeof e.t !== 'number' || typeof bodyId !== 'string') {
      throw new Error('scenario: invalid event');
    }
    if (!(bodyId in bodies)) throw new Error(`scenario: event bodyId '${bodyId}' not in bodies`);
    return { ...(e as unknown as ScenarioEvent), bodyId, ease: (e.ease as Ease) ?? 'linear' };
  });
  events.sort((a, b) => a.t - b.t);

  return {
    duration: r.duration as number,
    wind: { dirDeg: wind.dirDeg ?? 0, speed: wind.speed ?? 0 },
    bodies,
    events,
  };
}

export function serializeScenario(s: Scenario): string {
  return JSON.stringify(s, null, 2);
}

export function createPlayer(scenario: Scenario) {
  const ids = Object.keys(scenario.bodies);
  const byBody: Record<string, ScenarioEvent[]> = {};
  for (const id of ids) byBody[id] = [];
  for (const e of scenario.events) byBody[e.bodyId].push(e);

  function sampleField(events: ScenarioEvent[], t: number, key: NumKey, fallback: number): number {
    const pts = events.filter((e) => e[key] !== undefined);
    if (pts.length === 0) return fallback;
    if (t <= pts[0].t) return pts[0][key] as number;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1][key] as number;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (t >= a.t && t <= b.t) {
        const span = Math.max(1e-5, b.t - a.t);
        let u = (t - a.t) / span;
        if (b.ease === 'smooth') u = smoothstep(u);
        const av = a[key] as number;
        const bv = b[key] as number;
        return av + (bv - av) * u;
      }
    }
    return fallback;
  }

  function sampleType(events: ScenarioEvent[], t: number, fallback: string): string {
    let type = fallback;
    for (const e of events) {
      if (e.type !== undefined && e.t <= t) type = e.type;
    }
    if (type === fallback) {
      const first = events.find((e) => e.type !== undefined);
      if (first) type = first.type as string;
    }
    return type;
  }

  const windDeg0 = scenario.wind?.dirDeg ?? 0;
  const windSpeed0 = scenario.wind?.speed ?? 0;

  return {
    duration: scenario.duration,
    sample(t: number): ScenarioSample {
      const bodies: CloudBody[] = [];
      for (const id of ids) {
        const sb = scenario.bodies[id];
        const evs = byBody[id];
        bodies.push({
          id,
          shape: sb.shape,
          bounds: sb.bounds,
          feather: sb.feather,
          base: sampleField(evs, t, 'base', sb.base),
          thickness: sampleField(evs, t, 'thickness', sb.thickness),
          type: sampleType(evs, t, sb.type),
          coverage: sampleField(evs, t, 'coverage', 0),
          densityScale: sampleField(evs, t, 'densityScale', 1),
          windDeg: sampleField(evs, t, 'windDeg', windDeg0),
          windSpeed: sampleField(evs, t, 'windSpeed', windSpeed0),
          morphRate: 0.05,
          life: defaultLife(),
        });
      }
      return { bodies };
    },
  };
}

export type ScenarioPlayer = ReturnType<typeof createPlayer>;

export const DEMO_SCENARIO: Scenario = {
  duration: 70,
  wind: { dirDeg: 90, speed: 0.35 },
  bodies: {
    A: { shape: 'rect', bounds: [-3.5, -1.5, 0.5, 1.5], feather: 1.5, base: 0.0, thickness: 0.4, type: 'cumulus' },
    H: { shape: 'circle', bounds: [1.5, 1.5, 2.0, 0], feather: 1.8, base: 0.76, thickness: 0.22, type: 'cirrus' },
  },
  events: [
    { t: 0, bodyId: 'A', coverage: 0.0, densityScale: 0.0 },
    { t: 12, bodyId: 'A', coverage: 0.75, densityScale: 1.0, ease: 'smooth' },
    { t: 40, bodyId: 'A', coverage: 0.75, densityScale: 1.0 },
    { t: 65, bodyId: 'A', coverage: 0.0, densityScale: 0.0, ease: 'smooth' },
    { t: 0, bodyId: 'H', coverage: 0.4, densityScale: 1.0, windDeg: 80, windSpeed: 0.6 },
    { t: 70, bodyId: 'H', coverage: 0.4, densityScale: 1.0 },
  ],
};
