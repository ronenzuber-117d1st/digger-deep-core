import { Grid, createGrid, TileType, setTile, tileAt } from './grid';
import { RNG, nextInt } from './rng';
import {
  Entity,
  BagEntity,
  GemEntity,
  FuelEntity,
  NestEntity,
} from './entities';
import { makeGrub, makeBurrower, makeSpitter } from './rules/monsters';
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

type MonsterKind = 'grub' | 'burrower' | 'spitter';

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

  const playerStart = { x: 1, y: 1 };
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      setTile(grid, 1 + dx, 1 + dy, TileType.Empty);
    }
  }

  const exitX = W - 2;
  const exitY = H - 2;
  setTile(grid, exitX, exitY, TileType.Exit);
  setTile(grid, exitX - 1, exitY, TileType.Empty);

  const occupied = new Set<number>();
  const markOccupied = (x: number, y: number) => occupied.add(y * W + x);
  const isOccupied = (x: number, y: number) => occupied.has(y * W + x);

  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 2; dy++) markOccupied(1 + dx, 1 + dy);
  }
  markOccupied(exitX, exitY);
  markOccupied(exitX - 1, exitY);

  const pickInterior = (tries = 50): { x: number; y: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = nextInt(rng, 1, W - 1);
      const y = nextInt(rng, 1, H - 1);
      if (!isOccupied(x, y)) return { x, y };
    }
    return null;
  };

  const fuelCount = nextInt(rng, tuning.fuel.perFloorMin, tuning.fuel.perFloorMax + 1);
  for (let i = 0; i < fuelCount; i++) {
    const pos = pickInterior();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    setTile(grid, pos.x, pos.y, TileType.Empty);
    const fuel: FuelEntity = { kind: 'fuel', id: nextId++, x: pos.x, y: pos.y };
    entities.push(fuel);
  }

  const bagCount = nextInt(rng, tuning.bag.perFloorMin, tuning.bag.perFloorMax + 1);
  for (let i = 0; i < bagCount; i++) {
    const pos = pickInterior();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    setTile(grid, pos.x, pos.y, TileType.Empty);
    const bag: BagEntity = {
      kind: 'bag', id: nextId++, x: pos.x, y: pos.y,
      falling: false, fallProgress: 0, fallDistance: 0,
      pendingFallTimer: tuning.bag.fallDelay,
    };
    entities.push(bag);
  }

  for (let i = 0; i < tuning.gem.perFloor; i++) {
    const pos = pickInterior();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    setTile(grid, pos.x, pos.y, TileType.Empty);
    const gem: GemEntity = { kind: 'gem', id: nextId++, x: pos.x, y: pos.y };
    entities.push(gem);
  }

  const nestCount = tuning.nest.perFloorBase + Math.floor(floor / tuning.nest.perFloorScale);
  for (let i = 0; i < nestCount; i++) {
    const pos = pickInterior();
    if (pos === null) break;
    markOccupied(pos.x, pos.y);
    setTile(grid, pos.x, pos.y, TileType.Empty);
    const nest: NestEntity = {
      kind: 'nest', id: nextId++, x: pos.x, y: pos.y,
      hp: tuning.nest.hp,
      spawnTimer: tuning.nest.spawnInterval,
      spawnCount: 0,
    };
    entities.push(nest);
  }

  const monsterPool = buildMonsterPool(floor);
  const monsterStart = pickInterior();
  if (monsterStart !== null) {
    markOccupied(monsterStart.x, monsterStart.y);
    setTile(grid, monsterStart.x, monsterStart.y, TileType.Empty);
    const kind = pickMonster(rng, monsterPool);
    switch (kind) {
      case 'grub':
        entities.push(makeGrub(nextId++, monsterStart.x, monsterStart.y));
        break;
      case 'burrower':
        entities.push(makeBurrower(nextId++, monsterStart.x, monsterStart.y));
        break;
      case 'spitter':
        entities.push(makeSpitter(nextId++, monsterStart.x, monsterStart.y));
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
