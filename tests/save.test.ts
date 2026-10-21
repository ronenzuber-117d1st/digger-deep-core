import { describe, it, expect } from 'vitest';
import { migrate, createFreshSave, SAVE_VERSION } from '../src/core/save';

describe('save migration', () => {
  it('null/undefined returns fresh save', () => {
    expect(migrate(null).version).toBe(SAVE_VERSION);
    expect(migrate(undefined).version).toBe(SAVE_VERSION);
    expect(migrate('corrupt').version).toBe(SAVE_VERSION);
  });

  it('current version passes through with defaults merged', () => {
    const fresh = createFreshSave();
    fresh.emeralds = 500;
    fresh.upgrades.hull = 2;
    const result = migrate(fresh);
    expect(result.emeralds).toBe(500);
    expect(result.upgrades.hull).toBe(2);
    expect(result.upgrades.fuelTank).toBe(0);
  });

  it('v1 migrates: totalEmeralds → emeralds, bestFloor preserved', () => {
    const v1 = {
      version: 1,
      totalEmeralds: 300,
      bestFloor: 7,
      upgrades: { hull: 1 },
    };
    const result = migrate(v1);
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.emeralds).toBe(300);
    expect(result.stats.bestFloor).toBe(7);
    expect(result.upgrades.hull).toBe(1);
    expect(result.storyFlags).toEqual([]);
  });

  it('unknown version returns fresh save', () => {
    const result = migrate({ version: 99, emeralds: 999 });
    expect(result.version).toBe(SAVE_VERSION);
    expect(result.emeralds).toBe(0);
  });

  it('partial upgrades object does not throw', () => {
    const partial = {
      version: SAVE_VERSION,
      emeralds: 50,
      upgrades: { hull: 3 },
      stats: {},
      storyFlags: [],
      settings: {},
    };
    const result = migrate(partial);
    expect(result.upgrades.hull).toBe(3);
    expect(result.upgrades.fuelTank).toBe(0);
    expect(result.stats.runs).toBe(0);
    expect(result.settings.shake).toBe(true);
  });

  it('storyFlags array preserved', () => {
    const data = { ...createFreshSave(), storyFlags: ['intro', 'firstDeath'] };
    const result = migrate(data);
    expect(result.storyFlags).toEqual(['intro', 'firstDeath']);
  });
});
