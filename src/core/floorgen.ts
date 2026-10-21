import { Grid, createGrid, TileType, setTile } from './grid';
import { RNG } from './rng';

export interface FloorData {
  grid: Grid;
  playerStart: { x: number; y: number };
}

export function generateFloor(_rng: RNG, _floor: number): FloorData {
  const grid = createGrid(30, 17);
  setTile(grid, 0, 0, TileType.Empty);
  setTile(grid, 29, 16, TileType.Exit);
  return { grid, playerStart: { x: 0, y: 0 } };
}
