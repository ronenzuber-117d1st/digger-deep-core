import Phaser from 'phaser';
import { RunCarry } from './carry';
import { bitmapLabel, COLOR, measureText } from '../render/font';
import upgradesDef from '../data/upgrades.json';

interface RunUpgradeDef {
  id: string;
  label: string;
  description: string;
  rarity: number;
  icon: string;
  tag: string;
}

interface RunPickData {
  carry: RunCarry;
}

const RARITY_COLORS: Record<number, number> = {
  1: COLOR.good,    // COMMON — green
  2: COLOR.cyan,    // RARE — cyan
  3: COLOR.gold,    // RELIC — amber
};

const RARITY_BORDER: Record<number, number> = {
  1: 0x1a3a20,
  2: 0x1a2f3f,
  3: 0x3a2a0a,
};

function pickUpgrades(): RunUpgradeDef[] {
  const pool = (upgradesDef.run as RunUpgradeDef[]).slice();
  const chosen: RunUpgradeDef[] = [];

  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, u) => s + (4 - u.rarity), 0);
    let r = Math.random() * totalWeight;
    for (let j = 0; j < pool.length; j++) {
      r -= 4 - pool[j].rarity;
      if (r <= 0) {
        chosen.push(...pool.splice(j, 1));
        break;
      }
    }
  }

  return chosen;
}

export class RunPickScene extends Phaser.Scene {
  private carry!: RunCarry;
  private upgrades!: RunUpgradeDef[];
  private selectedIdx = 1; // centre card starts selected
  private cards: Array<{
    gfx: Phaser.GameObjects.Graphics;
    container: Phaser.GameObjects.Container;
  }> = [];

  constructor() {
    super({ key: 'RunPick' });
  }

  init(data: RunPickData): void {
    this.carry = data.carry;
    this.upgrades = pickUpgrades();
    this.selectedIdx = 1;
  }

  create(): void {
    // Dim background (the tile scene already rendered its last frame under)
    this.add.rectangle(240, 136, 480, 272, 0x000000, 0.65);

    // Header strip
    this.add.graphics().fillStyle(0x16122a, 0.9).fillRect(0, 0, 480, 16);

    // HUD elements (mirror DiveScene's HUD appearance with carry data)
    bitmapLabel(this, 4, 4, `FLOOR ${this.carry.floor - 1}`, COLOR.soft);

    const title = 'CHOOSE ONE UPGRADE';
    bitmapLabel(this, 240 - measureText(title) / 2, 20, title, COLOR.gold, 7);

    const sub = `FLOOR ${this.carry.floor - 1} REWARD - THIS RUN ONLY`;
    bitmapLabel(this, 240 - measureText(sub) / 2, 32, sub, COLOR.soft);

    this.buildCards();
    this.highlightCard(this.selectedIdx);

    const hint = 'LEFT/RIGHT TO SELECT   ENTER TO PICK';
    bitmapLabel(this, 240 - measureText(hint) / 2, 262, hint, COLOR.muted);

    this.setupKeys();
  }

