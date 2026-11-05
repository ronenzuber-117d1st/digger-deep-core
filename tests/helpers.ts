import { RunState } from '../src/core/run';
import { createGrid, setTile, TileType } from '../src/core/grid';
import { createPlayer, Entity } from '../src/core/entities';

export function makeTestState(
  overrides: Partial<{
    playerX: number;
    playerY: number;
    playerHp: number;
    maxHp: number;
    fuel: number;
    maxFuel: number;
    entities: Entity[];
    floor: number;
  }> = {},
): RunState {
  const grid = createGrid(10, 10);
  for (let x = 0; x < 10; x++) {
    setTile(grid, x, 0, TileType.Bedrock);
    setTile(grid, x, 9, TileType.Bedrock);
    setTile(grid, 0, x, TileType.Bedrock);
    setTile(grid, 9, x, TileType.Bedrock);
  }
  for (let x = 1; x < 9; x++) {
    for (let y = 1; y < 9; y++) {
      setTile(grid, x, y, TileType.Empty);
    }
  }

  const hp = overrides.playerHp ?? 3;
  const maxHp = overrides.maxHp ?? hp;
  const fuel = overrides.fuel ?? 100;
  const maxFuel = overrides.maxFuel ?? fuel;

  const player = createPlayer(overrides.playerX ?? 1, overrides.playerY ?? 1, hp, maxHp, fuel, maxFuel);

  return {
    seed: 42,
    floor: overrides.floor ?? 1,
    grid,
    player,
    entities: overrides.entities ?? [],
    nextId: 100,
    phase: 'playing',
    kills: 0,
    killsByType: {},
    runUpgrades: [],
    secondWindUsed: false,
    magnetTimer: 0,
    fuelStarveTimer: 0,
    echoPingAvailable: true,
    echoPingTimer: 0,
    tileBombAvailable: true,
  };
}
