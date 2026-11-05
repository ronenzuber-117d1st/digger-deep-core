import { RunState } from './run';
import { InputSnapshot } from '../input/actions';
import { GameEvent } from './events';
import { tileAt, TileType } from './grid';
import { isExtractionFloor } from './economy';
import tuning from '../data/tuning.json';
import {
  applyMovement,
  applyMagnetCoil,
  applyBags,
  applyNuggetTimers,
  applyFuel,
  applyPulse,
  applyContactDamage,
  applyMonsters,
  applyNests,
  applyProjectiles,
} from './rules/index';

export type { GameEvent };

export function step(
  state: RunState,
  input: InputSnapshot,
  dt: number,
): { state: RunState; events: GameEvent[] } {
  if (state.phase !== 'playing') return { state, events: [] };

  const events: GameEvent[] = [];

  events.push(...applyMovement(state, input, dt));
  events.push(...applyMagnetCoil(state, dt));
  if (state.echoPingTimer > 0) {
    state.echoPingTimer = Math.max(0, state.echoPingTimer - dt);
  }
  events.push(...applyPulse(state, dt));
  events.push(...applyBags(state, dt));
  applyNuggetTimers(state, dt);
  events.push(...applyMonsters(state, dt));
  events.push(...applyNests(state, dt));
  events.push(...applyProjectiles(state, dt));
  events.push(...applyFuel(state, dt));
  events.push(...applyContactDamage(state));

  if (state.player.hp <= 0) {
    if (state.runUpgrades.includes('secondWind') && !state.secondWindUsed) {
      state.player.hp = 1;
      state.player.invulTimer = tuning.player.invulDuration;
      state.secondWindUsed = true;
    } else {
      state.player.hp = 0;
      state.phase = 'dead';
      events.push({ type: 'death' });
      return { state, events };
    }
  }

  const playerTile = tileAt(state.grid, state.player.x, state.player.y);
  const gemsRemaining = state.entities.some((e) => e.kind === 'gem');
  if (!state.player.moving && playerTile === TileType.Exit && !gemsRemaining) {
    if (isExtractionFloor(state.floor)) {
      state.phase = 'extraction';
      events.push({ type: 'extraction' });
    } else {
      state.phase = 'floor-clear';
      events.push({ type: 'floor-clear' });
    }
  }

  return { state, events };
}
