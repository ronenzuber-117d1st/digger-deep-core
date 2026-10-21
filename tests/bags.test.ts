import { describe, it, expect } from 'vitest';
import { applyBags, applyNuggetTimers } from '../src/core/rules/bags';
import { applyMovement } from '../src/core/rules/movement';
import { makeTestState } from './helpers';
import { BagEntity, GrubEntity, NuggetEntity } from '../src/core/entities';
import { setTile, TileType } from '../src/core/grid';
import tuning from '../src/data/tuning.json';

function makeBag(id: number, x: number, y: number): BagEntity {
  return { kind: 'bag', id, x, y, falling: false, fallProgress: 0, fallDistance: 0 };
}

function makeGrub(id: number, x: number, y: number): GrubEntity {
  return {
    kind: 'grub', id, x, y, hp: 2,
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
  };
}

describe('bag: fall detection', () => {
  it('starts falling when tile below is empty', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 3)] });
    applyBags(state, 0.001);
    const bag = state.entities[0] as BagEntity;
    expect(bag.falling).toBe(true);
  });

  it('does not fall when tile below is solid dirt', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 3)] });
    setTile(state.grid, 3, 4, TileType.Dirt);
    applyBags(state, 0.001);
    const bag = state.entities[0] as BagEntity;
    expect(bag.falling).toBe(false);
  });

  it('does not fall when another bag is below', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 3), makeBag(2, 3, 4)] });
    setTile(state.grid, 3, 5, TileType.Dirt);
    applyBags(state, 0.001);
    const bag = state.entities.find((e) => e.id === 1) as BagEntity;
    expect(bag.falling).toBe(false);
  });
});

describe('bag: fall distance and break', () => {
  it('stays intact after falling 1 tile', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 2)] });
    setTile(state.grid, 3, 4, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    applyBags(state, dtPerTile * 1.1);
    const bag = state.entities.find((e) => e.id === 1);
    expect(bag).toBeDefined();
    expect((bag as BagEntity).falling).toBe(false);
    expect((bag as BagEntity).fallDistance).toBe(1);
  });

  it('breaks after falling 2 tiles and spawns nuggets', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 2)] });
    setTile(state.grid, 3, 5, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    applyBags(state, dtPerTile * 2.2);
    const bag = state.entities.find((e) => e.id === 1);
    expect(bag).toBeUndefined();
    const nuggets = state.entities.filter((e) => e.kind === 'nugget');
    expect(nuggets.length).toBe(tuning.bag.nuggetsOnBreak);
  });

  it('each nugget has correct timer', () => {
    const state = makeTestState({ entities: [makeBag(1, 3, 2)] });
    setTile(state.grid, 3, 5, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    applyBags(state, dtPerTile * 2.2);
    const nuggets = state.entities.filter((e) => e.kind === 'nugget') as NuggetEntity[];
    for (const n of nuggets) {
      expect(n.timer).toBeCloseTo(tuning.bag.nuggetLifetime, 0);
    }
  });
});

describe('bag: monster kill', () => {
  it('kills grub it lands on and breaks', () => {
    const grub = makeGrub(2, 3, 3);
    const state = makeTestState({ entities: [makeBag(1, 3, 2), grub] });
    setTile(state.grid, 3, 4, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    const events = applyBags(state, dtPerTile * 1.1);

    const grubRemaining = state.entities.find((e) => e.id === 2);
    expect(grubRemaining).toBeUndefined();

    const bagRemoved = state.entities.find((e) => e.id === 1);
    expect(bagRemoved).toBeUndefined();

    expect(events.some((ev) => ev.type === 'kill')).toBe(true);
    expect(events.some((ev) => ev.type === 'bag-break')).toBe(true);
  });
});

describe('bag: player damage', () => {
  it('damages player when bag lands on them', () => {
    const state = makeTestState({ playerX: 3, playerY: 3, entities: [makeBag(1, 3, 2)] });
    setTile(state.grid, 3, 4, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    applyBags(state, dtPerTile * 1.1);
    expect(state.player.hp).toBe(2);
  });

  it('does not damage player while invulnerable', () => {
    const state = makeTestState({ playerX: 3, playerY: 3, entities: [makeBag(1, 3, 2)] });
    state.player.invulTimer = 1.0;
    setTile(state.grid, 3, 4, TileType.Dirt);
    const dtPerTile = 1 / tuning.bag.fallSpeed;
    applyBags(state, dtPerTile * 1.1);
    expect(state.player.hp).toBe(3);
  });
});

describe('bag: push', () => {
  it('movement rule pushes bag to adjacent empty tile', () => {
    const state = makeTestState({ playerX: 2, playerY: 3, entities: [makeBag(1, 3, 3)] });
    applyMovement(state, { moveRight: true, moveUp: false, moveDown: false, moveLeft: false, pause: false }, 1);
    const bag = state.entities.find((e) => e.id === 1) as BagEntity;
    expect(bag.x).toBe(4);
  });
});

describe('nugget: timer', () => {
  it('nugget vanishes after its lifetime expires', () => {
    const nugget: NuggetEntity = { kind: 'nugget', id: 1, x: 3, y: 3, timer: 0.1 };
    const state = makeTestState({ entities: [nugget] });
    applyNuggetTimers(state, 0.2);
    expect(state.entities.find((e) => e.id === 1)).toBeUndefined();
  });

  it('nugget persists while timer is still positive', () => {
    const nugget: NuggetEntity = { kind: 'nugget', id: 1, x: 3, y: 3, timer: 5.0 };
    const state = makeTestState({ entities: [nugget] });
    applyNuggetTimers(state, 0.5);
    expect(state.entities.find((e) => e.id === 1)).toBeDefined();
  });
});
