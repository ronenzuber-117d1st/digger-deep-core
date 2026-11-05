import Phaser from 'phaser';
import { loadSave, saveSave } from '../storage/index';
import { createFreshSave } from '../core/save';
import { FONT_KEY, FONT_SIZE, measureText } from '../render/font';
import { playTrack, stopTrack, setMusicVolume, setSfxVolume, resumeAudio, ensureAudioContext } from '../audio/index';

type TitleMode = 'title' | 'menu' | 'confirm-new';

interface MenuEntry {
  label: string;
  y: number;
  enabled: boolean;
  action: () => void;
}

// Main menu panel geometry (480×272 canvas)
const PX = 100, PY = 18, PW = 280, PH = 196;
const HDR_H = 26;
const BTN_W = PW - 40;        // 240
const BTN_X = PX + 20;        // 120
const BTN_CX = PX + PW / 2;   // 240
const BTN_H = 20;

// Confirm panel geometry
const CPX = 110, CPY = 80, CPW = 260, CPH = 96;
const BTN_GAP = 6;
const BTN0_TOP = PY + HDR_H + 8; // 52 — top of first button

function btnCY(i: number): number {
  return BTN0_TOP + i * (BTN_H + BTN_GAP) + BTN_H / 2;
}

const FOOTER_Y = PY + PH - FONT_SIZE - 8;

// Palette colours
const C_PANEL_BG     = 0x2d1a09;
const C_PANEL_BORDER = 0x8b5a2b;
const C_HDR_BG       = 0x4a2f0d;
const C_BTN_GREEN    = 0x3d7a45;
const C_BTN_SEL      = 0xf7c94b;
const C_TEXT_LIGHT   = 0xf4eed9;
const C_TEXT_DARK    = 0x1a0a00;
const C_TEXT_MUTED   = 0x78768a;
const C_TEXT_DIMPUR  = 0x7868a0;

export class TitleScene extends Phaser.Scene {
  private mode: TitleMode = 'title';
  private blinkOn = true;
  private pressText!: Phaser.GameObjects.BitmapText;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private confirmGfx!: Phaser.GameObjects.Graphics;
  private confirmBmts: Phaser.GameObjects.BitmapText[] = [];
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
    const save = loadSave();
    setMusicVolume(save.settings.musicVol);
    setSfxVolume(save.settings.sfxVol);
    this.events.once('shutdown', stopTrack);

    this.add.image(240, 136, 'title_a').setDisplaySize(480, 272).setDepth(0);

    this.playPixelReveal();

    // "PRESS SPACE OR ENTER" blinking prompt
    const promptStr = 'PRESS SPACE OR ENTER';
    const promptW = measureText(promptStr);
    this.pressText = this.add
      .bitmapText(240 - promptW / 2, 248, FONT_KEY, promptStr, FONT_SIZE)
      .setTint(0xf4eed9)
      .setDepth(1);

    this.overlayGfx = this.add.graphics().setDepth(2).setVisible(false);
    this.overlayGfx.fillStyle(0x000000, 0.65);
    this.overlayGfx.fillRect(0, 0, 480, 272);

    this.panelGfx = this.add.graphics().setDepth(3).setVisible(false);

    // Confirm-new panel (depth above menu)
    this.confirmGfx = this.add.graphics().setDepth(6).setVisible(false);
    this.buildConfirmPanel();

