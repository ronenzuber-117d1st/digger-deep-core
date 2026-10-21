import Phaser from 'phaser';
import { loadSave, saveSave, resetSave, isStorageAvailable } from '../storage/index';
import { SaveData, PermanentUpgradeId } from '../core/save';
import { upgradeCost, UpgradeTier } from '../core/economy';
import upgradesDef from '../data/upgrades.json';
import tuning from '../data/tuning.json';

const UPGRADE_IDS = upgradesDef.permanent.map((u) => u.id as PermanentUpgradeId);

export class BaseScene extends Phaser.Scene {
  private save!: SaveData;
  private upgradeTexts: Map<PermanentUpgradeId, Phaser.GameObjects.Text> = new Map();
  private emeraldText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Base' });
  }

  init(): void {
    this.save = loadSave();
  }

  create(): void {
    this.upgradeTexts.clear();
    this.add.rectangle(240, 136, 480, 272, 0x0d0b14);

    this.add.text(12, 8, 'DEEP CORE  ·  BASE', {
      fontSize: '12px',
      color: '#f0a04b',
    });

    this.emeraldText = this.add.text(240, 8, '', {
      fontSize: '12px',
      color: '#f7c94b',
    }).setOrigin(0.5, 0);

    if (!isStorageAvailable()) {
      this.add.text(240, 264, '! progress will not be saved (storage unavailable)', {
        fontSize: '8px',
        color: '#f28f2e',
      }).setOrigin(0.5);
    }

    this.buildUpgradeList();
    this.refreshEmeralds();

    const diveBtn = this.add.text(390, 248, '▶  DIVE', {
      fontSize: '16px',
      color: '#5bc46a',
      backgroundColor: '#0f2e24',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    diveBtn.on('pointerover', () => diveBtn.setColor('#a8e68a'));
    diveBtn.on('pointerout', () => diveBtn.setColor('#5bc46a'));
    diveBtn.on('pointerdown', () => this.startDive());

    this.input.keyboard!.once('keydown-ENTER', () => this.startDive());
    this.input.keyboard!.once('keydown-SPACE', () => this.startDive());

    // Debug: F8 resets save (only during development; warn before acting)
    this.input.keyboard!.once('keydown-F8', () => {
      this.save = resetSave();
      saveSave(this.save);
      this.scene.restart();
    });
  }

  private buildUpgradeList(): void {
    const startY = 36;
    const rowH = 26;
    const cols = 2;
    const colW = 240;

    upgradesDef.permanent.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 12 + col * colW;
      const y = startY + row * rowH;
      const id = def.id as PermanentUpgradeId;

      const rowText = this.add.text(x, y, '', {
        fontSize: '9px',
        color: '#e8e6df',
      }).setInteractive({ useHandCursor: true });

      this.upgradeTexts.set(id, rowText);

      rowText.on('pointerover', () => {
        const lvl = this.save.upgrades[id];
        if (lvl < def.maxLevel) rowText.setColor('#f7c94b');
      });
      rowText.on('pointerout', () => rowText.setColor('#e8e6df'));
      rowText.on('pointerdown', () => this.tryBuy(id));

      this.refreshUpgradeRow(id);
    });
  }

  private refreshUpgradeRow(id: PermanentUpgradeId): void {
    const def = upgradesDef.permanent.find((u) => u.id === id)!;
    const rowText = this.upgradeTexts.get(id)!;
    const lvl = this.save.upgrades[id];
    const maxed = lvl >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def.tier as UpgradeTier, lvl);
    const affordable = !maxed && this.save.emeralds >= cost;
    const stars = '★'.repeat(lvl) + '☆'.repeat(def.maxLevel - lvl);

    let label: string;
    if (maxed) {
      label = `${def.label.padEnd(16)} ${stars}  MAX`;
    } else {
      label = `${def.label.padEnd(16)} ${stars}  ${cost}◆${affordable ? ' [BUY]' : ''}`;
    }
    rowText.setText(label);
    rowText.setColor(maxed ? '#78768a' : affordable ? '#e8e6df' : '#43365f');
  }

  private tryBuy(id: PermanentUpgradeId): void {
    const def = upgradesDef.permanent.find((u) => u.id === id)!;
    const lvl = this.save.upgrades[id];
    if (lvl >= def.maxLevel) return;

    const cost = upgradeCost(def.tier as UpgradeTier, lvl);
    if (this.save.emeralds < cost) return;

    this.save.emeralds -= cost;
    this.save.upgrades[id] = lvl + 1;
    saveSave(this.save);

    this.refreshEmeralds();
    for (const uid of UPGRADE_IDS) this.refreshUpgradeRow(uid);
  }

  private refreshEmeralds(): void {
    this.emeraldText.setText(`${this.save.emeralds} ◆  runs:${this.save.stats.runs}  best:${this.save.stats.bestFloor}`);
  }

  private startDive(): void {
    const seed = Math.floor(Math.random() * 0xffffffff);
    this.scene.start('Dive', {
      seed,
      floor: 1,
      hp: tuning.player.startHp + this.save.upgrades.hull,
      maxHp: tuning.player.startHp + this.save.upgrades.hull,
      fuel: tuning.player.startFuel * (1 + this.save.upgrades.fuelTank * 0.1),
      maxFuel: tuning.player.startFuel * (1 + this.save.upgrades.fuelTank * 0.1),
      emeralds: 0,
      kills: 0,
      saveData: this.save,
    });
  }
}
