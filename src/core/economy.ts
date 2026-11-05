import tuning from '../data/tuning.json';
import upgradesDef from '../data/upgrades.json';

export type UpgradeTier = 'cheap' | 'mid' | 'expensive';

const TIER_BASE: Record<UpgradeTier, number> = { cheap: 60, mid: 90, expensive: 150 };

export function upgradeCost(tier: UpgradeTier, currentLevel: number): number {
  return Math.floor(TIER_BASE[tier] * Math.pow(tuning.economy.costExponent, currentLevel));
}

export function deathPayout(emeraldsCarried: number, salvageLevel: number): number {
  const keepPct = Math.min(salvageLevel * 15, 100);
  return Math.floor(emeraldsCarried * keepPct / 100);
}

export function extractionPayout(emeraldsCarried: number): number {
  return emeraldsCarried;
}


export function isExtractionFloor(floor: number): boolean {
  return floor > 0 && floor % 5 === 0;
}

export function getUpgradeDef(id: string) {
  return upgradesDef.permanent.find((u) => u.id === id) ?? null;
}
