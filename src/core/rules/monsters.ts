import { RunState } from '../run';
import { GrubEntity, BurrowerEntity, SpitterEntity, DrifterEntity, ProjectileEntity, NestEntity, dirDelta, Direction } from '../entities';
import { tileAt, setTile, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

// ─── Difficulty helpers ───────────────────────────────────────────────────────

function biomeTier(floor: number): number {
  return Math.floor((floor - 1) / 5);
}

// +10% speed per biome tier
function speedMult(floor: number): number {
  return 1 + biomeTier(floor) * 0.1;
}

// +1 HP every two biome tiers (tiers 2-3 → +1, tiers 4-5 → +2, …)
function hpBonus(floor: number): number {
  return Math.floor(biomeTier(floor) / 2);
}

// ─── Grub ───────────────────────────────────────────────────────────────────

export function makeGrub(id: number, x: number, y: number, floor = 1): GrubEntity {
  return {
    kind: 'grub', id, x, y, hp: tuning.grub.hp + hpBonus(floor),
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null, facing: 'right',
  };
}

// ─── Burrower ────────────────────────────────────────────────────────────────

export function makeBurrower(id: number, x: number, y: number, floor = 1): BurrowerEntity {
  return {
    kind: 'burrower', id, x, y, hp: tuning.burrower.hp + hpBonus(floor),
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
    noDirTimer: 0, isDigging: false, facing: 'right',
  };
}

// ─── Spitter ──────────────────────────────────────────────────────────────────

export function makeSpitter(id: number, x: number, y: number, floor = 1): SpitterEntity {
  return {
    kind: 'spitter', id, x, y, hp: tuning.spitter.hp + hpBonus(floor),
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null,
    fireTimer: tuning.spitter.fireInterval,
    noDirTimer: 0, isDigging: false, facing: 'right',
  };
}

// ─── Drifter ─────────────────────────────────────────────────────────────────

export function makeDrifter(id: number, x: number, y: number, floor = 1): DrifterEntity {
  return {
    kind: 'drifter', id, x, y, hp: tuning.drifter.hp + hpBonus(floor),
    moving: false, moveProgress: 0,
    fromX: x, fromY: y, toX: x, toY: y,
    pathTimer: 0, nextDir: null, facing: 'right',
  };
}

// ─── Main apply functions ─────────────────────────────────────────────────────

export function applyMonsters(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toEvolve: number[] = [];

  for (const e of state.entities) {
    if (e.kind === 'grub') {
      if (updateGrub(state, e, dt)) toEvolve.push(e.id);
    } else if (e.kind === 'burrower') updateBurrower(state, e, dt, events);
    else if (e.kind === 'spitter') updateSpitter(state, e, dt, events);
    else if (e.kind === 'drifter') updateDrifter(state, e, dt);
  }

  for (const id of toEvolve) {
    const grub = state.entities.find((e) => e.id === id) as GrubEntity | undefined;
    if (!grub) continue;
    const burrower = makeBurrower(state.nextId++, grub.x, grub.y, state.floor);
    state.entities = state.entities.filter((e) => e.id !== id).concat([burrower]);
    events.push({ type: 'spawn', kind: 'burrower', x: grub.x, y: grub.y });
  }

  return events;
}

export function applyNests(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toAdd: (GrubEntity | BurrowerEntity | SpitterEntity | NestEntity)[] = [];

  // Replenish destroyed nests — count all nests regardless of surface state
  const nestCount = state.entities.filter((e) => e.kind === 'nest').length
    + toAdd.filter((e) => e.kind === 'nest').length;
  for (let n = nestCount; n < tuning.nest.minNests; n++) {
    const newNest = makeRespawnNest(state);
    if (newNest === null) break;
    toAdd.push(newNest);
  }

  for (const e of state.entities) {
    if (e.kind !== 'nest') continue;

    if (e.surfaceDelay > 0) {
      const tile = tileAt(state.grid, e.x, e.y);
      if (tile !== TileType.Dirt) {
        e.surfaceDelay = 0;
        e.surfacing = true;
      } else {
        e.surfaceDelay -= dt;
        if (e.surfaceDelay <= 0) {
          setTile(state.grid, e.x, e.y, TileType.Empty);
          e.surfacing = true;
        }
      }
      continue;
    }

    if (e.surfacing) {
      e.surfaceFrame += dt * tuning.nest.surfaceAnimSpeed;
      if (e.surfaceFrame >= 13) {
        e.surfaceFrame = 13;
        e.surfacing = false;
        // Stay at surfaced position — teleport will happen after first grub spawns
        e.spawnTimer = tuning.nest.firstSpawnDelay;
      }
      continue;
    }

    // Active nest — spawn grubs on timer (faster at deeper floors)
    e.spawnTimer -= dt;
    if (e.spawnTimer > 0) continue;
    const nestInterval = Math.max(
      tuning.nest.spawnIntervalMin,
      tuning.nest.spawnInterval - Math.floor(state.floor / 5),
    );
    e.spawnTimer = nestInterval;

    const spawnPos = findEmptyAdjacent(state, e.x, e.y);
    if (spawnPos !== null) {
      const grub = makeGrub(state.nextId++, spawnPos.x, spawnPos.y, state.floor);
      toAdd.push(grub);
      e.spawnCount += 1;
      events.push({ type: 'spawn', kind: 'grub', x: spawnPos.x, y: spawnPos.y });

      // Teleport after spawnsPerLocation grubs — then reset and move again
      if (e.spawnCount >= tuning.nest.spawnsPerLocation) {
        e.spawnCount = 0;
        const dest = pickNestTeleportDest(state, e);
        if (dest !== null) {
          e.x = dest.x;
          e.y = dest.y;
        }
      }
    }
  }

  state.entities = state.entities.concat(toAdd);
  return events;
}

// ─── Grub update ─────────────────────────────────────────────────────────────

function updateGrub(state: RunState, grub: GrubEntity, dt: number): boolean {
  if (grub.moving) {
    grub.moveProgress += dt * tuning.grub.speed * speedMult(state.floor);
    if (grub.moveProgress >= 1) {
      grub.x = grub.toX;
      grub.y = grub.toY;
      grub.moving = false;
      grub.moveProgress = 0;
      grub.pathTimer = 0;
    }
    return false;
  }

  // Eat nugget underfoot → evolve into burrower
  const nuggetIdx = state.entities.findIndex((e) => e.kind === 'nugget' && e.x === grub.x && e.y === grub.y);
  if (nuggetIdx !== -1) {
    state.entities = state.entities.filter((_, i) => i !== nuggetIdx);
    return true;
  }

  grub.pathTimer -= dt;
  if (grub.pathTimer <= 0) {
    grub.pathTimer = tuning.grub.pathfindInterval;
    grub.nextDir = bfsNextDir(state, grub.x, grub.y, false);
    if (grub.nextDir === 'left' || grub.nextDir === 'right') grub.facing = grub.nextDir;
  }

  if (grub.nextDir === null) return false;
  tryMoveMonster(state, grub, grub.nextDir, false, () => { grub.nextDir = null; });
  return false;
}

// ─── Burrower update ─────────────────────────────────────────────────────────

function updateBurrower(state: RunState, b: BurrowerEntity, dt: number, _events: GameEvent[]): void {
  if (b.moving) {
    b.moveProgress += dt * tuning.burrower.speed * speedMult(state.floor);
    if (b.moveProgress >= 1) {
      if (b.isDigging) {
        setTile(state.grid, b.toX, b.toY, TileType.Empty);
        b.isDigging = false;
      }
      b.x = b.toX;
      b.y = b.toY;
      b.moving = false;
      b.moveProgress = 0;
      b.pathTimer = 0;
    }
    return;
  }

  b.pathTimer -= dt;
  if (b.pathTimer <= 0) {
    b.pathTimer = tuning.burrower.pathfindInterval;
    b.nextDir = bfsNextDir(state, b.x, b.y, false);
    if (b.nextDir !== null) {
      b.noDirTimer = 0;
      if (b.nextDir === 'left' || b.nextDir === 'right') b.facing = b.nextDir;
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
  if (sp.moving) {
    sp.moveProgress += dt * tuning.spitter.speed * speedMult(state.floor);
    if (sp.moveProgress >= 1) {
      if (sp.isDigging) {
        setTile(state.grid, sp.toX, sp.toY, TileType.Empty);
        sp.isDigging = false;
      }
      sp.x = sp.toX;
      sp.y = sp.toY;
      sp.moving = false;
      sp.moveProgress = 0;
      sp.pathTimer = 0;
    }
    return;
  }

  sp.pathTimer -= dt;
  if (sp.pathTimer <= 0) {
    sp.pathTimer = tuning.spitter.pathfindInterval;
    sp.nextDir = bfsNextDir(state, sp.x, sp.y, false);
    if (sp.nextDir !== null) {
      sp.noDirTimer = 0;
      if (sp.nextDir === 'left' || sp.nextDir === 'right') sp.facing = sp.nextDir;
    } else {
      sp.noDirTimer += tuning.spitter.pathfindInterval;
    }
  }

  if (sp.nextDir !== null) {
    tryMoveMonster(state, sp, sp.nextDir, false, () => { sp.nextDir = null; });
  } else if (sp.noDirTimer >= tuning.spitter.digDelay) {
    const digDir = bfsNextDir(state, sp.x, sp.y, true);
    if (digDir !== null) {
      const { dx, dy } = dirDelta(digDir);
      const tx = sp.x + dx;
      const ty = sp.y + dy;
      const tile = tileAt(state.grid, tx, ty);
      if (tile !== TileType.Bedrock && !isMonsterAt(state, tx, ty, sp.id)) {
        sp.fromX = sp.x; sp.fromY = sp.y;
        sp.toX = tx; sp.toY = ty;
        sp.moving = true; sp.moveProgress = 0;
        sp.isDigging = tile === TileType.Dirt;
      }
    }
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
      events.push({ type: 'pulse-fire', x: sp.x, y: sp.y, dir: fireDir, range: 1 });
    }
  }
}

// ─── Drifter update ───────────────────────────────────────────────────────────

function updateDrifter(state: RunState, d: DrifterEntity, dt: number): void {
  if (d.moving) {
    d.moveProgress += dt * tuning.drifter.speed * speedMult(state.floor);
    if (d.moveProgress >= 1) {
      d.x = d.toX;
      d.y = d.toY;
      d.moving = false;
      d.moveProgress = 0;
      d.pathTimer = 0;
    }
    return;
  }

  d.pathTimer -= dt;
  if (d.pathTimer <= 0) {
    d.pathTimer = tuning.drifter.pathfindInterval;
    // BFS through all non-bedrock tiles (ghosts through dirt)
    d.nextDir = bfsNextDir(state, d.x, d.y, true);
    if (d.nextDir !== null) {
      if (d.nextDir === 'left' || d.nextDir === 'right') d.facing = d.nextDir;
    }
  }

  if (d.nextDir === null) return;

  // Phase through dirt without destroying it
  const { dx, dy } = dirDelta(d.nextDir);
  const tx = d.x + dx;
  const ty = d.y + dy;
  if (tileAt(state.grid, tx, ty) === TileType.Bedrock) return;
  if (isMonsterAt(state, tx, ty, d.id)) return;

  d.fromX = d.x; d.fromY = d.y;
  d.toX = tx; d.toY = ty;
  d.moving = true; d.moveProgress = 0;
  d.nextDir = null;
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
          if (state.player.shield) {
            state.player.shield = false;
          } else {
            state.player.hp -= proj.damage;
          }
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
  const dirs: Direction[] = ['left', 'right'];

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

function pickNestTeleportDest(
  state: RunState,
  nest: NestEntity,
): { x: number; y: number } | null {
  const { grid, player, entities } = state;
  const candidates: { x: number; y: number }[] = [];

  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (tileAt(grid, x, y) !== TileType.Empty) continue;
      if (x === player.x && y === player.y) continue;
      if (Math.abs(x - player.x) + Math.abs(y - player.y) < 4) continue;
      if (entities.some((e) => e.x === x && e.y === y && e.id !== nest.id)) continue;
      candidates.push({ x, y });
    }
  }

  if (candidates.length === 0) return null;
  return candidates[(nest.id * 17 + (state.seed % 100)) % candidates.length];
}

function makeRespawnNest(state: RunState): NestEntity | null {
  const { grid, player, entities } = state;
  const candidates: { x: number; y: number }[] = [];

  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (tileAt(grid, x, y) !== TileType.Dirt) continue;
      if (Math.abs(x - player.x) + Math.abs(y - player.y) < 6) continue;
      if (entities.some((e) => e.x === x && e.y === y)) continue;
      candidates.push({ x, y });
    }
  }

  if (candidates.length === 0) return null;
  const id = state.nextId++;
  const pos = candidates[(id * 17 + state.seed % 1000) % candidates.length];
  const range = tuning.nest.surfaceDelayMax - tuning.nest.surfaceDelayMin;
  const delay = tuning.nest.surfaceDelayMin + (id * 13 + state.seed % 1000) % range;

  return {
    kind: 'nest', id, x: pos.x, y: pos.y,
    hp: tuning.nest.hp,
    spawnTimer: tuning.nest.spawnInterval,
    spawnCount: 0,
    surfaceDelay: delay,
    surfacing: false,
    surfaceFrame: 0,
  };
}
