import { RunState } from '../run';
import { InputSnapshot } from '../../input/actions';
import { Direction, dirDelta, BagEntity } from '../entities';
import { tileAt, setTile, TileType, isSolid } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyMovement(state: RunState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  if (p.moving) {
    const digSpeed = tuning.player.moveSpeedDirt * (p.digSpeedMult ?? 1);
    const speed = p.isDigging ? digSpeed : tuning.player.moveSpeedTunnel;
    p.moveProgress += dt * speed;
    if (p.moveProgress >= 1) {
      p.x = p.toX;
      p.y = p.toY;
      p.moving = false;
      p.moveProgress = 0;
      p.isDigging = false;
      collectPickupsAt(state, p.x, p.y, events);
    }
    return events;
  }

  const dir = inputToDir(input);
  if (dir === null) return events;

  p.facing = dir;
  const { dx, dy } = dirDelta(dir);
  const tx = p.x + dx;
  const ty = p.y + dy;
  const tile = tileAt(state.grid, tx, ty);

  if (tile === TileType.Bedrock) return events;

  if (tile === TileType.Dirt) {
    if (findBagAt(state, tx, ty) !== null) return events;
    setTile(state.grid, tx, ty, TileType.Empty);
    p.fromX = p.x; p.fromY = p.y;
    p.toX = tx; p.toY = ty;
    p.moving = true; p.moveProgress = 0; p.isDigging = true;
    events.push({ type: 'dig' });
    return events;
  }

  if (tile === TileType.Empty || tile === TileType.Exit) {
    const bag = findBagAt(state, tx, ty);
    if (bag !== null) {
      if (dy !== 0) return events;
      const bx2 = tx + dx;
      const tileAhead = tileAt(state.grid, bx2, ty);
      if (isSolid(tileAhead) || findBagAt(state, bx2, ty) !== null) return events;
      bag.x = bx2;
      bag.y = ty;
    }
    p.fromX = p.x; p.fromY = p.y;
    p.toX = tx; p.toY = ty;
    p.moving = true; p.moveProgress = 0; p.isDigging = false;
    return events;
  }

  return events;
}

function inputToDir(input: InputSnapshot): Direction | null {
  if (input.moveUp) return 'up';
  if (input.moveDown) return 'down';
  if (input.moveLeft) return 'left';
  if (input.moveRight) return 'right';
  return null;
}

function findBagAt(state: RunState, x: number, y: number): BagEntity | null {
  for (const e of state.entities) {
    if (e.kind === 'bag' && e.x === x && e.y === y && !e.falling) {
      return e as BagEntity;
    }
  }
  return null;
}

function collectPickupsAt(state: RunState, x: number, y: number, events: GameEvent[]): void {
  const toRemove: number[] = [];
  for (const e of state.entities) {
    if (e.x !== x || e.y !== y) continue;
    if (e.kind === 'gem') {
      state.player.emeralds += 1;
      state.player.fuel = Math.min(
        state.player.fuel + tuning.player.fuelPerEmerald,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'gem' });
      toRemove.push(e.id);
    } else if (e.kind === 'nugget') {
      state.player.emeralds += tuning.bag.nuggetValue;
      state.player.fuel = Math.min(
        state.player.fuel + tuning.bag.nuggetValue * tuning.player.fuelPerEmerald,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'nugget' });
      toRemove.push(e.id);
    } else if (e.kind === 'fuel') {
      state.player.fuel = Math.min(
        state.player.fuel + tuning.player.fuelPerCanister,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'fuel' });
      toRemove.push(e.id);
    }
  }
  state.entities = state.entities.filter((e) => !toRemove.includes(e.id));
}
