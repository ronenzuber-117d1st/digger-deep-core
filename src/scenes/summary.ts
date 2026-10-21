import Phaser from 'phaser';
import { SaveData } from '../core/save';

export interface SummaryData {
  floor: number;
  emeraldsBanked: number;
  kills: number;
  seed: number;
  survived: boolean;
  saveData: SaveData;
}

export class SummaryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Summary' });
  }

  init(data: SummaryData): void {
    this.data.set('d', data);
  }

  create(): void {
    const d = this.data.get('d') as SummaryData;

    this.add.rectangle(240, 136, 480, 272, 0x000000, 0.9);

    const titleColor = d.survived ? '#f7c94b' : '#e0502f';
    const titleText = d.survived ? 'EXTRACTED' : 'SIGNAL LOST';
    this.add.text(240, 50, titleText, {
      fontSize: '28px',
      color: titleColor,
    }).setOrigin(0.5);

    const rows: [string, string][] = [
      ['Floor reached', String(d.floor)],
      ['Emeralds banked', `${d.emeraldsBanked} ◆`],
      ['Monsters killed', String(d.kills)],
      ['Seed', String(d.seed)],
    ];

    rows.forEach(([label, value], i) => {
      this.add.text(140, 105 + i * 22, label, { fontSize: '12px', color: '#9aa1b2' });
      this.add.text(340, 105 + i * 22, value, { fontSize: '12px', color: '#e8e6df' }).setOrigin(1, 0);
    });

    this.add.text(240, 220, 'Press ENTER or SPACE to return to base', {
      fontSize: '11px',
      color: '#5d6475',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Base'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('Base'));
  }
}
