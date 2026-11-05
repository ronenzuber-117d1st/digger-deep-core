import { Grid, createGrid, TileType, setTile, tileAt } from './grid';
import { RNG, nextInt } from './rng';
import {
  Entity,
  BagEntity,
  GemEntity,
  FuelEntity,
  NestEntity,
} from './entities';
import { makeGrub, makeBurrower, makeSpitter, makeDrifter } from './rules/monsters';
import tuning from '../data/tuning.json';
import monsterDefs from '../data/monsters.json';

export interface FloorData {
  grid: Grid;
  playerStart: { x: number; y: number };
  entities: Entity[];
  startNextId: number;
}

const W = tuning.floor.width;
const H = tuning.floor.height;

type MonsterKind = 'grub' | 'burrower' | 'spitter' | 'drifter';

// Grid-maze corridor carver.
// Divides the interior into a 6×5 grid of nodes, then randomly connects adjacent
// nodes with 1-tile-wide passages (75% horizontal, 65% vertical probability).
// Each node is jittered ±1 tile so the grid is irregular per seed.
function carveCorridors(grid: Grid, rng: RNG): void {
  const COLS = 6;
  const ROWS = 5;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 0; c <= COLS; c++) {
    const base = 1 + Math.round(c * (W - 2) / COLS);
    xs.push(Math.max(1, Math.min(W - 2, base + nextInt(rng, -1, 2))));
  }
  for (let r = 0; r <= ROWS; r++) {
    const base = 1 + Math.round(r * (H - 2) / ROWS);
    ys.push(Math.max(1, Math.min(H - 2, base + nextInt(rng, -1, 2))));
  }

  // Horizontal segments between horizontally-adjacent nodes (75% chance each)
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (nextInt(rng, 0, 4) < 3) {
        const y = ys[r];
        for (let x = xs[c]; x <= xs[c + 1]; x++) {
          if (tileAt(grid, x, y) !== TileType.Bedrock) setTile(grid, x, y, TileType.Empty);
        }
      }
    }
  }

  // Vertical segments between vertically-adjacent nodes (65% chance each)
  for (let c = 0; c <= COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (nextInt(rng, 0, 20) < 13) {
        const x = xs[c];
        for (let y = ys[r]; y <= ys[r + 1]; y++) {
          if (tileAt(grid, x, y) !== TileType.Bedrock) setTile(grid, x, y, TileType.Empty);
        }
      }
    }
  }
}

function buildMonsterPool(floor: number): MonsterKind[] {
  const pool: MonsterKind[] = [];
  for (const def of monsterDefs) {
    if (floor >= def.minFloor) {
      pool.push(def.id as MonsterKind);
    }
  }
  return pool;
}

function pickMonster(rng: RNG, pool: MonsterKind[]): MonsterKind {
  return pool[nextInt(rng, 0, pool.length)];
}

