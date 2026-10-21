import { describe, it, expect } from 'vitest';
import { generateFloor, canReachAll } from '../src/core/floorgen';
import { createRNG } from '../src/core/rng';
import { tileAt, TileType } from '../src/core/grid';
import tuning from '../src/data/tuning.json';

const W = tuning.floor.width;
const H = tuning.floor.height;

describe('floor generation: structure', () => {
  it('produces a floor of the correct size', () => {
    const rng = createRNG(1);
    const { grid } = generateFloor(rng, 1);
    expect(grid.width).toBe(W);
    expect(grid.height).toBe(H);
  });

  it('has bedrock border on all edges', () => {
    const rng = createRNG(42);
    const { grid } = generateFloor(rng, 1);
    for (let x = 0; x < W; x++) {
      expect(tileAt(grid, x, 0)).toBe(TileType.Bedrock);
      expect(tileAt(grid, x, H - 1)).toBe(TileType.Bedrock);
    }
    for (let y = 0; y < H; y++) {
      expect(tileAt(grid, 0, y)).toBe(TileType.Bedrock);
      expect(tileAt(grid, W - 1, y)).toBe(TileType.Bedrock);
    }
  });

  it('has an exit tile at the bottom-right area', () => {
    const rng = createRNG(99);
    const { grid } = generateFloor(rng, 1);
    let hasExit = false;
    for (let x = W - 5; x < W; x++) {
      for (let y = H - 5; y < H; y++) {
        if (tileAt(grid, x, y) === TileType.Exit) hasExit = true;
      }
    }
    expect(hasExit).toBe(true);
  });

  it('places the player start in the top-left area', () => {
    const rng = createRNG(7);
    const { playerStart } = generateFloor(rng, 1);
    expect(playerStart.x).toBeLessThanOrEqual(5);
    expect(playerStart.y).toBeLessThanOrEqual(5);
  });

  it('places fuel canisters', () => {
    const rng = createRNG(55);
    const { entities } = generateFloor(rng, 1);
    const fuels = entities.filter((e) => e.kind === 'fuel');
    expect(fuels.length).toBeGreaterThanOrEqual(tuning.fuel.perFloorMin);
    expect(fuels.length).toBeLessThanOrEqual(tuning.fuel.perFloorMax);
  });

  it('places bags in the configured range', () => {
    const rng = createRNG(123);
    const { entities } = generateFloor(rng, 1);
    const bags = entities.filter((e) => e.kind === 'bag');
    expect(bags.length).toBeGreaterThanOrEqual(tuning.bag.perFloorMin);
    expect(bags.length).toBeLessThanOrEqual(tuning.bag.perFloorMax);
  });
});

describe('floor reachability: 1000 seeds', () => {
  it('exit is always reachable from player start by digging', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const rng = createRNG(seed);
      const { grid, playerStart } = generateFloor(rng, 1);
      const exitX = W - 2;
      const exitY = H - 2;
      const reachable = canReachAll(grid, playerStart, [{ x: exitX, y: exitY }]);
      expect(reachable).toBe(true);
    }
  });

  it('at least one fuel canister is always reachable from player start', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const rng = createRNG(seed);
      const { grid, playerStart, entities } = generateFloor(rng, 1);
      const fuelPositions = entities
        .filter((e) => e.kind === 'fuel')
        .map((e) => ({ x: e.x, y: e.y }));
      if (fuelPositions.length === 0) continue;
      const reachable = canReachAll(grid, playerStart, [fuelPositions[0]]);
      expect(reachable).toBe(true);
    }
  });
});

describe('seed determinism', () => {
  it('same seed produces same floor', () => {
    const a = generateFloor(createRNG(12345), 1);
    const b = generateFloor(createRNG(12345), 1);
    expect(a.grid.tiles).toEqual(b.grid.tiles);
    expect(a.playerStart).toEqual(b.playerStart);
    expect(a.entities.length).toBe(b.entities.length);
  });

  it('different seeds produce different floors', () => {
    const a = generateFloor(createRNG(1), 1);
    const b = generateFloor(createRNG(2), 1);
    expect(a.entities.length !== b.entities.length || JSON.stringify(a.entities) !== JSON.stringify(b.entities)).toBe(true);
  });
});
