import Phaser from 'phaser';
import { RunState } from '../core/run';
import { TileType, tileAt } from '../core/grid';
import {
  Entity, BagEntity, GrubEntity, BurrowerEntity, SpitterEntity, DrifterEntity,
  ProjectileEntity, NestEntity, dirDelta,
} from '../core/entities';
import { GameEvent } from '../core/events';
import { dirtTileFrame, emptyTileFrame, tileHash } from './autotile';
import { FONT_KEY, FONT_SIZE, COLOR, measureText } from './font';
import tuning from '../data/tuning.json';

const T = 16;
const GRID_W = tuning.floor.width;
const GRID_H = tuning.floor.height;
const BIOME_NAMES  = ['TOPSOIL', 'FOSSIL BED', 'CRYSTAL WARRENS', 'FUNGAL HOLLOW', 'MAGMA SEAMS', 'FROZEN VAULT'];
const BIOME_COLORS = [COLOR.good, COLOR.amber, COLOR.cyan, 0xa8e68a, COLOR.warn, 0xa8e4f5];
const BIOME_TILES  = ['tiles_topsoil', 'tiles_fossil', 'tiles_crystal', 'tiles_fungal', 'tiles_magma', 'tiles_frozen'];

function biomeIndex(floor: number): number {
  return Math.min(Math.floor((floor - 1) / 5), BIOME_NAMES.length - 1);
}

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
const SEG_STRIDE = 6;
const HUD_MAX_HP = 6;
const HUD_HEART_X = 4;
const HUD_HEART_STRIDE = 10;
const HUD_FUEL_ICON_X = HUD_HEART_X + HUD_MAX_HP * HUD_HEART_STRIDE + 4; // 68
const HUD_SEG_X = HUD_FUEL_ICON_X + 18; // 86
const HUD_EM_X = HUD_SEG_X + HUD_SEGMENTS * SEG_STRIDE + 6; // 220

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}

