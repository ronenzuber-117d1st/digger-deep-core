import Phaser from 'phaser';
import { RunState } from '../core/run';
import { TileType, tileAt } from '../core/grid';
import {
  Entity, BagEntity, GrubEntity, BurrowerEntity, SpitterEntity,
  ProjectileEntity, NestEntity, dirDelta,
} from '../core/entities';
import { GameEvent } from '../core/events';
import { dirtTileFrame, emptyTileFrame, tileHash } from './autotile';
import { FONT_KEY, FONT_SIZE, COLOR, measureText } from './font';
import tuning from '../data/tuning.json';

const T = 16;
const GRID_W = tuning.floor.width;
const GRID_H = tuning.floor.height;
const BIOME_NAMES = ['TOPSOIL', 'FOSSIL BED', 'CRYSTAL DEPTHS', 'MAGMA RIM'];

// tiles_topsoil spritesheet has 12 columns; frame index = row*12 + col
const TILE_FRAMES: Record<string, number> = {
  dirt_0: 0, dirt_1: 1, dirt_2: 2, dirt_3: 3,
  floor: 4, floor_shadowed: 5,
  edge_n: 12, edge_e: 13, edge_s: 14, edge_w: 15,
  corner_nw: 16, corner_ne: 17, corner_se: 18, corner_sw: 19,
  concave_nw: 20, concave_ne: 21, concave_se: 22, concave_sw: 23,
  corridor_ns: 24, corridor_ew: 25, corridor_new: 26, corridor_esw: 27,
  corridor_nes: 28, corridor_nsw: 29, corridor_all: 30,
};
const HUD_SEGMENTS = 16;
const SEG_STRIDE = 8;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}

function biomeName(floor: number): string {
  const idx = Math.min(Math.floor((floor - 1) / 5), BIOME_NAMES.length - 1);
  return BIOME_NAMES[idx];
}

// ── Floating score popup ────────────────────────────────────────────────────

interface FloatText {
  bm: Phaser.GameObjects.BitmapText;
  vy: number;
  ttl: number;
  maxTtl: number;
}

// ── Main renderer ───────────────────────────────────────────────────────────

export class DiveRenderer {
  private scene: Phaser.Scene;
  private tileImages: Phaser.GameObjects.Image[];
  private exitShaftImg: Phaser.GameObjects.Image;
  private hudRT: Phaser.GameObjects.RenderTexture;
  private playerImg: Phaser.GameObjects.Image;
  private entityImages = new Map<number, Phaser.GameObjects.Image>();
  private floatTexts: FloatText[] = [];

  // HUD bitmap text labels (updated each frame)
  private hudEmText: Phaser.GameObjects.BitmapText;
  private hudFloorText: Phaser.GameObjects.BitmapText;
  private hudBiomeText: Phaser.GameObjects.BitmapText;
  private hudLowText: Phaser.GameObjects.BitmapText;

  // Pulse flash overlay
  private pulseGfx: Phaser.GameObjects.Graphics;

