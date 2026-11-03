import Phaser from 'phaser';
import { SaveData } from '../core/save';
import { bitmapLabel, COLOR, measureText } from '../render/font';
import tuning from '../data/tuning.json';
import { playJingle } from '../audio/index';

export interface SummaryData {
  floor: number;
  emeraldsCarried: number;
  emeraldsBanked: number;
  kills: number;
  killsByType: Record<string, number>;
  seed: number;
  survived: boolean;
  saveData: SaveData;
  prevBestFloor: number;
}

const STATIC_LINES = [
  '...HUM... DEEPER... DEEPER... CAN YOU HEAR IT YET...',
  '...FLOOR {n}. THE HUM GOT LOUDER. IT KNEW YOUR NAME. KEEP DIGGING, LITTLE LIGHT.',
  '...SIGNAL FADING... OR STRENGTHENING... HARD TO TELL FROM HERE...',
];

const MONSTER_ORDER = ['grub', 'burrower', 'spitter', 'drifter'] as const;
const MONSTER_FRAME: Record<string, string> = {
  grub: 'grub_0', burrower: 'burrower_0', spitter: 'spitter_0', drifter: 'drifter_0',
};

const WOOD_BORDER = 0x6b4128;
const WOOD_HI     = 0x8f5a33;
const WOOD_SHADOW = 0x2a1a14;
const PANEL_BG    = 0x0d0b14;

