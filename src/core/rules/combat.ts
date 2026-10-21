import { RunState } from '../run';
import { dirDelta } from '../entities';
import { tileAt, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyPulse(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  p.pulseTimer += dt;
  if (p.pulseTimer < tuning.pulse.interval) return events;
  p.pulseTimer -= tuning.pulse.interval;

  const { dx, dy } = dirDelta(p.facing);
  events.push({ type: 'pulse-fire', x: p.x, y: p.y, dir: p.facing });

  for (let i = 1; i <= tuning.pulse.range; i++) {
    const tx = p.x + dx * i;
    const ty = p.y + dy * i;

    const tile = tileAt(state.grid, tx, ty);
    if (tile === TileType.Bedrock || tile === TileType.Dirt) break;

    const hit = hitEntityAt(state, tx, ty, events, p.pulseDamage);
    if (hit) break;
  }

  return events;
}

function hitEntityAt(
  state: RunState,
  x: number,
  y: number,
  events: GameEvent[],
  damage: number,
): boolean {
  for (const e of state.entities) {
    if (e.x !== x || e.y !== y) continue;

    if (e.kind === 'grub') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'grub' });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
      }
      return true;
    }

    if (e.kind === 'burrower') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'burrower' });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
      }
      return true;
    }

    if (e.kind === 'spitter') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'spitter' });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
      }
      return true;
    }

    if (e.kind === 'nest') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'nest' });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
      }
      return true;
    }
  }
  return false;
}

export function applyContactDamage(state: RunState): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;
  if (p.invulTimer > 0) return events;

  for (const e of state.entities) {
    if (e.kind !== 'grub' && e.kind !== 'burrower' && e.kind !== 'spitter') continue;
    if (!e.moving && e.x === p.x && e.y === p.y) {
      p.hp -= 1;
      p.invulTimer = tuning.player.invulDuration;
      events.push({ type: 'hit', source: 'monster' });
      break;
    }
  }
  return events;
}
