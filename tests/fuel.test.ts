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

describe('fuel empty: slow-down', () => {
  it('reduces fuelStarveMult as timer advances', () => {
    const state = makeTestState({ fuel: 0 });
    applyFuel(state, tuning.player.fuelStarveSlowDuration / 2);
    expect(state.player.fuelStarveMult).toBeCloseTo(0.5, 3);
  });

  it('clamps fuelStarveMult to 0 when fully starved', () => {
    const state = makeTestState({ fuel: 0 });
    applyFuel(state, tuning.player.fuelStarveSlowDuration + 5);
    expect(state.player.fuelStarveMult).toBe(0);
  });

  it('emits fuel-starved event when fully starved', () => {
    const state = makeTestState({ fuel: 0 });
    const events = applyFuel(state, tuning.player.fuelStarveSlowDuration + 0.01);
    expect(events.some((e) => e.type === 'fuel-starved')).toBe(true);
  });

  it('does not slow when fuel > 0', () => {
    const state = makeTestState({ fuel: 10 });
    applyFuel(state, 1.0);
    expect(state.player.fuelStarveMult).toBe(1);
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
