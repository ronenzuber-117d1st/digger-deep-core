import Phaser from 'phaser';

export class DeathScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Death' });
  }

  init(data: { floor: number; emeralds: number; seed: number }): void {
    this.data.set('floor', data.floor);
    this.data.set('emeralds', data.emeralds);
    this.data.set('seed', data.seed);
  }

  create(): void {
    const floor = this.data.get('floor') as number;
    const emeralds = this.data.get('emeralds') as number;
    const seed = this.data.get('seed') as number;

    this.add.rectangle(240, 136, 480, 272, 0x000000, 0.85);

    this.add.text(240, 80, 'DEEP CORE FAILURE', {
      fontSize: '24px',
      color: '#ff4444',
    }).setOrigin(0.5);

    this.add.text(240, 120, `Reached floor ${floor}`, {
      fontSize: '14px',
      color: '#cccccc',
    }).setOrigin(0.5);

    this.add.text(240, 145, `Emeralds recovered: ${emeralds}`, {
      fontSize: '14px',
      color: '#00ffaa',
    }).setOrigin(0.5);

    this.add.text(240, 185, `Seed: ${seed}`, {
      fontSize: '10px',
      color: '#666666',
    }).setOrigin(0.5);

    this.add.text(240, 220, 'Press SPACE or ENTER to dive again', {
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-SPACE', () => this.restartDive());
    this.input.keyboard!.once('keydown-ENTER', () => this.restartDive());
  }

  private restartDive(): void {
    this.scene.start('Dive', {});
  }
}