  private buildCards(): void {
    this.cards = [];
    const CARD_W = 128;
    const CARD_H = 170;
    const CARD_Y = 48;
    const positions = [20, 176, 332];

    this.upgrades.forEach((upg, i) => {
      const cx = positions[i];
      const gfx = this.add.graphics();
      const container = this.add.container(cx, CARD_Y);

      // Card background
      gfx.fillStyle(0x16122a).fillRect(cx, CARD_Y, CARD_W, CARD_H);
      gfx.lineStyle(1, RARITY_BORDER[upg.rarity]).strokeRect(cx, CARD_Y, CARD_W, CARD_H);

      // Rarity tag
      const rarityColor = RARITY_COLORS[upg.rarity] ?? COLOR.body;
      const tagStr = upg.tag;
      const tagW = measureText(tagStr) + 8;
      const tagGfx = this.add.graphics();
      tagGfx.fillStyle(rarityColor, 0.3).fillRect(cx + 2, CARD_Y + 2, tagW, 11);
      bitmapLabel(this, cx + 6, CARD_Y + 4, tagStr, rarityColor).setDepth(1);

      // Rarity diamonds
      const diamondX = cx + CARD_W - 4 - upg.rarity * 8;
      for (let d = 0; d < upg.rarity; d++) {
        bitmapLabel(this, diamondX + d * 8, CARD_Y + 4, '*', rarityColor).setDepth(1);
      }

      // Icon (try to find in icons sheet, fallback to emerald)
      const iconKey = Object.keys(iconMap).includes(upg.icon) ? iconMap[upg.icon] : 'emerald';
      this.add.image(cx + CARD_W / 2, CARD_Y + 46, iconKey[0], iconKey[1])
        .setOrigin(0.5).setDepth(1);

      // Upgrade name
      const nameStr = upg.label.toUpperCase();
      bitmapLabel(this, cx + (CARD_W - measureText(nameStr)) / 2, CARD_Y + 66, nameStr, COLOR.body).setDepth(1);

      // Description — word-wrap at ~18 chars
      const words = upg.description.split(' ');
      const descLines: string[] = [];
      let cur = '';
      for (const w of words) {
        if ((cur + w).length > 18 && cur) { descLines.push(cur.trim()); cur = w + ' '; }
        else cur += w + ' ';
      }
      if (cur.trim()) descLines.push(cur.trim());
      for (let l = 0; l < Math.min(4, descLines.length); l++) {
        bitmapLabel(this, cx + 6, CARD_Y + 80 + l * 10, descLines[l], COLOR.soft).setDepth(1);
      }

      // Pick button
      const btnY = CARD_Y + CARD_H - 22;
      const btnGfx = this.add.graphics();
      btnGfx.fillStyle(0x0f3020).fillRect(cx + 4, btnY, CARD_W - 8, 16);
      btnGfx.lineStyle(1, COLOR.good).strokeRect(cx + 4, btnY, CARD_W - 8, 16);
      const pickStr = `[${i + 1}] PICK`;
      bitmapLabel(this, cx + (CARD_W - measureText(pickStr)) / 2, btnY + 4, pickStr, COLOR.good)
        .setDepth(1)
        .setInteractive({
          useHandCursor: true,
          hitArea: new Phaser.Geom.Rectangle(-CARD_W / 2, -8, CARD_W, 16),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        })
        .on('pointerdown', () => this.pick(i));

      this.cards.push({ gfx, container });
    });
  }

  private highlightCard(idx: number): void {
    const positions = [20, 176, 332];
    const CARD_W = 128;
    const CARD_H = 170;
    const CARD_Y = 48;

    this.cards.forEach(({ gfx }, i) => {
      const cx = positions[i];
      const isSelected = i === idx;
      gfx.clear();
      gfx.fillStyle(isSelected ? 0x1e1838 : 0x16122a)
        .fillRect(cx, isSelected ? CARD_Y - 4 : CARD_Y, CARD_W, isSelected ? CARD_H + 4 : CARD_H);
      gfx.lineStyle(isSelected ? 2 : 1, isSelected ? 0xf0a04b : RARITY_BORDER[this.upgrades[i].rarity])
        .strokeRect(cx, isSelected ? CARD_Y - 4 : CARD_Y, CARD_W, isSelected ? CARD_H + 4 : CARD_H);
    });
  }

  private pick(idx: number): void {
    const chosen = this.upgrades[idx];
    const updatedCarry: RunCarry = {
      ...this.carry,
      runUpgrades: [...(this.carry.runUpgrades ?? []), chosen.id],
    };
    this.scene.start('Dive', updatedCarry);
  }

  private setupKeys(): void {
    this.input.keyboard!.on('keydown-LEFT', () => {
      this.selectedIdx = Math.max(0, this.selectedIdx - 1);
      this.highlightCard(this.selectedIdx);
    });
    this.input.keyboard!.on('keydown-RIGHT', () => {
      this.selectedIdx = Math.min(2, this.selectedIdx + 1);
      this.highlightCard(this.selectedIdx);
    });
    this.input.keyboard!.on('keydown-ONE',   () => this.pick(0));
    this.input.keyboard!.on('keydown-TWO',   () => this.pick(1));
    this.input.keyboard!.on('keydown-THREE', () => this.pick(2));
    this.input.keyboard!.on('keydown-ENTER', () => this.pick(this.selectedIdx));
  }
}

// Maps upgrade icon IDs to [sheet, frame] pairs
const iconMap: Record<string, [string, string]> = {
  pulse:      ['icons', 'pulse_core'],
  fuel:       ['icons', 'fuel_tank'],
  hull:       ['icons', 'hull'],
  drill:      ['icons', 'drill_motor'],
  prospector: ['icons', 'prospector'],
  salvage:    ['icons', 'salvage_contract'],
  lantern:    ['icons', 'lantern_mount'],
  magnet:     ['icons', 'magnet_coil'],
  ping:       ['icons', 'echo_ping'],
};
