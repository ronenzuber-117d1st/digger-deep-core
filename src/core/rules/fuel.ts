import { RunState } from '../run';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyFuel(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  p.fuel -= tuning.player.fuelDrainRate * dt;

  if (p.fuel <= 0) {
    p.fuel = 0;
    p.fuelDamageAccum += tuning.player.fuelEmptyDamageRate * dt;
    if (p.fuelDamageAccum >= 1) {
      p.fuelDamageAccum -= 1;
      if (p.invulTimer <= 0) {
        p.hp -= 1;
        events.push({ type: 'hit', source: 'fuel-empty' });
      }
    }
  }

  if (p.invulTimer > 0) p.invulTimer -= dt;

  return events;
}
