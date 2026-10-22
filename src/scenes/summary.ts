import Phaser from 'phaser';
import { SaveData } from '../core/save';
import { bitmapLabel, COLOR, measureText } from '../render/font';

export interface SummaryData {
  floor: number;
  emeraldsBanked: number;
  kills: number;
  seed: number;
  survived: boolean;
  saveData: SaveData;
}

const STATIC_LINES = [
  '...HUM... DEEPER... DEEPER... CAN YOU HEAR IT YET...',
  '...FLOOR {n}. THE HUM GOT LOUDER. IT KNEW YOUR NAME. KEEP DIGGING, LITTLE LIGHT.',
  '...SIGNAL FADING... OR STRENGTHENING... HARD TO TELL FROM HERE...',
];

export class SummaryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Summary' });
  }

  init(data: SummaryData): void {
    this.data.set('d', data);
  }

  create(): void {
    const d = this.data.get('d') as SummaryData;

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

    // ── Left panel: Run stats ─────────────────────────────────────────────
    const STATS_X = 8;
    const STATS_Y = 22;
    const PANEL_W = 240;

    this.add.graphics()
      .fillStyle(0x16122a).fillRect(0, 18, PANEL_W, 182)
      .lineStyle(1, 0x2c2347).strokeRect(0, 18, PANEL_W, 182);

    const rows: [string, string][] = [
      ['FLOORS REACHED', String(d.floor)],
      ['EMERALDS BANKED', `+${d.emeraldsBanked}`],
      ['KILLS', String(d.kills)],
    ];

    rows.forEach(([label, val], i) => {
      bitmapLabel(this, STATS_X, STATS_Y + i * 16, label, COLOR.soft);
      const w = measureText(val);
      bitmapLabel(this, PANEL_W - 8 - w, STATS_Y + i * 16, val, COLOR.body);
    });

    // Kill icons row
    const killY = STATS_Y + 3 * 16 + 4;
    bitmapLabel(this, STATS_X, killY, 'KILLS BY TYPE:', COLOR.muted);
    // Show kill icons in a row
    const monsterTypes = ['grub', 'burrower', 'spitter', 'nest'] as const;
    monsterTypes.forEach((kind, i) => {
      const ix = STATS_X + i * 36;
      const frameMap: Record<string, string> = {
        grub: 'grub_0', burrower: 'burrower_0', spitter: 'spitter_0', nest: 'nest_0',
      };
      this.add.image(ix, killY + 14, 'monsters', frameMap[kind] ?? 'grub_0').setOrigin(0, 0);
      bitmapLabel(this, ix + 18, killY + 16, `X${Math.floor(d.kills / 4)}`, COLOR.body);
    });

    // Seed row
    const seedY = killY + 34;
    bitmapLabel(this, STATS_X, seedY, 'SEED', COLOR.muted);
    const seedHex = d.seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
    const seedStr = `${seedHex.slice(0,4)}-${seedHex.slice(4)}`;
    bitmapLabel(this, STATS_X + 40, seedY, seedStr, COLOR.body);

    // Salvage bonus row
    const salBonus = Math.floor(d.emeraldsBanked * 0.1);
    if (salBonus > 0) {
      bitmapLabel(this, STATS_X, seedY + 14, `SALVAGE BONUS +${salBonus}`, COLOR.soft);
    }

    // ── Right panel: New best / medals ────────────────────────────────────
    const RIGHT_X = PANEL_W + 4;
    const RIGHT_W = 480 - PANEL_W - 4;

    this.add.graphics()
      .fillStyle(0x16122a).fillRect(PANEL_W, 18, RIGHT_W, 182)
      .lineStyle(1, 0x2c2347).strokeRect(PANEL_W, 18, RIGHT_W, 182);

    const isNewBest = d.floor > (d.saveData.stats.bestFloor - 1);
    if (isNewBest) {
      const nbStr = 'NEW BEST!';
      bitmapLabel(this, RIGHT_X + (RIGHT_W - measureText(nbStr)) / 2, 24, nbStr, COLOR.gold);

      // Show entity sprites as decorative icons
      const iconY = 40;
      this.add.image(RIGHT_X + 10, iconY, 'objects', 'bag').setOrigin(0, 0);
      this.add.image(RIGHT_X + 30, iconY, 'objects', 'emerald').setOrigin(0, 0);
      this.add.image(RIGHT_X + 50, iconY, 'objects', 'fuel_canister').setOrigin(0, 0);

      bitmapLabel(this, RIGHT_X + 4, iconY + 24, 'DEEPEST FLOOR YET', COLOR.body);
      bitmapLabel(this, RIGHT_X + 4, iconY + 34, 'NEW: ECHO PING', COLOR.good);
      bitmapLabel(this, RIGHT_X + 4, iconY + 44, '+3 TO NEXT UPGRADE', COLOR.soft);
    }

    // ── Buttons ───────────────────────────────────────────────────────────
    const BTN_Y = 204;
    const BTN_H = 18;

    this.makeButton(4, BTN_Y, 150, BTN_H, 'BACK TO CAMP', COLOR.soft, 0x1a1530, 0x2c2347,
      () => this.scene.start('Base'));

    this.makeButton(158, BTN_Y, 150, BTN_H, 'DIVE AGAIN', COLOR.good, 0x0f3020, 0x5bc46a,
      () => this.scene.start('Base'));

    // ── Dialogue box (Static) ─────────────────────────────────────────────
    const dlgY = 226;
    const dlgGfx = this.add.graphics();
    dlgGfx.fillStyle(0x13101e).fillRect(0, dlgY, 480, 46);
    dlgGfx.lineStyle(1, 0x5b3f82).strokeRect(0, dlgY, 480, 46);

    // Static portrait + flicker edge
    dlgGfx.fillStyle(0x5b3f82).fillRect(0, dlgY, 2, 46);
    this.add.image(4, dlgY + 4, 'portraits', 'static').setOrigin(0, 0).setDepth(1);

    // Name tab
    dlgGfx.fillStyle(0x5b3f82).fillRect(34, dlgY - 9, measureText('STATIC') + 8, 9);
    bitmapLabel(this, 38, dlgY - 8, 'STATIC', COLOR.bold).setDepth(1);

    // Dialogue line
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
    bitmapLabel(this, 470, dlgY + 36, '>', COLOR.muted).setDepth(1);

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

    const lbl = bitmapLabel(
      this,
      x + (w - measureText(label)) / 2,
      y + (h - 7) / 2,
      label, tint,
    ).setDepth(1);

    gfx.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    gfx.on('pointerover', () => { draw(borderColor, borderColor); lbl.setTint(0xffffff); });
    gfx.on('pointerout', () => { draw(fillColor, borderColor); lbl.setTint(tint); });
    gfx.on('pointerdown', action);
  }
}
