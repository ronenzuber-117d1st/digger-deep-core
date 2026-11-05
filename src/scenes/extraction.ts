import Phaser from 'phaser';
import { RunCarry } from './carry';
import { saveSave } from '../storage/index';
import { SaveData } from '../core/save';
import { bitmapLabel, COLOR, measureText } from '../render/font';

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

    // Header
    this.add.graphics().fillStyle(0x16122a).fillRect(0, 0, 480, 16);
    const hStr = 'EXTRACTION POINT';
    bitmapLabel(this, 240 - measureText(hStr, 14) / 2, 1, hStr, COLOR.cyan, 14);

    // Stats
    const subStr = `FLOOR ${carry.floor}  -  ${carry.emeralds} $ CARRIED  -  ${carry.kills} KILLS`;
    bitmapLabel(this, 240 - measureText(subStr) / 2, 22, subStr, COLOR.soft);

    // Extract button
    const btnY = 60;
    this.makeButton(80, btnY, 140, 18, 'EXTRACT  (KEEP 100%)', COLOR.good, 0x0f3020, 0x5bc46a,
      () => this.extract(carry));

    // Continue button
    this.makeButton(260, btnY, 140, 18, 'CONTINUE DEEPER', COLOR.warn, 0x2a1a14, 0xc07020,
      () => this.continueDeeper(carry));

    const hint = 'E - EXTRACT     C - CONTINUE';
    bitmapLabel(this, 240 - measureText(hint) / 2, 90, hint, COLOR.muted);

    this.input.keyboard!.once('keydown-E', () => this.extract(carry));
    this.input.keyboard!.once('keydown-C', () => this.continueDeeper(carry));
    this.input.keyboard!.once('keydown-ENTER', () => this.extract(carry));
  }

  private makeButton(
    x: number, y: number, w: number, h: number,
    label: string, tint: number, fillColor: number, borderColor: number,
    action: () => void,
  ): void {
    const gfx = this.add.graphics();
    const draw = (f: number, b: number): void => {
      gfx.clear().fillStyle(f).fillRect(x, y, w, h).lineStyle(1, b).strokeRect(x, y, w, h);
    };
    draw(fillColor, borderColor);
    const lbl = bitmapLabel(this, x + (w - measureText(label)) / 2, y + (h - 7) / 2, label, tint).setDepth(1);
    gfx.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    gfx.on('pointerover', () => { draw(borderColor, borderColor); lbl.setTint(0xffffff); });
    gfx.on('pointerout', () => { draw(fillColor, borderColor); lbl.setTint(tint); });
    gfx.on('pointerdown', action);
  }

  private extract(carry: RunCarry): void {
    const banked = carry.emeralds;
    const prevBestFloor = carry.saveData.stats.bestFloor;
    const newSave: SaveData = {
      ...carry.saveData,
      emeralds: carry.saveData.emeralds + banked,
      stats: {
        ...carry.saveData.stats,
        runs: carry.saveData.stats.runs + 1,
        bestFloor: Math.max(carry.saveData.stats.bestFloor, carry.floor),
        totalKills: carry.saveData.stats.totalKills + carry.kills,
      },
      runHistory: [...(carry.saveData.runHistory ?? []),
        { floor: carry.floor, emeralds: banked, kills: carry.kills, survived: true, seed: carry.seed }].slice(-50),
    };
    saveSave(newSave);
    this.scene.start('Summary', {
      floor: carry.floor, emeraldsCarried: carry.emeralds, emeraldsBanked: banked,
      kills: carry.kills, killsByType: carry.killsByType ?? {}, seed: carry.seed,
      survived: true, saveData: newSave, prevBestFloor,
    });
  }

  private continueDeeper(carry: RunCarry): void {
    this.scene.start('Dive', { ...carry, floor: carry.floor + 1, fuel: Math.min(carry.fuel + 15, carry.maxFuel) });
  }
}
