import Phaser from 'phaser';
import { loadSave } from '../storage/index';
import { FONT_KEY, FONT_SIZE, measureText } from '../render/font';

type TitleMode = 'title' | 'menu';

interface MenuEntry {
  label: string;
  y: number;
  enabled: boolean;
  action: () => void;
}

// Panel geometry (480×272 canvas)
const PX = 100, PY = 18, PW = 280, PH = 230;
const HDR_H = 26;
const BTN_W = PW - 40;        // 240
const BTN_X = PX + 20;        // 120
const BTN_CX = PX + PW / 2;   // 240
const BTN_H = 20;
const BTN_GAP = 6;
const BTN0_TOP = PY + HDR_H + 8; // 52 — top of first button

function btnCY(i: number): number {
  return BTN0_TOP + i * (BTN_H + BTN_GAP) + BTN_H / 2;
}

const FOOTER_Y = BTN0_TOP + 6 * (BTN_H + BTN_GAP) - BTN_GAP + 12;

// Palette colours
const C_PANEL_BG     = 0x2d1a09;
const C_PANEL_BORDER = 0x8b5a2b;
const C_HDR_BG       = 0x4a2f0d;
const C_BTN_GREEN    = 0x3d7a45;
const C_BTN_PURPLE   = 0x3d2e6b;
const C_BTN_SEL      = 0xf7c94b;
const C_TEXT_LIGHT   = 0xf4eed9;
const C_TEXT_DARK    = 0x1a0a00;
const C_TEXT_MUTED   = 0x78768a;
const C_TEXT_DIMPUR  = 0x7868a0;

export class TitleScene extends Phaser.Scene {
  private mode: TitleMode = 'title';
  private blinkOn = true;
  private img!: Phaser.GameObjects.Image;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private headerBmt!: Phaser.GameObjects.BitmapText;
  private footerBmt!: Phaser.GameObjects.BitmapText;
  private labelBmts: Phaser.GameObjects.BitmapText[] = [];
  private entries: MenuEntry[] = [];
  private selected = 0;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.mode = 'title';
    this.blinkOn = true;

    this.img = this.add.image(240, 136, 'title_a').setDepth(0);

    this.playPixelReveal();

    this.overlayGfx = this.add.graphics().setDepth(1).setVisible(false);
    this.overlayGfx.fillStyle(0x000000, 0.65);
    this.overlayGfx.fillRect(0, 0, 480, 272);

    this.panelGfx = this.add.graphics().setDepth(2).setVisible(false);

