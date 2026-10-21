export const SAVE_VERSION = 2;
export const SAVE_KEY = 'deepcore.save.v1';
export const SAVE_BACKUP_KEY = 'deepcore.save.backup';

export type PermanentUpgradeId =
  | 'hull'
  | 'fuelTank'
  | 'drillMotor'
  | 'pulseCore'
  | 'prospector'
  | 'salvageContract'
  | 'extraPick'
  | 'lanternMount';

export interface SaveData {
  version: number;
  emeralds: number;
  upgrades: Record<PermanentUpgradeId, number>;
  stats: {
    runs: number;
    deaths: number;
    bestFloor: number;
    totalKills: number;
  };
  storyFlags: string[];
  settings: {
    musicVol: number;
    sfxVol: number;
    shake: boolean;
  };
}

export function createFreshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    emeralds: 0,
    upgrades: {
      hull: 0,
      fuelTank: 0,
      drillMotor: 0,
      pulseCore: 0,
      prospector: 0,
      salvageContract: 0,
      extraPick: 0,
      lanternMount: 0,
    },
    stats: { runs: 0, deaths: 0, bestFloor: 0, totalKills: 0 },
    storyFlags: [],
    settings: { musicVol: 0.8, sfxVol: 0.8, shake: true },
  };
}

export function migrate(data: unknown): SaveData {
  if (typeof data !== 'object' || data === null) return createFreshSave();

  const raw = data as Record<string, unknown>;

  if (raw.version === SAVE_VERSION) {
    const fresh = createFreshSave();
    return {
      version: SAVE_VERSION,
      emeralds: typeof raw.emeralds === 'number' ? raw.emeralds : fresh.emeralds,
      upgrades: mergeUpgrades(raw.upgrades, fresh.upgrades),
      stats: mergeStats(raw.stats, fresh.stats),
      storyFlags: Array.isArray(raw.storyFlags) ? (raw.storyFlags as string[]) : [],
      settings: mergeSettings(raw.settings, fresh.settings),
    };
  }

  // v1 → v2: totalEmeralds renamed to emeralds, stats/storyFlags/settings added
  if (raw.version === 1) {
    const fresh = createFreshSave();
    const legacyEmeralds = typeof raw.totalEmeralds === 'number' ? raw.totalEmeralds : 0;
    const legacyBestFloor = typeof raw.bestFloor === 'number' ? raw.bestFloor : 0;
    return {
      ...fresh,
      emeralds: legacyEmeralds,
      upgrades: mergeUpgrades(raw.upgrades, fresh.upgrades),
      stats: { ...fresh.stats, bestFloor: legacyBestFloor },
    };
  }

  return createFreshSave();
}

function mergeUpgrades(
  raw: unknown,
  defaults: SaveData['upgrades'],
): SaveData['upgrades'] {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const src = raw as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as PermanentUpgradeId[]) {
    if (typeof src[key] === 'number') result[key] = src[key] as number;
  }
  return result;
}

function mergeStats(raw: unknown, defaults: SaveData['stats']): SaveData['stats'] {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const src = raw as Record<string, unknown>;
  return {
    runs: typeof src.runs === 'number' ? src.runs : defaults.runs,
    deaths: typeof src.deaths === 'number' ? src.deaths : defaults.deaths,
    bestFloor: typeof src.bestFloor === 'number' ? src.bestFloor : defaults.bestFloor,
    totalKills: typeof src.totalKills === 'number' ? src.totalKills : defaults.totalKills,
  };
}

function mergeSettings(raw: unknown, defaults: SaveData['settings']): SaveData['settings'] {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const src = raw as Record<string, unknown>;
  return {
    musicVol: typeof src.musicVol === 'number' ? src.musicVol : defaults.musicVol,
    sfxVol: typeof src.sfxVol === 'number' ? src.sfxVol : defaults.sfxVol,
    shake: typeof src.shake === 'boolean' ? src.shake : defaults.shake,
  };
}
