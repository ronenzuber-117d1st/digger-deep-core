import Phaser from 'phaser';
import { loadSave, saveSave, resetSave, isStorageAvailable } from '../storage/index';
import { SaveData, PermanentUpgradeId } from '../core/save';
import { upgradeCost, UpgradeTier } from '../core/economy';
import upgradesDef from '../data/upgrades.json';
import tuning from '../data/tuning.json';
import { bitmapLabel, COLOR, measureText } from '../render/font';
import { playTrack, stopTrack } from '../audio/index';

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
const ROW_H       = 33;
const COL_ICON_X  = 4;
const COL_TEXT_X  = 24;
const COL_COST_X  = 184; // emerald icon centre-x
const COL_NUM_X   = 195; // cost number left-x
const COL_BTN_X   = 228;
const BTN_W       = 56;
const BTN_H       = 14;

// Bench colours (wood palette)
const WOOD_BG     = 0x4a2c1e;
const WOOD_BORDER = 0x6b4128;
const PANEL_BG    = 0x1b1630;

// Button fill colours
const BTN_GREEN_NORMAL     = 0x2f8f4e;
const BTN_GREEN_HOVER      = 0x5bc46a;
const BTN_GREEN_BORDER     = 0x1b1630;
const BTN_GREEN_HIGHLIGHT  = 0x5bc46a;
const BTN_GREEN_SHADOW     = 0x1d5c3c;
const BTN_HOVER_HIGHLIGHT  = 0x82dc8c;
const BTN_HOVER_SHADOW     = 0x3d7a50;
const BTN_DISABLED_BG      = 0x1b1630;
const BTN_DISABLED_BDR     = 0x2c2347;
const BTN_DISABLED_HILITE  = 0x2c2347;
const BTN_DISABLED_SHADOW  = 0x0d0b14;

