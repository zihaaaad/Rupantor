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
    fs.writeFileSync(dbPath, JSON.stringify({ fonts: [], collections: [], scripts: [] }), 'utf8');
  }
  try {
    dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    dbCache = { fonts: [], collections: [], scripts: [] };
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
  const write = writeQueue.then(() =>
    fs.promises.writeFile(getDbPath(), JSON.stringify(snapshot, null, 2), 'utf8')
  );
  // The queue itself must survive a failed write — otherwise one rejection
  // poisons the chain and every later save is rejected without being tried.
  // The caller still receives the original rejection via `write`.
  writeQueue = write.catch(() => {});
  return write;
}
