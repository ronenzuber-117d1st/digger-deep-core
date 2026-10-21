import Phaser from 'phaser';
import { RunState } from '../core/run';

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
      .text(2, 260, '', {
        fontSize: '9px',
        color: '#ffff00',
        backgroundColor: '#00000088',
        padding: { x: 2, y: 1 },
      })
      .setDepth(100)
      .setScrollFactor(0);
  }

  update(gameState: RunState, debug: DebugState, fps: number): void {
    if (!debug.enabled) {
      this.text.setVisible(false);
      return;
    }
    this.text.setVisible(true);

    const p = gameState.player;
    const grubCount = gameState.entities.filter((e) => e.kind === 'grub').length;
    const nestCount = gameState.entities.filter((e) => e.kind === 'nest').length;

    this.text.setText(
      [
        `FPS:${fps.toFixed(0)} FLOOR:${gameState.floor} SEED:${gameState.seed}`,
        `HP:${p.hp}/${p.maxHp} FUEL:${p.fuel.toFixed(1)} E:${p.emeralds}`,
        `GRUBS:${grubCount} NESTS:${nestCount} GOD:${debug.godMode ? 'ON' : 'OFF'}`,
        `[F1]toggle [F2]god [F3]+em [F4]skip [F5]grub`,
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
