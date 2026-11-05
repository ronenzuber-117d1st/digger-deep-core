import { RunState } from '../run';
import { NuggetEntity, BagEntity } from '../entities';
import { tileAt, setTile, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyBags(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const toRemove = new Set<number>();
  const toAdd: NuggetEntity[] = [];

  for (const e of state.entities) {
    if (e.kind !== 'bag') continue;
    if (toRemove.has(e.id)) continue;
    const bag = e as BagEntity;

    // Showing bag_landed briefly before shattering into nuggets
    if (bag.breakTimer > 0) {
      bag.breakTimer -= dt;
      if (bag.breakTimer <= 0) {
        toRemove.add(bag.id);
        spawnNuggets(state, bag.x, bag.y, toAdd);
        events.push({ type: 'bag-break', x: bag.x, y: bag.y });
      }
      continue;
    }

    if (!bag.falling) {
      const below = tileAt(state.grid, bag.x, bag.y + 1);
      const bagBelow = findBagAt(state, bag.x, bag.y + 1, toRemove);
      if (below === TileType.Empty && bagBelow === null) {
        bag.pendingFallTimer -= dt;
        if (bag.pendingFallTimer <= 0) {
          bag.falling = true;
          bag.fallProgress = 0;
          events.push({ type: 'bag-fall', x: bag.x, y: bag.y });
        }
      } else {
        bag.pendingFallTimer = tuning.bag.fallDelay;
      }
    }

    if (!bag.falling) continue;

    bag.fallProgress += dt * tuning.bag.fallSpeed;

    let broken = false;
    while (bag.fallProgress >= 1 && !broken) {
      bag.fallProgress -= 1;
      bag.y += 1;
      bag.fallDistance += 1;

      const grubHit = findGrubAt(state, bag.x, bag.y, toRemove);
      if (grubHit !== null) {
        events.push({ type: 'kill', targetId: grubHit.id, kind: grubHit.kind, x: bag.x, y: bag.y, facing: grubHit.facing });
        toRemove.add(grubHit.id);
        toRemove.add(bag.id);
        spawnNuggets(state, bag.x, bag.y, toAdd);
        events.push({ type: 'bag-break', x: bag.x, y: bag.y });
        if (grubHit.kind === 'grub' || grubHit.kind === 'burrower' || grubHit.kind === 'spitter') {
          state.kills++;
          state.killsByType[grubHit.kind] = (state.killsByType[grubHit.kind] ?? 0) + 1;
        }
        broken = true;
        break;
      }

      const playerHere = state.player.x === bag.x && state.player.y === bag.y;
      if (playerHere) {
        damagePlayer(state, events, 'bag', state.runUpgrades.includes('heavyBags') ? 2 : 1);
      }

      const below = tileAt(state.grid, bag.x, bag.y + 1);
      const bagBelow = findBagAt(state, bag.x, bag.y + 1, toRemove);
      const canContinue = below === TileType.Empty && bagBelow === null;
      const canCrush = below === TileType.Dirt
        && state.runUpgrades.includes('heavyBags')
        && !bag.heavyCrushUsed;

      if (canCrush) {
        setTile(state.grid, bag.x, bag.y + 1, TileType.Empty);
        bag.heavyCrushUsed = true;
      } else if (!canContinue) {
        bag.falling = false;
        bag.fallProgress = 0;
        if (bag.fallDistance >= tuning.bag.breakMinFall) {
          bag.breakTimer = tuning.bag.breakDelay;
        } else {
          bag.pendingFallTimer = tuning.bag.fallDelay;
        }
        broken = true;
      }
    }
  }

  state.entities = state.entities
    .filter((e) => !toRemove.has(e.id))
    .concat(toAdd);

  return events;
}

export function applyNuggetTimers(state: RunState, dt: number): void {
  const toRemove: number[] = [];
  for (const e of state.entities) {
    if (e.kind !== 'nugget') continue;
    e.timer -= dt;
    if (e.timer <= 0) toRemove.push(e.id);
  }
  state.entities = state.entities.filter((e) => !toRemove.includes(e.id));
}

const NUGGET_OFFSETS: [number, number][] = [[0, 0]];

function spawnNuggets(state: RunState, x: number, y: number, out: NuggetEntity[]): void {
  for (const [dx, dy] of NUGGET_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (tileAt(state.grid, nx, ny) === TileType.Bedrock) continue;
    out.push({
      kind: 'nugget',
      id: state.nextId++,
      x: nx,
      y: ny,
      timer: tuning.bag.nuggetLifetime,
    });
  }
}

function damagePlayer(
  state: RunState,
  events: GameEvent[],
  source: 'bag' | 'monster' | 'fuel-empty',
  damage = 1,
): void {
  if (state.player.invulTimer > 0) return;
  if (state.player.shield) {
    state.player.shield = false;
  } else {
    state.player.hp -= damage;
  }
  state.player.invulTimer = tuning.player.invulDuration;
  events.push({ type: 'hit', source });
}

function findBagAt(
  state: RunState,
  x: number,
  y: number,
  removed: Set<number>,
): BagEntity | null {
  for (const e of state.entities) {
    if (e.kind === 'bag' && e.x === x && e.y === y && !removed.has(e.id)) {
      return e as BagEntity;
    }
  }
  return null;
}

function findGrubAt(
  state: RunState,
  x: number,
  y: number,
  removed: Set<number>,
): { id: number; kind: 'grub' | 'burrower' | 'spitter'; facing: 'left' | 'right' } | null {
  for (const e of state.entities) {
    if (
      (e.kind === 'grub' || e.kind === 'burrower' || e.kind === 'spitter') &&
      e.x === x && e.y === y && !removed.has(e.id)
    ) {
      return e as { id: number; kind: 'grub' | 'burrower' | 'spitter'; facing: 'left' | 'right' };
    }
  }
  return null;
}
