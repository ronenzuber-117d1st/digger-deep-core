export const TILE_SIZE = 16;

export enum TileType {
  Empty = 0,
  Dirt = 1,
  Bedrock = 2,
  Exit = 3,
}

export interface Grid {
  width: number;
  height: number;
  tiles: TileType[];
}

export function createGrid(width: number, height: number): Grid {
  return { width, height, tiles: new Array<TileType>(width * height).fill(TileType.Dirt) };
}

export function tileAt(grid: Grid, x: number, y: number): TileType {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return TileType.Bedrock;
  return grid.tiles[y * grid.width + x];
}

export function setTile(grid: Grid, x: number, y: number, tile: TileType): void {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  grid.tiles[y * grid.width + x] = tile;
}

export function isSolid(tile: TileType): boolean {
  return tile === TileType.Bedrock || tile === TileType.Dirt;
}

export function isDiggable(tile: TileType): boolean {
  return tile === TileType.Dirt;
}

export function neighbours(
  grid: Grid,
  x: number,
  y: number,
): { x: number; y: number; tile: TileType }[] {
  return [
    { x, y: y - 1 },
    { x, y: y + 1 },
    { x: x - 1, y },
    { x: x + 1, y },
  ]
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height)
    .map((p) => ({ ...p, tile: tileAt(grid, p.x, p.y) }));
}