    this.buildMenu();

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.mode !== 'title') return;
        this.blinkOn = !this.blinkOn;
        this.pressText.setVisible(this.blinkOn);
      },
    });

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.mode === 'title') this.showMenu();
    });
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.mode === 'title') this.showMenu();
      else if (this.mode === 'menu') this.activateSelected();
    });
    this.input.keyboard!.on('keydown-Y', () => {
      if (this.mode === 'confirm-new') this.confirmNewDive();
    });
    this.input.keyboard!.on('keydown-N', () => {
      if (this.mode === 'confirm-new') this.showMenu();
    });
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.mode === 'menu') this.showTitle();
      else if (this.mode === 'confirm-new') this.showMenu();
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
      .setDepth(4)
      .setVisible(false);

    // Footer label
    const footerStr = 'UP/DOWN: MOVE     ENTER: SELECT';
    const ftTw = measureText(footerStr);
    this.footerBmt = this.add
      .bitmapText(BTN_CX - ftTw / 2, FOOTER_Y, FONT_KEY, footerStr, FONT_SIZE)
      .setTint(C_TEXT_MUTED)
      .setDepth(4)
      .setVisible(false);

    const ENTRIES: Omit<MenuEntry, 'y'>[] = [
      { label: 'CONTINUE RUN', enabled: hasSave, action: () => this.scene.start('Base') },
      { label: 'NEW DIVE',     enabled: true,    action: () => this.showConfirmNew() },
      { label: 'BEST RUNS',    enabled: true,    action: () => this.scene.start('BestRuns') },
      { label: 'OPTIONS',      enabled: true,    action: () => this.scene.start('Options') },
      { label: 'QUIT',         enabled: true,    action: () => window.close() },
    ];

    this.entries = ENTRIES.map((e, i) => ({ ...e, y: btnCY(i) }));
    this.selected = this.entries.findIndex(e => e.enabled);

    // Button labels + click zones
    this.labelBmts = this.entries.map((e, i) => {
      const tw = measureText(e.label);
      const bmt = this.add
        .bitmapText(BTN_CX - tw / 2, e.y - FONT_SIZE / 2, FONT_KEY, e.label, FONT_SIZE)
        .setDepth(4)
        .setVisible(false);

      if (e.enabled) {
        const zone = this.add.zone(BTN_CX, e.y, BTN_W, BTN_H).setInteractive().setDepth(5);
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
    const g = this.panelGfx;
    g.clear();

    // Panel fill
    g.fillStyle(C_PANEL_BG);
    g.fillRect(PX, PY, PW, PH);

    // Outer border + inner bevel (raised panel)
    g.lineStyle(2, C_PANEL_BORDER);
    g.strokeRect(PX, PY, PW, PH);
    g.lineStyle(1, 0xb07840);
    g.lineBetween(PX + 2, PY + 2, PX + PW - 2, PY + 2);
    g.lineBetween(PX + 2, PY + 2, PX + 2, PY + PH - 2);
    g.lineStyle(1, 0x150800);
    g.lineBetween(PX + 2, PY + PH - 2, PX + PW - 2, PY + PH - 2);
    g.lineBetween(PX + PW - 2, PY + 2, PX + PW - 2, PY + PH - 2);

    // Header bar + raised bevel
    g.fillStyle(C_HDR_BG);
    g.fillRect(PX + 1, PY + 1, PW - 2, HDR_H - 1);
    g.lineStyle(1, 0xb07840);
    g.lineBetween(PX + 3, PY + 3, PX + PW - 3, PY + 3);
    g.lineStyle(1, 0x150800);
    g.lineBetween(PX + 3, PY + HDR_H - 1, PX + PW - 3, PY + HDR_H - 1);

    // Buttons with 3D depth
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const sel = i === this.selected;
      const isPurple = e.label === 'CONTINUE RUN';
      const bx = BTN_X;
      const by = Math.round(e.y - BTN_H / 2);

      let fill: number, hilite: number, shadow: number, fg: number;
      if (sel) {
        fill = C_BTN_SEL; hilite = 0xfbe080; shadow = 0x9a6f08; fg = C_TEXT_DARK;
      } else if (!e.enabled) {
        fill    = isPurple ? 0x2a1e4a : 0x1c2818;
        hilite  = isPurple ? 0x3a2860 : 0x263020;
        shadow  = 0x0d0800;
        fg      = isPurple ? C_TEXT_DIMPUR : C_TEXT_MUTED;
      } else if (isPurple) {
        fill = 0x4a3580; hilite = 0x6a50b8; shadow = 0x261948; fg = C_TEXT_LIGHT;
      } else {
        fill = C_BTN_GREEN; hilite = 0x5aab64; shadow = 0x1e3d22; fg = C_TEXT_LIGHT;
      }

      // Dark outer border
      g.fillStyle(0x150800);
      g.fillRect(bx, by, BTN_W, BTN_H);
      // Button fill
      g.fillStyle(fill);
      g.fillRect(bx + 1, by + 1, BTN_W - 2, BTN_H - 2);
      // Top highlight
      g.fillStyle(hilite);
      g.fillRect(bx + 1, by + 1, BTN_W - 2, 1);
      // Bottom shadow
      g.fillStyle(shadow);
      g.fillRect(bx + 1, by + BTN_H - 2, BTN_W - 2, 1);

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
    this.pressText.setVisible(true);
    this.setMenuVisible(false);
    this.confirmGfx.setVisible(false);
    this.confirmBmts.forEach(b => b.setVisible(false));
  }

  private showMenu(): void {
    // Ensure the AudioContext exists and is running before playTrack's async path runs.
    // On remote origins Chrome keeps a pre-gesture context suspended; creating it here
    // (inside the keyboard/pointer callback) guarantees it starts in running state.
    ensureAudioContext();
    resumeAudio();
    void playTrack('title');
    this.mode = 'menu';
    this.pressText.setVisible(false);
    this.confirmGfx.setVisible(false);
    this.confirmBmts.forEach(b => b.setVisible(false));
    this.setMenuVisible(true);
    this.drawPanel();
  }

  private showConfirmNew(): void {
    this.mode = 'confirm-new';
    this.confirmGfx.setVisible(true);
    this.confirmBmts.forEach(b => b.setVisible(true));
  }

  private confirmNewDive(): void {
    saveSave(createFreshSave());
    this.scene.start('Base');
  }

  private buildConfirmPanel(): void {
    const g = this.confirmGfx;
    const CX = CPX + CPW / 2;

    // Panel fill + border bevel
    g.fillStyle(0x2d1a09);
    g.fillRect(CPX, CPY, CPW, CPH);
    g.lineStyle(2, 0x8b5a2b);
    g.strokeRect(CPX, CPY, CPW, CPH);
    g.lineStyle(1, 0xb07840);
    g.lineBetween(CPX + 2, CPY + 2, CPX + CPW - 2, CPY + 2);
    g.lineBetween(CPX + 2, CPY + 2, CPX + 2, CPY + CPH - 2);
    g.lineStyle(1, 0x150800);
    g.lineBetween(CPX + 2, CPY + CPH - 2, CPX + CPW - 2, CPY + CPH - 2);
    g.lineBetween(CPX + CPW - 2, CPY + 2, CPX + CPW - 2, CPY + CPH - 2);

    const lines = [
      { text: 'START OVER?', y: CPY + 14, tint: 0xf4eed9 },
      { text: 'ALL PROGRESS WILL BE LOST', y: CPY + 36, tint: 0xf7c94b },
      { text: 'Y: CONFIRM   N: CANCEL', y: CPY + 72, tint: 0xf4eed9 },
    ];

    this.confirmBmts = lines.map(({ text, y, tint }) => {
      const w = measureText(text);
      return this.add
        .bitmapText(CX - w / 2, y, FONT_KEY, text, FONT_SIZE)
        .setTint(tint)
        .setDepth(7)
        .setVisible(false);
    });
  }
}
