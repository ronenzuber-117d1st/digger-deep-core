import Phaser from 'phaser';
import { loadSave, saveSave, resetSave, isStorageAvailable } from '../storage/index';
import { SaveData, PermanentUpgradeId } from '../core/save';
import { upgradeCost, UpgradeTier } from '../core/economy';
import upgradesDef from '../data/upgrades.json';
import tuning from '../data/tuning.json';
import { bitmapLabel, COLOR, measureText } from '../render/font';

const UPGRADE_IDS = upgradesDef.permanent.map((u) => u.id as PermanentUpgradeId);

const ICON_FRAME: Record<string, string> = {
  hull:            'hull',
  fuelTank:        'fuel_tank',
  drillMotor:      'drill_motor',
  pulseCore:       'pulse_core',
  prospector:      'prospector',
  salvageContract: 'salvage_contract',
  extraPick:       'extra_pick',
  lanternMount:    'lantern_mount',
};

const PANEL_W = 290;
const CAMP_X  = PANEL_W;
const CAMP_W  = 480 - PANEL_W;

// Upgrade bench row layout
const ROW_START_Y = 32;
const ROW_H       = 30;
const COL_ICON_X  = 4;
const COL_TEXT_X  = 24;
const COL_COST_X  = 150; // emerald icon centre-x
const COL_NUM_X   = 160; // cost number left-x
const COL_BTN_X   = 228;
const BTN_W       = 56;
const BTN_H       = 14;

// Bench colours (wood palette)
const WOOD_BG     = 0x4a2c1e;
const WOOD_BORDER = 0x6b4128;
const PANEL_BG    = 0x1b1630;

// Button fill colours
const BTN_GREEN_NORMAL  = 0x2f8f4e;
const BTN_GREEN_HOVER   = 0x5bc46a;
const BTN_GREEN_BORDER  = 0x0d0b14;
const BTN_GREEN_BORDER_H= 0x0d0b14;
const BTN_DISABLED_BG   = 0x1b1630;
const BTN_DISABLED_BDR  = 0x2c2347;

const TESSA_LINES = [
  "THAT DRILL IS HELD TOGETHER BY SPITE AND TAPE. BRING IT BACK IN ONE PIECE.",
  "THE RIG'S PATCHED. DON'T SCRATCH IT THIS TIME.",
  "WATCH THE FUEL. YOU'VE GOT ENOUGH EXCUSES, NOT ENOUGH CANISTERS.",
];

interface UpgradeRow {
  nameLbl:    Phaser.GameObjects.BitmapText;
  levelLbl:   Phaser.GameObjects.BitmapText;
  pipGfx:     Phaser.GameObjects.Graphics;
  costIcon:   Phaser.GameObjects.Image;
  costLbl:    Phaser.GameObjects.BitmapText;
  buyGfx:     Phaser.GameObjects.Graphics;
  buyLbl:     Phaser.GameObjects.BitmapText;
  hoverArrow: Phaser.GameObjects.BitmapText;
  rowY:       number;
}

export class BaseScene extends Phaser.Scene {
  private save!: SaveData;
  private upgradeRows: Map<PermanentUpgradeId, UpgradeRow> = new Map();
  private emeraldLbl!:  Phaser.GameObjects.BitmapText;
  private emeraldIcon!: Phaser.GameObjects.Image;
  private emeraldNum!:  Phaser.GameObjects.BitmapText;
  private confirmVisible = false;
  private confirmSelected = 1;   // 0 = NO, 1 = YES
  private confirmObjs: Phaser.GameObjects.GameObject[] = [];
  private drawNoBtn:  (active: boolean) => void = () => {};
  private drawYesBtn: (active: boolean) => void = () => {};

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
    this.add.graphics().fillStyle(0x1b1630).fillRect(0, 0, 480, 16);
    bitmapLabel(this, 4, 4, 'BASE CAMP', COLOR.gold);

    const bestStr = `BEST FLOOR ${this.save.stats.bestFloor}`;
    bitmapLabel(this, Math.floor(240 - measureText(bestStr) / 2), 4, bestStr, COLOR.muted);

