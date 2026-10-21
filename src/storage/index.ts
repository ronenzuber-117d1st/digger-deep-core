import { SaveData, createFreshSave, migrate } from '../core/save';

const SAVE_KEY = 'deepcore.save';
const BACKUP_KEY = 'deepcore.save.backup';

let inMemorySave: SaveData | null = null;

function isAvailable(): boolean {
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return true;
  } catch {
    return false;
  }
}

export function load(): { save: SaveData; inMemory: boolean } {
  if (!isAvailable()) {
    return { save: createFreshSave(), inMemory: true };
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { save: createFreshSave(), inMemory: false };
    const parsed: unknown = JSON.parse(raw);
    return { save: migrate(parsed), inMemory: false };
  } catch {
    return { save: createFreshSave(), inMemory: false };
  }
}

export function save(data: SaveData): void {
  if (!isAvailable()) {
    inMemorySave = data;
    return;
  }
  try {
    const existing = localStorage.getItem(SAVE_KEY);
    if (existing) localStorage.setItem(BACKUP_KEY, existing);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    inMemorySave = data;
  }
}

export function getInMemorySave(): SaveData | null {
  return inMemorySave;
}
