import Phaser from 'phaser';

// Legacy fallback — the Dive scene now handles death directly via Summary.
export class DeathScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Death' });
  }

  create(): void {
    this.scene.start('Base');
  }
}
