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
  maxPicks?: number;
  requiresPulse?: boolean;
}

interface RunPickData {
  carry: RunCarry;
  remainingUpgrades?: string[]; // IDs of pre-selected upgrades for second pick
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

function pickUpgrades(count: number, owned: string[], hasPulse: boolean): RunUpgradeDef[] {
  const pool = (upgradesDef.run as RunUpgradeDef[]).filter((u) => {
    if (u.requiresPulse && !hasPulse) return false;
    const timesOwned = owned.filter((id) => id === u.id).length;
    return timesOwned < (u.maxPicks ?? 1);
  });
  const chosen: RunUpgradeDef[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
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

interface CardLayout {
  cardW: number;
  cardH: number;
  positions: number[];
  wrapW: number;
}

function computeLayout(count: number): CardLayout {
  if (count === 4) {
    const cardW = 96;
    const gap = 18;
    const total = count * cardW + (count - 1) * gap;
    const start = Math.round((480 - total) / 2);
    return {
      cardW,
      cardH: 170,
      positions: Array.from({ length: count }, (_, i) => start + i * (cardW + gap)),
      wrapW: 14,
    };
  }
  return {
    cardW: 128,
    cardH: 170,
    positions: [20, 176, 332],
    wrapW: 18,
  };
}

export class RunPickScene extends Phaser.Scene {
  private carry!: RunCarry;
  private upgrades!: RunUpgradeDef[];
  private selectedIdx = 1;
  private picksLeft = 1;
  private pickNum = 1;
  private totalPicks = 1;
  private cards: Array<{
    gfx: Phaser.GameObjects.Graphics;
    container: Phaser.GameObjects.Container;
  }> = [];

  constructor() {
    super({ key: 'RunPick' });
  }

  init(data: RunPickData): void {
    this.carry = data.carry;
    const hasPulse = this.carry.saveData.upgrades.pulseCore > 0;

    if (data.remainingUpgrades) {
      // Second pick: show the three remaining cards from the first pick
      this.upgrades = (upgradesDef.run as RunUpgradeDef[])
        .filter((u) => data.remainingUpgrades!.includes(u.id));
      this.picksLeft = 1;
      this.pickNum = 2;
      this.totalPicks = 2;
    } else {
      this.totalPicks = this.carry.saveData.upgrades.extraPick > 0 ? 2 : 1;
      this.picksLeft = this.totalPicks;
      this.pickNum = 1;
      this.upgrades = pickUpgrades(this.totalPicks === 2 ? 4 : 3, this.carry.runUpgrades ?? [], hasPulse);
    }

    this.selectedIdx = 1;
  }

  create(): void {
    this.add.rectangle(240, 136, 480, 272, 0x000000, 0.65);
    this.add.graphics().fillStyle(0x16122a, 0.9).fillRect(0, 0, 480, 16);

    bitmapLabel(this, 4, 4, `FLOOR ${this.carry.floor - 1}`, COLOR.soft);

    const title = this.totalPicks === 2
      ? `CHOOSE TWO UPGRADES (${this.pickNum}/2)`
      : 'CHOOSE ONE UPGRADE';
    bitmapLabel(this, 240 - measureText(title) / 2, 20, title, COLOR.gold, 7);

    const sub = `FLOOR ${this.carry.floor - 1} REWARD - THIS RUN ONLY`;
    bitmapLabel(this, 240 - measureText(sub) / 2, 32, sub, COLOR.soft);

    this.buildCards();
    this.highlightCard(this.selectedIdx);

    const hint = this.upgrades.length === 4
      ? 'LEFT/RIGHT TO SELECT   1-4 OR ENTER TO PICK'
      : 'LEFT/RIGHT TO SELECT   ENTER TO PICK';
    bitmapLabel(this, 240 - measureText(hint) / 2, 262, hint, COLOR.muted);

    this.setupKeys();
  }

  private buildCards(): void {
    this.cards = [];
    const { cardW, cardH, positions, wrapW } = computeLayout(this.upgrades.length);
    const CARD_Y = 48;

    this.upgrades.forEach((upg, i) => {
      const cx = positions[i];
      const gfx = this.add.graphics();
      const container = this.add.container(cx, CARD_Y);

      // Card background
      gfx.fillStyle(0x16122a).fillRect(cx, CARD_Y, cardW, cardH);
      gfx.lineStyle(1, RARITY_BORDER[upg.rarity]).strokeRect(cx, CARD_Y, cardW, cardH);

      // Rarity tag
      const rarityColor = RARITY_COLORS[upg.rarity] ?? COLOR.body;
      const tagStr = upg.tag;
      const tagW = measureText(tagStr) + 8;
      const tagGfx = this.add.graphics();
      tagGfx.fillStyle(rarityColor, 0.3).fillRect(cx + 2, CARD_Y + 2, tagW, 11);
      bitmapLabel(this, cx + 6, CARD_Y + 4, tagStr, rarityColor).setDepth(1);

      // Rarity diamonds
      const diamondX = cx + cardW - 4 - upg.rarity * 8;
      for (let d = 0; d < upg.rarity; d++) {
        bitmapLabel(this, diamondX + d * 8, CARD_Y + 4, '*', rarityColor).setDepth(1);
      }

      // Icon
      const iconKey: [string, string] = Object.keys(iconMap).includes(upg.icon)
        ? iconMap[upg.icon]
        : ['objects', 'emerald'];
      this.add.image(cx + cardW / 2, CARD_Y + 46, iconKey[0], iconKey[1])
        .setOrigin(0.5).setDepth(1);

      // Upgrade name
      const nameStr = upg.label.toUpperCase();
      bitmapLabel(this, cx + (cardW - measureText(nameStr)) / 2, CARD_Y + 66, nameStr, COLOR.body).setDepth(1);

      // Description — word-wrap
      const words = upg.description.split(' ');
      const descLines: string[] = [];
      let cur = '';
      for (const w of words) {
        if ((cur + w).length > wrapW && cur) { descLines.push(cur.trim()); cur = w + ' '; }
        else cur += w + ' ';
      }
      if (cur.trim()) descLines.push(cur.trim());
      for (let l = 0; l < Math.min(4, descLines.length); l++) {
        bitmapLabel(this, cx + 6, CARD_Y + 80 + l * 10, descLines[l], COLOR.soft).setDepth(1);
      }

      // Pick button
      const btnY = CARD_Y + cardH - 22;
      const btnGfx = this.add.graphics();
      btnGfx.fillStyle(0x0f3020).fillRect(cx + 4, btnY, cardW - 8, 16);
      btnGfx.lineStyle(1, COLOR.good).strokeRect(cx + 4, btnY, cardW - 8, 16);
      const pickStr = `[${i + 1}] PICK`;
      bitmapLabel(this, cx + (cardW - measureText(pickStr)) / 2, btnY + 4, pickStr, COLOR.good)
        .setDepth(1)
        .setInteractive({
          useHandCursor: true,
          hitArea: new Phaser.Geom.Rectangle(-cardW / 2, -8, cardW, 16),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        })
        .on('pointerdown', () => this.pick(i));

      this.cards.push({ gfx, container });
    });
  }

  private highlightCard(idx: number): void {
    const { cardW, cardH, positions } = computeLayout(this.upgrades.length);
    const CARD_Y = 48;

    this.cards.forEach(({ gfx }, i) => {
      const cx = positions[i];
      const isSelected = i === idx;
      gfx.clear();
      gfx.fillStyle(isSelected ? 0x1e1838 : 0x16122a)
        .fillRect(cx, isSelected ? CARD_Y - 4 : CARD_Y, cardW, isSelected ? cardH + 4 : cardH);
      gfx.lineStyle(isSelected ? 2 : 1, isSelected ? 0xf0a04b : RARITY_BORDER[this.upgrades[i].rarity])
        .strokeRect(cx, isSelected ? CARD_Y - 4 : CARD_Y, cardW, isSelected ? cardH + 4 : cardH);
    });
  }

  private pick(idx: number): void {
    const chosen = this.upgrades[idx];
    let updatedCarry: RunCarry = {
      ...this.carry,
      runUpgrades: [...(this.carry.runUpgrades ?? []), chosen.id],
    };
    if (chosen.id === 'spareFuel') {
      updatedCarry = {
        ...updatedCarry,
        fuel: Math.min(updatedCarry.fuel + updatedCarry.maxFuel * 0.3, updatedCarry.maxFuel),
      };
    }

    if (this.picksLeft > 1) {
      // First pick of two: restart scene with the three remaining cards
      const remaining = this.upgrades.filter((_, i) => i !== idx).map((u) => u.id);
      this.scene.start('RunPick', { carry: updatedCarry, remainingUpgrades: remaining });
      return;
    }

    this.scene.start('Dive', updatedCarry);
  }

  private setupKeys(): void {
    const maxIdx = this.upgrades.length - 1;
    this.input.keyboard!.on('keydown-LEFT', () => {
      this.selectedIdx = Math.max(0, this.selectedIdx - 1);
      this.highlightCard(this.selectedIdx);
    });
    this.input.keyboard!.on('keydown-RIGHT', () => {
      this.selectedIdx = Math.min(maxIdx, this.selectedIdx + 1);
      this.highlightCard(this.selectedIdx);
    });
    this.input.keyboard!.on('keydown-ONE',   () => this.pick(0));
    this.input.keyboard!.on('keydown-TWO',   () => this.pick(1));
    this.input.keyboard!.on('keydown-THREE', () => this.pick(2));
    if (this.upgrades.length === 4) {
      this.input.keyboard!.on('keydown-FOUR', () => this.pick(3));
    }
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
