import Phaser from 'phaser';
import { RunState } from '../core/run';
import { TileType } from '../core/grid';
import { Entity, BagEntity, GrubEntity, BurrowerEntity, SpitterEntity, ProjectileEntity, dirDelta } from '../core/entities';
import tuning from '../data/tuning.json';

const T = tuning.floor.tileSize;

const COLORS = {
  bedrock: 0x1a1a2e,
  dirt: 0x7a3b10,
  empty: 0x0d0d1a,
  exit: 0x00e5ff,
  player: 0x44ff44,
  playerInvul: 0xaaaaaa,
  grub: 0xff4444,
  grubDead: 0x882222,
  burrower: 0xe04040,
  burrowerDig: 0xff8800,
  spitter: 0xcc44cc,
  spitterEye: 0xffffff,
  projectile: 0xff88ff,
  bag: 0xffd700,
  nugget: 0xff8c00,
  nest: 0xaa00cc,
  fuel: 0x0088ff,
  gem: 0x00ffaa,
  pulse: 0xffffff,
  hpFull: 0xff2222,
  hpEmpty: 0x440000,
  fuelFull: 0x2266ff,
  fuelEmpty: 0x111133,
};

export interface PulseFlash {
  x: number;
  y: number;
  dir: string;
  ttl: number;
}

export function renderFloor(
  gfx: Phaser.GameObjects.Graphics,
  state: RunState,
  pulseFlashes: PulseFlash[],
): void {
  gfx.clear();

  const { grid } = state;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.tiles[y * grid.width + x];
      let color: number;
      switch (tile) {
        case TileType.Bedrock: color = COLORS.bedrock; break;
        case TileType.Dirt:    color = COLORS.dirt;    break;
        case TileType.Empty:   color = COLORS.empty;   break;
        case TileType.Exit:    color = COLORS.exit;    break;
        default:               color = COLORS.empty;
      }
      gfx.fillStyle(color);
      gfx.fillRect(x * T, y * T, T, T);
    }
  }

  for (const e of state.entities) {
    drawEntity(gfx, e);
  }

  for (const flash of pulseFlashes) {
    drawPulseFlash(gfx, flash);
  }

  drawPlayer(gfx, state);
}

function drawEntity(gfx: Phaser.GameObjects.Graphics, e: Entity): void {
  switch (e.kind) {
    case 'gem':
      gfx.fillStyle(COLORS.gem);
      gfx.fillRect(e.x * T + 4, e.y * T + 4, T - 8, T - 8);
      break;

    case 'fuel':
      gfx.fillStyle(COLORS.fuel);
      gfx.fillRect(e.x * T + 2, e.y * T + 2, T - 4, T - 4);
      break;

    case 'nugget': {
      const alpha = Math.min(1, e.timer / 2);
      gfx.fillStyle(COLORS.nugget, alpha);
      gfx.fillRect(e.x * T + 5, e.y * T + 5, T - 10, T - 10);
      break;
    }

    case 'nest':
      gfx.fillStyle(COLORS.nest);
      gfx.fillRect(e.x * T + 1, e.y * T + 1, T - 2, T - 2);
      gfx.fillStyle(0x220033);
      gfx.fillRect(e.x * T + 5, e.y * T + 5, T - 10, T - 10);
      break;

    case 'bag': {
      const bag = e as BagEntity;
      const vy = bag.falling ? bag.y + bag.fallProgress : bag.y;
      gfx.fillStyle(COLORS.bag);
      gfx.fillRect(bag.x * T + 1, vy * T + 1, T - 2, T - 2);
      break;
    }

    case 'grub': {
      const grub = e as GrubEntity;
      const vx = grub.moving ? lerp(grub.fromX, grub.toX, grub.moveProgress) : grub.x;
      const vy = grub.moving ? lerp(grub.fromY, grub.toY, grub.moveProgress) : grub.y;
      gfx.fillStyle(COLORS.grub);
      gfx.fillRect(vx * T + 2, vy * T + 2, T - 4, T - 4);
      gfx.fillStyle(COLORS.grubDead);
      gfx.fillRect(vx * T + 5, vy * T + 5, 3, 3);
      gfx.fillRect(vx * T + T - 8, vy * T + 5, 3, 3);
      break;
    }

    case 'burrower': {
      const b = e as BurrowerEntity;
      const vx = b.moving ? lerp(b.fromX, b.toX, b.moveProgress) : b.x;
      const vy = b.moving ? lerp(b.fromY, b.toY, b.moveProgress) : b.y;
      gfx.fillStyle(b.isDigging ? COLORS.burrowerDig : COLORS.burrower);
      gfx.fillRect(vx * T + 1, vy * T + 1, T - 2, T - 2);
      // Spikes
      gfx.fillStyle(0xffd700);
      gfx.fillTriangle(
        vx * T + 8, vy * T,
        vx * T + 4, vy * T + 4,
        vx * T + 12, vy * T + 4,
      );
      break;
    }

    case 'spitter': {
      const sp = e as SpitterEntity;
      const vx = sp.moving ? lerp(sp.fromX, sp.toX, sp.moveProgress) : sp.x;
      const vy = sp.moving ? lerp(sp.fromY, sp.toY, sp.moveProgress) : sp.y;
      gfx.fillStyle(COLORS.spitter);
      gfx.fillRect(vx * T + 2, vy * T + 3, T - 4, T - 6);
      // Eye/nozzle
      gfx.fillStyle(COLORS.spitterEye);
      gfx.fillRect(vx * T + T - 5, vy * T + 6, 3, 4);
      break;
    }

    case 'projectile': {
      const proj = e as ProjectileEntity;
      const { dx, dy } = dirDelta(proj.dir);
      const vx = proj.x + dx * proj.moveProgress;
      const vy = proj.y + dy * proj.moveProgress;
      gfx.fillStyle(COLORS.projectile);
      gfx.fillRect(vx * T + 5, vy * T + 5, T - 10, T - 10);
      break;
    }
  }
}

