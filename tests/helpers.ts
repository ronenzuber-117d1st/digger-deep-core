import { RunState } from '../src/core/run';
import { createGrid, setTile, TileType } from '../src/core/grid';
import { createPlayer, Entity } from '../src/core/entities';

export function makeTestState(
  overrides: Partial<{
    playerX: number;
    playerY: number;
    playerHp: number;
    fuel: number;
    entities: Entity[];
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

  const player = createPlayer(
    overrides.playerX ?? 1,
    overrides.playerY ?? 1,
    overrides.playerHp ?? 3,
    overrides.fuel ?? 100,
  );

  return {
    seed: 42,
    floor: 1,
    grid,
    player,
    entities: overrides.entities ?? [],
    nextId: 100,
    phase: 'playing',
  };
}
