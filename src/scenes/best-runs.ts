import Phaser from 'phaser';
import { loadSave } from '../storage/index';
import { RunRecord } from '../core/save';
import { FONT_KEY, FONT_SIZE, measureText } from '../render/font';

const C_BG       = 0x2d1a09;
const C_BORDER   = 0x8b5a2b;
const C_HDR_BG   = 0x4a2f0d;
const C_LIGHT    = 0xf4eed9;
const C_MUTED    = 0x78768a;
const C_GOLD     = 0xf7c94b;
const C_GREEN    = 0x7ec87a;
const C_RED      = 0xe06060;

const PX = 60, PY = 18, PW = 360, PH = 236;
const HDR_H = 24;
const CX = PX + PW / 2;

const COL_RANK  = PX + 16;
const COL_FLOOR = PX + 50;
const COL_EM    = PX + 120;
const COL_KILLS = PX + 210;
const COL_OUT   = PX + 280;

const ROW_H = 16;
const ROWS_START = PY + HDR_H + 20;
const MAX_ROWS = 8;

export class BestRunsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BestRuns' });
  }

  create(): void {
    const save = loadSave();

    // Sort: floor desc, then emeralds desc
    const sorted = [...save.runHistory].sort(
      (a, b) => (b.floor * 1000 + b.emeralds) - (a.floor * 1000 + a.emeralds),
    );
    const rows = sorted.slice(0, MAX_ROWS);

    // Panel
    const g = this.add.graphics();
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

    // Header bar
    g.fillStyle(C_HDR_BG);
    g.fillRect(PX + 1, PY + 1, PW - 2, HDR_H - 1);

    const title = 'BEST RUNS';
    const tw = measureText(title);
    this.add.bitmapText(CX - tw / 2, PY + (HDR_H - FONT_SIZE) / 2, FONT_KEY, title, FONT_SIZE)
      .setTint(C_LIGHT);

    if (rows.length === 0) {
      const msg = 'NO RUNS YET - GO DIVE!';
      const mw = measureText(msg);
      this.add.bitmapText(CX - mw / 2, PY + PH / 2 - FONT_SIZE / 2, FONT_KEY, msg, FONT_SIZE)
        .setTint(C_MUTED);
    } else {
      // Column headers
      const COL_H_Y = PY + HDR_H + 6;
      this.bmt(COL_RANK,  COL_H_Y, '#',       C_MUTED);
      this.bmt(COL_FLOOR, COL_H_Y, 'FLOOR',   C_MUTED);
      this.bmt(COL_EM,    COL_H_Y, 'EMERALDS',C_MUTED);
      this.bmt(COL_KILLS, COL_H_Y, 'KILLS',   C_MUTED);
      this.bmt(COL_OUT,   COL_H_Y, 'OUTCOME', C_MUTED);

      // Divider
      g.lineStyle(1, 0x4a3010);
      g.lineBetween(PX + 8, COL_H_Y + FONT_SIZE + 3, PX + PW - 8, COL_H_Y + FONT_SIZE + 3);

      rows.forEach((r: RunRecord, i: number) => {
        const y = ROWS_START + i * ROW_H;
        const rowColor = i === 0 ? C_GOLD : C_LIGHT;
        this.bmt(COL_RANK,  y, `${i + 1}`, rowColor);
        this.bmt(COL_FLOOR, y, `${r.floor}`, rowColor);
        this.bmt(COL_EM,    y, `${r.emeralds}`, rowColor);
        this.bmt(COL_KILLS, y, `${r.kills}`, rowColor);
        const outcomeStr = r.survived ? 'EXTRACTED' : 'DIED';
        this.bmt(COL_OUT, y, outcomeStr, r.survived ? C_GREEN : C_RED);
      });
    }

    // Footer
    const footer = 'ESC / ENTER - BACK';
    const fw = measureText(footer);
    this.add.bitmapText(CX - fw / 2, PY + PH - FONT_SIZE - 6, FONT_KEY, footer, FONT_SIZE)
      .setTint(C_MUTED);

    this.input.keyboard!.on('keydown-ESC',   () => this.scene.start('Title'));
    this.input.keyboard!.on('keydown-ENTER', () => this.scene.start('Title'));
  }

  private bmt(x: number, y: number, text: string, tint: number): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(x, y, FONT_KEY, text, FONT_SIZE).setTint(tint);
  }
}
