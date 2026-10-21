import Phaser from 'phaser';

export class FloorClearScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FloorClear' });
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

    this.add.text(240, 80, 'FLOOR CLEARED!', {
      fontSize: '24px',
      color: '#44ff44',
    }).setOrigin(0.5);

    this.add.text(240, 120, `Floor ${floor} complete`, {
      fontSize: '14px',
      color: '#cccccc',
    }).setOrigin(0.5);

    this.add.text(240, 145, `Emeralds: ${emeralds}`, {
      fontSize: '14px',
      color: '#00ffaa',
    }).setOrigin(0.5);

    this.add.text(240, 185, `Seed: ${seed}`, {
      fontSize: '10px',
      color: '#666666',
    }).setOrigin(0.5);

    this.add.text(240, 220, 'Press SPACE or ENTER for next floor', {
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-SPACE', () => this.nextFloor());
    this.input.keyboard!.once('keydown-ENTER', () => this.nextFloor());
  }

  private nextFloor(): void {
    const floor = this.data.get('floor') as number;
    const seed = this.data.get('seed') as number;
    this.scene.start('Dive', { seed: seed + floor, floor: floor + 1 });
  }
}
