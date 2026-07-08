import { defaultLife, legacyBoundsToRect, type BodyShape, type CloudBody } from './body';
import { DEFAULT_SCENE_SCALE, normalizedSceneScale, worldToMetersXZ, worldToMetersY, type SceneScale } from './space';
import {
  normalizeWindDirection,
  validateWindSpeedMps,
  velocityToWind,
  WIND_DEMO_MAX_MPS,
  windVelocityMps,
  type WindAdvectionSample,
  type WindVectorMps,
} from './wind';

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
  schemaVersion: 3;
  distanceUnit: 'm';
  windUnit: 'm/s';
  duration: number;
  wind?: { dirDeg: number; speed: number };
  bodies: Record<string, ScenarioBody>;
  events: ScenarioEvent[];
}

export interface ScenarioSample {
  bodies: CloudBody[];
  windSamples: WindAdvectionSample[];
}

interface WindPoint {
  t: number;
  velocityMps: WindVectorMps;
  ease: Ease;
  prefixOffsetM: [number, number];
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`scenario: ${label} must be finite`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : finiteNumber(value, label);
}

function normalizeEase(value: unknown): Ease {
  if (value === undefined) return 'linear';
  if (value !== 'linear' && value !== 'smooth') throw new Error(`scenario: unsupported ease '${String(value)}'`);
  return value;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function easeValue(ease: Ease, t: number): number {
  return ease === 'smooth' ? smoothstep(t) : Math.min(1, Math.max(0, t));
}

function easeIntegral(ease: Ease, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return ease === 'smooth' ? u * u * u - 0.5 * u * u * u * u : 0.5 * u * u;
}

type NumKey = 'coverage' | 'densityScale' | 'base' | 'thickness';

function legacyBoundsToMeters(shape: string, bounds: number[], scale: SceneScale): number[] {
  return legacyBoundsToRect(shape, bounds).map((v) => worldToMetersXZ(v, scale));
}

function parseWindDirection(value: unknown, label: string, fallback: number): number {
  return value === undefined ? fallback : normalizeWindDirection(finiteNumber(value, label));
}

function parseWindSpeed(value: unknown, label: string, legacyWind: boolean, scale: SceneScale, fallback: number): number {
  if (value === undefined) return fallback;
  const speed = validateWindSpeedMps(finiteNumber(value, label));
  const speedMps = legacyWind ? speed * scale.horizontalMetersPerWorldUnit : speed;
  if (legacyWind && speedMps > WIND_DEMO_MAX_MPS) {
    console.warn(`scenario: migrated ${label} to unusually high ${speedMps.toFixed(1)} m/s to preserve legacy motion`);
  }
  return speedMps;
}

export function parseScenario(json: string | object, requestedScale: SceneScale = DEFAULT_SCENE_SCALE): Scenario {
  const raw = typeof json === 'string' ? JSON.parse(json) : (json as Record<string, unknown>);
  if (!raw || typeof raw !== 'object') throw new Error('scenario: not an object');
  const r = raw as Record<string, unknown>;
  const duration = finiteNumber(r.duration, 'duration');
  if (duration < 0) throw new Error('scenario: duration must be non-negative');

  const version = r.schemaVersion;
  if (version !== undefined && version !== 2 && version !== 3) {
    throw new Error(`scenario: unsupported schemaVersion '${String(version)}'`);
  }
  const legacyDistance = version === undefined;
  const legacyWind = version !== 3;
  if (!legacyDistance && r.distanceUnit !== 'm') {
    throw new Error(`scenario: unsupported distanceUnit '${String(r.distanceUnit)}'`);
  }
  if (version === 3 && r.windUnit !== 'm/s') {
    throw new Error(`scenario: unsupported windUnit '${String(r.windUnit)}'`);
  }
  const scale = normalizedSceneScale(requestedScale);

  const rawBodies = (r.bodies ?? r.regions) as Record<string, Record<string, unknown>> | undefined;
  if (!rawBodies || typeof rawBodies !== 'object' || Array.isArray(rawBodies)) throw new Error('scenario: missing bodies');
  if (!Array.isArray(r.events)) throw new Error('scenario: missing events');

  const bodies: Record<string, ScenarioBody> = {};
  for (const id of Object.keys(rawBodies)) {
    const sb = rawBodies[id];
    if (!sb || typeof sb !== 'object') throw new Error(`scenario: invalid body '${id}'`);
    const legacyShape = String(sb.shape ?? 'rect');
    const rawBounds = Array.isArray(sb.bounds) ? sb.bounds.map((value, index) => finiteNumber(value, `body '${id}' bounds[${index}]`)) : [0, 0, 0, 0];
    const rawFeather = optionalFiniteNumber(sb.feather, `body '${id}' feather`) ?? 1.5;
    const rawBase = optionalFiniteNumber(sb.base, `body '${id}' base`) ?? 0;
    const rawThickness = optionalFiniteNumber(sb.thickness, `body '${id}' thickness`) ?? 3.2;
    bodies[id] = {
      shape: 'rect',
      bounds: legacyDistance ? legacyBoundsToMeters(legacyShape, rawBounds, scale) : legacyBoundsToRect(legacyShape, rawBounds),
      feather: legacyDistance ? worldToMetersXZ(rawFeather, scale) : rawFeather,
      base: legacyDistance ? worldToMetersY(rawBase, scale) : rawBase,
      thickness: legacyDistance ? worldToMetersY(rawThickness, scale) : rawThickness,
      type: (sb.type as string) ?? 'cumulus',
    };
  }

  let wind: Scenario['wind'];
  if (r.wind !== undefined) {
    if (!r.wind || typeof r.wind !== 'object') throw new Error('scenario: invalid wind');
    const rawWind = r.wind as Record<string, unknown>;
    wind = {
      dirDeg: parseWindDirection(rawWind.dirDeg, 'wind.dirDeg', 0),
      speed: parseWindSpeed(rawWind.speed, 'wind.speed', legacyWind, scale, 0),
    };
  }

  const events: ScenarioEvent[] = (r.events as Array<Record<string, unknown>>).map((rawEvent, index) => {
    if (!rawEvent || typeof rawEvent !== 'object') throw new Error(`scenario: invalid event ${index}`);
    const bodyId = (rawEvent.bodyId ?? rawEvent.regionId) as string;
    const eventTime = finiteNumber(rawEvent.t, `event ${index} t`);
    if (typeof bodyId !== 'string' || !(bodyId in bodies)) {
      throw new Error(`scenario: event bodyId '${String(bodyId)}' not in bodies`);
    }
    if (eventTime < 0 || eventTime > duration) throw new Error(`scenario: event ${index} t outside duration`);
    const event: ScenarioEvent = {
      t: eventTime,
      bodyId,
      ease: normalizeEase(rawEvent.ease),
    };
    const numberFields: NumKey[] = ['coverage', 'densityScale', 'base', 'thickness'];
    for (const key of numberFields) {
      const value = optionalFiniteNumber(rawEvent[key], `event ${index} ${key}`);
      if (value !== undefined) event[key] = value;
    }
    if (legacyDistance && event.base !== undefined) event.base = worldToMetersY(event.base, scale);
    if (legacyDistance && event.thickness !== undefined) event.thickness = worldToMetersY(event.thickness, scale);
    if (rawEvent.type !== undefined) event.type = String(rawEvent.type);
    if (rawEvent.windDeg !== undefined) event.windDeg = parseWindDirection(rawEvent.windDeg, `event ${index} windDeg`, 0);
    if (rawEvent.windSpeed !== undefined) {
      event.windSpeed = parseWindSpeed(rawEvent.windSpeed, `event ${index} windSpeed`, legacyWind, scale, 0);
    }
    return event;
  });
  events.sort((a, b) => a.t - b.t);

  return {
    schemaVersion: 3,
    distanceUnit: 'm',
    windUnit: 'm/s',
    duration,
    wind,
    bodies,
    events,
  };
}

export function serializeScenario(scenario: Scenario): string {
  return JSON.stringify({ ...scenario, schemaVersion: 3, distanceUnit: 'm', windUnit: 'm/s' }, null, 2);
}

function buildWindTrack(events: readonly ScenarioEvent[], fallbackDeg: number, fallbackSpeedMps: number): WindPoint[] {
  let direction = normalizeWindDirection(fallbackDeg);
  let speed = validateWindSpeedMps(fallbackSpeedMps);
  const points: WindPoint[] = [{ t: 0, velocityMps: windVelocityMps(direction, speed), ease: 'linear', prefixOffsetM: [0, 0] }];

  for (const event of events) {
    if (event.windDeg === undefined && event.windSpeed === undefined) continue;
    if (event.windDeg !== undefined) direction = normalizeWindDirection(event.windDeg);
    if (event.windSpeed !== undefined) speed = validateWindSpeedMps(event.windSpeed);
    const point: WindPoint = {
      t: event.t,
      velocityMps: windVelocityMps(direction, speed),
      ease: event.ease ?? 'linear',
      prefixOffsetM: [0, 0],
    };
    const previous = points[points.length - 1];
    if (Math.abs(previous.t - point.t) <= 1e-8) points[points.length - 1] = point;
    else points.push(point);
  }

  points[0].prefixOffsetM = [0, 0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const span = Math.max(0, b.t - a.t);
    b.prefixOffsetM = [
      a.prefixOffsetM[0] + span * (a.velocityMps[0] + b.velocityMps[0]) * 0.5,
      a.prefixOffsetM[1] + span * (a.velocityMps[1] + b.velocityMps[1]) * 0.5,
    ];
  }
  return points;
}

function sampleWindTrack(points: readonly WindPoint[], time: number): { velocityMps: WindVectorMps; offsetM: [number, number] } {
  const t = Math.max(0, time);
  if (points.length === 1 || t >= points[points.length - 1].t) {
    const last = points[points.length - 1];
    const dt = Math.max(0, t - last.t);
    return {
      velocityMps: last.velocityMps,
      offsetM: [last.prefixOffsetM[0] + last.velocityMps[0] * dt, last.prefixOffsetM[1] + last.velocityMps[1] * dt],
    };
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t < a.t || t > b.t) continue;
    const span = Math.max(1e-8, b.t - a.t);
    const u = Math.min(1, Math.max(0, (t - a.t) / span));
    const mix = easeValue(b.ease, u);
    const integral = easeIntegral(b.ease, u);
    const dvx = b.velocityMps[0] - a.velocityMps[0];
    const dvz = b.velocityMps[1] - a.velocityMps[1];
    return {
      velocityMps: [a.velocityMps[0] + dvx * mix, a.velocityMps[1] + dvz * mix],
      offsetM: [
        a.prefixOffsetM[0] + span * (a.velocityMps[0] * u + dvx * integral),
        a.prefixOffsetM[1] + span * (a.velocityMps[1] * u + dvz * integral),
      ],
    };
  }

  return { velocityMps: points[0].velocityMps, offsetM: [0, 0] };
}

