import { RunState } from './run';
import { Action } from '../input/actions';

export type GameEvent = { type: 'pickup' | 'hit' | 'bag-break' | 'floor-clear' };

export function step(
  state: RunState,
  _input: Action | null,
  _dt: number,
): { state: RunState; events: GameEvent[] } {
  return { state, events: [] };
}