function drawDepthBtn(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  fill: number, border: number, hilite: number, shadow: number,
): void {
  gfx
    .lineStyle(1, border).strokeRect(x, y, w, h)
    .fillStyle(fill).fillRect(x + 1, y + 1, w - 2, h - 2)
    .lineStyle(1, hilite).lineBetween(x + 1, y + 1, x + w - 2, y + 1)
    .lineStyle(1, shadow).lineBetween(x + 1, y + h - 2, x + w - 2, y + h - 2);
}

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
  private campImg!: Phaser.GameObjects.Image;
  private confirmVisible = false;
  private confirmSelected = 1;   // 0 = NO, 1 = YES
  private confirmObjs: Phaser.GameObjects.GameObject[] = [];
  private drawNoBtn:  (active: boolean) => void = () => {};
  private drawYesBtn: (active: boolean) => void = () => {};

  constructor() {
    super({ key: 'Base' });
  }

  preload(): void {
    for (let i = 0; i < 7; i++) {
      if (!this.textures.exists(`camp_${i}`)) {
        this.load.image(`camp_${i}`, `assets/camp/camp_${i}.png`);
      }
    }
  }

  init(): void {
    this.save = loadSave();
  }

  create(): void {
    this.upgradeRows.clear();
    void playTrack('base');
    this.events.once('shutdown', stopTrack);

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
    // strokeRect at (1,16) so left border sits inside canvas; height=247 → y=263
    // 2px bevel: outer WOOD_BORDER frame + inner highlight (top/left) / shadow (bottom/right)
    this.add.graphics()
      .fillStyle(PANEL_BG).fillRect(0, 16, PANEL_W, 256)
      .lineStyle(1, WOOD_BORDER).strokeRect(1, 16, PANEL_W - 1, 247)
      .lineStyle(1, 0x8f5a33)
      .lineBetween(2, 17, PANEL_W - 1, 17)
      .lineBetween(2, 17, 2, 262)
      .lineStyle(1, 0x2a1a14)
      .lineBetween(2, 262, PANEL_W - 1, 262)
      .lineBetween(PANEL_W - 1, 17, PANEL_W - 1, 262);

    // Header bar (raised 3D look)
    this.add.graphics()
      .fillStyle(WOOD_BG).fillRect(1, 17, PANEL_W - 2, 14)
      .lineStyle(1, 0x8f5a33).lineBetween(2, 17, PANEL_W - 2, 17)
      .lineStyle(1, 0x2a1a14).lineBetween(1, 30, PANEL_W - 1, 30)
      .lineStyle(1, WOOD_BORDER).lineBetween(1, 31, PANEL_W - 1, 31);
    bitmapLabel(this, 6, 20, 'UPGRADE BENCH', COLOR.bold);
    bitmapLabel(this, PANEL_W - measureText('PERMANENT') - 6, 20, 'PERMANENT', COLOR.amber);

    this.buildUpgradeList();

    // ── Right panel ───────────────────────────────────────────────────────
    this.setupCampAnimation();
    this.drawDialogue('TESSA', TESSA_LINES[Math.floor(Math.random() * TESSA_LINES.length)]);
    this.drawDiveButton();

    // Floor label strip (panel-bg background)
    this.add.graphics().setDepth(2).fillStyle(PANEL_BG).fillRect(CAMP_X, 254, CAMP_W, 18);
    const flStr = 'FLOOR 1 - TOPSOIL';
    bitmapLabel(this, CAMP_X + Math.floor((CAMP_W - measureText(flStr)) / 2), 258, flStr, COLOR.muted).setDepth(3);

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
      drawDepthBtn(row.buyGfx, COL_BTN_X, btnY, BTN_W, BTN_H,
        BTN_GREEN_HOVER, BTN_GREEN_BORDER, BTN_HOVER_HIGHLIGHT, BTN_HOVER_SHADOW);
    } else {
      drawDepthBtn(row.buyGfx, COL_BTN_X, btnY, BTN_W, BTN_H,
        BTN_GREEN_NORMAL, BTN_GREEN_BORDER, BTN_GREEN_HIGHLIGHT, BTN_GREEN_SHADOW);
    }
    row.buyLbl
      .setTint(0x0d0b14)
      .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('BUY')) / 2), btnY + 3);
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
      .setText((maxed && isSingle ? 'OWNED' : def.description).toUpperCase())
      .setTint(maxed ? COLOR.muted : COLOR.soft);

    // Pips — centered under the BUY button
    row.pipGfx.clear();
    if (!isSingle) {
      const totalPipW = (def.maxLevel - 1) * 7 + 5;
      const pipStartX = COL_BTN_X + Math.floor((BTN_W - totalPipW) / 2);
      const py = ry + 8 + BTN_H + 3;
      for (let p = 0; p < def.maxLevel; p++) {
        const px = pipStartX + p * 7;
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
      drawDepthBtn(row.buyGfx, COL_BTN_X, btnY, BTN_W, BTN_H,
        BTN_DISABLED_BG, BTN_DISABLED_BDR, BTN_DISABLED_HILITE, BTN_DISABLED_SHADOW);
      row.buyLbl
        .setText('MAX')
        .setTint(COLOR.muted)
        .setPosition(COL_BTN_X + Math.floor((BTN_W - measureText('MAX')) / 2), btnY + 3)
        .setVisible(true);
      row.buyGfx.removeInteractive();
    } else if (affordable) {
      drawDepthBtn(row.buyGfx, COL_BTN_X, btnY, BTN_W, BTN_H,
        BTN_GREEN_NORMAL, BTN_GREEN_BORDER, BTN_GREEN_HIGHLIGHT, BTN_GREEN_SHADOW);
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
      drawDepthBtn(row.buyGfx, COL_BTN_X, btnY, BTN_W, BTN_H,
        BTN_DISABLED_BG, BTN_DISABLED_BDR, BTN_DISABLED_HILITE, BTN_DISABLED_SHADOW);
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
    const numStr  = `${this.save.emeralds}`;
    const numW    = measureText(numStr);
    const ICON_W  = 16; // emerald_mini frame is 16×16
    const GAP     = 3;
    const lblW    = measureText('EMERALDS') + 4;
    const rightX  = 476;

    this.emeraldNum.setText(numStr).setX(rightX - numW);
    this.emeraldIcon.setX(rightX - numW - GAP - ICON_W);
    this.emeraldLbl.setX(rightX - numW - GAP - ICON_W - GAP - lblW);
  }

  // ── Camp animation ────────────────────────────────────────────────────────

  private setupCampAnimation(): void {
    const SCENE_H  = 174 - 16;
    const INNER_W  = CAMP_W - 8; // 4px margin each side
    this.campImg = this.add.image(CAMP_X + 4, 16, 'camp_0')
      .setOrigin(0, 0)
      .setDepth(0)
      .setCrop(0, 0, INNER_W, SCENE_H);
    let f = 0;
    this.time.addEvent({
      delay: 125,
      loop: true,
      callback: () => {
        f = (f + 1) % 7;
        this.campImg.setTexture(`camp_${f}`);
      },
    });
  }

  // ── Dialogue box ──────────────────────────────────────────────────────────

  private drawDialogue(speaker: string, text: string): void {
    const BOX_X = CAMP_X + 4;
    const BOX_W = CAMP_W - 8;
    const BOX_Y = 174;
    const BOX_H = 56;
    const gfx   = this.add.graphics().setDepth(2);

    // Box bg + depth bevel (sunken: dark top+left, lighter bottom+right)
    gfx
      .fillStyle(PANEL_BG).fillRect(BOX_X, BOX_Y, BOX_W, BOX_H)
      .lineStyle(1, 0x0d0b14)
      .lineBetween(BOX_X, BOX_Y, BOX_X + BOX_W, BOX_Y)
      .lineBetween(BOX_X, BOX_Y, BOX_X, BOX_Y + BOX_H)
      .lineStyle(1, 0x2c2347)
      .lineBetween(BOX_X, BOX_Y + BOX_H, BOX_X + BOX_W, BOX_Y + BOX_H)
      .lineBetween(BOX_X + BOX_W, BOX_Y, BOX_X + BOX_W, BOX_Y + BOX_H);

    // Portrait (inside box)
    this.add.image(BOX_X + 2, BOX_Y + 6, 'portraits', 'tessa').setOrigin(0, 0).setDepth(3);

    // Speaker name in amber
    bitmapLabel(this, BOX_X + 34, BOX_Y + 8, speaker, COLOR.amber).setDepth(3);

    // Wrap text into 3 lines within the text area
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
      bitmapLabel(this, BOX_X + 34, BOX_Y + 19 + l * 10, lines[l], COLOR.body).setDepth(3);
    }

    // Continue arrow
    bitmapLabel(this, BOX_X + BOX_W - 10, BOX_Y + BOX_H - 10, '>', COLOR.soft).setDepth(3);
  }

  // ── DIVE button ───────────────────────────────────────────────────────────

  private drawDiveButton(): void {
    const BTN_X = CAMP_X + 4;
    const BTN_Y = 232;
    const BTN_W = CAMP_W - 8;
    const BTN_H = 22;

    const gfx = this.add.graphics().setDepth(2);
    const drawNormal = (): void => {
      gfx.clear()
        .fillStyle(0xf28f2e).fillRect(BTN_X, BTN_Y, BTN_W, BTN_H)
        .lineStyle(1, 0xf7c94b).strokeRect(BTN_X, BTN_Y, BTN_W, BTN_H);
    };
    drawNormal();

    const diveStr = 'DIVE';
    const diveX   = BTN_X + Math.floor((BTN_W - measureText(diveStr, 9)) / 2);
    bitmapLabel(this, diveX, BTN_Y + 8, diveStr, 0x1a0a0a, 9).setDepth(3);

    // Chomper sprites flanking the label — 4-frame animation
    const digL = this.add.image(BTN_X + 6, BTN_Y + BTN_H / 2, 'chomper_down_0')
      .setOrigin(0, 0.5).setDepth(3);
    const digR = this.add.image(BTN_X + BTN_W - 6, BTN_Y + BTN_H / 2, 'chomper_down_0')
      .setOrigin(1, 0.5).setFlipX(true).setDepth(3);
    let diveFrame = 0;
    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        diveFrame = (diveFrame + 1) % 4;
        digL.setTexture(`chomper_down_${diveFrame}`);
        digR.setTexture(`chomper_down_${diveFrame}`);
      },
    });


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
