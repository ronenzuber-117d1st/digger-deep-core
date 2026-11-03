import Phaser from 'phaser';
import { RunState } from '../core/run';
import { generateFloor } from '../core/floorgen';
import { createRNG } from '../core/rng';
import { createPlayer } from '../core/entities';
import { step } from '../core/step';
import { InputSnapshot } from '../input/actions';
import { DiveRenderer } from '../render/index';
import { GameEvent } from '../core/events';
import { makeGrub, makeBurrower } from '../core/rules/monsters';
import { triggerTileBomb } from '../core/rules/index';
import { deathPayout } from '../core/economy';
import { saveSave } from '../storage/index';
import { SaveData, createFreshSave } from '../core/save';
import { DebugPanel, DebugState, createDebugState } from '../debug/index';
import { RunCarry } from './carry';
import { bitmapLabel, COLOR, FONT_KEY, FONT_SIZE } from '../render/font';
import tuning from '../data/tuning.json';
import { playTrack, stopTrack, playJingle, getSceneTrack } from '../audio/index';

const STEP_DT = 1 / 60;
const MAX_DELTA = 0.1;
const OVERLAY_DEPTH = 50;

const HELP_LINES = [
  '-- CONTROLS --',
  '',
  'MOVE/DIG   ARROW KEYS OR WASD',
  'PULSE      AUTO-FIRES EVERY 1.2S',
  'E          ECHO PING (ONCE/FLOOR)',
  'SPACE      TILE BOMB (ONCE/FLOOR)',
  '',
  'P          PAUSE/UNPAUSE',
  'ESC        EXIT TO MENU',
  'H          THIS SCREEN',
  '',
  '-- DEBUG --',
  '',
  '[BACKTICK] TOGGLE DEBUG PANEL',
  'F2         GOD MODE',
  'F4         +100 EMERALDS',
  'F8         SKIP FLOOR',
  'F9         SPAWN GRUB',
  'F10        SPAWN BURROWER',
  '',
  'PRESS H TO CLOSE',
].join('\n');

export class DiveScene extends Phaser.Scene {
  private gameState!: RunState;
  private accumulator = 0;
  private diveRenderer!: DiveRenderer;
  private pendingEvents: GameEvent[] = [];
  private keys!: ReturnType<typeof setupKeys>;
  private debugPanel!: DebugPanel;
  private debugState: DebugState = createDebugState();
  private paused = false;
  private confirmingExit = false;
  private deathTimer: number | null = null;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private helpOverlay!: Phaser.GameObjects.Container;
  private confirmOverlay!: Phaser.GameObjects.Container;
  private gameOverText!: Phaser.GameObjects.BitmapText;
  private gameOverHint!: Phaser.GameObjects.BitmapText;
  private saveData!: SaveData;

  constructor() {
    super({ key: 'Dive' });
  }

  init(data: RunCarry | { seed?: number; floor?: number }): void {
    const carry = data as RunCarry;
    if (carry.saveData !== undefined) {
      this.saveData = carry.saveData;
      this.startFloor(carry.seed, carry.floor, carry);
    } else {
      this.saveData = createFreshSave();
      const seed = (data as { seed?: number }).seed ?? Math.floor(Math.random() * 0xffffffff);
      const floor = (data as { floor?: number }).floor ?? 1;
      this.startFloor(seed, floor, null);
    }
  }

