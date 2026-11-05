import { RunState } from '../run';
import { InputSnapshot } from '../../input/actions';
import { Direction, dirDelta, BagEntity } from '../entities';
import { tileAt, setTile, TileType, isSolid } from '../grid';
import { GameEvent } from '../events';
import tuning from '../../data/tuning.json';

export function applyMagnetCoil(state: RunState, dt: number): GameEvent[] {
  if (!state.runUpgrades.includes('magnetCoil')) return [];

  state.magnetTimer += dt;
  if (state.magnetTimer < tuning.magnetCoil.interval) return [];
  state.magnetTimer -= tuning.magnetCoil.interval;

  const px = state.player.x;
  const py = state.player.y;
  const range = tuning.magnetCoil.range;

  for (const e of state.entities) {
    if (e.kind !== 'gem') continue;
    const dist = Math.abs(e.x - px) + Math.abs(e.y - py);
    if (dist > range || dist === 0) continue;

    const dx = px - e.x;
    const dy = py - e.y;

    // Build candidate steps: prefer the axis with the larger delta
    const candidates: [number, number][] = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) candidates.push([Math.sign(dx), 0]);
      if (dy !== 0) candidates.push([0, Math.sign(dy)]);
    } else {
      if (dy !== 0) candidates.push([0, Math.sign(dy)]);
      if (dx !== 0) candidates.push([Math.sign(dx), 0]);
    }

    for (const [sx, sy] of candidates) {
      if (!isSolid(tileAt(state.grid, e.x + sx, e.y + sy))) {
        e.x += sx;
        e.y += sy;
        break;
      }
    }
  }

  // Collect any gems that drifted onto the player's tile
  const events: GameEvent[] = [];
  const toRemove: number[] = [];
  for (const e of state.entities) {
    if (e.kind !== 'gem' || e.x !== px || e.y !== py) continue;
    const gemVal = state.runUpgrades.includes('goldRush') ? 2 : 1;
    state.player.emeralds += gemVal;
    state.player.fuel = Math.min(
      state.player.fuel + gemVal * tuning.player.fuelPerEmerald,
      state.player.maxFuel,
    );
    events.push({ type: 'pickup', kind: 'gem', value: gemVal });
    toRemove.push(e.id);
  }
  state.entities = state.entities.filter((e) => !toRemove.includes(e.id));
  return events;
}

export function applyMovement(state: RunState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.player;

  if (p.moving) {
    const digSpeed = tuning.player.moveSpeedDirt * (p.digSpeedMult ?? 1) * p.fuelStarveMult;
    const speed = p.isDigging ? digSpeed : tuning.player.moveSpeedTunnel * p.fuelStarveMult;
    p.moveProgress += dt * Math.max(speed, 0.5);  // floor ensures current tile always completes
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

  if (p.fuelStarveMult <= 0) return events;

  const dir = inputToDir(input);
  if (dir === null) return events;

  p.facing = dir;
  if (dir === 'left' || dir === 'right') p.lastHFacing = dir;
  const { dx, dy } = dirDelta(dir);
  const tx = p.x + dx;
  const ty = p.y + dy;
  const tile = tileAt(state.grid, tx, ty);

  if (tile === TileType.Bedrock) return events;

  if (tile === TileType.Dirt) {
    setTile(state.grid, tx, ty, TileType.Empty);
    p.fromX = p.x; p.fromY = p.y;
    p.toX = tx; p.toY = ty;
    p.moving = true; p.moveProgress = 0; p.isDigging = true;
    events.push({ type: 'dig', x: tx, y: ty, dir: p.facing });
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
      const gemVal = state.runUpgrades.includes('goldRush') ? 2 : 1;
      state.player.emeralds += gemVal;
      state.player.fuel = Math.min(
        state.player.fuel + gemVal * tuning.player.fuelPerEmerald,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'gem', value: gemVal });
      toRemove.push(e.id);
    } else if (e.kind === 'nugget') {
      const nuggetVal = tuning.bag.nuggetValue;
      state.player.emeralds += nuggetVal;
      state.player.fuel = Math.min(
        state.player.fuel + nuggetVal * tuning.player.fuelPerEmerald,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'nugget', value: nuggetVal });
      toRemove.push(e.id);
    } else if (e.kind === 'fuel') {
      const canisterFuel = state.runUpgrades.includes('spareFuel')
        ? tuning.player.fuelPerCanister * 1.1
        : tuning.player.fuelPerCanister;
      state.player.fuel = Math.min(
        state.player.fuel + canisterFuel,
        state.player.maxFuel,
      );
      events.push({ type: 'pickup', kind: 'fuel', value: Math.round(canisterFuel) });
      toRemove.push(e.id);
    }
  }
  state.entities = state.entities.filter((e) => !toRemove.includes(e.id));
}
