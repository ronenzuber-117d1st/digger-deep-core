import { Grid, TileType, tileAt } from '../core/grid';

export function tileHash(x: number, y: number): number {
  return Math.abs(x * 2654435761 ^ y * 2246822519) >>> 0;
}

export function dirtTileFrame(grid: Grid, x: number, y: number): string {
  const n = tileAt(grid, x, y - 1) === TileType.Empty || tileAt(grid, x, y - 1) === TileType.Exit;
  const e = tileAt(grid, x + 1, y) === TileType.Empty || tileAt(grid, x + 1, y) === TileType.Exit;
  const s = tileAt(grid, x, y + 1) === TileType.Empty || tileAt(grid, x, y + 1) === TileType.Exit;
  const w = tileAt(grid, x - 1, y) === TileType.Empty || tileAt(grid, x - 1, y) === TileType.Exit;
  const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
  const variant = `dirt_${tileHash(x, y) % 4}`;

  switch (mask) {
    case 0:  return variant;
    case 1:  return 'edge_n';
    case 2:  return 'edge_e';
    case 3:  return 'corner_ne';
    case 4:  return 'edge_s';
    case 5:  return variant;      // exposed N+S — thin horizontal strip
    case 6:  return 'corner_se';
    case 7:  return 'concave_sw'; // exposed N,E,S → inner corner at SW
    case 8:  return 'edge_w';
    case 9:  return 'corner_nw';
    case 10: return variant;      // exposed E+W — thin vertical strip
    case 11: return 'concave_se'; // exposed N,E,W → inner corner at SE
    case 12: return 'corner_sw';
    case 13: return 'concave_ne'; // exposed N,S,W → inner corner at NE
    case 14: return 'concave_nw'; // exposed E,S,W → inner corner at NW
    case 15: return variant;      // isolated dirt block
    default: return 'dirt_0';
  }
}

export function emptyTileFrame(grid: Grid, x: number, y: number): string {
  const dn = tileAt(grid, x, y - 1) === TileType.Dirt;
  const de = tileAt(grid, x + 1, y) === TileType.Dirt;
  const ds = tileAt(grid, x, y + 1) === TileType.Dirt;
  const dw = tileAt(grid, x - 1, y) === TileType.Dirt;
  const dirtMask = (dn ? 1 : 0) | (de ? 2 : 0) | (ds ? 4 : 0) | (dw ? 8 : 0);

  // Corridor variants: letters name the SOLID sides
  switch (dirtMask) {
    case 5:  return 'corridor_ns';  // dirt N+S, open E+W
    case 10: return 'corridor_ew';  // dirt E+W, open N+S
    case 7:  return 'corridor_nes'; // dirt N+E+S, only W open
    case 11: return 'corridor_new'; // dirt N+E+W, only S open
    case 13: return 'corridor_nsw'; // dirt N+S+W, only E open
    case 14: return 'corridor_esw'; // dirt E+S+W, only N open
    case 15: return 'corridor_all'; // dirt all sides
    default: {
      // N/W cast shadow rule: solid north or west → use shadowed floor
      const solidN = tileAt(grid, x, y - 1) !== TileType.Empty && tileAt(grid, x, y - 1) !== TileType.Exit;
      const solidW = tileAt(grid, x - 1, y) !== TileType.Empty && tileAt(grid, x - 1, y) !== TileType.Exit;
      return (solidN || solidW) ? 'floor_shadowed' : 'floor';
    }
  }
}
