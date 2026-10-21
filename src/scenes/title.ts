import Phaser from 'phaser';
import { loadSave } from '../storage/index';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.add.rectangle(240, 136, 480, 272, 0x0d0b14);

    this.add.text(240, 60, 'DEEP CORE', {
      fontSize: '32px',
      color: '#f0a04b',
    }).setOrigin(0.5);

    this.add.text(240, 100, 'roguelite · dig · survive', {
      fontSize: '10px',
      color: '#78768a',
    }).setOrigin(0.5);

    const save = loadSave();
    const hasSave = save.stats.runs > 0;

    const newGameText = this.add.text(240, 160, 'NEW GAME', {
      fontSize: '16px',
      color: '#5bc46a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    newGameText.on('pointerover', () => newGameText.setColor('#a8e68a'));
    newGameText.on('pointerout', () => newGameText.setColor('#5bc46a'));
    newGameText.on('pointerdown', () => this.startNew());

    if (hasSave) {
      const continueText = this.add.text(240, 195, `CONTINUE  (floor ${save.stats.bestFloor}  ·  ${save.emeralds} ◆)`, {
        fontSize: '14px',
        color: '#5bb8e8',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      continueText.on('pointerover', () => continueText.setColor('#a8e4f5'));
      continueText.on('pointerout', () => continueText.setColor('#5bb8e8'));
      continueText.on('pointerdown', () => this.scene.start('Base'));
    }

    this.add.text(240, 260, 'arrows / WASD to move · pulse auto-fires · H for help', {
      fontSize: '8px',
      color: '#43365f',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-ENTER', () => this.startNew());
    this.input.keyboard!.once('keydown-SPACE', () => {
      if (hasSave) this.scene.start('Base');
      else this.startNew();
    });
  }

  private startNew(): void {
    this.scene.start('Base');
  }
}
