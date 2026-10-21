export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  totalEmeralds: number;
  bestFloor: number;
  upgrades: Record<string, number>;
}

export function createFreshSave(): SaveData {
  return { version: SAVE_VERSION, totalEmeralds: 0, bestFloor: 0, upgrades: {} };
}

export function migrate(data: unknown): SaveData {
  if (typeof data !== 'object' || data === null) return createFreshSave();
  const save = data as Partial<SaveData>;
  if (save.version === SAVE_VERSION) return save as SaveData;
  return createFreshSave();
}
