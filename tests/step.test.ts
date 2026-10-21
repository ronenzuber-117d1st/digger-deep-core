import { describe, it, expect } from 'vitest';
import { step } from '../src/core/step';
import { makeTestState } from './helpers';
import { emptyInput } from '../src/input/actions';
import { setTile, TileType } from '../src/core/grid';

describe('step: determinism', () => {
  it('same seed + same inputs = same result after many steps', () => {
    const s1 = makeTestState();
    const s2 = makeTestState();
    const input = emptyInput();
    const dt = 1 / 60;

    for (let i = 0; i < 300; i++) {
      const r1 = step(s1, input, dt);
      const r2 = step(s2, input, dt);
      Object.assign(s1, r1.state);
      Object.assign(s2, r2.state);
    }

    expect(s1.player.fuel).toBeCloseTo(s2.player.fuel, 5);
    expect(s1.player.hp).toBe(s2.player.hp);
    expect(s1.entities.length).toBe(s2.entities.length);
  });
});

describe('step: death transition', () => {
  it('transitions to dead phase when hp is 0', () => {
    const state = makeTestState({ playerHp: 1, fuel: 0 });
    state.player.hp = 0;
    const result = step(state, emptyInput(), 1 / 60);
    expect(result.state.phase).toBe('dead');
    expect(result.events.some((e) => e.type === 'death')).toBe(true);
  });
});

describe('step: floor-clear transition', () => {
  it('transitions to floor-clear when player reaches exit', () => {
    const state = makeTestState({ playerX: 8, playerY: 8 });
    setTile(state.grid, 8, 8, TileType.Exit);
    const result = step(state, emptyInput(), 1 / 60);
    expect(result.state.phase).toBe('floor-clear');
  });
});

describe('step: no-op when not playing', () => {
  it('dead phase does not drain fuel', () => {
    const state = makeTestState({ fuel: 100 });
    state.phase = 'dead';
    const fuelBefore = state.player.fuel;
    step(state, emptyInput(), 1 / 60);
    expect(state.player.fuel).toBe(fuelBefore);
  });
});
