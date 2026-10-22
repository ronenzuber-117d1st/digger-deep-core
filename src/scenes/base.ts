import Phaser from 'phaser';
import { loadSave, saveSave, resetSave, isStorageAvailable } from '../storage/index';
import { SaveData, PermanentUpgradeId } from '../core/save';
import { upgradeCost, UpgradeTier } from '../core/economy';
import upgradesDef from '../data/upgrades.json';
import tuning from '../data/tuning.json';
import { bitmapLabel, COLOR, measureText } from '../render/font';

const UPGRADE_IDS = upgradesDef.permanent.map((u) => u.id as PermanentUpgradeId);

const PANEL_W = 290;
const CAMP_X = PANEL_W;
const CAMP_W = 480 - PANEL_W;

const TESSA_LINES = [
  "THAT DRILL IS HELD TOGETHER BY SPITE AND TAPE. BRING IT BACK IN ONE PIECE.",
  "THE RIG'S PATCHED. DON'T SCRATCH IT THIS TIME.",
  "WATCH THE FUEL. YOU'VE GOT ENOUGH EXCUSES, NOT ENOUGH CANISTERS.",
];

interface UpgradeRow {
  gfx: Phaser.GameObjects.Graphics;
  nameLbl: Phaser.GameObjects.BitmapText;
  levelLbl: Phaser.GameObjects.BitmapText;
  costLbl: Phaser.GameObjects.BitmapText;
  buyBtn: Phaser.GameObjects.Graphics;
  buyLbl: Phaser.GameObjects.BitmapText;
  rowY: number;
}

