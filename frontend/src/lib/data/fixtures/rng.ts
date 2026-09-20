/**
 * Deterministic pseudo-random numbers.
 *
 * This is a correctness requirement, not just reproducibility. Fixtures are
 * evaluated during server rendering and again on the client; `Math.random()`
 * or `Date.now()` would produce different values on each pass and trigger a
 * React hydration mismatch. Every generated fixture flows from a fixed seed.
 */

/** mulberry32: small, fast, good enough distribution for scattering debris. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Approximately normal via sum of three uniforms, clamped to +/-1 then scaled. */
  gaussian(mean: number, spread: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    gaussian: (mean, spread) => {
      const sum = next() + next() + next();
      return mean + ((sum / 1.5) - 1) * spread;
    },
    pick: (items) => items[Math.floor(next() * items.length)],
  };

  return rng;
}

/**
 * Frozen simulation epoch. Everything time-dependent in Phase 1 derives from
 * this instead of the wall clock, so renders are byte-identical.
 */
export const SIM_EPOCH_ISO = "2026-09-19T12:00:00.000Z";
export const SIM_EPOCH_MS = Date.parse(SIM_EPOCH_ISO);
