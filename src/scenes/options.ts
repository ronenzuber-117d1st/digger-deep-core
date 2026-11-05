import Phaser from 'phaser';
import { loadSave, saveSave } from '../storage/index';
import { SaveData } from '../core/save';
import { FONT_KEY, FONT_SIZE, measureText } from '../render/font';
import { setMusicVolume, setSfxVolume } from '../audio/index';

const C_BG       = 0x2d1a09;
const C_BORDER   = 0x8b5a2b;
const C_HDR_BG   = 0x4a2f0d;
const C_LIGHT    = 0xf4eed9;
const C_MUTED    = 0x78768a;
const C_SEL      = 0xf7c94b;
const C_VAL      = 0x7ec87a;

const PX = 90, PY = 30, PW = 300, PH = 180;
const HDR_H = 24;
const CX = PX + PW / 2;
const ROW_H = 24;
const ROWS_Y = PY + HDR_H + 16;
const VAL_X = PX + PW - 20;

type OptionKind = 'toggle' | 'volume';

type OptionValue = number | boolean | string;

interface OptionRow {
  label: string;
  kind: OptionKind;
  get: (s: SaveData['settings']) => OptionValue;
  set: (s: SaveData['settings'], delta: number) => SaveData['settings'];
  format: (v: OptionValue) => string;
}

const fmtVol = (v: OptionValue): string =>
  (v as number) === 0 ? 'OFF' : `${Math.round((v as number) * 100)}%`;

const ROWS: OptionRow[] = [
  {
    label: 'MUSIC VOL',
    kind: 'volume',
    get: s => s.musicVol,
    set: (s, d) => ({ ...s, musicVol: Math.max(0, Math.min(1, Math.round((s.musicVol + d * 0.1) * 10) / 10)) }),
    format: fmtVol,
  },
  {
    label: 'SFX VOL',
    kind: 'volume',
    get: s => s.sfxVol,
    set: (s, d) => ({ ...s, sfxVol: Math.max(0, Math.min(1, Math.round((s.sfxVol + d * 0.1) * 10) / 10)) }),
    format: fmtVol,
  },
  {
    label: 'SCREEN SHAKE',
    kind: 'toggle',
    get: s => s.shake,
    set: (s, _d) => ({ ...s, shake: !s.shake }),
    format: v => v ? 'ON' : 'OFF',
  },
  {
    label: 'FONT STYLE',
    kind: 'toggle',
    get: s => s.font,
    set: (s, _d) => ({ ...s, font: s.font === 'smooth' ? 'pixel' : 'smooth' }),
    format: v => (v as string) === 'smooth' ? 'SMOOTH' : 'PIXEL',
  },
];

