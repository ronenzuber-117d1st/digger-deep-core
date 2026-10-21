import { RunState } from '../run';
import { GrubEntity, dirDelta, Direction } from '../entities';
import { tileAt, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyMonsters(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];

  for (const e of state.entities) {
    if (e.kind !== 'grub') continue;
    const grub = e as GrubEntity;
    updateGrub(state, grub, dt, events);
  }

  return events;
}

export function applyNests(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toAdd: GrubEntity[] = [];

  for (const e of state.entities) {
    if (e.kind !== 'nest') continue;
    e.spawnTimer -= dt;
    if (e.spawnTimer > 0) continue;
    e.spawnTimer = tuning.nest.spawnInterval;
    if (e.spawnCount >= tuning.nest.maxSpawns) continue;

    const spawnPos = findEmptyAdjacentOrSelf(state, e.x, e.y);
    if (spawnPos !== null) {
      toAdd.push(makeGrub(state.nextId++, spawnPos.x, spawnPos.y));
      e.spawnCount += 1;
      events.push({ type: 'kill', targetId: -e.id, kind: 'grub' });
    }
  }

  state.entities = state.entities.concat(toAdd);
  return events;
}

function updateGrub(
  state: RunState,
  grub: GrubEntity,
  dt: number,
  _events: GameEvent[],
): void {
  if (grub.moving) {
    grub.moveProgress += dt * tuning.grub.speed;
    if (grub.moveProgress >= 1) {
      grub.x = grub.toX;
      grub.y = grub.toY;
      grub.moving = false;
      grub.moveProgress = 0;
    }
    return;
  }

  grub.pathTimer -= dt;
  if (grub.pathTimer <= 0) {
    grub.pathTimer = tuning.grub.pathfindInterval;
    grub.nextDir = bfsNextDir(state, grub.x, grub.y);
  }

  if (grub.nextDir === null) return;
  const { dx, dy } = dirDelta(grub.nextDir);
  const tx = grub.x + dx;
  const ty = grub.y + dy;
  const tile = tileAt(state.grid, tx, ty);
  if (tile !== TileType.Empty && tile !== TileType.Exit) return;

  const otherGrub = findGrubAt(state, tx, ty, grub.id);
  if (otherGrub) return;

  grub.fromX = grub.x; grub.fromY = grub.y;
  grub.toX = tx; grub.toY = ty;
  grub.moving = true; grub.moveProgress = 0;
  grub.nextDir = null;
}

function bfsNextDir(state: RunState, sx: number, sy: number): Direction | null {
  const gx = state.player.x;
  const gy = state.player.y;
  if (sx === gx && sy === gy) return null;

  const key = (x: number, y: number) => y * state.grid.width + x;
  const visited = new Set<number>([key(sx, sy)]);
  const queue: { x: number; y: number; first: Direction }[] = [];

  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  for (const dir of dirs) {
    const { dx, dy } = dirDelta(dir);
    const nx = sx + dx;
    const ny = sy + dy;
    const tile = tileAt(state.grid, nx, ny);
    if (tile === TileType.Empty || tile === TileType.Exit || (nx === gx && ny === gy)) {
      if (!visited.has(key(nx, ny))) {
        visited.add(key(nx, ny));
        queue.push({ x: nx, y: ny, first: dir });
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const { x, y, first } = queue[head++];
    if (x === gx && y === gy) return first;

    for (const dir of dirs) {
      const { dx, dy } = dirDelta(dir);
      const nx = x + dx;
      const ny = y + dy;
      const tile = tileAt(state.grid, nx, ny);
      const k = key(nx, ny);
      if (!visited.has(k) && (tile === TileType.Empty || tile === TileType.Exit || (nx === gx && ny === gy))) {
        visited.add(k);
        queue.push({ x: nx, y: ny, first });
      }
    }
  }

  return null;
}

function findEmptyAdjacentOrSelf(
  state: RunState,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const candidates = [{ x, y }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }];
  for (const pos of candidates) {
    const tile = tileAt(state.grid, pos.x, pos.y);
    if (tile === TileType.Empty || tile === TileType.Exit) {
      if (!findGrubAt(state, pos.x, pos.y, -1)) return pos;
    }
  }
  return null;
}

function findGrubAt(state: RunState, x: number, y: number, excludeId: number): boolean {
  for (const e of state.entities) {
    if (e.kind === 'grub' && e.id !== excludeId && e.x === x && e.y === y) return true;
  }
  return false;
}

export function makeGrub(id: number, x: number, y: number): GrubEntity {
  return {
    kind: 'grub', id, x, y, hp: tuning.grub.hp,
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
  };
}
