import { describe, it, expect } from 'vitest';
import { createRNG, nextFloat, nextInt } from '../src/core/rng';

describe('RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = createRNG(12345);
    const b = createRNG(12345);
    expect(nextFloat(a)).toBe(nextFloat(b));
    expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('produces different values for different seeds', () => {
    const a = createRNG(1);
    const b = createRNG(2);
    expect(nextFloat(a)).not.toBe(nextFloat(b));
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt returns values in [min, max)', () => {
    const rng = createRNG(999);
    for (let i = 0; i < 100; i++) {
      const v = nextInt(rng, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});
