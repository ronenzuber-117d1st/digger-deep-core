export const BASE_UPGRADE_COST = 100;

export function upgradeCost(tier: number): number {
  return Math.floor(BASE_UPGRADE_COST * Math.pow(1.5, tier));
}

export function deathPenalty(emeralds: number): number {
  return Math.floor(emeralds * 0.5);
}
