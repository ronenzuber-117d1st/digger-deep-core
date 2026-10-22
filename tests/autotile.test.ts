import { describe, it, expect } from 'vitest';
import { createGrid, setTile, TileType } from '../src/core/grid';
import { dirtTileFrame, emptyTileFrame, tileHash } from '../src/render/autotile';

function makeGrid(tiles: string[]): ReturnType<typeof createGrid> {
  // tiles: array of strings, each char: '#'=Dirt, '.'=Empty, 'B'=Bedrock, 'X'=Exit
  const height = tiles.length;
  const width = tiles[0].length;
  const g = createGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = tiles[y][x];
      const t = ch === '.' ? TileType.Empty
        : ch === 'B' ? TileType.Bedrock
        : ch === 'X' ? TileType.Exit
        : TileType.Dirt;
      setTile(g, x, y, t);
    }
  }
  return g;
}

describe('dirtTileFrame', () => {
  it('fully enclosed dirt returns a dirt_N variant', () => {
    const g = makeGrid([
      '###',
      '###',
      '###',
    ]);
    const f = dirtTileFrame(g, 1, 1);
    expect(f).toMatch(/^dirt_[0-3]$/);
  });

  it('dirt exposed to north returns edge_n', () => {
    const g = makeGrid([
      '...',
      '###',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('edge_n');
  });

  it('dirt exposed to south returns edge_s', () => {
    const g = makeGrid([
      '###',
      '###',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('edge_s');
  });

  it('dirt exposed to east returns edge_e', () => {
    const g = makeGrid([
      '###',
      '##.',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('edge_e');
  });

  it('dirt exposed to west returns edge_w', () => {
    const g = makeGrid([
      '###',
      '.##',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('edge_w');
  });

  it('dirt exposed to N+E returns corner_ne', () => {
    const g = makeGrid([
      '...',
      '##.',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('corner_ne');
  });

  it('dirt exposed to N+W returns corner_nw', () => {
    const g = makeGrid([
      '...',
      '.##',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('corner_nw');
  });

  it('dirt exposed to S+E returns corner_se', () => {
    const g = makeGrid([
      '###',
      '##.',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('corner_se');
  });

  it('dirt exposed to S+W returns corner_sw', () => {
    const g = makeGrid([
      '###',
      '.##',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('corner_sw');
  });

  it('dirt exposed to N+E+S returns concave_sw', () => {
    const g = makeGrid([
      '...',
      '##.',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('concave_sw');
  });

  it('dirt exposed to N+S+W returns concave_ne', () => {
    const g = makeGrid([
      '...',
      '.##',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('concave_ne');
  });

  it('dirt exposed to E+S+W returns concave_nw', () => {
    const g = makeGrid([
      '###',
      '.#.',
      '...',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('concave_nw');
  });

  it('dirt exposed to N+E+W returns concave_se', () => {
    const g = makeGrid([
      '...',
      '.#.',
      '###',
    ]);
    expect(dirtTileFrame(g, 1, 1)).toBe('concave_se');
  });
});

describe('emptyTileFrame', () => {
  it('open floor with no solid neighbours returns floor', () => {
    const g = makeGrid([
      '...',
      '...',
      '...',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('floor');
  });

  it('floor with dirt to north returns floor_shadowed', () => {
    const g = makeGrid([
      '###',
      '...',
      '...',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('floor_shadowed');
  });

  it('floor with dirt to west returns floor_shadowed', () => {
    const g = makeGrid([
      '...',
      '#..',
      '...',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('floor_shadowed');
  });

  it('floor with dirt to south-east only returns floor (no N/W shadow)', () => {
    const g = makeGrid([
      '...',
      '..#',
      '.##',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('floor');
  });

  it('N+S dirt walls → corridor_ns', () => {
    const g = makeGrid([
      '###',
      '...',
      '###',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('corridor_ns');
  });

  it('E+W dirt walls → corridor_ew', () => {
    const g = makeGrid([
      '...',
      '#.#',
      '...',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('corridor_ew');
  });

  it('N+E+S dirt walls (dead-end west) → corridor_nes', () => {
    const g = makeGrid([
      '###',
      '..#',
      '###',
    ]);
    expect(emptyTileFrame(g, 1, 1)).toBe('corridor_nes');
  });
});

describe('tileHash', () => {
  it('returns consistent values for same inputs', () => {
    expect(tileHash(3, 7)).toBe(tileHash(3, 7));
  });

  it('returns different values for different inputs', () => {
    expect(tileHash(0, 0)).not.toBe(tileHash(1, 0));
    expect(tileHash(0, 0)).not.toBe(tileHash(0, 1));
  });

  it('result is always in range 0..3 when modded by 4', () => {
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        expect(tileHash(x, y) % 4).toBeGreaterThanOrEqual(0);
        expect(tileHash(x, y) % 4).toBeLessThan(4);
      }
    }
  });
});