export function createPlayer(scenario: Scenario) {
  const ids = Object.keys(scenario.bodies);
  const byBody: Record<string, ScenarioEvent[]> = {};
  for (const id of ids) byBody[id] = [];
  for (const event of scenario.events) byBody[event.bodyId].push(event);

  const windDeg0 = scenario.wind?.dirDeg ?? 0;
  const windSpeed0 = scenario.wind?.speed ?? 0;
  const windTracks: Record<string, WindPoint[]> = {};
  for (const id of ids) windTracks[id] = buildWindTrack(byBody[id], windDeg0, windSpeed0);

  function sampleField(events: ScenarioEvent[], t: number, key: NumKey, fallback: number): number {
    const points = events.filter((event) => event[key] !== undefined);
    if (points.length === 0) return fallback;
    if (t <= points[0].t) return points[0][key] as number;
    if (t >= points[points.length - 1].t) return points[points.length - 1][key] as number;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (t >= a.t && t <= b.t) {
        const span = Math.max(1e-5, b.t - a.t);
        const u = easeValue(b.ease ?? 'linear', (t - a.t) / span);
        const av = a[key] as number;
        const bv = b[key] as number;
        return av + (bv - av) * u;
      }
    }
    return fallback;
  }

  function sampleType(events: ScenarioEvent[], t: number, fallback: string): string {
    let type = fallback;
    for (const event of events) {
      if (event.type !== undefined && event.t <= t) type = event.type;
    }
    if (type === fallback) {
      const first = events.find((event) => event.type !== undefined);
      if (first) type = first.type as string;
    }
    return type;
  }

  return {
    duration: scenario.duration,
    sample(time: number): ScenarioSample {
      const t = Math.min(scenario.duration, Math.max(0, time));
      const bodies: CloudBody[] = [];
      const windSamples: WindAdvectionSample[] = [];
      for (const id of ids) {
        const source = scenario.bodies[id];
        const events = byBody[id];
        const wind = sampleWindTrack(windTracks[id], t);
        const currentWind = velocityToWind(wind.velocityMps);
        bodies.push({
          id,
          shape: source.shape,
          bounds: source.bounds.slice(),
          feather: source.feather,
          base: sampleField(events, t, 'base', source.base),
          thickness: sampleField(events, t, 'thickness', source.thickness),
          type: sampleType(events, t, source.type),
          placementLocked: true,
          coverage: sampleField(events, t, 'coverage', 0),
          densityScale: sampleField(events, t, 'densityScale', 1),
          windDeg: currentWind.windDeg,
          windSpeedMps: currentWind.windSpeedMps,
          morphRate: 0.05,
          rot: [0, 0, 0],
          life: defaultLife(),
        });
        windSamples.push({ offsetM: wind.offsetM, morphTime: t * 0.05 });
      }
      return { bodies, windSamples };
    },
  };
}

