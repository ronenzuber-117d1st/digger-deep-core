import tuning from '../data/tuning.json';
import upgradesDef from '../data/upgrades.json';

export type UpgradeTier = 'cheap' | 'mid' | 'expensive';

const TIER_BASE: Record<UpgradeTier, number> = { cheap: 60, mid: 90, expensive: 150 };

export function upgradeCost(tier: UpgradeTier, currentLevel: number): number {
  return Math.floor(TIER_BASE[tier] * Math.pow(tuning.economy.costExponent, currentLevel));
}

export function deathPayout(emeraldsCarried: number, salvageLevel: number): number {
  const keep = tuning.economy.deathKeepFraction + salvageLevel * 0.1;
  return Math.floor(emeraldsCarried * Math.min(keep, 1));
}

export function extractionPayout(emeraldsCarried: number): number {
  return emeraldsCarried;
}

export function floorEmeraldValue(floor: number, prospectorLevel: number): number {
  const depthMult = 1 + (floor - 1) * tuning.floor.valueBasePerFloor;
  const prospectorMult = 1 + prospectorLevel * 0.1;
  return depthMult * prospectorMult;
}

export function isExtractionFloor(floor: number): boolean {
  return (tuning.floor.extractionFloors as number[]).includes(floor);
}

export function getUpgradeDef(id: string) {
  return upgradesDef.permanent.find((u) => u.id === id) ?? null;
}
