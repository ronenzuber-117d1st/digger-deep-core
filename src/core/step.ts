import { RunState } from './run';
import { InputSnapshot } from '../input/actions';
import { GameEvent } from './events';
import { tileAt, TileType } from './grid';
import { isExtractionFloor } from './economy';
import {
  applyMovement,
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
  events.push(...applyPulse(state, dt));
  events.push(...applyBags(state, dt));
  applyNuggetTimers(state, dt);
  events.push(...applyMonsters(state, dt));
  events.push(...applyNests(state, dt));
  events.push(...applyProjectiles(state, dt));
  events.push(...applyFuel(state, dt));
  events.push(...applyContactDamage(state));

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = 'dead';
    events.push({ type: 'death' });
    return { state, events };
  }

  const playerTile = tileAt(state.grid, state.player.x, state.player.y);
  if (!state.player.moving && playerTile === TileType.Exit) {
    if (isExtractionFloor(state.floor)) {
      state.phase = 'extraction';
      events.push({ type: 'extraction' });
    } else {
      state.phase = 'floor-clear';
      state.player.fuel = Math.min(state.player.fuel + 15, state.player.maxFuel);
      events.push({ type: 'floor-clear' });
    }
  }

  return { state, events };
}