export class OptionsScene extends Phaser.Scene {
  private saveData!: SaveData;
  private settings!: SaveData['settings'];
  private originalFont!: SaveData['settings']['font'];
  private selected = 0;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private rowBmts: Phaser.GameObjects.BitmapText[] = [];
  private valBmts: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super({ key: 'Options' });
  }

  create(): void {
    this.saveData = loadSave();
    this.settings = { ...this.saveData.settings };
    this.originalFont = this.settings.font;
    this.selected = 0;

    this.panelGfx = this.add.graphics();
    this.drawPanel();
    this.buildRows();

    this.input.keyboard!.on('keydown-UP',    () => this.moveCursor(-1));
    this.input.keyboard!.on('keydown-DOWN',  () => this.moveCursor(1));
    this.input.keyboard!.on('keydown-LEFT',  () => this.adjust(-1));
    this.input.keyboard!.on('keydown-RIGHT', () => this.adjust(1));
    this.input.keyboard!.on('keydown-ENTER', () => this.adjust(1));
    this.input.keyboard!.on('keydown-ESC',   () => this.saveAndBack());
  }

  private drawPanel(): void {
    const g = this.panelGfx;
    g.clear();
    g.fillStyle(C_BG);
    g.fillRect(PX, PY, PW, PH);
    g.lineStyle(2, C_BORDER);
    g.strokeRect(PX, PY, PW, PH);
    g.lineStyle(1, 0xb07840);
    g.lineBetween(PX + 2, PY + 2, PX + PW - 2, PY + 2);
    g.lineBetween(PX + 2, PY + 2, PX + 2, PY + PH - 2);
    g.lineStyle(1, 0x150800);
    g.lineBetween(PX + 2, PY + PH - 2, PX + PW - 2, PY + PH - 2);
    g.lineBetween(PX + PW - 2, PY + 2, PX + PW - 2, PY + PH - 2);

    g.fillStyle(C_HDR_BG);
    g.fillRect(PX + 1, PY + 1, PW - 2, HDR_H - 1);

    const title = 'OPTIONS';
    const tw = measureText(title);
    this.add.bitmapText(CX - tw / 2, PY + (HDR_H - FONT_SIZE) / 2, FONT_KEY, title, FONT_SIZE)
      .setTint(C_LIGHT).setDepth(1);

    // Row backgrounds for selection
    for (let i = 0; i < ROWS.length; i++) {
      const y = ROWS_Y + i * ROW_H;
      const sel = i === this.selected;
      if (sel) {
        g.fillStyle(0x1e2808);
        g.fillRect(PX + 4, y - 2, PW - 8, ROW_H - 2);
      }
    }

    const footer = 'UP/DOWN: SELECT  LEFT/RIGHT: CHANGE  ESC: SAVE';
    const fw = measureText(footer);
    this.add.bitmapText(CX - fw / 2, PY + PH - FONT_SIZE - 6, FONT_KEY, footer, FONT_SIZE)
      .setTint(C_MUTED).setDepth(1);
  }

  private buildRows(): void {
    this.rowBmts.forEach(b => b.destroy());
    this.valBmts.forEach(b => b.destroy());
    this.rowBmts = [];
    this.valBmts = [];

    for (let i = 0; i < ROWS.length; i++) {
      const row = ROWS[i];
      const y = ROWS_Y + i * ROW_H;
      const sel = i === this.selected;
      const labelColor = sel ? C_SEL : C_LIGHT;

      const lbl = this.add.bitmapText(PX + 16, y, FONT_KEY, row.label, FONT_SIZE)
        .setTint(labelColor).setDepth(2);

      const val = row.get(this.settings);
      const valStr = row.format(val);
      const vw = measureText(valStr);

      // For volume, show arrow hints
      let displayStr = valStr;
      if (sel && row.kind === 'volume') displayStr = `< ${valStr} >`;
      if (sel && row.kind === 'toggle') displayStr = `< ${valStr} >`;

      const dw = measureText(displayStr);
      const vBmt = this.add.bitmapText(VAL_X - dw, y, FONT_KEY, displayStr, FONT_SIZE)
        .setTint(sel ? C_SEL : C_VAL).setDepth(2);

      void vw; // suppress unused warning
      this.rowBmts.push(lbl);
      this.valBmts.push(vBmt);
    }
  }

  private moveCursor(delta: number): void {
    this.selected = (this.selected + delta + ROWS.length) % ROWS.length;
    this.panelGfx.clear();
    this.drawPanel();
    this.buildRows();
  }

  private adjust(delta: number): void {
    const row = ROWS[this.selected];
    this.settings = row.set(this.settings, delta);
    setMusicVolume(this.settings.musicVol);
    setSfxVolume(this.settings.sfxVol);
    this.panelGfx.clear();
    this.drawPanel();
    this.buildRows();
  }

  private saveAndBack(): void {
    const newSave: SaveData = { ...this.saveData, settings: this.settings };
    saveSave(newSave);
    if (this.settings.font !== this.originalFont) {
      window.location.reload();
    } else {
      this.scene.start('Title');
    }
  }
}
