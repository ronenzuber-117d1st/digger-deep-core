import Phaser from 'phaser';

// Legacy fallback — the Dive scene now handles floor transitions internally.
export class FloorClearScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FloorClear' });
  }

  create(): void {
    this.scene.start('Base');
  }
}
