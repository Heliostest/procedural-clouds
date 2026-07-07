export const SIMULATION_RATES = [0, 1, 2, 4] as const;

export type SimulationRate = (typeof SIMULATION_RATES)[number];

export interface SimulationState {
  rate: SimulationRate;
}

export const DEFAULT_SIMULATION_RATE: SimulationRate = 1;

export function isSimulationRate(value: number): value is SimulationRate {
  return SIMULATION_RATES.some((rate) => rate === value);
}

export function validateSimulationRate(value: number): SimulationRate {
  if (!isSimulationRate(value)) {
    throw new Error(`simulation rate must be one of ${SIMULATION_RATES.join(', ')}, got ${value}`);
  }
  return value;
}

export function scaledSimulationDelta(wallDeltaSeconds: number, rate: SimulationRate): number {
  if (!Number.isFinite(wallDeltaSeconds) || wallDeltaSeconds < 0) {
    throw new Error(`wall delta must be a finite non-negative number, got ${wallDeltaSeconds}`);
  }
  return wallDeltaSeconds * validateSimulationRate(rate);
}