  private startFloor(seed: number, floor: number, carry: RunCarry | null): void {
    this.deathTimer = null;
    const rng = createRNG(seed);
    const floorData = generateFloor(rng, floor);

    const ups = this.saveData.upgrades;
    let runUps = carry?.runUpgrades ?? [];
    if (ups.lanternMount > 0 && !runUps.includes('lantern')) {
      runUps = [...runUps, 'lantern'];
    }
    const hp = carry?.hp ?? tuning.player.startHp + ups.hull;
    const maxHp = carry?.maxHp ?? tuning.player.startHp + ups.hull;
    const maxFuel = carry?.maxFuel ?? tuning.player.startFuel * (1 + ups.fuelTank * 0.1);
    const fuel = carry?.fuel ?? maxFuel;
    const pulseDamage = ups.pulseCore;
    const digSpeedMult = 1 + ups.drillMotor * 0.1 + (runUps.includes('quickDrill') ? 0.25 : 0);

    const player = createPlayer(
      floorData.playerStart.x,
      floorData.playerStart.y,
      hp, maxHp, fuel, maxFuel, pulseDamage, digSpeedMult,
    );
    player.emeralds = carry?.emeralds ?? 0;
    player.shield = runUps.includes('shield');

    this.gameState = {
      seed,
      floor,
      grid: floorData.grid,
      player,
      entities: floorData.entities,
      nextId: floorData.startNextId,
      phase: 'playing',
      kills: carry?.kills ?? 0,
      killsByType: carry?.killsByType ?? {},
      runUpgrades: runUps,
      secondWindUsed: carry?.secondWindUsed ?? false,
      magnetTimer: 0,
      fuelStarveTimer: 0,
      echoPingAvailable: true,
      echoPingTimer: 0,
      tileBombAvailable: true,
    };
    this.accumulator = 0;
    this.pendingEvents = [];
  }