export class BaseScene extends Phaser.Scene {
  private save!: SaveData;
  private upgradeRows: Map<PermanentUpgradeId, UpgradeRow> = new Map();
  private emeraldText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super({ key: 'Base' });
  }

  init(): void {
    this.save = loadSave();
  }

  create(): void {
    this.upgradeRows.clear();

    // ── Background ────────────────────────────────────────────────────────
    this.add.rectangle(240, 136, 480, 272, 0x0d0b14);

    // ── Top bar ───────────────────────────────────────────────────────────
    this.add.graphics().fillStyle(0x1a1530).fillRect(0, 0, 480, 16);
    bitmapLabel(this, 4, 4, 'BASE CAMP', COLOR.heading);

    const bestStr = `BEST FLOOR ${this.save.stats.bestFloor}`;
    bitmapLabel(this, 240 - measureText(bestStr) / 2, 4, bestStr, COLOR.soft);

    this.emeraldText = bitmapLabel(this, 0, 4, '', COLOR.gold);
    this.refreshEmeralds();

    if (!isStorageAvailable()) {
      bitmapLabel(this, 4, 264, '! PROGRESS WILL NOT BE SAVED', COLOR.warn);
    }

    // ── Left panel: Upgrade Bench ─────────────────────────────────────────
    this.add.graphics()
      .fillStyle(0x16122a).fillRect(0, 16, PANEL_W, 256)
      .lineStyle(1, 0x2c2347).strokeRect(0, 16, PANEL_W, 256);

    bitmapLabel(this, 6, 20, 'UPGRADE BENCH', COLOR.amber);
    bitmapLabel(this, PANEL_W - measureText('PERMANENT') - 4, 20, 'PERMANENT', COLOR.soft);
    this.add.graphics().lineStyle(1, 0x2c2347).lineBetween(0, 30, PANEL_W, 30);

    this.buildUpgradeList();

    // ── Right panel: Camp ─────────────────────────────────────────────────
    this.drawCampScene();
    this.drawDialogue('TESSA', TESSA_LINES[Math.floor(Math.random() * TESSA_LINES.length)]);
    this.drawDiveButton();

    const flStr = 'FLOOR 1 - TOPSOIL';
    bitmapLabel(this, CAMP_X + (CAMP_W - measureText(flStr)) / 2, 256, flStr, COLOR.muted);

    this.input.keyboard!.once('keydown-ENTER', () => this.startDive());
    this.input.keyboard!.once('keydown-SPACE', () => this.startDive());
    this.input.keyboard!.once('keydown-F8', () => {
      this.save = resetSave();
      saveSave(this.save);
      this.scene.restart();
    });
  }

  // ── Upgrade list ──────────────────────────────────────────────────────────

  private buildUpgradeList(): void {
    const startY = 34;
    const rowH = 27;

    upgradesDef.permanent.forEach((def, i) => {
      const rx = 4;
      const ry = startY + i * rowH;
      const id = def.id as PermanentUpgradeId;

      this.add.image(rx, ry + 1, 'icons', def.id).setOrigin(0, 0);

      const nameLbl = bitmapLabel(this, rx + 20, ry + 1, def.label, COLOR.body);
      const levelLbl = bitmapLabel(this, rx + 20, ry + 11, '', COLOR.soft);
      const pipGfx = this.add.graphics();
      const costLbl = bitmapLabel(this, rx + 120, ry + 1, '', COLOR.gold);
      const buyGfx = this.add.graphics();
      const buyLbl = bitmapLabel(this, 0, 0, '', COLOR.good);

      buyLbl.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-4, -2, 42, 14),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      buyLbl.on('pointerdown', () => this.tryBuy(id));
      buyLbl.on('pointerover', () => buyLbl.setTint(0xa8e68a));
      buyLbl.on('pointerout', () => buyLbl.setTint(COLOR.good));

      this.upgradeRows.set(id, {
        gfx: pipGfx, nameLbl, levelLbl, costLbl, buyBtn: buyGfx, buyLbl, rowY: ry,
      });

      this.refreshUpgradeRow(id);
    });
  }

  private refreshUpgradeRow(id: PermanentUpgradeId): void {
    const def = upgradesDef.permanent.find((u) => u.id === id)!;
    const row = this.upgradeRows.get(id)!;
    const lvl = this.save.upgrades[id];
    const isSingle = def.maxLevel === 1;
    const maxed = lvl >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def.tier as UpgradeTier, lvl);
    const affordable = !maxed && this.save.emeralds >= cost;
    const ry = row.rowY;

    row.nameLbl.setTint(maxed ? COLOR.muted : COLOR.body);

    // Level text
    if (isSingle) {
      row.levelLbl.setText(maxed ? 'OWNED' : '').setTint(COLOR.soft);
    } else {
      row.levelLbl.setText(`LV ${lvl}/${def.maxLevel}`).setTint(COLOR.soft);
    }

    // Pips
    row.gfx.clear();
    if (!isSingle) {
      for (let p = 0; p < def.maxLevel; p++) {
        const px = 24 + 4 + p * 7;
        const py = ry + 19;
        row.gfx.fillStyle(p < lvl ? 0xf0a04b : 0x43365f).fillRect(px, py, 5, 3);
      }
    }

    // Cost
    if (maxed) {
      row.costLbl.setText(isSingle ? '' : 'MAX').setTint(COLOR.soft);
    } else {
      row.costLbl.setText(`${cost} $`).setTint(affordable ? COLOR.gold : COLOR.muted);
    }

    // BUY button
    const btnX = PANEL_W - 44;
    const btnY = ry + 7;
    row.buyBtn.clear();

    if (!maxed) {
      row.buyBtn
        .fillStyle(affordable ? 0x0f3020 : 0x16122a)
        .fillRect(btnX, btnY, 40, 12)
        .lineStyle(1, affordable ? 0x5bc46a : 0x2c2347)
        .strokeRect(btnX, btnY, 40, 12);

      const btnStr = 'BUY';
      row.buyLbl
        .setText(btnStr)
        .setTint(affordable ? COLOR.good : COLOR.muted)
        .setPosition(btnX + (40 - measureText(btnStr)) / 2, btnY + 2)
        .setVisible(true);
    } else {
      row.buyLbl.setVisible(false);
    }
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
    const str = `EMERALDS $ ${this.save.emeralds}`;
    this.emeraldText.setText(str).setX(480 - measureText(str) - 4);
  }

  // ── Camp scene ────────────────────────────────────────────────────────────

  private drawCampScene(): void {
    const gfx = this.add.graphics();
    // Night sky
    gfx.fillStyle(0x080614).fillRect(CAMP_X, 16, CAMP_W, 156);

    // Stars
    gfx.fillStyle(0x9087a8);
    const stars = [
      [305,25],[320,40],[345,22],[370,35],[395,28],[410,50],[435,20],
      [455,38],[470,30],[330,55],[360,48],[420,42],[448,55],[475,22],
    ];
    for (const [sx, sy] of stars) gfx.fillRect(sx, sy, 1, 1);

    // Moon
    gfx.fillStyle(0xd4c8a8).fillCircle(458, 30, 10);
    gfx.fillStyle(0x080614).fillCircle(455, 27, 8);

    // Ground
    gfx.fillStyle(0x24164a).fillRect(CAMP_X, 150, CAMP_W, 4);
    gfx.fillStyle(0x1a0e3c).fillRect(CAMP_X, 154, CAMP_W, 18);

    // Tent
    const tx = CAMP_X + 60;
    gfx.fillStyle(0xf0a04b).fillTriangle(tx, 152, tx + 36, 152, tx + 18, 126);
    gfx.fillStyle(0xc07830).fillTriangle(tx + 12, 152, tx + 24, 152, tx + 18, 140);
    gfx.fillStyle(0x2c1e58).fillRect(tx + 10, 138, 16, 14);

    // Crew sprites
    this.add.image(CAMP_X + 20, 172, 'crew', 'tessa').setOrigin(0.5, 1).setDepth(1);
    this.add.image(CAMP_X + 48, 172, 'crew', 'orin').setOrigin(0.5, 1).setDepth(1);
    this.add.image(CAMP_X + CAMP_W - 6, 172, 'crew', 'radio_0').setOrigin(1, 1).setDepth(1);
  }

  // ── Dialogue box ──────────────────────────────────────────────────────────

  private drawDialogue(speaker: string, text: string): void {
    const BOX_Y = 174;
    const BOX_H = 50;
    const gfx = this.add.graphics();

    gfx.fillStyle(0x0d0b14).fillRect(CAMP_X, BOX_Y, CAMP_W, BOX_H);
    gfx.lineStyle(1, 0x2c2347).strokeRect(CAMP_X, BOX_Y, CAMP_W, BOX_H);

    // Portrait
    this.add.image(CAMP_X + 4, BOX_Y + 4, 'portraits', 'tessa').setOrigin(0, 0).setDepth(1);

    // Name tab
    const nameW = measureText(speaker) + 8;
    gfx.fillStyle(0xc07830).fillRect(CAMP_X + 34, BOX_Y - 9, nameW, 9);
    bitmapLabel(this, CAMP_X + 38, BOX_Y - 8, speaker, COLOR.bold).setDepth(1);

    // Wrap text
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + w).length > 25 && cur) { lines.push(cur.trim()); cur = w + ' '; }
      else cur += w + ' ';
    }
    if (cur.trim()) lines.push(cur.trim());

    for (let l = 0; l < Math.min(3, lines.length); l++) {
      bitmapLabel(this, CAMP_X + 36, BOX_Y + 6 + l * 10, lines[l], COLOR.body).setDepth(1);
    }

    bitmapLabel(this, CAMP_X + CAMP_W - 14, BOX_Y + BOX_H - 10, '>', COLOR.soft).setDepth(1);
  }

  // ── DIVE button ───────────────────────────────────────────────────────────

  private drawDiveButton(): void {
    const BTN_X = CAMP_X + 4;
    const BTN_Y = 228;
    const BTN_W = CAMP_W - 8;
    const BTN_H = 22;

    const gfx = this.add.graphics();
    const drawNormal = (): void => {
      gfx.clear()
        .fillStyle(0xc07020).fillRect(BTN_X, BTN_Y, BTN_W, BTN_H)
        .lineStyle(2, 0xf7c94b).strokeRect(BTN_X, BTN_Y, BTN_W, BTN_H);
    };
    drawNormal();

    const diveStr = 'DIVE';
    const diveX = BTN_X + (BTN_W - measureText(diveStr, 14)) / 2;
    const diveLbl = bitmapLabel(this, diveX, BTN_Y + 7, diveStr, COLOR.bold, 14).setDepth(1);

    this.add.image(BTN_X + 8, BTN_Y + BTN_H / 2, 'icons', 'drill_motor')
      .setOrigin(0, 0.5).setDepth(1);
    this.add.image(BTN_X + BTN_W - 8, BTN_Y + BTN_H / 2, 'icons', 'drill_motor')
      .setOrigin(1, 0.5).setDepth(1).setFlipX(true);

    gfx.setInteractive(
      new Phaser.Geom.Rectangle(BTN_X, BTN_Y, BTN_W, BTN_H),
      Phaser.Geom.Rectangle.Contains,
    );
    gfx.on('pointerover', () => {
      gfx.clear()
        .fillStyle(0xf0a04b).fillRect(BTN_X, BTN_Y, BTN_W, BTN_H)
        .lineStyle(2, 0xffd700).strokeRect(BTN_X, BTN_Y, BTN_W, BTN_H);
      diveLbl.setTint(0x1a0a0a);
    });
    gfx.on('pointerout', () => { drawNormal(); diveLbl.setTint(COLOR.bold); });
    gfx.on('pointerdown', () => this.startDive());
  }

  private startDive(): void {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const ups = this.save.upgrades;
    this.scene.start('Dive', {
      seed, floor: 1,
      hp: tuning.player.startHp + ups.hull,
      maxHp: tuning.player.startHp + ups.hull,
      fuel: tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
      maxFuel: tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
      emeralds: 0, kills: 0, saveData: this.save,
    });
  }
}
