import { RunState } from '../run';
import { NuggetEntity, BagEntity } from '../entities';
import { tileAt, TileType } from '../grid';
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

    if (!bag.falling) {
      const below = tileAt(state.grid, bag.x, bag.y + 1);
      const bagBelow = findBagAt(state, bag.x, bag.y + 1, toRemove);
      if (below === TileType.Empty && bagBelow === null) {
        bag.falling = true;
        bag.fallProgress = 0;
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
        events.push({ type: 'kill', targetId: grubHit.id, kind: grubHit.kind });
        toRemove.add(grubHit.id);
        toRemove.add(bag.id);
        spawnNuggets(state, bag.x, bag.y, toAdd);
        events.push({ type: 'bag-break', x: bag.x, y: bag.y });
        if (grubHit.kind === 'grub' || grubHit.kind === 'burrower' || grubHit.kind === 'spitter') {
          state.kills++;
        }
        broken = true;
        break;
      }

      const playerHere = state.player.x === bag.x && state.player.y === bag.y;
      if (playerHere) {
        damagePlayer(state, events, 'bag');
      }

      const below = tileAt(state.grid, bag.x, bag.y + 1);
      const bagBelow = findBagAt(state, bag.x, bag.y + 1, toRemove);
      const canContinue = below === TileType.Empty && bagBelow === null;

      if (!canContinue) {
        if (bag.fallDistance >= tuning.bag.breakMinFall) {
          toRemove.add(bag.id);
          spawnNuggets(state, bag.x, bag.y, toAdd);
          events.push({ type: 'bag-break', x: bag.x, y: bag.y });
        } else {
          bag.falling = false;
          bag.fallProgress = 0;
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

function spawnNuggets(state: RunState, x: number, y: number, out: NuggetEntity[]): void {
  for (let i = 0; i < tuning.bag.nuggetsOnBreak; i++) {
    out.push({
      kind: 'nugget',
      id: state.nextId++,
      x: x + (i % 3) - 1,
      y: y + Math.floor(i / 3),
      timer: tuning.bag.nuggetLifetime,
    });
  }
}

function damagePlayer(
  state: RunState,
  events: GameEvent[],
  source: 'bag' | 'monster' | 'fuel-empty',
): void {
  if (state.player.invulTimer > 0) return;
  state.player.hp -= 1;
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
): { id: number; kind: 'grub' | 'burrower' | 'spitter' } | null {
  for (const e of state.entities) {
    if (
      (e.kind === 'grub' || e.kind === 'burrower' || e.kind === 'spitter') &&
      e.x === x && e.y === y && !removed.has(e.id)
    ) {
      return e as { id: number; kind: 'grub' | 'burrower' | 'spitter' };
    }
  }
  return null;
}
