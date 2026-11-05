import { describe, it, expect } from 'vitest';
import { upgradeCost, deathPayout, extractionPayout, isExtractionFloor } from '../src/core/economy';

describe('upgradeCost', () => {
  it('level 0 cheap = 60', () => {
    expect(upgradeCost('cheap', 0)).toBe(60);
  });

  it('level 1 cheap = floor(60 * 1.6) = 96', () => {
    expect(upgradeCost('cheap', 1)).toBe(96);
  });

  it('level 0 mid = 90', () => {
    expect(upgradeCost('mid', 0)).toBe(90);
  });

  it('level 0 expensive = 150', () => {
    expect(upgradeCost('expensive', 0)).toBe(150);
  });

  it('cost grows exponentially', () => {
    const c0 = upgradeCost('mid', 0);
    const c1 = upgradeCost('mid', 1);
    const c2 = upgradeCost('mid', 2);
    expect(c1).toBeGreaterThan(c0);
    expect(c2).toBeGreaterThan(c1);
  });

  it('uses 1.6 exponent base', () => {
    const cost = upgradeCost('mid', 2);
    expect(cost).toBe(Math.floor(90 * Math.pow(1.6, 2)));
  });
});

describe('deathPayout', () => {
  it('base: keep 0% (no salvage contract)', () => {
    expect(deathPayout(100, 0)).toBe(0);
  });

  it('salvage 1: keep 15%', () => {
    expect(deathPayout(100, 1)).toBe(15);
  });

  it('salvage 3: keep 45%', () => {
    expect(deathPayout(100, 3)).toBe(45);
  });

  it('salvage 5: keep 75%', () => {
    expect(deathPayout(100, 5)).toBe(75);
  });

  it('salvage cap at 100%', () => {
    expect(deathPayout(100, 10)).toBe(100);
  });

  it('floors the result', () => {
    expect(deathPayout(101, 1)).toBe(15);
  });
});

describe('extractionPayout', () => {
  it('keeps 100%', () => {
    expect(extractionPayout(200)).toBe(200);
  });
});

describe('isExtractionFloor', () => {
  it('floors 5/10/15/20 are extraction floors', () => {
    expect(isExtractionFloor(5)).toBe(true);
    expect(isExtractionFloor(10)).toBe(true);
    expect(isExtractionFloor(15)).toBe(true);
    expect(isExtractionFloor(20)).toBe(true);
  });

  it('other floors are not extraction floors', () => {
    expect(isExtractionFloor(1)).toBe(false);
    expect(isExtractionFloor(3)).toBe(false);
    expect(isExtractionFloor(7)).toBe(false);
  });
});