function biomeName(floor: number): string  { return BIOME_NAMES[biomeIndex(floor)]; }
function biomeColor(floor: number): number { return BIOME_COLORS[biomeIndex(floor)]; }
function biomeTileKey(floor: number): string { return BIOME_TILES[biomeIndex(floor)]; }

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
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private fuelIconImg!: Phaser.GameObjects.Image;
  private segImgs: Phaser.GameObjects.Image[] = [];
  private emIconImg!: Phaser.GameObjects.Image;
  private playerImg: Phaser.GameObjects.Image;
  private entityImages = new Map<number, Phaser.GameObjects.Image>();
  private floatTexts: FloatText[] = [];
  private deathAnimTimer: number | null = null;
  private deathAnimDir: 'left' | 'right' = 'right';
  private static readonly DEATH_FPS = 10;
  private static readonly DEATH_FRAMES = 16;
  private static readonly DEATH_GHOST_START = 12;  // frames 12-15 loop after full anim

  private enemyDeathEffects: Array<{
    img: Phaser.GameObjects.Image;
    kind: 'grub' | 'burrower' | 'spitter' | 'drifter';
    facing: 'left' | 'right';
    timer: number;
  }> = [];
  private static readonly ENEMY_DEATH_FPS = 12;
  private static readonly ENEMY_DEATH_FRAMES = 8;

  // HUD bitmap text labels (updated each frame)
  private hudEmText: Phaser.GameObjects.BitmapText;
  private hudFloorText: Phaser.GameObjects.BitmapText;
  private hudBiomeText: Phaser.GameObjects.BitmapText;
  private hudLowText: Phaser.GameObjects.BitmapText;

  // Darkness overlay for deep floors (MAGMA RIM, floor 16+) — above entities
  private darknessGfx: Phaser.GameObjects.Graphics;

  // Lantern highlight overlay (nests + bags) — above darkness so glows show through
  private lanternGfx: Phaser.GameObjects.Graphics;

  // Pulse flash overlay (kept for potential future use; cleared each frame)
  private pulseGfx: Phaser.GameObjects.Graphics;

  // Bottom-bedrock purple hum
  private humGfx: Phaser.GameObjects.Graphics;

  // Tracks current tile sheet so we can batch-switch textures only on biome change
  private currentTileKey = 'tiles_topsoil';

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

    // Player image, depth 2.5 — above entity layer (depth 2) so never hidden behind nests
    this.playerImg = scene.add.image(0, 0, 'chomper_right_0')
      .setDepth(2.5).setOrigin(0.5, 0.5);

    // Pulse flash overlay, depth 3
    this.pulseGfx = scene.add.graphics().setDepth(3);

    // Darkness overlay, depth 8 — above entities, below HUD
    this.darknessGfx = scene.add.graphics().setDepth(8);

    // Lantern highlight overlay, depth 9 — above darkness so glows pierce it
    this.lanternGfx = scene.add.graphics().setDepth(9);

    // Purple hum strip above bottom bedrock row, depth 1
    this.humGfx = scene.add.graphics().setDepth(1);

    // HUD sprite layer — individual images fixed to camera, depth 10
    for (let i = 0; i < HUD_MAX_HP; i++) {
      this.heartImgs.push(
        scene.add.image(HUD_HEART_X + i * HUD_HEART_STRIDE, 0, 'hud', 'heart_full')
          .setOrigin(0, 0).setDepth(10).setScrollFactor(0),
      );
    }
    this.fuelIconImg = scene.add.image(HUD_FUEL_ICON_X, 0, 'hud', 'fuel_mini')
      .setOrigin(0, 0).setDepth(10).setScrollFactor(0);
    for (let i = 0; i < HUD_SEGMENTS; i++) {
      this.segImgs.push(
        scene.add.image(HUD_SEG_X + i * SEG_STRIDE, 0, 'hud', 'fuel_segment')
          .setOrigin(0, 0).setDepth(10).setScrollFactor(0),
      );
    }
    this.emIconImg = scene.add.image(HUD_EM_X, 0, 'hud', 'emerald_mini')
      .setOrigin(0, 0).setDepth(10).setScrollFactor(0);

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

  startDeathAnim(dir: 'left' | 'right'): void {
    this.deathAnimTimer = 0;
    this.deathAnimDir = dir;
  }

  isDeathAnimComplete(): boolean {
    if (this.deathAnimTimer === null) return false;
    return this.deathAnimTimer >= DiveRenderer.DEATH_FRAMES / DiveRenderer.DEATH_FPS;
  }

  update(state: RunState, dt: number, events: GameEvent[], shakeEnabled = true): void {
    this.animTimer += dt;
    if (this.deathAnimTimer !== null) this.deathAnimTimer += dt;
    const a6 = Math.floor(this.animTimer * 6) % 2;
    const a4 = Math.floor(this.animTimer * 6) % 4;
    const a2 = Math.floor(this.animTimer * 2) % 2;

    this.drawTiles(state, a2);
    this.drawHum();
    this.drawPlayer(state, a4);
    this.drawEntities(state, a6, a2);
    this.drawDarkness(state);
    this.drawLanternHighlights(state);
    this.drawHUD(state);
    this.processEvents(events, state, shakeEnabled);
    this.updateFloats(dt);
    this.updateEnemyDeathEffects(dt);
  }

  private updateEnemyDeathEffects(dt: number): void {
    const duration = DiveRenderer.ENEMY_DEATH_FRAMES / DiveRenderer.ENEMY_DEATH_FPS;
    for (let i = this.enemyDeathEffects.length - 1; i >= 0; i--) {
      const ef = this.enemyDeathEffects[i];
      ef.timer += dt;
      if (ef.timer >= duration) {
        ef.img.destroy();
        this.enemyDeathEffects.splice(i, 1);
        continue;
      }
      const frameIdx = Math.min(Math.floor(ef.timer * DiveRenderer.ENEMY_DEATH_FPS), DiveRenderer.ENEMY_DEATH_FRAMES - 1);
      const dir = (ef.kind === 'burrower' || ef.kind === 'drifter') ? 'front' : ef.facing;
      ef.img.setTexture(`${ef.kind}_death_${dir}_${frameIdx}`);
    }
  }

  // ── Tile layer ────────────────────────────────────────────────────────────

  private drawTiles(state: RunState, a2: number): void {
    const tileKey = biomeTileKey(state.floor);
    const keyChanged = tileKey !== this.currentTileKey;
    if (keyChanged) this.currentTileKey = tileKey;

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
        const img = this.tileImages[y * grid.width + x];
        if (keyChanged) {
          img.setTexture(tileKey, frame);
        } else {
          img.setFrame(frame);
        }
      }
    }

    const gemsRemaining = state.entities.some((e) => e.kind === 'gem');
    if (exitX >= 0 && !gemsRemaining) {
      this.exitShaftImg
        .setPosition(exitX * T, exitY * T)
        .setFrame(7 + a2) // exit_shaft_0=7, exit_shaft_1=8 in objects sheet
        .setVisible(true);
    } else {
      this.exitShaftImg.setVisible(false);
    }
  }

  // ── Player ────────────────────────────────────────────────────────────────

  private drawPlayer(state: RunState, a4: number): void {
    const p = state.player;

    if (this.deathAnimTimer !== null) {
      const fullDuration = DiveRenderer.DEATH_FRAMES / DiveRenderer.DEATH_FPS;
      let frameIdx: number;
      if (this.deathAnimTimer < fullDuration) {
        frameIdx = Math.floor(this.deathAnimTimer * DiveRenderer.DEATH_FPS);
      } else {
        // Loop ghost-flapping frames after full anim completes
        const ghostCount = DiveRenderer.DEATH_FRAMES - DiveRenderer.DEATH_GHOST_START;
        const ghostElapsed = this.deathAnimTimer - fullDuration;
        frameIdx = DiveRenderer.DEATH_GHOST_START + Math.floor(ghostElapsed * DiveRenderer.DEATH_FPS) % ghostCount;
      }
      const f = frameIdx.toString().padStart(2, '0');
      this.playerImg
        .setTexture(`chomper_death_${this.deathAnimDir}_${f}`)
        .setAngle(0)
        .setOrigin(0.5, 0.5)
        .setPosition(p.x * T + T / 2, p.y * T)
        .setAlpha(1);
      return;
    }

    const vx = p.moving ? lerp(p.fromX, p.toX, p.moveProgress) : p.x;
    const vy = p.moving ? lerp(p.fromY, p.toY, p.moveProgress) : p.y;

    const flicker = p.invulTimer > 0 && Math.floor(p.invulTimer * 10) % 2 === 0;
    const frameIdx = (p.moving || p.isDigging) ? a4 : 0;

    let texKey: string;
    let angle = 0;

    if (p.facing === 'left' || p.facing === 'right') {
      texKey = `chomper_${p.facing}_${frameIdx}`;
    } else {
      texKey = `chomper_${p.lastHFacing}_${frameIdx}`;
      if (p.facing === 'up') {
        angle = p.lastHFacing === 'right' ? -90 : 90;
      } else {
        angle = p.lastHFacing === 'right' ? 90 : -90;
      }
    }

    this.playerImg
      .setTexture(texKey)
      .setAngle(angle)
      .setOrigin(0.5, 0.5)
      .setPosition(vx * T + T / 2, vy * T + T / 2)
      .setAlpha(flicker ? 0.35 : 1.0);
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  private drawEntities(state: RunState, a6: number, a2: number): void {
    const seen = new Set<number>();
    const echoPingActive = state.echoPingTimer > 0;

    for (const e of state.entities) {
      seen.add(e.id);
      if (!this.entityImages.has(e.id)) {
        const img = this.scene.add.image(0, 0, 'objects', 0)
          .setDepth(2).setOrigin(0, 0);
        this.entityImages.set(e.id, img);
      }
      this.updateEntityImg(this.entityImages.get(e.id)!, e, a6, a2, echoPingActive);
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
    echoPingActive = false,
  ): void {
    img.setAlpha(1).setFlipX(false).setVisible(true).clearTint();
    if (echoPingActive && (e.kind === 'grub' || e.kind === 'burrower' || e.kind === 'spitter' || e.kind === 'drifter')) {
      img.setTint(0x44ffee);
    }

    switch (e.kind) {
      case 'grub': {
        const g = e as GrubEntity;
        const vx = g.moving ? lerp(g.fromX, g.toX, g.moveProgress) : g.x;
        const vy = g.moving ? lerp(g.fromY, g.toY, g.moveProgress) : g.y;
        img.setTexture('monsters', `grub_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(g.facing === 'left');
        break;
      }

      case 'burrower': {
        const b = e as BurrowerEntity;
        const vx = b.moving ? lerp(b.fromX, b.toX, b.moveProgress) : b.x;
        const vy = b.moving ? lerp(b.fromY, b.toY, b.moveProgress) : b.y;
        img.setTexture('monsters', `burrower_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(b.facing === 'left');
        break;
      }

      case 'spitter': {
        const sp = e as SpitterEntity;
        const vx = sp.moving ? lerp(sp.fromX, sp.toX, sp.moveProgress) : sp.x;
        const vy = sp.moving ? lerp(sp.fromY, sp.toY, sp.moveProgress) : sp.y;
        img.setTexture('monsters', `spitter_${a6}`)
          .setPosition(vx * T, vy * T)
          .setFlipX(sp.facing === 'left');
        break;
      }

      case 'drifter': {
        const dr = e as DrifterEntity;
        const vx = dr.moving ? lerp(dr.fromX, dr.toX, dr.moveProgress) : dr.x;
        const vy = dr.moving ? lerp(dr.fromY, dr.toY, dr.moveProgress) : dr.y;
        // Drifter bobs vertically to sell the floating feel
        const bob = Math.sin(this.animTimer * Math.PI * 2) * 2;
        img.setTexture('monsters', `drifter_${a6 % 2}`)
          .setPosition(vx * T, vy * T + bob)
          .setFlipX(dr.facing === 'left')
          .setAlpha(0.88);  // slight transparency reinforces ghost effect
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
        img.setTexture(`nugget_pile_${a2}`)
          .setPosition(e.x * T, e.y * T)
          .setAlpha(alpha);
        break;
      }

      case 'nest': {
        const nest = e as NestEntity;
        if (nest.surfaceDelay > 0) {
          if (echoPingActive) {
            img.setTexture('objects', 'nest_0').setPosition(nest.x * T, nest.y * T)
              .setVisible(true).setAlpha(0.45).setTint(0x44ffee);
          } else {
            img.setVisible(false);
          }
        } else if (nest.surfacing) {
          const f = Math.min(13, Math.floor(nest.surfaceFrame));
          img.setTexture(`nest_surface_${f}`).setPosition(nest.x * T, nest.y * T).setVisible(true);
        } else {
          img.setTexture('objects', `nest_${a2}`).setPosition(nest.x * T, nest.y * T).setVisible(true);
        }
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

  // ── Darkness overlay (floor 16+ / MAGMA RIM biome) ───────────────────────

  private drawDarkness(state: RunState): void {
    this.darknessGfx.clear();
    if (biomeIndex(state.floor) < 3) return;

    const hasLantern = state.runUpgrades.includes('lantern');
    const radius = hasLantern ? 6 : 2;

    // Use interpolated player position so the light circle moves smoothly
    const p = state.player;
    const vpx = p.moving ? lerp(p.fromX, p.toX, p.moveProgress) : p.x;
    const vpy = p.moving ? lerp(p.fromY, p.toY, p.moveProgress) : p.y;

    // Group tiles by darkness level to minimise fillStyle calls
    const full: [number, number][] = [];
    const mid: [number, number][] = [];
    const fringe: [number, number][] = [];

    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const dx = tx - vpx;
        const dy = ty - vpy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius + 1.5) full.push([tx, ty]);
        else if (dist > radius + 0.5) mid.push([tx, ty]);
        else if (dist > radius - 0.5) fringe.push([tx, ty]);
      }
    }

    this.darknessGfx.fillStyle(0x000000, 0.94);
    for (const [tx, ty] of full) this.darknessGfx.fillRect(tx * T, ty * T, T, T);

    this.darknessGfx.fillStyle(0x000000, 0.70);
    for (const [tx, ty] of mid) this.darknessGfx.fillRect(tx * T, ty * T, T, T);

    this.darknessGfx.fillStyle(0x000000, 0.35);
    for (const [tx, ty] of fringe) this.darknessGfx.fillRect(tx * T, ty * T, T, T);
  }

  // ── Lantern highlights ────────────────────────────────────────────────────

  private drawLanternHighlights(state: RunState): void {
    this.lanternGfx.clear();
    if (!state.runUpgrades.includes('lantern')) return;

    const px = state.player.x;
    const py = state.player.y;
    const isDark = biomeIndex(state.floor) >= 3;
    const lanternRadius = 6;
    const pulse = 0.5 + 0.3 * Math.sin(this.animTimer * Math.PI * 2);

    for (const e of state.entities) {
      if (e.kind !== 'bag' && e.kind !== 'nest') continue;
      const eucDist = Math.sqrt((e.x - px) ** 2 + (e.y - py) ** 2);
      // In dark floors: glow for items just outside the lit radius (reveals them through darkness)
      // In bright floors: glow for nearby items within 6 tiles
      const maxDetect = isDark ? lanternRadius + 4 : lanternRadius;
      if (eucDist > maxDetect) continue;
      if (isDark && eucDist <= lanternRadius - 0.5) continue; // already fully visible, skip glow

      const color = e.kind === 'nest' ? 0xff6644 : 0xffcc44;
      this.lanternGfx.lineStyle(1, color, pulse);
      this.lanternGfx.strokeRect(e.x * T + 1, e.y * T + 1, T - 2, T - 2);
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private drawHUD(state: RunState): void {
    const p = state.player;

    // Hearts
    for (let i = 0; i < this.heartImgs.length; i++) {
      if (i < p.maxHp) {
        this.heartImgs[i].setVisible(true).setFrame(i < p.hp ? 'heart_full' : 'heart_empty');
      } else {
        this.heartImgs[i].setVisible(false);
      }
    }

    // Fuel segments — flash whole bar between the two frames when low
    const fuelRatio = p.maxFuel > 0 ? Math.max(0, p.fuel / p.maxFuel) : 0;
    const filledSegs = Math.round(fuelRatio * HUD_SEGMENTS);
    const lowFuel = fuelRatio <= 0.25;
    const flashAlt = Math.floor(this.animTimer * 4) % 2 === 0;
    for (let i = 0; i < this.segImgs.length; i++) {
      if (i < filledSegs) {
        const frame = lowFuel
          ? (flashAlt ? 'fuel_segment' : 'fuel_segment_low')
          : 'fuel_segment';
        this.segImgs[i].setVisible(true).setFrame(frame);
      } else {
        this.segImgs[i].setVisible(false);
      }
    }

    // LOW! warning — always visible when low, positioned right after the last filled segment
    if (lowFuel) {
      this.hudLowText.setX(HUD_SEG_X + filledSegs * SEG_STRIDE + 4).setVisible(true);
    } else {
      this.hudLowText.setVisible(false);
    }

    // Emerald count
    const emStr = `X${p.emeralds}`;
    this.hudEmText.setText(emStr).setX(HUD_EM_X + 18);

    // Floor number
    const floorStr = `FLOOR ${state.floor}`;
    this.hudFloorText.setText(floorStr).setX(HUD_EM_X + 18 + measureText(emStr) + 10);

    // Biome name — right-aligned before right bedrock column
    const biome = biomeName(state.floor);
    this.hudBiomeText.setText(biome).setX(480 - 16 - measureText(biome) - 2).setTint(biomeColor(state.floor));
  }

  // ── Pulse effect ───────────────────────────────────────────────────────────

  private spawnPulseEffect(
    sx: number, sy: number,
    dir: 'up' | 'down' | 'left' | 'right',
    range: number,
    state: RunState,
  ): void {
    const { dx, dy } = dirDelta(dir);
    const angle = dir === 'right' ? 0 : dir === 'down' ? 90 : dir === 'left' ? 180 : -90;
    const FRAME_MS = 45;
    const HIT_FRAME_MS = 55;

    let lastTx = sx + dx;
    let lastTy = sy + dy;

    for (let i = 1; i <= range; i++) {
      const tx = sx + dx * i;
      const ty = sy + dy * i;
      const tile = tileAt(state.grid, tx, ty);
      const blocked = tile === TileType.Bedrock || tile === TileType.Dirt;

      // Beam tile: play pulse_0..3 in sequence
      const img = this.scene.add.image(tx * T + T / 2, ty * T + T / 2, 'pulse_0')
        .setDepth(3.5).setAngle(angle);
      let frame = 0;
      this.scene.time.addEvent({
        delay: FRAME_MS,
        repeat: 3,
        callback: () => {
          frame++;
          if (frame < 4) img.setTexture(`pulse_${frame}`);
          else img.destroy();
        },
      });

      if (!blocked) { lastTx = tx; lastTy = ty; }
      if (blocked || i === tuning.pulse.range) {
        // Hit animation at last reachable tile
        const hitImg = this.scene.add.image(lastTx * T + T / 2, lastTy * T + T / 2, 'pulse_hit_0')
          .setDepth(3.6);
        let hitFrame = 0;
        this.scene.time.addEvent({
          delay: HIT_FRAME_MS,
          repeat: 3,
          callback: () => {
            hitFrame++;
            if (hitFrame < 4) hitImg.setTexture(`pulse_hit_${hitFrame}`);
            else hitImg.destroy();
          },
        });
        break;
      }
    }
  }

  // ── Purple hum ────────────────────────────────────────────────────────────

  private drawHum(): void {
    this.humGfx.clear();
    const y = (GRID_H - 1) * T;
    // Solid base strip
    this.humGfx.fillStyle(0x6b3fa0).fillRect(0, y, GRID_W * T, 1);
    // Brighter accent pixels that shift position at ~6 Hz
    const offset = Math.floor(this.animTimer * 6) % 2 * 3;
    this.humGfx.fillStyle(0xb66be0);
    for (let x = offset; x < GRID_W * T; x += 6) {
      this.humGfx.fillRect(x, y, 1, 1);
    }
  }

  // ── Events → visual effects ───────────────────────────────────────────────

  private processEvents(events: GameEvent[], state: RunState, shakeEnabled: boolean): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'hit':
          if (shakeEnabled) this.scene.cameras.main.shake(200, 0.003);
          break;
        case 'dig': {
          const de = ev as { x: number; y: number; dir: string };
          this.spawnDigDust(de.x, de.y, de.dir);
          break;
        }
        case 'bag-break':
          this.spawnStarburst((ev as { x: number; y: number }).x, (ev as { x: number; y: number }).y);
          break;
        case 'pickup': {
          const pu = ev as { kind: string; value: number };
          const txt = pu.kind === 'fuel' ? `+${pu.value}F` : `+${pu.value}`;
          this.spawnFloatText(state.player.x, state.player.y, txt, COLOR.gold);
          break;
        }
        case 'pulse-fire': {
          const pf = ev as { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right'; range: number };
          this.spawnPulseEffect(pf.x, pf.y, pf.dir, pf.range, state);
          break;
        }
        case 'kill': {
          const kv = ev as { kind: string; x: number; y: number; facing: 'left' | 'right' };
          if (kv.kind === 'grub' || kv.kind === 'burrower' || kv.kind === 'spitter' || kv.kind === 'drifter') {
            const dir = (kv.kind === 'burrower' || kv.kind === 'drifter') ? 'front' : kv.facing;
            const img = this.scene.add.image(
              kv.x * T + T / 2, kv.y * T + T / 2,
              `${kv.kind}_death_${dir}_0`,
            ).setOrigin(0.5, 0.5).setDepth(6);
            this.enemyDeathEffects.push({ img, kind: kv.kind as 'grub' | 'burrower' | 'spitter' | 'drifter', facing: kv.facing, timer: 0 });
          }
          break;
        }
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

  private spawnDigDust(tx: number, ty: number, dir: string): void {
    const gfx = this.scene.add.graphics().setDepth(5);
    const cx = tx * T + 8;
    const cy = ty * T + 8;
    const ddx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const ddy = dir === 'down'  ? 1 : dir === 'up'   ? -1 : 0;
    // Small fan of dirt pixels spraying in the dig direction
    gfx.fillStyle(0xf4eed9).fillRect(cx + ddx * 3,       cy + ddy * 3,       1, 1);
    gfx.fillStyle(0xb57a46).fillRect(cx + ddx * 4 + ddy, cy + ddy * 4 + ddx, 1, 1);
    gfx.fillStyle(0xb57a46).fillRect(cx + ddx * 4 - ddy, cy + ddy * 4 - ddx, 1, 1);
    gfx.fillStyle(0x8f5a33).fillRect(cx + ddx * 5,       cy + ddy * 5,       1, 1);
    this.scene.time.delayedCall(160, () => gfx.destroy());
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
    for (const img of this.heartImgs) img.destroy();
    this.fuelIconImg.destroy();
    for (const img of this.segImgs) img.destroy();
    this.emIconImg.destroy();
    this.playerImg.destroy();
    this.lanternGfx.destroy();
    this.pulseGfx.destroy();
    this.hudEmText.destroy();
    this.hudFloorText.destroy();
    this.hudBiomeText.destroy();
    this.hudLowText.destroy();
    for (const img of this.entityImages.values()) img.destroy();
    for (const f of this.floatTexts) f.bm.destroy();
  }
}