export function generateFloor(rng: RNG, floor: number): FloorData {
  const grid = createGrid(W, H);
  let nextId = 1;
  const entities: Entity[] = [];

  for (let x = 0; x < W; x++) {
    setTile(grid, x, 0, TileType.Bedrock);
    setTile(grid, x, H - 1, TileType.Bedrock);
  }
  for (let y = 0; y < H; y++) {
    setTile(grid, 0, y, TileType.Bedrock);
    setTile(grid, W - 1, y, TileType.Bedrock);
  }

  // Carve corridors before placing items so items stay embedded in dirt
  carveCorridors(grid, rng);

  const playerStart = { x: 1, y: 1 };
  setTile(grid, 1, 1, TileType.Empty);

  // Pick exit from 3 corners (not top-left where player starts)
  const exitCorners = [
    { x: W - 2, y: 1,     clearDx: -1, clearDy: 0 },  // top-right
    { x: 1,     y: H - 2, clearDx: 1,  clearDy: 0 },  // bottom-left
    { x: W - 2, y: H - 2, clearDx: -1, clearDy: 0 },  // bottom-right
  ];
  const exitCorner = exitCorners[nextInt(rng, 0, exitCorners.length)];
  const exitX = exitCorner.x;
  const exitY = exitCorner.y;
  setTile(grid, exitX, exitY, TileType.Exit);
  setTile(grid, exitX + exitCorner.clearDx, exitY + exitCorner.clearDy, TileType.Empty);

  const occupied = new Set<number>();
  const markOccupied = (x: number, y: number) => occupied.add(y * W + x);
  const isOccupied = (x: number, y: number) => occupied.has(y * W + x);

  markOccupied(1, 1);
  markOccupied(exitX, exitY);
  markOccupied(exitX - 1, exitY);

  // Items pick only from dirt tiles so they stay embedded (not floating in corridors)
  const pickInDirt = (tries = 80): { x: number; y: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = nextInt(rng, 1, W - 1);
      const y = nextInt(rng, 1, H - 1);
      if (!isOccupied(x, y) && tileAt(grid, x, y) === TileType.Dirt) return { x, y };
    }
    return null;
  };

  // Nests and monsters can go anywhere (they carve their own tile if needed)
  const pickInterior = (tries = 50): { x: number; y: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = nextInt(rng, 1, W - 1);
      const y = nextInt(rng, 1, H - 1);
      if (!isOccupied(x, y)) return { x, y };
    }
    return null;
  };

  // Bags need horizontal clearance from walls, vertical room to fall,
  // and no two bags in the same column (prevents stacking). Must be in dirt.
  const bagColumns = new Set<number>();
  const pickBagPosition = (tries = 80): { x: number; y: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = nextInt(rng, 2, W - 2);
      const y = nextInt(rng, 1, H - 3);
      if (!isOccupied(x, y) && !bagColumns.has(x) && tileAt(grid, x, y) === TileType.Dirt) return { x, y };
    }
    return null;
  };

  const fuelCount = nextInt(rng, tuning.fuel.perFloorMin, tuning.fuel.perFloorMax + 1);
  for (let i = 0; i < fuelCount; i++) {
    const pos = pickInDirt();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    const fuel: FuelEntity = { kind: 'fuel', id: nextId++, x: pos.x, y: pos.y };
    entities.push(fuel);
  }

  const bagCount = nextInt(rng, tuning.bag.perFloorMin, tuning.bag.perFloorMax + 1);
  for (let i = 0; i < bagCount; i++) {
    const pos = pickBagPosition();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    bagColumns.add(pos.x);
    const bag: BagEntity = {
      kind: 'bag', id: nextId++, x: pos.x, y: pos.y,
      falling: false, fallProgress: 0, fallDistance: 0,
      pendingFallTimer: 0, heavyCrushUsed: false, breakTimer: 0,
    };
    entities.push(bag);
  }

  for (let i = 0; i < tuning.gem.perFloor; i++) {
    const pos = pickInDirt();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    const gem: GemEntity = { kind: 'gem', id: nextId++, x: pos.x, y: pos.y };
    entities.push(gem);
  }

  const nestCount = tuning.nest.perFloorBase + Math.floor(floor / tuning.nest.perFloorScale);
  for (let i = 0; i < nestCount; i++) {
    const pos = pickInDirt();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    // First 3 nests surface quickly; the rest emerge later for surprise
    const delay = i < 3
      ? nextInt(rng, 0, tuning.nest.surfaceDelayQuick + 1)
      : nextInt(rng, tuning.nest.surfaceDelayMin, tuning.nest.surfaceDelayMax + 1);
    const nest: NestEntity = {
      kind: 'nest', id: nextId++, x: pos.x, y: pos.y,
      hp: tuning.nest.hp,
      spawnTimer: tuning.nest.spawnInterval,
      spawnCount: 0,
      surfaceDelay: delay,
      surfacing: false,
      surfaceFrame: 0,
    };
    entities.push(nest);
  }

  const monsterPool = buildMonsterPool(floor);
  const monsterCount = Math.min(1 + Math.floor(floor / 5), 6);
  for (let i = 0; i < monsterCount; i++) {
    const monsterStart = pickInterior();
    if (monsterStart === null) break;
    markOccupied(monsterStart.x, monsterStart.y);
    setTile(grid, monsterStart.x, monsterStart.y, TileType.Empty);
    const kind = pickMonster(rng, monsterPool);
    switch (kind) {
      case 'grub':
        entities.push(makeGrub(nextId++, monsterStart.x, monsterStart.y, floor));
        break;
      case 'burrower':
        entities.push(makeBurrower(nextId++, monsterStart.x, monsterStart.y, floor));
        break;
      case 'spitter':
        entities.push(makeSpitter(nextId++, monsterStart.x, monsterStart.y, floor));
        break;
      case 'drifter':
        entities.push(makeDrifter(nextId++, monsterStart.x, monsterStart.y, floor));
        break;
    }
  }

  return { grid, playerStart, entities, startNextId: nextId };
}

export function canReachAll(
  grid: Grid,
  start: { x: number; y: number },
  targets: { x: number; y: number }[],
): boolean {
  if (targets.length === 0) return true;

  const key = (x: number, y: number) => y * grid.width + x;
  const visited = new Set<number>([key(start.x, start.y)]);
  const queue: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
  const remaining = new Set(targets.map((t) => key(t.x, t.y)));

  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  let head = 0;
  while (head < queue.length) {
    const { x, y } = queue[head++];
    remaining.delete(key(x, y));
    if (remaining.size === 0) return true;

    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      const tile = tileAt(grid, nx, ny);
      if (tile === TileType.Bedrock) continue;
      visited.add(k);
      queue.push({ x: nx, y: ny });
    }
  }

  return remaining.size === 0;
}
