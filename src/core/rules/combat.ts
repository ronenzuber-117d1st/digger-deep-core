import { RunState } from '../run';
import { dirDelta, Direction } from '../entities';
import { tileAt, setTile, TileType } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyPulse(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  if (p.pulseDamage <= 0) return events;

  const pulseInterval = tuning.pulse.interval * (state.runUpgrades.includes('rapidPulse') ? 0.8 : 1.0);
  p.pulseTimer += dt;
  if (p.pulseTimer < pulseInterval) return events;
  p.pulseTimer -= pulseInterval;

  const longPulseCount = state.runUpgrades.filter((u) => u === 'longPulse').length;
  const range = 1 + longPulseCount;

  const widePulseCount = state.runUpgrades.filter((u) => u === 'widePulse').length;
  const facing = p.facing;
  const opposite: Direction =
    facing === 'left' ? 'right' : facing === 'right' ? 'left' :
    facing === 'up'   ? 'down'  : 'up';

  const dirs: Direction[] = [facing];
  if (widePulseCount >= 1) dirs.push(opposite);
  if (widePulseCount >= 2) {
    dirs.push(facing === 'left' || facing === 'right' ? 'up'   : 'left');
    dirs.push(facing === 'left' || facing === 'right' ? 'down' : 'right');
  }

  for (const dir of dirs) {
    const { dx, dy } = dirDelta(dir);
    events.push({ type: 'pulse-fire', x: p.x, y: p.y, dir, range });
    for (let i = 1; i <= range; i++) {
      const tx = p.x + dx * i;
      const ty = p.y + dy * i;
      const tile = tileAt(state.grid, tx, ty);
      if (tile === TileType.Bedrock || tile === TileType.Dirt) break;
      const hit = hitEntityAt(state, tx, ty, events, p.pulseDamage);
      if (hit) break;
    }
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
        events.push({ type: 'kill', targetId: e.id, kind: 'grub', x: e.x, y: e.y, facing: e.facing });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
        state.killsByType['grub'] = (state.killsByType['grub'] ?? 0) + 1;
      }
      return true;
    }

    if (e.kind === 'burrower') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'burrower', x: e.x, y: e.y, facing: e.facing });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
        state.killsByType['burrower'] = (state.killsByType['burrower'] ?? 0) + 1;
      }
      return true;
    }

    if (e.kind === 'spitter') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'spitter', x: e.x, y: e.y, facing: e.facing });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
        state.killsByType['spitter'] = (state.killsByType['spitter'] ?? 0) + 1;
      }
      return true;
    }

    if (e.kind === 'drifter') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'drifter', x: e.x, y: e.y, facing: e.facing });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
        state.kills++;
        state.killsByType['drifter'] = (state.killsByType['drifter'] ?? 0) + 1;
      }
      return true;
    }

    if (e.kind === 'nest') {
      e.hp -= damage;
      if (e.hp <= 0) {
        events.push({ type: 'kill', targetId: e.id, kind: 'nest', x: e.x, y: e.y, facing: 'right' });
        state.entities = state.entities.filter((ent) => ent.id !== e.id);
      }
      return true;
    }
  }
  return false;
}

export function triggerTileBomb(state: RunState): GameEvent[] {
  if (!state.tileBombAvailable) return [];
  state.tileBombAvailable = false;

  const px = state.player.x;
  const py = state.player.y;
  const events: GameEvent[] = [];

  // Clear all dirt tiles in 3×3 centered on player
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (tileAt(state.grid, px + dx, py + dy) === TileType.Dirt) {
        setTile(state.grid, px + dx, py + dy, TileType.Empty);
      }
    }
  }

  // Kill all monsters and nests in 3×3
  const damage = tuning.tileBomb.damage;
  for (const e of state.entities.slice()) {
    if (e.kind !== 'grub' && e.kind !== 'burrower' && e.kind !== 'spitter' && e.kind !== 'drifter' && e.kind !== 'nest') continue;
    if (Math.abs(e.x - px) > 1 || Math.abs(e.y - py) > 1) continue;
    (e as { hp: number }).hp -= damage;
    if ((e as { hp: number }).hp <= 0) {
      const facing = (e.kind === 'nest') ? 'right' : e.facing;
      events.push({ type: 'kill', targetId: e.id, kind: e.kind, x: e.x, y: e.y, facing });
      state.entities = state.entities.filter((ent) => ent.id !== e.id);
      if (e.kind !== 'nest') {
        state.kills++;
        state.killsByType[e.kind] = (state.killsByType[e.kind] ?? 0) + 1;
      }
    }
  }

  return events;
}

export function applyContactDamage(state: RunState): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;
  if (p.invulTimer > 0) return events;

  for (const e of state.entities) {
    if (e.kind !== 'grub' && e.kind !== 'burrower' && e.kind !== 'spitter' && e.kind !== 'drifter') continue;
    if (!e.moving && e.x === p.x && e.y === p.y) {
      if (p.shield) {
        p.shield = false;
      } else {
        p.hp -= 1;
      }
      p.invulTimer = tuning.player.invulDuration;
      events.push({ type: 'hit', source: 'monster' });
      break;
    }
  }
  return events;
}
