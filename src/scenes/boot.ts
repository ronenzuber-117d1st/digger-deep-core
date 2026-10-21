import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a0a2e');
  }
}
