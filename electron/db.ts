import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function getDbPath() {
  return path.join(app.getPath('userData'), 'rupantor_db.json');
}

let dbCache: any = null;
let writeQueue: Promise<void> = Promise.resolve();

export function initDb() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ fonts: [], collections: [], scripts: [], licenseKey: null, licenseCache: null, deviceId: null }), 'utf8');
  }
  try {
    dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    dbCache = { fonts: [], collections: [], scripts: [], licenseKey: null, licenseCache: null, deviceId: null };
  }
}

export function getDbData() {
  if (!dbCache) initDb();
  return dbCache;
}

// Writes are serialized through writeQueue so two saves fired close together
// (e.g. fonts + scripts effects) can never clobber each other via a stale read.
export function saveDbData(key: string, value: any) {
  dbCache = { ...getDbData(), [key]: value };
  const snapshot = dbCache;
  writeQueue = writeQueue.then(() =>
    fs.promises.writeFile(getDbPath(), JSON.stringify(snapshot, null, 2), 'utf8')
  ).catch(error => console.error('Failed to save DB data:', error));
  return writeQueue;
}