  private animTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Tile layer — one Image per tile, depth 0
    this.tileImages = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        this.tileImages.push(
          scene.add.image(x * T, y * T, 'tiles_topsoil', 0)
            .setOrigin(0, 0)
            .setDepth(0),
        );
      }
    }
    // Exit shaft overlay (objects spritesheet, exit_shaft_0=frame7)
    this.exitShaftImg = scene.add.image(0, 0, 'objects', 7)
      .setOrigin(0, 0)
      .setDepth(1)
      .setVisible(false);

    // Player image, depth 2
    this.playerImg = scene.add.image(0, 0, 'player', 'right_0')
      .setDepth(2).setOrigin(0, 0);

    // Pulse flash overlay, depth 3
    this.pulseGfx = scene.add.graphics().setDepth(3);

    // HUD sprite layer — top 16 px, above everything, fixed to camera
    this.hudRT = scene.add
      .renderTexture(0, 0, 480, 16)
      .setDepth(10)
      .setScrollFactor(0);

    // HUD text labels, depth 11, fixed to camera
    const textY = 4;
    this.hudEmText = scene.add
      .bitmapText(0, textY, FONT_KEY, '', FONT_SIZE)
      .setDepth(11).setScrollFactor(0).setTint(COLOR.gold);

    this.hudFloorText = scene.add
      .bitmapText(0, textY, FONT_KEY, '', FONT_SIZE)
      .setDepth(11).setScrollFactor(0).setTint(COLOR.body);

    this.hudBiomeText = scene.add
      .bitmapText(0, textY, FONT_KEY, '', FONT_SIZE)
      .setDepth(11).setScrollFactor(0).setTint(COLOR.soft);

    this.hudLowText = scene.add
      .bitmapText(0, textY, FONT_KEY, 'LOW!', FONT_SIZE)
      .setDepth(11).setScrollFactor(0).setTint(COLOR.warn)
      .setVisible(false);
  }

  update(state: RunState, dt: number, events: GameEvent[]): void {
    this.animTimer += dt;
    const a6 = Math.floor(this.animTimer * 6) % 2;
    const a2 = Math.floor(this.animTimer * 2) % 2;

    this.drawTiles(state, a2);
    this.drawPlayer(state, a6);
    this.drawEntities(state, a6, a2);
    this.drawHUD(state);
    this.processEvents(events, state);
    this.updateFloats(dt);
  }

  // ── Tile layer ────────────────────────────────────────────────────────────

  private drawTiles(state: RunState, a2: number): void {
    const { grid } = state;
    let exitX = -1;
    let exitY = -1;

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = tileAt(grid, x, y);
        let frame: number;

        if (tile === TileType.Bedrock) {
          frame = 6 + tileHash(x, y) % 3; // bedrock_0=6, bedrock_1=7, bedrock_2=8
        } else if (tile === TileType.Dirt) {
          frame = TILE_FRAMES[dirtTileFrame(grid, x, y)];
        } else {
          frame = TILE_FRAMES[emptyTileFrame(grid, x, y)];
          if (tile === TileType.Exit) { exitX = x; exitY = y; }
        }
        this.tileImages[y * grid.width + x].setFrame(frame);
      }
    }

    if (exitX >= 0) {
      this.exitShaftImg
        .setPosition(exitX * T, exitY * T)
        .setFrame(7 + a2) // exit_shaft_0=7, exit_shaft_1=8 in objects sheet
        .setVisible(true);
    } else {
      this.exitShaftImg.setVisible(false);
    }
  }

  // ── Player ────────────────────────────────────────────────────────────────

  private drawPlayer(state: RunState, a6: number): void {
    const p = state.player;
    const vx = p.moving ? lerp(p.fromX, p.toX, p.moveProgress) : p.x;
    const vy = p.moving ? lerp(p.fromY, p.toY, p.moveProgress) : p.y;

    const flicker = p.invulTimer > 0 && Math.floor(p.invulTimer * 10) % 2 === 0;
    const frame = (p.moving || p.isDigging) ? `${p.facing}_${a6}` : `${p.facing}_0`;

    this.playerImg
      .setTexture('player', frame)
      .setPosition(vx * T, vy * T)
      .setAlpha(flicker ? 0.35 : 1.0);
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  private drawEntities(state: RunState, a6: number, a2: number): void {
    const seen = new Set<number>();

    for (const e of state.entities) {
      seen.add(e.id);
      if (!this.entityImages.has(e.id)) {
        const img = this.scene.add.image(0, 0, 'objects', 0)
          .setDepth(2).setOrigin(0, 0);
        this.entityImages.set(e.id, img);
      }
      this.updateEntityImg(this.entityImages.get(e.id)!, e, a6, a2);
    }

    for (const [id, img] of this.entityImages) {
      if (!seen.has(id)) {
        img.destroy();
        this.entityImages.delete(id);
      }
    }
  }

  private updateEntityImg(
    img: Phaser.GameObjects.Image,
    e: Entity,
    a6: number,
    a2: number,
  ): void {
    img.setAlpha(1).setFlipX(false).setVisible(true);

    switch (e.kind) {
      case 'grub': {
        const g = e as GrubEntity;
        const vx = g.moving ? lerp(g.fromX, g.toX, g.moveProgress) : g.x;
        const vy = g.moving ? lerp(g.fromY, g.toY, g.moveProgress) : g.y;
        img.setTexture('monsters', `grub_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(g.nextDir === 'left');
        break;
      }

      case 'burrower': {
        const b = e as BurrowerEntity;
        const vx = b.moving ? lerp(b.fromX, b.toX, b.moveProgress) : b.x;
        const vy = b.moving ? lerp(b.fromY, b.toY, b.moveProgress) : b.y;
        img.setTexture('monsters', `burrower_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(b.nextDir === 'left');
        break;
      }

      case 'spitter': {
        const sp = e as SpitterEntity;
        const vx = sp.moving ? lerp(sp.fromX, sp.toX, sp.moveProgress) : sp.x;
        const vy = sp.moving ? lerp(sp.fromY, sp.toY, sp.moveProgress) : sp.y;
        img.setTexture('monsters', `spitter_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(sp.nextDir === 'left');
        break;
      }

      case 'projectile': {
        const proj = e as ProjectileEntity;
        const { dx, dy } = dirDelta(proj.dir);
        const vx = proj.x + dx * proj.moveProgress;
        const vy = proj.y + dy * proj.moveProgress;
        img.setTexture('monsters', 'spit_bolt').setPosition(vx * T, vy * T);
        break;
      }

      case 'bag': {
        const bag = e as BagEntity;
        let px: number;
        let py: number;

        if (bag.pendingFallTimer > 0) {
          // Wobble: alternate ±1 px every 4 frames at 60 fps
          const tick = Math.floor(this.animTimer * 60);
          const wobble = (tick % 8 < 4) ? -1 : 1;
          px = bag.x * T + wobble;
          py = bag.y * T;
          img.setTexture('objects', 'bag');
        } else if (bag.falling) {
          px = bag.x * T;
          py = (bag.y + bag.fallProgress) * T;
          img.setTexture('objects', 'bag');
        } else {
          px = bag.x * T;
          py = bag.y * T;
          img.setTexture('objects', bag.fallDistance > 0 ? 'bag_landed' : 'bag');
        }
        img.setPosition(px, py);
        break;
      }

      case 'nugget': {
        const alpha = Math.min(1, (e as { timer: number }).timer / 2);
        img.setTexture('objects', 'nugget')
          .setPosition(e.x * T, e.y * T)
          .setAlpha(alpha);
        break;
      }

      case 'nest': {
        const nest = e as NestEntity;
        img.setTexture('objects', `nest_${a2}`).setPosition(nest.x * T, nest.y * T);
        break;
      }

      case 'fuel':
        img.setTexture('objects', 'fuel_canister').setPosition(e.x * T, e.y * T);
        break;

      case 'gem':
        img.setTexture('objects', 'emerald').setPosition(e.x * T, e.y * T);
        break;
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private drawHUD(state: RunState): void {
    const p = state.player;
    this.hudRT.clear();

    // Hearts (up to 6, 10 px stride) — heart_full=0, heart_empty=1
    for (let i = 0; i < p.maxHp; i++) {
      this.hudRT.drawFrame('hud', i < p.hp ? 0 : 1, 4 + i * 10, 0);
    }

    // Fuel icon — fuel_mini=3
    const fuelIconX = 4 + 6 * 10 + 4;
    this.hudRT.drawFrame('hud', 3, fuelIconX, 0);

    // Fuel segments — fuel_segment=6, fuel_segment_low=7
    const fuelRatio = p.maxFuel > 0 ? Math.max(0, p.fuel / p.maxFuel) : 0;
    const filledSegs = Math.round(fuelRatio * HUD_SEGMENTS);
    const lowFuel = fuelRatio <= 0.25;
    const lowFlash = lowFuel && Math.floor(this.animTimer * 4) % 2 === 0;
    const segStartX = fuelIconX + 18;

    for (let i = 0; i < filledSegs; i++) {
      this.hudRT.drawFrame('hud', (lowFlash && i === filledSegs - 1) ? 7 : 6, segStartX + i * SEG_STRIDE, 0);
    }

    // Emerald mini icon — emerald_mini=2
    const emX = segStartX + HUD_SEGMENTS * SEG_STRIDE + 6;
    this.hudRT.drawFrame('hud', 2, emX, 0);
    const emStr = `X${p.emeralds}`;
    this.hudEmText.setText(emStr).setX(emX + 18);

    // Floor number
    const floorStr = `FLOOR ${state.floor}`;
    const floorX = emX + 18 + measureText(emStr) + 10;
    this.hudFloorText.setText(floorStr).setX(floorX);

    // Biome name — right-aligned before right bedrock column
    const biome = biomeName(state.floor);
    const biomeW = measureText(biome);
    this.hudBiomeText.setText(biome).setX(480 - 16 - biomeW - 2);

    // LOW! warning
    if (lowFuel) {
      const lowX = segStartX - 24;
      this.hudLowText.setX(lowX).setVisible(Math.floor(this.animTimer * 4) % 2 === 0);
    } else {
      this.hudLowText.setVisible(false);
    }
  }

  // ── Pulse flashes ─────────────────────────────────────────────────────────

  drawPulseFlash(x: number, y: number, ttl: number, maxTtl: number): void {
    const alpha = (ttl / maxTtl) * 0.7;
    this.pulseGfx.fillStyle(0xffffff, alpha);
    this.pulseGfx.fillRect(x * T, y * T, T, T);
  }

  clearPulseGfx(): void {
    this.pulseGfx.clear();
  }

  // ── Events → visual effects ───────────────────────────────────────────────

  private processEvents(events: GameEvent[], state: RunState): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'hit':
          this.scene.cameras.main.shake(200, 0.003);
          break;
        case 'bag-break':
          this.spawnStarburst((ev as { x: number; y: number }).x, (ev as { x: number; y: number }).y);
          break;
        case 'pickup':
          this.spawnFloatText(
            state.player.x, state.player.y,
            (ev as { kind: string }).kind === 'gem' ? '+GEM' : '+',
            COLOR.gold,
          );
          break;
      }
    }
  }

  private spawnStarburst(tx: number, ty: number): void {
    const gfx = this.scene.add.graphics().setDepth(4);
    gfx.fillStyle(0xffd700);
    const cx = tx * T + 8;
    const cy = ty * T + 8;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ex = cx + Math.cos(angle) * 6;
      const ey = cy + Math.sin(angle) * 6;
      gfx.fillRect(ex - 1, ey - 1, 2, 2);
    }
    this.scene.time.delayedCall(300, () => gfx.destroy());
  }

  private spawnFloatText(tx: number, ty: number, text: string, tint: number): void {
    const bm = this.scene.add
      .bitmapText(tx * T, ty * T - 4, FONT_KEY, text, FONT_SIZE)
      .setDepth(4)
      .setTint(tint);
    this.floatTexts.push({ bm, vy: -20, ttl: 1.0, maxTtl: 1.0 });
  }

  private updateFloats(dt: number): void {
    for (const f of this.floatTexts) {
      f.ttl -= dt;
      f.bm.y += f.vy * dt;
      f.bm.setAlpha(Math.max(0, f.ttl / f.maxTtl));
    }
    const dead = this.floatTexts.filter((f) => f.ttl <= 0);
    for (const f of dead) f.bm.destroy();
    this.floatTexts = this.floatTexts.filter((f) => f.ttl > 0);
  }

  destroy(): void {
    for (const img of this.tileImages) img.destroy();
    this.exitShaftImg.destroy();
    this.hudRT.destroy();
    this.playerImg.destroy();
    this.pulseGfx.destroy();
    this.hudEmText.destroy();
    this.hudFloorText.destroy();
    this.hudBiomeText.destroy();
    this.hudLowText.destroy();
    for (const img of this.entityImages.values()) img.destroy();
    for (const f of this.floatTexts) f.bm.destroy();
  }
}
