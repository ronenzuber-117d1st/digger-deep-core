import { SaveData, SAVE_KEY, SAVE_BACKUP_KEY, createFreshSave, migrate } from '../core/save';

let inMemorySave: SaveData | null = null;
let _storageAvailable: boolean | null = null;

function checkStorage(): boolean {
  if (_storageAvailable !== null) return _storageAvailable;
  try {
    const probe = '__dc_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    _storageAvailable = true;
  } catch {
    _storageAvailable = false;
  }
  return _storageAvailable;
}

export function isStorageAvailable(): boolean {
  return checkStorage();
}

export function loadSave(): SaveData {
  if (!checkStorage()) {
    if (inMemorySave === null) inMemorySave = createFreshSave();
    return inMemorySave;
  }

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return createFreshSave();
    const parsed: unknown = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw !== null) localStorage.setItem(SAVE_BACKUP_KEY, raw);
    } catch { /* best effort backup */ }
    return createFreshSave();
  }
}

export function saveSave(data: SaveData): void {
  if (!checkStorage()) {
    inMemorySave = data;
    return;
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    inMemorySave = data;
  }
}

export function resetSave(): SaveData {
  const fresh = createFreshSave();
  if (checkStorage()) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* best effort */ }
    try { localStorage.removeItem(SAVE_BACKUP_KEY); } catch { /* best effort */ }
  }
  inMemorySave = fresh;
  return fresh;
}
