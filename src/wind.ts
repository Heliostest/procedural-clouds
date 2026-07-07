import type { CloudBody } from './body';

export type WindVectorMps = readonly [number, number];
export type WindOffsetM = readonly [number, number];
export const WIND_DEMO_MAX_MPS = 80;

export interface WindAdvectionSample {
  offsetM: WindOffsetM;
  morphTime: number;
}

interface MutableWindState {
  offsetM: [number, number];
  morphTime: number;
}

export function normalizeWindDirection(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error('wind direction must be finite');
  return ((degrees % 360) + 360) % 360;
}

export function validateWindSpeedMps(speedMps: number): number {
  if (!Number.isFinite(speedMps) || speedMps < 0) {
    throw new Error('wind speed must be a finite non-negative number');
  }
  return speedMps;
}

export function windVelocityMps(directionDegToward: number, speedMps: number): WindVectorMps {
  const rad = normalizeWindDirection(directionDegToward) * Math.PI / 180;
  const speed = validateWindSpeedMps(speedMps);
  return [Math.cos(rad) * speed, Math.sin(rad) * speed];
}

export function velocityToWind(velocityMps: WindVectorMps): { windDeg: number; windSpeedMps: number } {
  const [x, z] = velocityMps;
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('wind velocity must be finite');
  const windSpeedMps = Math.hypot(x, z);
  const windDeg = windSpeedMps <= Number.EPSILON
    ? 0
    : normalizeWindDirection(Math.atan2(z, x) * 180 / Math.PI);
  return { windDeg, windSpeedMps };
}

function createState(): MutableWindState {
  return { offsetM: [0, 0], morphTime: 0 };
}

export interface WindAdvectionController {
  advance(bodies: readonly CloudBody[], deltaSceneSeconds: number): void;
  sample(bodyId: string): WindAdvectionSample;
  samples(bodies: readonly CloudBody[]): WindAdvectionSample[];
  reset(bodyId?: string): void;
}

export function createWindAdvectionController(): WindAdvectionController {
  const states = new Map<string, MutableWindState>();

  function synchronize(bodies: readonly CloudBody[]): void {
    const liveIds = new Set(bodies.map((body) => body.id));
    for (const id of states.keys()) {
      if (!liveIds.has(id)) states.delete(id);
    }
    for (const body of bodies) {
      if (!states.has(body.id)) states.set(body.id, createState());
    }
  }

  return {
    advance(bodies, deltaSceneSeconds) {
      synchronize(bodies);
      if (!Number.isFinite(deltaSceneSeconds) || deltaSceneSeconds <= 0) return;
      for (const body of bodies) {
        const state = states.get(body.id) as MutableWindState;
        const velocity = windVelocityMps(body.windDeg, body.windSpeedMps);
        state.offsetM[0] += velocity[0] * deltaSceneSeconds;
        state.offsetM[1] += velocity[1] * deltaSceneSeconds;
        if (Number.isFinite(body.morphRate)) {
          state.morphTime += Math.max(0, body.morphRate) * deltaSceneSeconds;
        }
      }
    },
    sample(bodyId) {
      if (!states.has(bodyId)) states.set(bodyId, createState());
      const state = states.get(bodyId) as MutableWindState;
      return { offsetM: [state.offsetM[0], state.offsetM[1]], morphTime: state.morphTime };
    },
    samples(bodies) {
      synchronize(bodies);
      return bodies.map((body) => {
        const state = states.get(body.id) as MutableWindState;
        return { offsetM: [state.offsetM[0], state.offsetM[1]], morphTime: state.morphTime };
      });
    },
    reset(bodyId) {
      if (bodyId === undefined) {
        states.clear();
      } else {
        states.set(bodyId, createState());
      }
    },
  };
}

export function zeroWindSamples(count: number): WindAdvectionSample[] {
  return Array.from({ length: count }, () => ({ offsetM: [0, 0], morphTime: 0 }));
}
