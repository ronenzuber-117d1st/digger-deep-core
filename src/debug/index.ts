import Phaser from 'phaser';
import { RunState } from '../core/run';
import { SaveData } from '../core/save';
import {
  getEngineMode, setEngineMode, setMusicVolume, getMusicVolume,
  setDelayLevel, getLoopInfo, getAvailableTrackNames, playTrack,
  stopTrack, EngineMode,
} from '../audio/index';
import { playMusic, stopMusic, DIVE_THEME } from '../audio/music';

export interface DebugState {
  enabled: boolean;
  godMode: boolean;
  seedOverride: number | null;
}

export function createDebugState(): DebugState {
  return { enabled: false, godMode: false, seedOverride: null };
}

// ── Music debug sub-panel ─────────────────────────────────────────────────────

const ENGINE_MODES: EngineMode[] = ['chiptune', 'dry', 'procedural'];
const ENGINE_LABELS = ['FULL CHIPTUNE', 'DRY SQUARE', 'PROCEDURAL'];

export class MusicDebugPanel {
  private text: Phaser.GameObjects.Text;
  private trackIdx = 0;
  private volLevel = 5;    // 0–10
  private delayLevel = 3;  // 0–10
  private trackNames: string[] = [];

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(2, 2, '', {
        fontSize: '8px',
        color: '#aaffee',
        backgroundColor: '#00000099',
        padding: { x: 3, y: 2 },
      })
      .setDepth(101)
      .setScrollFactor(0)
      .setVisible(false);

    this.trackNames = getAvailableTrackNames().filter(n => !['death','victory'].includes(n));

    // Keyboard shortcuts (only active when panel is visible)
    scene.input.keyboard!.on('keydown-COMMA',  () => { if (this.text.visible) this.prevTrack(); });
    scene.input.keyboard!.on('keydown-PERIOD', () => { if (this.text.visible) this.nextTrack(); });
    scene.input.keyboard!.on('keydown-P',      () => { /* handled by dive scene */ });
    scene.input.keyboard!.on('keydown-OPEN_BRACKET',  () => { if (this.text.visible) this.decVol(); });
    scene.input.keyboard!.on('keydown-CLOSED_BRACKET',() => { if (this.text.visible) this.incVol(); });
    scene.input.keyboard!.on('keydown-MINUS',  () => { if (this.text.visible) this.decDelay(); });
    scene.input.keyboard!.on('keydown-EQUALS', () => { if (this.text.visible) this.incDelay(); });
    scene.input.keyboard!.on('keydown-M',      () => { if (this.text.visible) this.cycleMode(); });
    scene.input.keyboard!.on('keydown-SLASH',  () => {
      if (this.text.visible) { void playTrack(this.trackNames[this.trackIdx] ?? 'topsoil'); }
    });
    scene.input.keyboard!.on('keydown-BACKSLASH', () => {
      if (this.text.visible) stopTrack();
    });
  }

  private prevTrack(): void { this.trackIdx = (this.trackIdx - 1 + this.trackNames.length) % this.trackNames.length; }
  private nextTrack(): void { this.trackIdx = (this.trackIdx + 1) % this.trackNames.length; }
  private decVol():   void { this.volLevel = Math.max(0, this.volLevel - 1); setMusicVolume(this.volLevel / 10); }
  private incVol():   void { this.volLevel = Math.min(10, this.volLevel + 1); setMusicVolume(this.volLevel / 10); }
  private decDelay(): void { this.delayLevel = Math.max(0, this.delayLevel - 1); setDelayLevel(this.delayLevel / 10); }
  private incDelay(): void { this.delayLevel = Math.min(10, this.delayLevel + 1); setDelayLevel(this.delayLevel / 10); }

  private cycleMode(): void {
    const cur = ENGINE_MODES.indexOf(getEngineMode());
    const next = ENGINE_MODES[(cur + 1) % ENGINE_MODES.length];
    setEngineMode(next);
    if (next === 'procedural') {
      // Kick old engine with a placeholder theme
      void stopTrack(0);
      playMusic(DIVE_THEME);
    } else {
      stopMusic();
    }
  }

  setVisible(v: boolean): void { this.text.setVisible(v); }

  update(): void {
    if (!this.text.visible) return;

    const loop     = getLoopInfo();
    const mode     = getEngineMode();
    const modeIdx  = ENGINE_MODES.indexOf(mode);
    const track    = this.trackNames[this.trackIdx] ?? '—';
    const vol      = Math.round(getMusicVolume() * 10);
    const loopStr  = loop.trackName
      ? `${loop.trackName}  ${loop.positionSec.toFixed(1)}/${loop.endSec.toFixed(1)}s`
      : '—';

    const rows = [
      `[MUSIC] ENGINE: ${ENGINE_LABELS[modeIdx]} (M to cycle)`,
      `TRACK: ${track}  (,/. to scroll  / to play  \\ to stop)`,
      `LOOP:  ${loopStr}`,
      `VOL:   ${'|'.repeat(vol)}${'.'.repeat(10 - vol)}  ([ ] ±)`,
      `DELAY: ${'|'.repeat(this.delayLevel)}${'.'.repeat(10 - this.delayLevel)}  (- + ±)`,
    ];
    this.text.setText(rows.join('\n'));
  }

  destroy(): void { this.text.destroy(); }
}

// ── Game debug panel ──────────────────────────────────────────────────────────

export class DebugPanel {
  private text:  Phaser.GameObjects.Text;
  private music: MusicDebugPanel;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(2, 254, '', {
        fontSize: '8px',
        color: '#ffff00',
        backgroundColor: '#00000088',
        padding: { x: 2, y: 1 },
      })
      .setDepth(100)
      .setScrollFactor(0);

    this.music = new MusicDebugPanel(scene);
  }

  update(gameState: RunState, debug: DebugState, fps: number, saveData?: SaveData): void {
    if (!debug.enabled) {
      this.text.setVisible(false);
      this.music.setVisible(false);
      return;
    }
    this.text.setVisible(true);
    this.music.setVisible(true);
    this.music.update();

    const p = gameState.player;
    const grubCount     = gameState.entities.filter((e) => e.kind === 'grub').length;
    const burrowerCount = gameState.entities.filter((e) => e.kind === 'burrower').length;
    const spitterCount  = gameState.entities.filter((e) => e.kind === 'spitter').length;
    const nestCount     = gameState.entities.filter((e) => e.kind === 'nest').length;
    const banked        = saveData?.emeralds ?? 0;

    const ups = gameState.runUpgrades.length > 0 ? gameState.runUpgrades.join(' ') : 'none';
    this.text.setText(
      [
        `FPS:${fps.toFixed(0)} FL:${gameState.floor} SEED:${gameState.seed} KILLS:${gameState.kills}`,
        `HP:${p.hp}/${p.maxHp} FUEL:${p.fuel.toFixed(1)}/${p.maxFuel.toFixed(0)} E:${p.emeralds} BANK:${banked}◆`,
        `G:${grubCount} B:${burrowerCount} SP:${spitterCount} NESTS:${nestCount} GOD:${debug.godMode ? 'ON' : 'OFF'}`,
        `UPG: ${ups}`,
        `[\`]tog [F2]god [F4]+100em [F8]skip [F9]grub [F10]burrow [F11]goldRush`,
      ].join('\n'),
    );
  }

  get textObject(): Phaser.GameObjects.Text {
    return this.text;
  }

  destroy(): void {
    this.text.destroy();
    this.music.destroy();
  }
}