export class SummaryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Summary' });
  }

  init(data: SummaryData): void {
    this.data.set('d', data);
  }

  create(): void {
    const d = this.data.get('d') as SummaryData;
    const isNewBest = d.floor > d.prevBestFloor;
    if (d.survived) void playJingle('victory');

    // ── Background ────────────────────────────────────────────────────────
    this.add.rectangle(240, 136, 480, 272, 0x0d0b14);

    // ── Header ────────────────────────────────────────────────────────────
    this.add.graphics().fillStyle(0x16122a).fillRect(0, 0, 480, 16);

    const statusStr = d.survived ? 'RUN COMPLETE' : 'RIG LOST POWER';
    bitmapLabel(this, 4, 4, statusStr, d.survived ? COLOR.gold : COLOR.warn);

    const subStr = d.survived
      ? `EXTRACTED ON FLOOR ${d.floor}`
      : `RIG LOST POWER ON FLOOR ${d.floor}`;
    bitmapLabel(this, 240 - measureText(subStr) / 2, 4, subStr, COLOR.soft);

    // ── Panel layout ──────────────────────────────────────────────────────
    const PANEL_Y  = 18;
    const PANEL_H  = 100;
    const GAP      = 8;
    const L_W      = 232;
    const R_X      = L_W + GAP;
    const R_W      = 480 - R_X;

    const drawPanel = (x: number, y: number, w: number, h: number): void => {
      this.add.graphics()
        .fillStyle(PANEL_BG).fillRect(x, y, w, h)
        .lineStyle(1, WOOD_BORDER).strokeRect(x, y, w, h)
        .lineStyle(1, WOOD_HI)
          .lineBetween(x + 1, y + 1, x + w - 2, y + 1)
          .lineBetween(x + 1, y + 1, x + 1, y + h - 2)
        .lineStyle(1, WOOD_SHADOW)
          .lineBetween(x + 1, y + h - 2, x + w - 2, y + h - 2)
          .lineBetween(x + w - 2, y + 1, x + w - 2, y + h - 2);
    };

    drawPanel(0,    PANEL_Y, L_W, PANEL_H);
    drawPanel(R_X,  PANEL_Y, R_W, PANEL_H);

    // ── Left panel: stats ─────────────────────────────────────────────────
    const SX   = 8;
    const VAL_X = L_W - 10;
    let sy = 26;

    const statRow = (label: string, val: string, col: number): void => {
      bitmapLabel(this, SX, sy, label, COLOR.soft);
      const labelEnd = SX + measureText(label);
      const valW     = measureText(val);
      const dotSpace = VAL_X - valW - labelEnd - 4;
      const dots = '.'.repeat(Math.max(0, Math.floor(dotSpace / 6)));
      if (dots) bitmapLabel(this, labelEnd + 2, sy, dots, COLOR.muted);
      bitmapLabel(this, VAL_X - valW, sy, val, col);
      sy += 14;
    };

    statRow('FLOORS REACHED', String(d.floor), COLOR.body);
    statRow('EMERALDS FOUND', String(d.emeraldsCarried), COLOR.body);
    if (!d.survived && d.emeraldsCarried > d.emeraldsBanked) {
      statRow('LOST TO PENALTY', `-${d.emeraldsCarried - d.emeraldsBanked}`, COLOR.warn);
    }
    statRow('EMERALDS BANKED', `+${d.emeraldsBanked}`, COLOR.gold);
    statRow('KILLS', String(d.kills), COLOR.body);

    // Kill sprite breakdown
    sy += 2;
    const killedTypes = MONSTER_ORDER.filter((k) => (d.killsByType[k] ?? 0) > 0);
    if (killedTypes.length === 0) {
      bitmapLabel(this, SX, sy + 4, 'NO KILLS', COLOR.muted);
    } else {
      let kx = SX;
      for (const kind of killedTypes) {
        this.add.image(kx, sy, 'monsters', MONSTER_FRAME[kind]).setOrigin(0, 0);
        const countStr = `×${d.killsByType[kind]}`;
        bitmapLabel(this, kx + 18, sy + 5, countStr, COLOR.body);
        kx += 18 + measureText(countStr) + 8;
      }
    }

    // ── Right panel ───────────────────────────────────────────────────────
    const RX2 = R_X + 8;
    const RVX = R_X + R_W - 10;
    let ry = 26;

    if (isNewBest) {
      const nbStr = 'NEW BEST!';
      bitmapLabel(this, R_X + (R_W - measureText(nbStr)) / 2, ry, nbStr, COLOR.gold);
      ry += 14;
      bitmapLabel(this, RX2, ry, 'DEEPEST FLOOR YET', COLOR.soft);
      ry += 16;
      this.add.graphics().lineStyle(1, 0x2c2347).lineBetween(R_X + 4, ry, R_X + R_W - 4, ry);
      ry += 8;
    }

    const stats = d.saveData.stats;

    const rightRow = (label: string, val: string, col: number): void => {
      bitmapLabel(this, RX2, ry, label, COLOR.soft);
      const labelEnd = RX2 + measureText(label);
      const valW     = measureText(val);
      const dotSpace = RVX - valW - labelEnd - 4;
      const dots = '.'.repeat(Math.max(0, Math.floor(dotSpace / 6)));
      if (dots) bitmapLabel(this, labelEnd + 2, ry, dots, COLOR.muted);
      bitmapLabel(this, RVX - valW, ry, val, col);
      ry += 14;
    };

    rightRow('BEST FLOOR',   String(stats.bestFloor),  COLOR.body);
    rightRow('TOTAL RUNS',   String(stats.runs),        COLOR.body);
    rightRow('TOTAL KILLS',  String(stats.totalKills),  COLOR.body);

    // ── Buttons ───────────────────────────────────────────────────────────
    const BTN_Y = PANEL_Y + PANEL_H + 14;
    const BTN_H = 18;
    const BTN_W = 234;

    this.makeButton(4,   BTN_Y, BTN_W, BTN_H, 'BACK TO CAMP', COLOR.gold,  0x3a2500, 0xd4a020,
      () => this.scene.start('Base'));
    this.makeButton(242, BTN_Y, BTN_W, BTN_H, 'DIVE AGAIN',   COLOR.good, 0x0f3020, 0x5bc46a,
      () => {
        const save = d.saveData;
        const ups  = save.upgrades;
        this.scene.start('Dive', {
          seed:     Math.floor(Math.random() * 0xffffffff),
          floor:    1,
          hp:       tuning.player.startHp + ups.hull,
          maxHp:    tuning.player.startHp + ups.hull,
          fuel:     tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
          maxFuel:  tuning.player.startFuel * (1 + ups.fuelTank * 0.1),
          emeralds: 0, kills: 0, saveData: save,
        });
      });

    // ── Dialogue box (Static) ─────────────────────────────────────────────
    const dlgY = BTN_Y + BTN_H + 12;
    const dlgH = 272 - dlgY - 8;
    const dlgGfx = this.add.graphics();
    dlgGfx.fillStyle(0x0d0b14).fillRect(0, dlgY, 480, dlgH);
    dlgGfx.lineStyle(1, 0x5b3f82).strokeRect(0, dlgY, 480, dlgH);
    dlgGfx.fillStyle(0x5b3f82).fillRect(0, dlgY, 2, dlgH);
    this.add.image(4, dlgY + 4, 'portraits', 'static').setOrigin(0, 0).setDepth(1);

    dlgGfx.fillStyle(0x5b3f82).fillRect(34, dlgY - 9, measureText('STATIC') + 8, 9);
    bitmapLabel(this, 38, dlgY - 8, 'STATIC', COLOR.bold).setDepth(1);

    const staticLine = STATIC_LINES[1].replace('{n}', String(d.floor));
    const words = staticLine.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + w).length > 52 && cur) { lines.push(cur.trim()); cur = w + ' '; }
      else cur += w + ' ';
    }
    if (cur.trim()) lines.push(cur.trim());
    for (let l = 0; l < Math.min(3, lines.length); l++) {
      bitmapLabel(this, 36, dlgY + 6 + l * 10, lines[l], COLOR.soft).setDepth(1);
    }
    bitmapLabel(this, 470, dlgY + dlgH - 10, '>', COLOR.muted).setDepth(1);

    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Base'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('Base'));
  }

  private makeButton(
    x: number, y: number, w: number, h: number,
    label: string, tint: number, fillColor: number, borderColor: number,
    action: () => void,
  ): void {
    const gfx = this.add.graphics();
    const draw = (fill: number, border: number): void => {
      gfx.clear().fillStyle(fill).fillRect(x, y, w, h).lineStyle(1, border).strokeRect(x, y, w, h);
    };
    draw(fillColor, borderColor);
    const lbl = bitmapLabel(this, x + (w - measureText(label)) / 2, y + (h - 7) / 2, label, tint).setDepth(1);
    gfx.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    gfx.on('pointerover', () => { draw(borderColor, borderColor); lbl.setTint(0xffffff); });
    gfx.on('pointerout', () => { draw(fillColor, borderColor); lbl.setTint(tint); });
    gfx.on('pointerdown', action);
  }
}
