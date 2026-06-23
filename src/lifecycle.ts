export const DENSITY_SCALE_MAX = 2.0;

export interface LifecycleEnvelope {
  birth: number;
  grow: number;
  mature: number;
  decay: number;
  death: number;
  peakDensity: number;
}

export interface RegionMod {
  coverageMul: number;
  densityScale: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function evalEnvelope(env: LifecycleEnvelope, t: number): number {
  if (t < env.birth || t >= env.death) return 0;
  if (t < env.grow) return smoothstep(env.birth, env.grow, t);
  if (t < env.decay) return 1;
  return 1 - smoothstep(env.decay, env.death, t);
}

export function evalRegionMod(env: LifecycleEnvelope | undefined, t: number): RegionMod {
  if (!env) return { coverageMul: 1, densityScale: 1 };
  const phase = evalEnvelope(env, t);
  return { coverageMul: phase, densityScale: phase * env.peakDensity };
}
