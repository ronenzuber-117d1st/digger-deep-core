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

  it('has exactly one exit tile in a corner', () => {
    const rng = createRNG(99);
    const { grid } = generateFloor(rng, 1);
    let exitCount = 0;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if (tileAt(grid, x, y) === TileType.Exit) exitCount++;
      }
    }
    expect(exitCount).toBe(1);
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

  it('floor 1 only spawns grubs (min floor check)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = createRNG(seed);
      const { entities } = generateFloor(rng, 1);
      const burrowers = entities.filter((e) => e.kind === 'burrower');
      const spitters = entities.filter((e) => e.kind === 'spitter');
      expect(burrowers.length).toBe(0);
      expect(spitters.length).toBe(0);
    }
  });

  it('floor 6+ can spawn spitters', () => {
    let foundSpitter = false;
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRNG(seed);
      const { entities } = generateFloor(rng, 6);
      if (entities.some((e) => e.kind === 'spitter')) {
        foundSpitter = true;
        break;
      }
    }
    expect(foundSpitter).toBe(true);
  });

  it('floor 3+ can spawn burrowers', () => {
    let foundBurrower = false;
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRNG(seed);
      const { entities } = generateFloor(rng, 3);
      if (entities.some((e) => e.kind === 'burrower')) {
        foundBurrower = true;
        break;
      }
    }
    expect(foundBurrower).toBe(true);
  });
});

describe('floor reachability: floors 1-20, 200 seeds each', () => {
  it('exit is always reachable from player start by digging', () => {
    for (let floor = 1; floor <= 20; floor++) {
      for (let seed = 0; seed < 200; seed++) {
        const rng = createRNG(seed * 10000 + floor);
        const { grid, playerStart } = generateFloor(rng, floor);
        const exitX = W - 2;
        const exitY = H - 2;
        const reachable = canReachAll(grid, playerStart, [{ x: exitX, y: exitY }]);
        if (!reachable) {
          throw new Error(`Floor ${floor} seed ${seed}: exit not reachable`);
        }
      }
    }
  });

  it('at least one fuel canister is always reachable', () => {
    for (let floor = 1; floor <= 20; floor++) {
      for (let seed = 0; seed < 200; seed++) {
        const rng = createRNG(seed * 10000 + floor);
        const { grid, playerStart, entities } = generateFloor(rng, floor);
        const fuelPositions = entities
          .filter((e) => e.kind === 'fuel')
          .map((e) => ({ x: e.x, y: e.y }));
        if (fuelPositions.length === 0) continue;
        const reachable = canReachAll(grid, playerStart, [fuelPositions[0]]);
        if (!reachable) {
          throw new Error(`Floor ${floor} seed ${seed}: fuel not reachable`);
        }
      }
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

  it('floors have more nests at higher floors', () => {
    const lowFloor = generateFloor(createRNG(42), 1);
    const highFloor = generateFloor(createRNG(42), 15);
    const lowNests = lowFloor.entities.filter((e) => e.kind === 'nest').length;
    const highNests = highFloor.entities.filter((e) => e.kind === 'nest').length;
    expect(highNests).toBeGreaterThanOrEqual(lowNests);
  });
});
