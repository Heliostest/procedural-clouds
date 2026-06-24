import type { Region, RegionShape } from './weather';
import type { RegionMod } from './lifecycle';

export type Ease = 'linear' | 'smooth';

export interface ScenarioRegion {
  shape: RegionShape;
  bounds: number[];
  type: string;
  feather: number;
}

export interface ScenarioEvent {
  t: number;
  regionId: string;
  coverage?: number;
  densityScale?: number;
  type?: string;
  ease?: Ease;
}

export interface Scenario {
  duration: number;
  wind: { dirDeg: number; speed: number };
  regions: Record<string, ScenarioRegion>;
  events: ScenarioEvent[];
}

export interface ScenarioSample {
  regions: Region[];
  mods: RegionMod[];
  windDeg: number;
  windSpeed: number;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function parseScenario(json: string | object): Scenario {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || typeof raw !== 'object') throw new Error('scenario: not an object');
  if (typeof raw.duration !== 'number') throw new Error('scenario: missing duration');
  if (!raw.regions || typeof raw.regions !== 'object') throw new Error('scenario: missing regions');
  if (!Array.isArray(raw.events)) throw new Error('scenario: missing events');
  const wind = raw.wind ?? { dirDeg: 0, speed: 0 };
  const events: ScenarioEvent[] = raw.events.map((e: ScenarioEvent) => {
    if (typeof e.t !== 'number' || typeof e.regionId !== 'string') {
      throw new Error('scenario: invalid event');
    }
    if (!(e.regionId in raw.regions)) throw new Error(`scenario: event regionId '${e.regionId}' not in regions`);
    return { ...e, ease: e.ease ?? 'linear' };
  });
  events.sort((a, b) => a.t - b.t);
  return {
    duration: raw.duration,
    wind: { dirDeg: wind.dirDeg ?? 0, speed: wind.speed ?? 0 },
    regions: raw.regions,
    events,
  };
}

export function serializeScenario(s: Scenario): string {
  return JSON.stringify(s, null, 2);
}

function boundsToWeather(sr: ScenarioRegion): [number, number, number, number] {
  const b = sr.bounds;
  return [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0];
}

export function createPlayer(scenario: Scenario) {
  const ids = Object.keys(scenario.regions);
  const byRegion: Record<string, ScenarioEvent[]> = {};
  for (const id of ids) byRegion[id] = [];
  for (const e of scenario.events) byRegion[e.regionId].push(e);

  function sampleField(events: ScenarioEvent[], t: number, key: 'coverage' | 'densityScale', fallback: number): number {
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

  return {
    duration: scenario.duration,
    sample(t: number): ScenarioSample {
      const regions: Region[] = [];
      const mods: RegionMod[] = [];
      for (const id of ids) {
        const sr = scenario.regions[id];
        const evs = byRegion[id];
        const coverage = sampleField(evs, t, 'coverage', 0);
        const densityScale = sampleField(evs, t, 'densityScale', 1);
        const type = sampleType(evs, t, sr.type);
        regions.push({
          shape: sr.shape,
          bounds: boundsToWeather(sr),
          type,
          coverage,
          feather: sr.feather,
        });
        mods.push({ coverageMul: 1, densityScale, morph: 0 });
      }
      return { regions, mods, windDeg: scenario.wind.dirDeg, windSpeed: scenario.wind.speed };
    },
  };
}

export type ScenarioPlayer = ReturnType<typeof createPlayer>;

export const DEMO_SCENARIO: Scenario = {
  duration: 70,
  wind: { dirDeg: 90, speed: 0.35 },
  regions: {
    A: { shape: 'rect', bounds: [-3.5, -1.5, 0.5, 1.5], type: 'cumulus', feather: 1.5 },
  },
  events: [
    { t: 0, regionId: 'A', coverage: 0.0, densityScale: 0.0 },
    { t: 12, regionId: 'A', coverage: 0.75, densityScale: 1.0, ease: 'smooth' },
    { t: 40, regionId: 'A', coverage: 0.75, densityScale: 1.0 },
    { t: 65, regionId: 'A', coverage: 0.0, densityScale: 0.0, ease: 'smooth' },
  ],
};