export type ScenarioPlayer = ReturnType<typeof createPlayer>;

export const DEMO_SCENARIO: Scenario = {
  schemaVersion: 3,
  distanceUnit: 'm',
  windUnit: 'm/s',
  duration: 70,
  wind: { dirDeg: 90, speed: 10 },
  bodies: {
    A: { shape: 'rect', bounds: [-3500, -1500, 500, 1500], feather: 1500, base: 1000, thickness: 1500, type: 'cumulus' },
    H: { shape: 'rect', bounds: [-500, -500, 3500, 3500], feather: 1800, base: 7000, thickness: 5000, type: 'cirrus' },
  },
  events: [
    { t: 0, bodyId: 'A', coverage: 0.0, densityScale: 0.0 },
    { t: 12, bodyId: 'A', coverage: 0.75, densityScale: 1.0, ease: 'smooth' },
    { t: 40, bodyId: 'A', coverage: 0.75, densityScale: 1.0 },
    { t: 65, bodyId: 'A', coverage: 0.0, densityScale: 0.0, ease: 'smooth' },
    { t: 0, bodyId: 'H', coverage: 0.4, densityScale: 1.0, windDeg: 80, windSpeed: 20 },
    { t: 70, bodyId: 'H', coverage: 0.4, densityScale: 1.0 },
  ],
};
