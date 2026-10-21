export interface RNG {
  state: number;
}

export function createRNG(seed: number): RNG {
  return { state: seed >>> 0 };
}

export function nextFloat(rng: RNG): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(rng.state ^ (rng.state >>> 15), 1 | rng.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RNG, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min));
}
