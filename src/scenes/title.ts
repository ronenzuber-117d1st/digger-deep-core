import Phaser from 'phaser';
import { loadSave } from '../storage/index';
import { bitmapLabel, COLOR, measureText } from '../render/font';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    // Background
    this.add.rectangle(240, 136, 480, 272, 0x0d0b14);

    // Title
    const titleStr = 'DEEP CORE';
    bitmapLabel(this, 240 - measureText(titleStr) / 2, 52, titleStr, COLOR.heading, 14)
      .setDepth(1);

    bitmapLabel(this, 0, 70, 'ROGUELITE  -  DIG  -  SURVIVE', COLOR.soft)
      .setOrigin(0).setX(240 - measureText('ROGUELITE  -  DIG  -  SURVIVE') / 2)
      .setDepth(1);

    const save = loadSave();
    const hasSave = save.stats.runs > 0;

    // NEW GAME button
    const ngX = 240 - measureText('NEW GAME') / 2;
    const ngBm = bitmapLabel(this, ngX, 130, 'NEW GAME', COLOR.good).setDepth(1)
      .setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, measureText('NEW GAME'), 10), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    ngBm.on('pointerover', () => ngBm.setTint(0xa8e68a));
    ngBm.on('pointerout', () => ngBm.setTint(COLOR.good));
    ngBm.on('pointerdown', () => this.startNew());

    if (hasSave) {
      const contStr = `CONTINUE  (BEST FL.${save.stats.bestFloor}  -  ${save.emeralds} $)`;
      const contX = 240 - measureText(contStr) / 2;
      const contBm = bitmapLabel(this, contX, 150, contStr, COLOR.cyan).setDepth(1)
        .setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, measureText(contStr), 10), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
      contBm.on('pointerover', () => contBm.setTint(0xa8e4f5));
      contBm.on('pointerout', () => contBm.setTint(COLOR.cyan));
      contBm.on('pointerdown', () => this.scene.start('Base'));
    }

    const hint = 'ARROWS/WASD TO MOVE - PULSE AUTO-FIRES - H FOR HELP';
    bitmapLabel(this, 240 - measureText(hint) / 2, 256, hint, COLOR.muted).setDepth(1);

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