    this.buildMenu();

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.mode !== 'title') return;
        this.blinkOn = !this.blinkOn;
        this.img.setTexture(this.blinkOn ? 'title_a' : 'title_b');
      },
    });

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.mode === 'title') this.showMenu();
    });
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.mode === 'title') this.showMenu();
      else this.activateSelected();
    });
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.mode === 'menu') this.showTitle();
    });
    this.input.keyboard!.on('keydown-UP', () => {
      if (this.mode === 'menu') this.moveCursor(-1);
    });
    this.input.keyboard!.on('keydown-DOWN', () => {
      if (this.mode === 'menu') this.moveCursor(1);
    });

    this.input.on('pointerdown', () => {
      if (this.mode === 'title') this.showMenu();
    });
  }

  private buildMenu(): void {
    const save = loadSave();
    const hasSave = save.stats.runs > 0;

    // Header label
    const hdrTw = measureText('WHAT NEXT?');
    this.headerBmt = this.add
      .bitmapText(BTN_CX - hdrTw / 2, PY + (HDR_H - FONT_SIZE) / 2, FONT_KEY, 'WHAT NEXT?', FONT_SIZE)
      .setTint(C_TEXT_LIGHT)
      .setDepth(3)
      .setVisible(false);

    // Footer label
    const footerStr = 'UP/DOWN MOVE   ENTER SELECT';
    const ftTw = measureText(footerStr);
    this.footerBmt = this.add
      .bitmapText(BTN_CX - ftTw / 2, FOOTER_Y, FONT_KEY, footerStr, FONT_SIZE)
      .setTint(C_TEXT_MUTED)
      .setDepth(3)
      .setVisible(false);

    const ENTRIES: Omit<MenuEntry, 'y'>[] = [
      { label: 'CONTINUE RUN', enabled: hasSave, action: () => this.scene.start('Base') },
      { label: 'NEW DIVE',     enabled: true,    action: () => this.scene.start('Base') },
      { label: 'BASE CAMP',    enabled: true,    action: () => this.scene.start('Base') },
      { label: 'BEST RUNS',    enabled: false,   action: () => {} },
      { label: 'OPTIONS',      enabled: false,   action: () => {} },
      { label: 'QUIT',         enabled: true,    action: () => window.close() },
    ];

    this.entries = ENTRIES.map((e, i) => ({ ...e, y: btnCY(i) }));
    this.selected = this.entries.findIndex(e => e.enabled);

    // Button labels + click zones
    this.labelBmts = this.entries.map((e, i) => {
      const tw = measureText(e.label);
      const bmt = this.add
        .bitmapText(BTN_CX - tw / 2, e.y - FONT_SIZE / 2, FONT_KEY, e.label, FONT_SIZE)
        .setDepth(3)
        .setVisible(false);

      if (e.enabled) {
        const zone = this.add.zone(BTN_CX, e.y, BTN_W, BTN_H).setInteractive().setDepth(4);
        zone.on('pointerover', () => {
          if (this.mode !== 'menu') return;
          this.selected = i;
          this.drawPanel();
        });
        zone.on('pointerdown', () => {
          if (this.mode !== 'menu') return;
          this.selected = i;
          this.activateSelected();
        });
      }

      return bmt;
    });
  }

  private drawPanel(): void {
    this.panelGfx.clear();

    // Panel background + border
    this.panelGfx.fillStyle(C_PANEL_BG);
    this.panelGfx.fillRect(PX, PY, PW, PH);
    this.panelGfx.lineStyle(2, C_PANEL_BORDER);
    this.panelGfx.strokeRect(PX, PY, PW, PH);

    // Header bar
    this.panelGfx.fillStyle(C_HDR_BG);
    this.panelGfx.fillRect(PX + 1, PY + 1, PW - 2, HDR_H - 1);

    // Buttons
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const sel = i === this.selected;
      const isPurple = e.label === 'CONTINUE RUN';

      let bg: number, fg: number;
      if (sel) {
        bg = C_BTN_SEL; fg = C_TEXT_DARK;
      } else if (!e.enabled) {
        bg = isPurple ? C_BTN_PURPLE : 0x2a4030;
        fg = isPurple ? C_TEXT_DIMPUR : C_TEXT_MUTED;
      } else {
        bg = isPurple ? 0x4a3580 : C_BTN_GREEN;
        fg = C_TEXT_LIGHT;
      }

      this.panelGfx.fillStyle(bg);
      this.panelGfx.fillRect(BTN_X, e.y - BTN_H / 2, BTN_W, BTN_H);
      this.labelBmts[i].setTint(fg);
    }
  }

  private moveCursor(delta: number): void {
    const n = this.entries.length;
    let next = this.selected;
    for (let i = 0; i < n; i++) {
      next = (next + delta + n) % n;
      if (this.entries[next].enabled) break;
    }
    this.selected = next;
    this.drawPanel();
  }

  private activateSelected(): void {
    const e = this.entries[this.selected];
    if (e.enabled) e.action();
  }

  private setMenuVisible(visible: boolean): void {
    this.overlayGfx.setVisible(visible);
    this.panelGfx.setVisible(visible);
    this.headerBmt.setVisible(visible);
    this.footerBmt.setVisible(visible);
    this.labelBmts.forEach(b => b.setVisible(visible));
  }

  private playPixelReveal(): void {
    const CELL = 16;
    const COLS = Math.ceil(480 / CELL); // 30
    const ROWS = Math.ceil(272 / CELL); // 17
    const TOTAL = COLS * ROWS;          // 510

    const order: number[] = [];
    for (let i = 0; i < TOTAL; i++) order.push(i);
    Phaser.Utils.Array.Shuffle(order);

    const gfx = this.add.graphics().setDepth(5);
    let revealed = 0;

    const redraw = () => {
      gfx.clear();
      gfx.fillStyle(0x000000);
      for (let i = revealed; i < TOTAL; i++) {
        const c = order[i] % COLS;
        const r = Math.floor(order[i] / COLS);
        gfx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    };

    redraw();

    const tick = this.time.addEvent({
      delay: 20,
      loop: true,
      callback: () => {
        revealed = Math.min(revealed + 8, TOTAL);
        redraw();
        if (revealed >= TOTAL) {
          tick.remove();
          gfx.destroy();
        }
      },
    });
  }

  private showTitle(): void {
    this.mode = 'title';
    this.blinkOn = true;
    this.img.setTexture('title_a');
    this.setMenuVisible(false);
  }

  private showMenu(): void {
    this.mode = 'menu';
    this.setMenuVisible(true);
    this.drawPanel();
  }
}