    // Emerald display: "EMERALDS [icon] [number]"
    this.emeraldLbl  = bitmapLabel(this, 0, 4, 'EMERALDS', COLOR.soft).setDepth(1);
    this.emeraldIcon = this.add.image(0, 8, 'hud', 'emerald_mini').setOrigin(0, 0.5).setDepth(1);
    this.emeraldNum  = bitmapLabel(this, 0, 4, '', COLOR.gold).setDepth(1);
    this.refreshEmeralds();

    if (!isStorageAvailable()) {
      bitmapLabel(this, 4, 264, '! PROGRESS WILL NOT BE SAVED', COLOR.warn);
    }

    // ── Left panel ────────────────────────────────────────────────────────
    this.add.graphics()
      .fillStyle(PANEL_BG).fillRect(0, 16, PANEL_W, 256)
      .lineStyle(1, WOOD_BORDER).strokeRect(0, 16, PANEL_W, 256);

    // Header bar
    this.add.graphics()
      .fillStyle(WOOD_BG).fillRect(1, 17, PANEL_W - 2, 14)
      .lineStyle(1, WOOD_BORDER).lineBetween(1, 31, PANEL_W - 1, 31);
    bitmapLabel(this, 6, 20, 'UPGRADE BENCH', COLOR.bold);
    bitmapLabel(this, PANEL_W - measureText('PERMANENT') - 6, 20, 'PERMANENT', COLOR.amber);

    this.buildUpgradeList();

    // ── Right panel ───────────────────────────────────────────────────────
    this.drawCampScene();
    this.drawDialogue('TESSA', TESSA_LINES[Math.floor(Math.random() * TESSA_LINES.length)]);
    this.drawDiveButton();

