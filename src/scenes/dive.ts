import Phaser from 'phaser';
import { RunState } from '../core/run';
import { generateFloor } from '../core/floorgen';
import { createRNG } from '../core/rng';
import { createPlayer } from '../core/entities';
import { step } from '../core/step';
import { InputSnapshot } from '../input/actions';
import { renderFloor, renderHud, PulseFlash } from '../render/index';
import { makeGrub } from '../core/rules/monsters';
import { DebugPanel, DebugState, createDebugState } from '../debug/index';
import tuning from '../data/tuning.json';

const STEP_DT = 1 / 60;
const MAX_DELTA = 0.1;

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

  constructor() {
    super({ key: 'Dive' });
  }

  init(data: { seed?: number; floor?: number }): void {
    const seed = data.seed ?? Math.floor(Math.random() * 0xffffffff);
    const floor = data.floor ?? 1;
    this.startFloor(seed, floor);
  }

  private startFloor(seed: number, floor: number): void {
    const rng = createRNG(seed);
    const floorData = generateFloor(rng, floor);
    const player = createPlayer(
      floorData.playerStart.x,
      floorData.playerStart.y,
      tuning.player.startHp,
      tuning.player.startFuel,
    );
    this.gameState = {
      seed,
      floor,
      grid: floorData.grid,
      player,
      entities: floorData.entities,
      nextId: floorData.startNextId,
      phase: 'playing',
    };
    this.accumulator = 0;
    this.pulseFlashes = [];
  }

  create(): void {
    this.gfx = this.add.graphics().setDepth(0);
    this.hudGfx = this.add.graphics().setDepth(10).setScrollFactor(0);
    this.hudText = this.add
      .text(72, 4, '', { fontSize: '9px', color: '#ffffff' })
      .setDepth(10)
      .setScrollFactor(0);

    this.keys = setupKeys(this);
    this.debugPanel = new DebugPanel(this);

    this.input.keyboard!.on('keydown-F1', () => {
      this.debugState.enabled = !this.debugState.enabled;
    });
    this.input.keyboard!.on('keydown-F2', () => {
      this.debugState.godMode = !this.debugState.godMode;
    });
    this.input.keyboard!.on('keydown-F3', () => {
      this.gameState.player.emeralds += 10;
    });
    this.input.keyboard!.on('keydown-F4', () => {
      this.gameState.phase = 'floor-clear';
    });
    this.input.keyboard!.on('keydown-F5', () => {
      const px = this.gameState.player.x + 3;
      const py = this.gameState.player.y;
      this.gameState.entities.push(makeGrub(this.gameState.nextId++, px, py));
    });
  }

  update(_time: number, deltaMs: number): void {
    const rawDt = deltaMs / 1000;
    const dt = Math.min(rawDt, MAX_DELTA);

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
      const { seed, floor, player } = this.gameState;
      if (phase === 'dead') {
        this.scene.start('Death', { seed, floor, emeralds: Math.floor(player.emeralds * 0.5) });
        return;
      }
      if (phase === 'floor-clear') {
        this.scene.start('FloorClear', { seed, floor, emeralds: player.emeralds });
        return;
      }
    }

    if (this.debugState.godMode) {
      this.gameState.player.hp = this.gameState.player.maxHp;
      this.gameState.player.fuel = 100;
    }

    renderFloor(this.gfx, this.gameState, this.pulseFlashes);
    renderHud(this.hudGfx, this.hudText, this.gameState);
    this.debugPanel.update(
      this.gameState,
      this.debugState,
      1000 / (deltaMs || 16.67),
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