  create(): void {
    const biomeIdx = Math.min(Math.floor((this.gameState.floor - 1) / 5), 5);
    void playTrack(getSceneTrack(`biome${biomeIdx}`) ?? 'topsoil');
    this.events.once('shutdown', stopTrack);
    this.diveRenderer = new DiveRenderer(this);
    this.keys = setupKeys(this);
    this.debugPanel = new DebugPanel(this);

    const GAME_CENTER_X = 240;
    const GAME_CENTER_Y = 136;

    this.pauseOverlay = this.makeTextOverlay(
      GAME_CENTER_X, GAME_CENTER_Y,
      'PAUSED\n\nP TO RESUME',
    );
    this.helpOverlay = this.makeTextOverlay(
      GAME_CENTER_X, GAME_CENTER_Y,
      HELP_LINES,
    );
    this.confirmOverlay = this.makeTextOverlay(
      GAME_CENTER_X, GAME_CENTER_Y,
      'EXIT TO MENU?\n\nY - YES     N - CANCEL',
    );

    const cx = 240;
    const cy = 120;
    this.gameOverText = this.add
      .bitmapText(cx, cy, FONT_KEY, 'GAME OVER', FONT_SIZE * 2)
      .setTint(COLOR.warn)
      .setOrigin(0.5, 0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
    this.gameOverHint = this.add
      .bitmapText(cx, cy + 18, FONT_KEY, 'PRESS ENTER OR SPACE', FONT_SIZE)
      .setTint(COLOR.soft)
      .setOrigin(0.5, 0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    this.setupKeyHandlers();
  }

  private makeTextOverlay(
    cx: number,
    cy: number,
    text: string,
  ): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    const lines = text.split('\n');
    const lineH = 10;
    const padX = 20;
    const padY = 12;
    const textW = Math.max(...lines.map((l) => l.length)) * 6;
    const textH = lines.length * lineH;
    const boxW = textW + padX * 2;
    const boxH = textH + padY * 2;

    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
    bg.lineStyle(1, 0x43365f);
    bg.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

    const bm = bitmapLabel(this, -textW / 2, -textH / 2, text, COLOR.body);
    bm.setMaxWidth(textW + 10);

    const c = this.add.container(cx, cy, [bg, bm]).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    c.setVisible(false);
    return c;
  }

  private setupKeyHandlers(): void {
    this.input.keyboard!.on('keydown-H', () => {
      if (this.confirmingExit) return;
      const next = !this.helpOverlay.visible;
      this.helpOverlay.setVisible(next);
      if (next) {
        this.paused = true;
        this.pauseOverlay.setVisible(false);
      } else {
        this.paused = false;
        this.accumulator = 0;
      }
    });

    this.input.keyboard!.on('keydown-P', () => {
      if (this.confirmingExit || this.helpOverlay.visible) return;
      this.paused = !this.paused;
      this.pauseOverlay.setVisible(this.paused);
      if (!this.paused) this.accumulator = 0;
    });

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.helpOverlay.visible) {
        this.helpOverlay.setVisible(false);
        this.paused = false;
        this.accumulator = 0;
        return;
      }
      if (this.confirmingExit) {
        this.confirmingExit = false;
        this.confirmOverlay.setVisible(false);
        this.paused = false;
        this.accumulator = 0;
        return;
      }
      if (this.gameState.phase !== 'playing' && !this.paused) return;
      this.confirmingExit = true;
      this.confirmOverlay.setVisible(true);
      this.paused = true;
      this.pauseOverlay.setVisible(false);
    });

    this.input.keyboard!.on('keydown-Y', () => {
      if (!this.confirmingExit) return;
      this.scene.start('Title');
    });

    this.input.keyboard!.on('keydown-N', () => {
      if (!this.confirmingExit) return;
      this.confirmingExit = false;
      this.confirmOverlay.setVisible(false);
      this.paused = false;
      this.accumulator = 0;
    });

    this.input.keyboard!.on('keydown-BACKTICK', () => {
      this.debugState.enabled = !this.debugState.enabled;
    });
    this.input.keyboard!.on('keydown-F2', () => {
      this.debugState.godMode = !this.debugState.godMode;
    });
    this.input.keyboard!.on('keydown-F4', () => {
      this.gameState.player.emeralds += 100;
    });
    this.input.keyboard!.on('keydown-F8', () => {
      this.gameState.phase = 'floor-clear';
    });
    this.input.keyboard!.on('keydown-F9', () => {
      const px = this.gameState.player.x + 3;
      const py = this.gameState.player.y;
      this.gameState.entities.push(makeGrub(this.gameState.nextId++, px, py));
    });
    this.input.keyboard!.on('keydown-F10', () => {
      const px = this.gameState.player.x + 3;
      const py = this.gameState.player.y;
      this.gameState.entities.push(makeBurrower(this.gameState.nextId++, px, py));
    });
    this.input.keyboard!.on('keydown-E', () => {
      if (this.paused) return;
      if (!this.gameState.runUpgrades.includes('echoPing')) return;
      if (!this.gameState.echoPingAvailable) return;
      this.gameState.echoPingAvailable = false;
      this.gameState.echoPingTimer = tuning.echoPing.duration;
    });

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.paused) return;
      if (this.gameState.phase === 'dead' && this.diveRenderer.isDeathAnimComplete()) {
        this.transitionFromDeath();
        return;
      }
      if (this.gameState.phase !== 'playing') return;
      if (!this.gameState.runUpgrades.includes('tileBomb')) return;
      if (!this.gameState.tileBombAvailable) return;
      const events = triggerTileBomb(this.gameState);
      this.cameras.main.shake(250, 0.005);
      this.pendingEvents.push(...events);
    });

    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.gameState.phase === 'dead' && this.diveRenderer.isDeathAnimComplete()) {
        this.transitionFromDeath();
      }
    });

    this.input.keyboard!.on('keydown-F11', () => {
      if (!this.gameState.runUpgrades.includes('goldRush')) {
        this.gameState.runUpgrades = [...this.gameState.runUpgrades, 'goldRush'];
      }
    });
  }

  private transitionFromDeath(): void {
    const { seed, floor, player, kills, killsByType } = this.gameState;
    const prevBestFloor = this.saveData.stats.bestFloor;
    const salvageLvl = this.saveData.upgrades.salvageContract;
    const finalBanked = deathPayout(player.emeralds, salvageLvl);
    const newSave: SaveData = {
      ...this.saveData,
      emeralds: this.saveData.emeralds + finalBanked,
      stats: {
        ...this.saveData.stats,
        runs: this.saveData.stats.runs + 1,
        deaths: this.saveData.stats.deaths + 1,
        bestFloor: Math.max(this.saveData.stats.bestFloor, floor),
        totalKills: this.saveData.stats.totalKills + kills,
      },
      runHistory: [...(this.saveData.runHistory ?? []),
        { floor, emeralds: finalBanked, kills, survived: false, seed }].slice(-50),
    };
    saveSave(newSave);
    this.scene.start('Summary', {
      floor, emeraldsCarried: player.emeralds, emeraldsBanked: finalBanked,
      kills, killsByType, seed, survived: false, saveData: newSave, prevBestFloor,
    });
  }

  update(_time: number, deltaMs: number): void {
    const rawDt = deltaMs / 1000;
    const dt = Math.min(rawDt, MAX_DELTA);

    if (this.paused) return;

    this.accumulator += dt;
    const input = readInput(this.keys);

    while (this.accumulator >= STEP_DT) {
      this.accumulator -= STEP_DT;
      const effectiveInput: InputSnapshot = this.gameState.phase === 'playing' ? input : {
        moveUp: false, moveDown: false, moveLeft: false, moveRight: false, pause: false,
      };
      const result = step(this.gameState, effectiveInput, STEP_DT);
      this.gameState = result.state;
      this.pendingEvents.push(...result.events);
    }

    if (this.gameState.phase !== 'playing') {
      const phase = this.gameState.phase;
      const { seed, floor, player, kills } = this.gameState;

      if (this.debugState.godMode) {
        if (phase !== 'dead') {
          this.gameState.player.hp = this.gameState.player.maxHp;
          this.gameState.player.fuel = this.gameState.player.maxFuel;
          this.gameState.phase = 'playing';
          this.pendingEvents = [];
          return;
        }
      }

      if (phase === 'dead') {
        if (this.deathTimer === null) {
          this.deathTimer = 0;
          this.diveRenderer.startDeathAnim(player.lastHFacing);
          void playJingle('death');
        }
        this.deathTimer += dt;

        this.diveRenderer.update(this.gameState, dt, this.pendingEvents, this.saveData.settings.shake);
        this.pendingEvents = [];

        if (this.diveRenderer.isDeathAnimComplete() && !this.gameOverText.visible) {
          this.gameOverText.setVisible(true);
          this.gameOverHint.setVisible(true);
        }

        return;  // wait for ENTER / SPACE
      }

      if (phase === 'extraction') {
        const carry: RunCarry = {
          seed, floor,
          hp: player.hp, maxHp: player.maxHp,
          fuel: player.fuel, maxFuel: player.maxFuel,
          emeralds: player.emeralds,
          kills, killsByType: this.gameState.killsByType,
          saveData: this.saveData,
          runUpgrades: this.gameState.runUpgrades,
          secondWindUsed: this.gameState.secondWindUsed,
        };
        this.scene.start('Extraction', { carry });
        return;
      }

      if (phase === 'floor-clear') {
        const nextFloor = floor + 1;
        const fuelAfterClear = Math.min(player.fuel + tuning.player.fuelPerFloorClear, player.maxFuel);
        const carry: RunCarry = {
          seed: seed + floor,
          floor: nextFloor,
          hp: player.hp, maxHp: player.maxHp,
          fuel: fuelAfterClear, maxFuel: player.maxFuel,
          emeralds: player.emeralds,
          kills, killsByType: this.gameState.killsByType,
          saveData: this.saveData,
          runUpgrades: this.gameState.runUpgrades,
          secondWindUsed: this.gameState.secondWindUsed,
        };
        // Run pick offered every 2nd floor (after floor 2, 4, 6…)
        if (floor % 2 === 0) {
          this.scene.start('RunPick', { carry });
        } else {
          this.scene.start('Dive', carry);
        }
        return;
      }
    }

    if (this.debugState.godMode) {
      this.gameState.player.hp = this.gameState.player.maxHp;
      this.gameState.player.fuel = this.gameState.player.maxFuel;
    }

    this.diveRenderer.update(this.gameState, dt, this.pendingEvents, this.saveData.settings.shake);
    this.pendingEvents = [];

    this.debugPanel.update(
      this.gameState,
      this.debugState,
      1000 / (deltaMs || 16.67),
      this.saveData,
    );
  }
}

interface Keys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
}

function setupKeys(scene: Phaser.Scene): Keys {
  const kb = scene.input.keyboard!;
  return {
    up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
    down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
    left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
    right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  };
}

function readInput(keys: Keys): InputSnapshot {
  return {
    moveUp: keys.up.isDown || keys.w.isDown,
    moveDown: keys.down.isDown || keys.s.isDown,
    moveLeft: keys.left.isDown || keys.a.isDown,
    moveRight: keys.right.isDown || keys.d.isDown,
    pause: false,
  };
}