    // Floor label strip (panel-bg background)
    this.add.graphics().fillStyle(PANEL_BG).fillRect(CAMP_X, 254, CAMP_W, 18);
    const flStr = 'FLOOR 1 - TOPSOIL';
    bitmapLabel(this, CAMP_X + Math.floor((CAMP_W - measureText(flStr)) / 2), 258, flStr, COLOR.muted);

    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.confirmVisible) {
        if (this.confirmSelected === 1) this.confirmYes();
        else this.hideConfirm();
        return;
      }
      this.startDive();
    });
    this.input.keyboard!.on('keydown-SPACE', () => {
      if (!this.confirmVisible) this.startDive();
    });
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.confirmVisible) { this.hideConfirm(); return; }
      this.showConfirm();
    });
    this.input.keyboard!.on('keydown-Y', () => {
      if (this.confirmVisible) this.confirmYes();
    });
    this.input.keyboard!.on('keydown-N', () => {
      if (this.confirmVisible) this.hideConfirm();
    });
    this.input.keyboard!.once('keydown-F8', () => {
      this.save = resetSave();
      saveSave(this.save);
      this.scene.restart();
    });

    this.buildConfirmDialog();
  }

  // ── Upgrade list ──────────────────────────────────────────────────────────

  private buildUpgradeList(): void {
    upgradesDef.permanent.forEach((def, i) => {
      const ry = ROW_START_Y + i * ROW_H;
      const id = def.id as PermanentUpgradeId;

      // Row separator
      if (i > 0) {
        this.add.graphics().lineStyle(1, 0x2c2347).lineBetween(1, ry, PANEL_W - 1, ry);
      }

      // Icon
      this.add.image(COL_ICON_X, ry + Math.floor(ROW_H / 2), 'icons', ICON_FRAME[def.id])
        .setOrigin(0, 0.5).setDepth(1);

      const nameLbl  = bitmapLabel(this, COL_TEXT_X, ry + 4,  def.label, COLOR.body);
      const levelLbl = bitmapLabel(this, COL_TEXT_X, ry + 13, '',        COLOR.soft);
      const pipGfx   = this.add.graphics();
      const costIcon = this.add.image(COL_COST_X, ry + Math.floor(ROW_H / 2), 'hud', 'emerald_mini')
        .setOrigin(0.5, 0.5).setDepth(1);
      const costLbl  = bitmapLabel(this, COL_NUM_X, ry + 11, '', COLOR.gold);
      const buyGfx   = this.add.graphics();
      const buyLbl   = bitmapLabel(this, 0, 0, '', COLOR.bold);
      const hoverArrow = bitmapLabel(this, COL_BTN_X - 6, ry + 11, '>', COLOR.good).setVisible(false);

      buyGfx.setInteractive(
        new Phaser.Geom.Rectangle(COL_BTN_X, ry + 8, BTN_W, BTN_H),
        Phaser.Geom.Rectangle.Contains,
      );
      buyGfx.on('pointerover', () => this.onBuyHover(id, true));
      buyGfx.on('pointerout',  () => this.onBuyHover(id, false));
      buyGfx.on('pointerdown', () => this.tryBuy(id));

      this.upgradeRows.set(id, {
        nameLbl, levelLbl, pipGfx, costIcon, costLbl, buyGfx, buyLbl, hoverArrow, rowY: ry,
      });

      this.refreshUpgradeRow(id);
    });
  }

  private onBuyHover(id: PermanentUpgradeId, over: boolean): void {
    const def = upgradesDef.permanent.find((u) => u.id === id)!;
    const row = this.upgradeRows.get(id)!;
    const lvl = this.save.upgrades[id];
    const maxed = lvl >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def.tier as UpgradeTier, lvl);
    const affordable = !maxed && this.save.emeralds >= cost;

    if (maxed || !affordable) return;

    const ry   = row.rowY;
    const btnY = ry + 8;

    row.hoverArrow.setVisible(over);
    row.buyGfx.clear();

    if (over) {
      row.buyGfx
        .fillStyle(BTN_GREEN_HOVER).fillRect(COL_BTN_X, btnY, BTN_W, BTN_H)
        .lineStyle(1, BTN_GREEN_BORDER_H).strokeRect(COL_BTN_X, btnY, BTN_W, BTN_H);
      row.buyLbl
        .setTint(0x0d0b14)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('BUY')) / 2), btnY + 3);
    } else {
      row.buyGfx
        .fillStyle(BTN_GREEN_NORMAL).fillRect(COL_BTN_X, btnY, BTN_W, BTN_H)
        .lineStyle(1, BTN_GREEN_BORDER).strokeRect(COL_BTN_X, btnY, BTN_W, BTN_H);
      row.buyLbl
        .setTint(0x0d0b14)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('BUY')) / 2), btnY + 3);
    }
  }

  private refreshUpgradeRow(id: PermanentUpgradeId): void {
    const def = upgradesDef.permanent.find((u) => u.id === id)!;
    const row = this.upgradeRows.get(id)!;
    const lvl      = this.save.upgrades[id];
    const isSingle = def.maxLevel === 1;
    const maxed    = lvl >= def.maxLevel;
    const cost     = maxed ? 0 : upgradeCost(def.tier as UpgradeTier, lvl);
    const affordable = !maxed && this.save.emeralds >= cost;
    const ry  = row.rowY;
    const btnY = ry + 8;

    row.nameLbl.setTint(maxed ? COLOR.muted : COLOR.body);

    // Description (replaces level text; pips show level progress)
    row.levelLbl
      .setText(maxed && isSingle ? 'OWNED' : def.description)
      .setTint(maxed ? COLOR.muted : COLOR.soft);

    // Pips
    row.pipGfx.clear();
    if (!isSingle) {
      for (let p = 0; p < def.maxLevel; p++) {
        const px = COL_TEXT_X + p * 7;
        const py = ry + 22;
        row.pipGfx.fillStyle(p < lvl ? 0xf7c94b : 0x2c2347).fillRect(px, py, 5, 3);
      }
    }

    // Cost area
    if (maxed) {
      row.costIcon.setVisible(false);
      row.costLbl.setVisible(false);
    } else {
      row.costIcon.setVisible(true);
      row.costLbl
        .setText(`${cost}`)
        .setTint(affordable ? COLOR.gold : COLOR.muted)
        .setVisible(true);
    }

    // BUY / MAX button
    row.hoverArrow.setVisible(false);
    row.buyGfx.clear();

    if (maxed) {
      row.buyGfx
        .fillStyle(BTN_DISABLED_BG).fillRect(COL_BTN_X, btnY, BTN_W, BTN_H)
        .lineStyle(1, BTN_DISABLED_BDR).strokeRect(COL_BTN_X, btnY, BTN_W, BTN_H);
      row.buyLbl
        .setText('MAX')
        .setTint(COLOR.muted)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('MAX')) / 2), btnY + 3)
        .setVisible(true);
      row.buyGfx.removeInteractive();
    } else if (affordable) {
      row.buyGfx
        .fillStyle(BTN_GREEN_NORMAL).fillRect(COL_BTN_X, btnY, BTN_W, BTN_H)
        .lineStyle(1, BTN_GREEN_BORDER).strokeRect(COL_BTN_X, btnY, BTN_W, BTN_H);
      row.buyLbl
        .setText('BUY')
        .setTint(0x0d0b14)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('BUY')) / 2), btnY + 3)
        .setVisible(true);
      row.buyGfx.setInteractive(
        new Phaser.Geom.Rectangle(COL_BTN_X, btnY, BTN_W, BTN_H),
        Phaser.Geom.Rectangle.Contains,
      );
    } else {
      row.buyGfx
        .fillStyle(BTN_DISABLED_BG).fillRect(COL_BTN_X, btnY, BTN_W, BTN_H)
        .lineStyle(1, BTN_DISABLED_BDR).strokeRect(COL_BTN_X, btnY, BTN_W, BTN_H);
      row.buyLbl
        .setText('BUY')
        .setTint(COLOR.muted)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('BUY')) / 2), btnY + 3)
        .setVisible(true);
      row.buyGfx.removeInteractive();
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
    const numStr = `${this.save.emeralds}`;
    const numW   = measureText(numStr);
    const iconW  = 10; // icon display width + gap
    const lblW   = measureText('EMERALDS') + 4;
    const rightX = 476;

    this.emeraldNum.setText(numStr).setX(rightX - numW);
    this.emeraldIcon.setX(rightX - numW - iconW + 1);
    this.emeraldLbl.setX(rightX - numW - iconW - lblW);
  }

  // ── Camp scene ────────────────────────────────────────────────────────────

  private drawCampScene(): void {
    const HORIZON = 156;

    // === Layer 0: sky, hills, stars, moon ===
    const bgGfx = this.add.graphics(); // depth 0
    // Clip to camp panel so hills can't bleed into the upgrade bench
    const campClip = this.add.graphics().fillRect(CAMP_X, 16, CAMP_W, 240);
    bgGfx.setMask(campClip.createGeometryMask());

    // Sky bands (4 palette colours, top to bottom)
    bgGfx.fillStyle(0x0d0b14).fillRect(CAMP_X, 16,  CAMP_W, 35);
    bgGfx.fillStyle(0x1b1630).fillRect(CAMP_X, 51,  CAMP_W, 35);
    bgGfx.fillStyle(0x2c2347).fillRect(CAMP_X, 86,  CAMP_W, 35);
    bgGfx.fillStyle(0x43365f).fillRect(CAMP_X, 121, CAMP_W, 35);

    // Stars
    bgGfx.fillStyle(0x9087a8);
    const stars = [
      [305,25],[320,40],[345,22],[370,35],[395,28],[410,50],[435,20],
      [455,38],[470,30],[330,55],[360,48],[420,42],[448,55],[475,22],
    ];
    for (const [sx, sy] of stars) bgGfx.fillRect(sx, sy, 1, 1);

    // Moon
    bgGfx.fillStyle(0xd4c8a8).fillCircle(462, 30, 9);
    bgGfx.fillStyle(0x080614).fillCircle(459, 27, 7);

    // Hills — wide ellipses so they look like landscape, not balloons
    bgGfx.fillStyle(0x0f2e24); // far dark green
    bgGfx.fillEllipse(CAMP_X + 38,  HORIZON + 18, 120, 72);
    bgGfx.fillEllipse(CAMP_X + 158, HORIZON + 18, 140, 84);
    bgGfx.fillStyle(0x1d5c3c); // near lighter green
    bgGfx.fillEllipse(CAMP_X + 82,  HORIZON + 14,  96, 56);
    bgGfx.fillEllipse(CAMP_X + 170, HORIZON + 12, 106, 62);

    // === Layer 1: dirt tile ground (covers hill bottoms) ===
    const tilesWide = Math.ceil(CAMP_W / 16) + 1;
    for (let c = 0; c < tilesWide; c++) {
      this.add.image(CAMP_X + c * 16, HORIZON,      'tiles_topsoil', `dirt_${c % 4}`)
        .setOrigin(0, 0).setDepth(1);
      this.add.image(CAMP_X + c * 16, HORIZON + 16, 'tiles_topsoil', `dirt_${(c + 2) % 4}`)
        .setOrigin(0, 0).setDepth(1);
    }

    // === Layer 2: tent, fire glow, crate (in front of tiles) ===
    const fgGfx = this.add.graphics().setDepth(2);

    // Tent: left face lit, right face shaded
    const tentX   = CAMP_X + 26;
    const TENT_CX = tentX + 24;
    const PEAK_Y  = 116;
    fgGfx.fillStyle(0xf28f2e).fillTriangle(tentX,    HORIZON, TENT_CX, HORIZON, TENT_CX, PEAK_Y);
    fgGfx.fillStyle(0xa3262e).fillTriangle(TENT_CX,  HORIZON, tentX + 48, HORIZON, TENT_CX, PEAK_Y);
    fgGfx.fillStyle(0x1b1630).fillRect(TENT_CX - 6, 142, 12, 14);
    fgGfx.fillStyle(0x6b4128).fillRect(TENT_CX,     110,  2,  7);

    // Fire glow on ground — warm light pool
    const FX = CAMP_X + 96;
    fgGfx.fillStyle(0xf28f2e); // outer glow
    fgGfx.fillRect(FX - 8, HORIZON,     4, 2);
    fgGfx.fillRect(FX + 8, HORIZON,     4, 2);
    fgGfx.fillRect(FX - 5, HORIZON + 2, 3, 1);
    fgGfx.fillRect(FX + 6, HORIZON + 2, 3, 1);
    fgGfx.fillStyle(0xf7c94b); // inner glow
    fgGfx.fillRect(FX - 4, HORIZON,     4, 2);
    fgGfx.fillRect(FX + 4, HORIZON,     4, 2);
    fgGfx.fillRect(FX - 1, HORIZON + 2, 6, 1);
    // Campfire flame
    fgGfx.fillStyle(0xf7c94b).fillRect(FX,     HORIZON - 4, 4, 4);
    fgGfx.fillStyle(0xe0502f).fillRect(FX + 1, HORIZON - 7, 2, 5);
    fgGfx.fillStyle(0xf28f2e).fillRect(FX + 1, HORIZON - 2, 2, 2);

    // Wooden crate for Static radio
    const BOX_W   = 26;
    const BOX_H   = 14;
    const BOX_RX  = CAMP_X + CAMP_W - 2;
    const BOX_LX  = BOX_RX - BOX_W;
    const BOX_TOP = HORIZON - BOX_H;
    fgGfx.fillStyle(0x8f5a33).fillRect(BOX_LX, BOX_TOP, BOX_W, BOX_H);
    fgGfx.fillStyle(0xb57a46).fillRect(BOX_LX, BOX_TOP, BOX_W, 2);
    fgGfx.fillStyle(0x6b4128).fillRect(BOX_RX - 2, BOX_TOP, 2, BOX_H);
    fgGfx.fillStyle(0x4a2c1e).fillRect(BOX_LX, BOX_TOP + BOX_H - 1, BOX_W, 1);
    fgGfx.fillStyle(0x6b4128)
      .fillRect(BOX_LX + Math.floor(BOX_W / 2), BOX_TOP + 2, 1, BOX_H - 3);

    // === Layer 3: grass (behind crew, over tiles) ===
    const grassGfx = this.add.graphics().setDepth(3);
    grassGfx.fillStyle(0x2f8f4e);
    for (let x = CAMP_X; x < CAMP_X + CAMP_W; x += 4) {
      grassGfx.fillRect(x,     HORIZON - 1, 1, 1);
      grassGfx.fillRect(x + 2, HORIZON - 2, 1, 2);
    }

    // === Layer 4: crew sprites (in front of grass) ===
    this.add.image(CAMP_X + 82,  HORIZON, 'crew', 'tessa').setOrigin(0.5, 1).setDepth(4);
    this.add.image(CAMP_X + 126, HORIZON, 'crew', 'orin' ).setOrigin(0.5, 1).setDepth(4);
    this.add.image(BOX_LX + Math.floor(BOX_W / 2), BOX_TOP, 'crew', 'radio_0')
      .setOrigin(0.5, 1).setDepth(4);
  }

  // ── Dialogue box ──────────────────────────────────────────────────────────

  private drawDialogue(speaker: string, text: string): void {
    const BOX_X = CAMP_X;
    const BOX_Y = 174;
    const BOX_H = 56;
    const gfx   = this.add.graphics();

    // Box bg (same as panel) + border
    gfx.fillStyle(PANEL_BG).fillRect(BOX_X, BOX_Y, CAMP_W, BOX_H);
    gfx.lineStyle(1, WOOD_BORDER).strokeRect(BOX_X, BOX_Y, CAMP_W, BOX_H);

    // Portrait (inside box)
    this.add.image(BOX_X + 2, BOX_Y + 2, 'portraits', 'tessa').setOrigin(0, 0).setDepth(1);

    // Speaker name in amber, no background
    bitmapLabel(this, BOX_X + 34, BOX_Y + 4, speaker, COLOR.amber).setDepth(1);

    // Wrap text into 3 lines within the text area (~150px wide)
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (measureText(cur + w) > 148 && cur) {
        lines.push(cur.trimEnd());
        cur = w + ' ';
      } else {
        cur += w + ' ';
      }
    }
    if (cur.trim()) lines.push(cur.trim());

    for (let l = 0; l < Math.min(3, lines.length); l++) {
      bitmapLabel(this, BOX_X + 34, BOX_Y + 15 + l * 10, lines[l], COLOR.body).setDepth(1);
    }

    // Continue arrow
    bitmapLabel(this, BOX_X + CAMP_W - 10, BOX_Y + BOX_H - 10, '>', COLOR.soft).setDepth(1);
  }

  // ── DIVE button ───────────────────────────────────────────────────────────

  private drawDiveButton(): void {
    const BTN_X = CAMP_X + 2;
    const BTN_Y = 232;
    const BTN_W = CAMP_W - 4;
    const BTN_H = 22;

    const gfx = this.add.graphics();
    const drawNormal = (): void => {
      gfx.clear()
        .fillStyle(0xf28f2e).fillRect(BTN_X, BTN_Y, BTN_W, BTN_H)
        .lineStyle(1, 0xf7c94b).strokeRect(BTN_X, BTN_Y, BTN_W, BTN_H);
    };
    drawNormal();

    const diveStr = 'DIVE';
    const diveX   = BTN_X + Math.floor((BTN_W - measureText(diveStr, 9)) / 2);
    bitmapLabel(this, diveX, BTN_Y + 8, diveStr, 0x1a0a0a, 9).setDepth(1);

    // Chomper sprites flanking the label
    this.add.image(BTN_X + 6, BTN_Y + BTN_H / 2, 'player', 'down_0')
      .setOrigin(0, 0.5).setDepth(1);
    this.add.image(BTN_X + BTN_W - 6, BTN_Y + BTN_H / 2, 'player', 'down_0')
      .setOrigin(1, 0.5).setFlipX(true).setDepth(1);

    gfx.setInteractive(
      new Phaser.Geom.Rectangle(BTN_X, BTN_Y, BTN_W, BTN_H),
      Phaser.Geom.Rectangle.Contains,
    );
    gfx.on('pointerover', () => {
      gfx.clear()
        .fillStyle(0xf7c94b).fillRect(BTN_X, BTN_Y, BTN_W, BTN_H)
        .lineStyle(1, 0xffffff).strokeRect(BTN_X, BTN_Y, BTN_W, BTN_H);
    });
    gfx.on('pointerout', () => { drawNormal(); });
    gfx.on('pointerdown', () => this.startDive());
  }

  // ── Confirm-exit dialog ───────────────────────────────────────────────────

  private buildConfirmDialog(): void {
    const DX = 110, DY = 104, DW = 260, DH = 64;
    const DCX = DX + DW / 2;

    const overlay = this.add.graphics().setDepth(10);
    overlay.fillStyle(0x000000, 0.70);
    overlay.fillRect(0, 0, 480, 272);

    const panel = this.add.graphics().setDepth(11);
    panel.fillStyle(0x2d1a09).fillRect(DX, DY, DW, DH);
    panel.lineStyle(2, 0x8b5a2b).strokeRect(DX, DY, DW, DH);
    panel.fillStyle(0x4a2f0d).fillRect(DX + 1, DY + 1, DW - 2, 20);

    const questionStr = 'RETURN TO MAIN MENU?';
    const qBmt = bitmapLabel(
      this, DCX - measureText(questionStr) / 2, DY + 6, questionStr, COLOR.bold,
    ).setDepth(12);

    const NO_X = DCX - 68, BTN_Y = DY + 34, BTN_W2 = 56, BTN_H2 = 18;
    const YES_X = DCX + 12;
    const noBtnGfx  = this.add.graphics().setDepth(12);
    const yesBtnGfx = this.add.graphics().setDepth(12);

    this.drawNoBtn = (active: boolean) => {
      noBtnGfx.clear()
        .fillStyle(active ? 0x5bc46a : 0x3d7a45).fillRect(NO_X, BTN_Y, BTN_W2, BTN_H2)
        .lineStyle(1, 0x0d0b14).strokeRect(NO_X, BTN_Y, BTN_W2, BTN_H2);
    };
    this.drawYesBtn = (active: boolean) => {
      yesBtnGfx.clear()
        .fillStyle(active ? 0xf7c94b : 0xd4a830).fillRect(YES_X, BTN_Y, BTN_W2, BTN_H2)
        .lineStyle(1, 0x0d0b14).strokeRect(YES_X, BTN_Y, BTN_W2, BTN_H2);
    };

    const noStr  = 'NO (ESC)';
    const yesStr = 'YES (Y)';
    const noBmt = bitmapLabel(
      this, NO_X  + Math.floor((BTN_W2 - measureText(noStr))  / 2), BTN_Y + 5, noStr,  COLOR.bold,
    ).setDepth(13);
    const yesBmt = bitmapLabel(
      this, YES_X + Math.floor((BTN_W2 - measureText(yesStr)) / 2), BTN_Y + 5, yesStr, 0x1a0a00,
    ).setDepth(13);

    noBtnGfx.setInteractive(
      new Phaser.Geom.Rectangle(NO_X, BTN_Y, BTN_W2, BTN_H2), Phaser.Geom.Rectangle.Contains,
    );
    noBtnGfx.on('pointerover', () => { this.confirmSelected = 0; this.updateConfirmBtns(); });
    noBtnGfx.on('pointerdown', () => this.hideConfirm());

    yesBtnGfx.setInteractive(
      new Phaser.Geom.Rectangle(YES_X, BTN_Y, BTN_W2, BTN_H2), Phaser.Geom.Rectangle.Contains,
    );
    yesBtnGfx.on('pointerover', () => { this.confirmSelected = 1; this.updateConfirmBtns(); });
    yesBtnGfx.on('pointerdown', () => this.confirmYes());

    this.input.keyboard!.on('keydown-LEFT', () => {
      if (!this.confirmVisible) return;
      this.confirmSelected = 0;
      this.updateConfirmBtns();
    });
    this.input.keyboard!.on('keydown-RIGHT', () => {
      if (!this.confirmVisible) return;
      this.confirmSelected = 1;
      this.updateConfirmBtns();
    });

    this.confirmObjs = [overlay, panel, qBmt, noBtnGfx, noBmt, yesBtnGfx, yesBmt];
    this.confirmObjs.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private updateConfirmBtns(): void {
    this.drawNoBtn(this.confirmSelected === 0);
    this.drawYesBtn(this.confirmSelected === 1);
  }

  private showConfirm(): void {
    this.confirmVisible = true;
    this.confirmSelected = 1;
    this.confirmObjs.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.updateConfirmBtns();
  }

  private hideConfirm(): void {
    this.confirmVisible = false;
    this.confirmObjs.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private confirmYes(): void {
    this.scene.start('Title');
  }

  private startDive(): void {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const ups  = this.save.upgrades;
    this.scene.start('Dive', {
      seed, floor: 1,
      hp:      tuning.player.startHp  + ups.hull,
      maxHp:   tuning.player.startHp  + ups.hull,
      fuel:    tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
      maxFuel: tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
      emeralds: 0, kills: 0, saveData: this.save,
    });
  }
}
