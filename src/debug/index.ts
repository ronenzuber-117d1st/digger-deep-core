import Phaser from 'phaser';
import { RunState } from '../core/run';
import { SaveData } from '../core/save';

export interface DebugState {
  enabled: boolean;
  godMode: boolean;
  seedOverride: number | null;
}

export function createDebugState(): DebugState {
  return { enabled: false, godMode: false, seedOverride: null };
}

export class DebugPanel {
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(2, 282, '', {
        fontSize: '8px',
        color: '#ffff00',
        backgroundColor: '#00000088',
        padding: { x: 2, y: 1 },
      })
      .setDepth(100)
      .setScrollFactor(0);
  }

  update(gameState: RunState, debug: DebugState, fps: number, saveData?: SaveData): void {
    if (!debug.enabled) {
      this.text.setVisible(false);
      return;
    }
    this.text.setVisible(true);

    const p = gameState.player;
    const grubCount = gameState.entities.filter((e) => e.kind === 'grub').length;
    const burrowerCount = gameState.entities.filter((e) => e.kind === 'burrower').length;
    const spitterCount = gameState.entities.filter((e) => e.kind === 'spitter').length;
    const nestCount = gameState.entities.filter((e) => e.kind === 'nest').length;
    const banked = saveData?.emeralds ?? 0;

    this.text.setText(
      [
        `FPS:${fps.toFixed(0)} FL:${gameState.floor} SEED:${gameState.seed} KILLS:${gameState.kills}`,
        `HP:${p.hp}/${p.maxHp} FUEL:${p.fuel.toFixed(1)}/${p.maxFuel.toFixed(0)} E:${p.emeralds} BANK:${banked}◆`,
        `G:${grubCount} B:${burrowerCount} SP:${spitterCount} NESTS:${nestCount} GOD:${debug.godMode ? 'ON' : 'OFF'}`,
        `[\`]tog [F2]god [F4]+100em [F8]skip [F9]grub [F10]burrow`,
      ].join('\n'),
    );
  }

  get textObject(): Phaser.GameObjects.Text {
    return this.text;
  }

  destroy(): void {
    this.text.destroy();
  }
}
