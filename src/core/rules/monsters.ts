import { RunState } from '../run';
import { GrubEntity, BurrowerEntity, SpitterEntity, ProjectileEntity, dirDelta, Direction } from '../entities';
import { tileAt, setTile, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

// ─── Grub ───────────────────────────────────────────────────────────────────

export function makeGrub(id: number, x: number, y: number): GrubEntity {
  return {
    kind: 'grub', id, x, y, hp: tuning.grub.hp,
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
  };
}

// ─── Burrower ────────────────────────────────────────────────────────────────

export function makeBurrower(id: number, x: number, y: number): BurrowerEntity {
  return {
    kind: 'burrower', id, x, y, hp: tuning.burrower.hp,
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
    noDirTimer: 0, isDigging: false,
  };
}

// ─── Spitter ──────────────────────────────────────────────────────────────────

export function makeSpitter(id: number, x: number, y: number): SpitterEntity {
  return {
    kind: 'spitter', id, x, y, hp: tuning.spitter.hp,
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
    fireTimer: tuning.spitter.fireInterval,
  };
}

// ─── Main apply functions ─────────────────────────────────────────────────────

export function applyMonsters(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];

  for (const e of state.entities) {
    if (e.kind === 'grub') updateGrub(state, e, dt);
    else if (e.kind === 'burrower') updateBurrower(state, e, dt, events);
    else if (e.kind === 'spitter') updateSpitter(state, e, dt, events);
  }

  return events;
}

export function applyNests(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toAdd: (GrubEntity | BurrowerEntity | SpitterEntity)[] = [];

  for (const e of state.entities) {
    if (e.kind !== 'nest') continue;
    e.spawnTimer -= dt;
    if (e.spawnTimer > 0) continue;
    e.spawnTimer = tuning.nest.spawnInterval;
    if (e.spawnCount >= tuning.nest.maxSpawns) continue;

    const spawnPos = findEmptyAdjacent(state, e.x, e.y);
    if (spawnPos !== null) {
      const grub = makeGrub(state.nextId++, spawnPos.x, spawnPos.y);
      toAdd.push(grub);
      e.spawnCount += 1;
      events.push({ type: 'spawn', kind: 'grub', x: spawnPos.x, y: spawnPos.y });
    }
  }

  state.entities = state.entities.concat(toAdd);
  return events;
}

// ─── Grub update ─────────────────────────────────────────────────────────────

function updateGrub(state: RunState, grub: GrubEntity, dt: number): void {
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
    grub.nextDir = bfsNextDir(state, grub.x, grub.y, false);
  }

  if (grub.nextDir === null) return;
  tryMoveMonster(state, grub, grub.nextDir, false, () => { grub.nextDir = null; });
}

// ─── Burrower update ─────────────────────────────────────────────────────────

function updateBurrower(state: RunState, b: BurrowerEntity, dt: number, _events: GameEvent[]): void {
  if (b.moving) {
    b.moveProgress += dt * tuning.burrower.speed;
    if (b.moveProgress >= 1) {
      if (b.isDigging) {
        setTile(state.grid, b.toX, b.toY, TileType.Empty);
        b.isDigging = false;
      }
      b.x = b.toX;
      b.y = b.toY;
      b.moving = false;
      b.moveProgress = 0;
    }
    return;
  }

  b.pathTimer -= dt;
  if (b.pathTimer <= 0) {
    b.pathTimer = tuning.burrower.pathfindInterval;
    b.nextDir = bfsNextDir(state, b.x, b.y, false);
    if (b.nextDir !== null) {
      b.noDirTimer = 0;
    } else {
      b.noDirTimer += tuning.burrower.pathfindInterval;
    }
  }

  if (b.nextDir !== null) {
    tryMoveMonster(state, b, b.nextDir, false, () => { b.nextDir = null; });
    return;
  }

  // No open path — check if we should dig
  if (b.noDirTimer < tuning.burrower.digDelay) return;

  // Pick a direction toward the player, digging through dirt
  const digDir = bfsNextDir(state, b.x, b.y, true);
  if (digDir === null) return;

  const { dx, dy } = dirDelta(digDir);
  const tx = b.x + dx;
  const ty = b.y + dy;
  const tile = tileAt(state.grid, tx, ty);

  if (tile === TileType.Bedrock) return;

  if (isMonsterAt(state, tx, ty, b.id)) return;

  b.fromX = b.x; b.fromY = b.y;
  b.toX = tx; b.toY = ty;
  b.moving = true; b.moveProgress = 0;
  b.isDigging = tile === TileType.Dirt;
}

// ─── Spitter update ───────────────────────────────────────────────────────────

