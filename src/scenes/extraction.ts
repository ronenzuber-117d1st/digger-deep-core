import Phaser from 'phaser';
import { RunCarry } from './carry';
import { saveSave } from '../storage/index';
import { SaveData } from '../core/save';

export interface ExtractionData {
  carry: RunCarry;
}

export class ExtractionScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Extraction' });
  }

  init(data: ExtractionData): void {
    this.data.set('carry', data.carry);
  }

  create(): void {
    const carry = this.data.get('carry') as RunCarry;

    this.add.rectangle(240, 136, 480, 272, 0x000000, 0.92);

    this.add.text(240, 45, 'EXTRACTION POINT', {
      fontSize: '22px',
      color: '#5bb8e8',
    }).setOrigin(0.5);

    this.add.text(240, 80, `Floor ${carry.floor}  ·  ${carry.emeralds} ◆ carried  ·  ${carry.kills} kills`, {
      fontSize: '11px',
      color: '#9aa1b2',
    }).setOrigin(0.5);

    // Extract button
    const extractBtn = this.add.text(160, 140, 'EXTRACT  (keep 100%)', {
      fontSize: '14px',
      color: '#5bc46a',
      backgroundColor: '#0f2e24',
      padding: { x: 10, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    extractBtn.on('pointerover', () => extractBtn.setColor('#a8e68a'));
    extractBtn.on('pointerout', () => extractBtn.setColor('#5bc46a'));
    extractBtn.on('pointerdown', () => this.extract(carry));

    // Continue button
    const continueBtn = this.add.text(330, 140, 'CONTINUE DEEPER', {
      fontSize: '14px',
      color: '#f28f2e',
      backgroundColor: '#2a1a14',
      padding: { x: 10, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    continueBtn.on('pointerover', () => continueBtn.setColor('#f7c94b'));
    continueBtn.on('pointerout', () => continueBtn.setColor('#f28f2e'));
    continueBtn.on('pointerdown', () => this.continueDeeper(carry));

    this.add.text(240, 200, 'E — extract     C — continue', {
      fontSize: '10px',
      color: '#43365f',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-E', () => this.extract(carry));
    this.input.keyboard!.once('keydown-C', () => this.continueDeeper(carry));
    this.input.keyboard!.once('keydown-ENTER', () => this.extract(carry));
  }

  private extract(carry: RunCarry): void {
    const newSave: SaveData = {
      ...carry.saveData,
      emeralds: carry.saveData.emeralds + carry.emeralds,
      stats: {
        ...carry.saveData.stats,
        runs: carry.saveData.stats.runs + 1,
        bestFloor: Math.max(carry.saveData.stats.bestFloor, carry.floor),
        totalKills: carry.saveData.stats.totalKills + carry.kills,
      },
    };
    saveSave(newSave);

    this.scene.start('Summary', {
      floor: carry.floor,
      emeraldsBanked: carry.emeralds,
      kills: carry.kills,
      seed: carry.seed,
      survived: true,
      saveData: newSave,
    });
  }

  private continueDeeper(carry: RunCarry): void {
    const nextFloor = carry.floor + 1;
    const nextCarry: RunCarry = {
      ...carry,
      floor: nextFloor,
      fuel: Math.min(carry.fuel + 15, carry.maxFuel),
    };
    this.scene.start('Dive', nextCarry);
  }
}
