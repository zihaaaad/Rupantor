import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function getDbPath() {
  return path.join(app.getPath('userData'), 'rupantor_db.json');
}

export function initDb() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ fonts: [], collections: [] }), 'utf8');
  }
}

export function getDbData() {
  try {
    return JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
  } catch {
    return { fonts: [], collections: [] };
  }
}

export function saveDbData(key: string, value: any) {
  const data = getDbData();
  data[key] = value;
  fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf8');
}
