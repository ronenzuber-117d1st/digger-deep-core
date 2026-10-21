import Phaser from 'phaser';
import { RunState } from '../core/run';
import { generateFloor } from '../core/floorgen';
import { createRNG } from '../core/rng';
import { createPlayer } from '../core/entities';
import { step } from '../core/step';
import { InputSnapshot } from '../input/actions';
import { renderFloor, renderHud, PulseFlash, HUD_HEIGHT } from '../render/index';
import { makeGrub, makeBurrower } from '../core/rules/monsters';
import { deathPayout } from '../core/economy';
import { saveSave } from '../storage/index';
import { SaveData, createFreshSave } from '../core/save';
import { DebugPanel, DebugState, createDebugState } from '../debug/index';
import { RunCarry } from './carry';
import tuning from '../data/tuning.json';

const STEP_DT = 1 / 60;
const MAX_DELTA = 0.1;

const HELP_TEXT = [
  '── CONTROLS ──',
  '',
  'Move / Dig   Arrow keys or WASD',
  'Pulse        Auto-fires every 1.2 s',
  '',
  'P            Pause / unpause',
  'Esc          Exit to menu',
  'H            This screen',
  '',
  '── DEBUG ──',
  '',
  '`            Toggle debug panel',
  'F2           God mode',
  'F4           +100 emeralds',
  'F8           Skip floor',
  'F9           Spawn grub',
  'F10          Spawn burrower',
  '',
  'Press H to close',
].join('\n');

export class DiveScene extends Phaser.Scene {
  private gameState!: RunState;
  private accumulator = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private keys!: ReturnType<typeof setupKeys>;
  private debugPanel!: DebugPanel;
  private debugState: DebugState = createDebugState();
  private pulseFlashes: PulseFlash[] = [];
  private paused = false;
  private confirmingExit = false;
  private pauseOverlay!: Phaser.GameObjects.Text;
  private helpOverlay!: Phaser.GameObjects.Text;
  private confirmOverlay!: Phaser.GameObjects.Text;
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
    const rng = createRNG(seed);
    const floorData = generateFloor(rng, floor);

    const ups = this.saveData.upgrades;
    const hp = carry?.hp ?? tuning.player.startHp + ups.hull;
    const maxHp = carry?.maxHp ?? tuning.player.startHp + ups.hull;
    const maxFuel = carry?.maxFuel ?? tuning.player.startFuel * (1 + ups.fuelTank * 0.1);
    const fuel = carry?.fuel ?? maxFuel;
    const pulseDamage = 1 + ups.pulseCore;
    const digSpeedMult = 1 + ups.drillMotor * 0.1;

    const player = createPlayer(
      floorData.playerStart.x,
      floorData.playerStart.y,
      hp, maxHp, fuel, maxFuel, pulseDamage, digSpeedMult,
    );
    player.emeralds = carry?.emeralds ?? 0;

    this.gameState = {
      seed,
      floor,
      grid: floorData.grid,
      player,
      entities: floorData.entities,
      nextId: floorData.startNextId,
      phase: 'playing',
      kills: carry?.kills ?? 0,
    };
    this.accumulator = 0;
    this.pulseFlashes = [];
  }

  create(): void {
    this.gfx = this.add.graphics().setDepth(0).setY(HUD_HEIGHT);
    this.hudGfx = this.add.graphics().setDepth(10).setScrollFactor(0);
    this.hudText = this.add
      .text(72, 4, '', { fontSize: '9px', color: '#ffffff' })
      .setDepth(10)
      .setScrollFactor(0);

    this.keys = setupKeys(this);
    this.debugPanel = new DebugPanel(this);

    const GAME_CENTER_Y = HUD_HEIGHT + 136;

    this.pauseOverlay = this.add
      .text(240, GAME_CENTER_Y, 'PAUSED\n\nP to resume', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#00000099',
        align: 'center',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setScrollFactor(0)
      .setVisible(false);

    this.helpOverlay = this.add
      .text(240, GAME_CENTER_Y, HELP_TEXT, {
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        align: 'left',
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setScrollFactor(0)
      .setVisible(false);

    this.confirmOverlay = this.add
      .text(240, GAME_CENTER_Y, 'Exit to menu?\n\nY — yes     N — cancel', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000099',
        align: 'center',
        padding: { x: 24, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(52)
      .setScrollFactor(0)
      .setVisible(false);

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
  }

  update(_time: number, deltaMs: number): void {
    const rawDt = deltaMs / 1000;
    const dt = Math.min(rawDt, MAX_DELTA);

    if (this.paused) return;

    this.accumulator += dt;

    const input = readInput(this.keys);

    while (this.accumulator >= STEP_DT) {
      this.accumulator -= STEP_DT;

      const effectiveInput = this.gameState.phase === 'playing' ? input : {
        moveUp: false, moveDown: false, moveLeft: false, moveRight: false, pause: false,
      };

      const result = step(this.gameState, effectiveInput, STEP_DT);
      this.gameState = result.state;

      for (const ev of result.events) {
        if (ev.type === 'pulse-fire') {
          this.pulseFlashes.push({ x: ev.x, y: ev.y, dir: ev.dir, ttl: 0.1 });
        }
      }
    }

    this.pulseFlashes = this.pulseFlashes
      .map((f) => ({ ...f, ttl: f.ttl - dt }))
      .filter((f) => f.ttl > 0);

    if (this.gameState.phase !== 'playing') {
      const phase = this.gameState.phase;
      const { seed, floor, player, kills } = this.gameState;

      if (this.debugState.godMode) {
        if (phase !== 'dead') {
          this.gameState.player.hp = this.gameState.player.maxHp;
          this.gameState.player.fuel = this.gameState.player.maxFuel;
          this.gameState.phase = 'playing';
          return;
        }
      }

      if (phase === 'dead') {
        const salvageLvl = this.saveData.upgrades.salvageContract;
        const banked = deathPayout(player.emeralds, salvageLvl);
        const prospectorMult = 1 + this.saveData.upgrades.prospector * 0.1;
        const finalBanked = Math.floor(banked * prospectorMult);

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
        };
        saveSave(newSave);

        this.scene.start('Summary', {
          floor,
          emeraldsBanked: finalBanked,
          kills,
          seed,
          survived: false,
          saveData: newSave,
        });
        return;
      }

      if (phase === 'extraction') {
        const carry: RunCarry = {
          seed,
          floor,
          hp: player.hp,
          maxHp: player.maxHp,
          fuel: player.fuel,
          maxFuel: player.maxFuel,
          emeralds: player.emeralds,
          kills,
          saveData: this.saveData,
        };
        this.scene.start('Extraction', { carry });
        return;
      }

      if (phase === 'floor-clear') {
        const nextSeed = seed + floor;
        const fuelAfterClear = Math.min(player.fuel + 15, player.maxFuel);
        const carry: RunCarry = {
          seed: nextSeed,
          floor: floor + 1,
          hp: player.hp,
          maxHp: player.maxHp,
          fuel: fuelAfterClear,
          maxFuel: player.maxFuel,
          emeralds: player.emeralds,
          kills,
          saveData: this.saveData,
        };
        this.scene.start('Dive', carry);
        return;
      }
    }

    if (this.debugState.godMode) {
      this.gameState.player.hp = this.gameState.player.maxHp;
      this.gameState.player.fuel = this.gameState.player.maxFuel;
    }

    renderFloor(this.gfx, this.gameState, this.pulseFlashes);
    renderHud(this.hudGfx, this.hudText, this.gameState);
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
