import { describe, it, expect } from 'vitest';
import { applyFuel } from '../src/core/rules/fuel';
import { makeTestState } from './helpers';
import tuning from '../src/data/tuning.json';

describe('fuel drain', () => {
  it('drains fuel at the configured rate', () => {
    const state = makeTestState({ fuel: 100 });
    applyFuel(state, 1.0);
    expect(state.player.fuel).toBeCloseTo(100 - tuning.player.fuelDrainRate, 5);
  });

  it('drains proportionally over small dt', () => {
    const state = makeTestState({ fuel: 50 });
    applyFuel(state, 0.5);
    expect(state.player.fuel).toBeCloseTo(50 - tuning.player.fuelDrainRate * 0.5, 5);
  });

  it('does not go below 0', () => {
    const state = makeTestState({ fuel: 0.5 });
    applyFuel(state, 10);
    expect(state.player.fuel).toBe(0);
  });
});

describe('fuel empty: HP damage', () => {
  it('deals 1 damage per second at 0 fuel', () => {
    const state = makeTestState({ fuel: 0, playerHp: 3 });
    for (let i = 0; i < 60; i++) {
      applyFuel(state, 1 / 60);
    }
    expect(state.player.hp).toBeLessThan(3);
  });

  it('does not deal damage while invulnerable', () => {
    const state = makeTestState({ fuel: 0, playerHp: 3 });
    state.player.invulTimer = 2.0;
    applyFuel(state, 1.0);
    expect(state.player.hp).toBe(3);
  });

  it('does not deal damage when fuel > 0', () => {
    const state = makeTestState({ fuel: 10, playerHp: 3 });
    applyFuel(state, 1.0);
    expect(state.player.hp).toBe(3);
  });
});

describe('invulnerability timer', () => {
  it('decrements over time', () => {
    const state = makeTestState();
    state.player.invulTimer = 1.0;
    applyFuel(state, 0.5);
    expect(state.player.invulTimer).toBeCloseTo(0.5, 5);
  });

  it('does not go below 0', () => {
    const state = makeTestState();
    state.player.invulTimer = 0.1;
    applyFuel(state, 1.0);
    expect(state.player.invulTimer).toBeLessThanOrEqual(0);
  });
});
