import { RunState } from '../run';
import { GameEvent } from '../events';
import { NestEntity } from '../entities';
import { tileAt, TileType } from '../grid';
import tuning from '../../data/tuning.json';

export function applyFuel(state: RunState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  const drainRate = tuning.player.fuelDrainRate * (state.runUpgrades.includes('efficientEngine') ? 0.75 : 1.0);
  p.fuel -= drainRate * dt;

  if (p.fuel <= 0) {
    p.fuel = 0;
    const prevTimer = state.fuelStarveTimer;
    state.fuelStarveTimer += dt;
    p.fuelStarveMult = Math.max(0, 1 - state.fuelStarveTimer / tuning.player.fuelStarveSlowDuration);

    // When slowdown completes, flood the floor with nests
    if (prevTimer < tuning.player.fuelStarveSlowDuration && state.fuelStarveTimer >= tuning.player.fuelStarveSlowDuration) {
      spawnStarveNests(state);
      events.push({ type: 'fuel-starved' });
    }
  }

  if (p.invulTimer > 0) p.invulTimer -= dt;

  return events;
}

function spawnStarveNests(state: RunState): void {
  const { grid } = state;
  const candidates: { x: number; y: number }[] = [];

  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (tileAt(grid, x, y) !== TileType.Dirt) continue;
      if (state.entities.some((e) => e.x === x && e.y === y)) continue;
      candidates.push({ x, y });
    }
  }

  const count = Math.min(tuning.player.fuelStarveNestCount, candidates.length);
  if (count === 0) return;
  const step = Math.floor(candidates.length / count);

  for (let i = 0; i < count; i++) {
    const pos = candidates[i * step];
    const id = state.nextId++;
    const nest: NestEntity = {
      kind: 'nest', id, x: pos.x, y: pos.y,
      hp: tuning.nest.hp,
      spawnTimer: tuning.nest.spawnInterval,
      spawnCount: 0,
      surfaceDelay: i * 0.4,  // stagger emergence so they don't all pop at once
      surfacing: false,
      surfaceFrame: 0,
    };
    state.entities = [...state.entities, nest];
  }
}