function drawPulseFlash(gfx: Phaser.GameObjects.Graphics, flash: PulseFlash): void {
  const alpha = flash.ttl / 0.1;
  gfx.fillStyle(COLORS.pulse, alpha * 0.7);
  gfx.fillRect(flash.x * T, flash.y * T, T, T);
}

function drawPlayer(gfx: Phaser.GameObjects.Graphics, state: RunState): void {
  const p = state.player;
  const vx = p.moving ? lerp(p.fromX, p.toX, p.moveProgress) : p.x;
  const vy = p.moving ? lerp(p.fromY, p.toY, p.moveProgress) : p.y;

  const flicker = p.invulTimer > 0 && Math.floor(p.invulTimer * 10) % 2 === 0;
  const color = flicker ? COLORS.playerInvul : COLORS.player;

  gfx.fillStyle(color);
  gfx.fillRect(vx * T + 1, vy * T + 1, T - 2, T - 2);

  gfx.fillStyle(0x002200);
  switch (p.facing) {
    case 'right': gfx.fillRect(vx * T + T - 5, vy * T + 5, 3, 6); break;
    case 'left':  gfx.fillRect(vx * T + 2, vy * T + 5, 3, 6); break;
    case 'up':    gfx.fillRect(vx * T + 5, vy * T + 2, 6, 3); break;
    case 'down':  gfx.fillRect(vx * T + 5, vy * T + T - 5, 6, 3); break;
  }
}

export function renderHud(
  hudGfx: Phaser.GameObjects.Graphics,
  hudText: Phaser.GameObjects.Text,
  state: RunState,
): void {
  hudGfx.clear();

  const p = state.player;
  const barW = 60;
  const barH = 6;
  const bx = 4;

  for (let i = 0; i < p.maxHp; i++) {
    hudGfx.fillStyle(i < p.hp ? COLORS.hpFull : COLORS.hpEmpty);
    hudGfx.fillRect(bx + i * 10, 4, 8, 8);
  }

  hudGfx.fillStyle(COLORS.fuelEmpty);
  hudGfx.fillRect(bx, 16, barW, barH);
  const fuelRatio = Math.max(0, p.fuel / p.maxFuel);
  hudGfx.fillStyle(COLORS.fuelFull);
  hudGfx.fillRect(bx, 16, Math.floor(barW * fuelRatio), barH);

  hudText.setText(`E:${p.emeralds}  FL:${state.floor}  K:${state.kills}`);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}