function updateSpitter(state: RunState, sp: SpitterEntity, dt: number, events: GameEvent[]): void {
  // Movement: chases player through tunnels (not dirt)
  if (sp.moving) {
    sp.moveProgress += dt * tuning.spitter.speed;
    if (sp.moveProgress >= 1) {
      sp.x = sp.toX;
      sp.y = sp.toY;
      sp.moving = false;
      sp.moveProgress = 0;
    }
    return;
  }

  sp.pathTimer -= dt;
  if (sp.pathTimer <= 0) {
    sp.pathTimer = tuning.spitter.pathfindInterval;
    sp.nextDir = bfsNextDir(state, sp.x, sp.y, false);
  }

  if (sp.nextDir !== null) {
    tryMoveMonster(state, sp, sp.nextDir, false, () => { sp.nextDir = null; });
  }

  // Fire logic
  sp.fireTimer -= dt;
  if (sp.fireTimer <= 0) {
    sp.fireTimer = tuning.spitter.fireInterval;
    const fireDir = getLineOfSightDir(state, sp.x, sp.y);
    if (fireDir !== null) {
      const proj: ProjectileEntity = {
        kind: 'projectile',
        id: state.nextId++,
        x: sp.x,
        y: sp.y,
        dir: fireDir,
        moveProgress: 0,
        damage: tuning.spitter.damage,
        ownerId: sp.id,
      };
      state.entities = [...state.entities, proj];
      events.push({ type: 'pulse-fire', x: sp.x, y: sp.y, dir: fireDir });
    }
  }
}

// ─── Projectile update ───────────────────────────────────────────────────────

export function applyProjectiles(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toRemove = new Set<number>();

  for (const e of state.entities) {
    if (e.kind !== 'projectile') continue;
    if (toRemove.has(e.id)) continue;
    const proj = e;

    proj.moveProgress += dt * tuning.spitter.projectileSpeed;

    while (proj.moveProgress >= 1 && !toRemove.has(proj.id)) {
      proj.moveProgress -= 1;
      const { dx, dy } = dirDelta(proj.dir);
      proj.x += dx;
      proj.y += dy;

      const tile = tileAt(state.grid, proj.x, proj.y);
      if (tile === TileType.Bedrock || tile === TileType.Dirt) {
        toRemove.add(proj.id);
        break;
      }

      // Hit player
      if (state.player.x === proj.x && state.player.y === proj.y) {
        if (state.player.invulTimer <= 0) {
          state.player.hp -= proj.damage;
          state.player.invulTimer = tuning.player.invulDuration;
          events.push({ type: 'hit', source: 'monster' });
        }
        toRemove.add(proj.id);
        break;
      }
    }
  }

  state.entities = state.entities.filter((e) => !toRemove.has(e.id));
  return events;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function tryMoveMonster(
  state: RunState,
  monster: { x: number; y: number; fromX: number; fromY: number; toX: number; toY: number; moving: boolean; moveProgress: number; id: number },
  dir: Direction,
  canDig: boolean,
  onMoved: () => void,
): void {
  const { dx, dy } = dirDelta(dir);
  const tx = monster.x + dx;
  const ty = monster.y + dy;
  const tile = tileAt(state.grid, tx, ty);
  if (tile === TileType.Bedrock) return;
  if (!canDig && tile === TileType.Dirt) return;
  if (tile !== TileType.Empty && tile !== TileType.Exit && !canDig) return;
  if (isMonsterAt(state, tx, ty, monster.id)) return;

  monster.fromX = monster.x; monster.fromY = monster.y;
  monster.toX = tx; monster.toY = ty;
  monster.moving = true; monster.moveProgress = 0;
  onMoved();
}

function bfsNextDir(state: RunState, sx: number, sy: number, canDig: boolean): Direction | null {
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
    const passable = tile === TileType.Empty || tile === TileType.Exit || (canDig && tile === TileType.Dirt) || (nx === gx && ny === gy);
    if (passable && !visited.has(key(nx, ny))) {
      visited.add(key(nx, ny));
      queue.push({ x: nx, y: ny, first: dir });
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
      const passable = tile === TileType.Empty || tile === TileType.Exit || (canDig && tile === TileType.Dirt) || (nx === gx && ny === gy);
      if (!visited.has(k) && passable) {
        visited.add(k);
        queue.push({ x: nx, y: ny, first });
      }
    }
  }

  return null;
}

function getLineOfSightDir(state: RunState, sx: number, sy: number): Direction | null {
  const px = state.player.x;
  const py = state.player.y;
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];

  for (const dir of dirs) {
    const { dx, dy } = dirDelta(dir);
    let x = sx + dx;
    let y = sy + dy;

    while (true) {
      const tile = tileAt(state.grid, x, y);
      if (tile === TileType.Bedrock || tile === TileType.Dirt) break;
      if (x === px && y === py) return dir;
      x += dx;
      y += dy;
    }
  }

  return null;
}

function isMonsterAt(state: RunState, x: number, y: number, excludeId: number): boolean {
  for (const e of state.entities) {
    if (e.id === excludeId) continue;
    if ((e.kind === 'grub' || e.kind === 'burrower' || e.kind === 'spitter') && e.x === x && e.y === y) {
      return true;
    }
  }
  return false;
}

function findEmptyAdjacent(
  state: RunState,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const candidates = [{ x, y }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }];
  for (const pos of candidates) {
    const tile = tileAt(state.grid, pos.x, pos.y);
    if (tile === TileType.Empty || tile === TileType.Exit) {
      if (!isMonsterAt(state, pos.x, pos.y, -1)) return pos;
    }
  }
  return null;
}
