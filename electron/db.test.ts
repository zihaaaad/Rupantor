import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// db.ts imports `app` from electron purely to locate userData. Stub the module
// so the write-serialization logic can be exercised without an Electron runtime.
let tmpDir: string;

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
}));

const { initDb, getDbData, saveDbData, getDbPath } = await import('./db.js');

describe('db write serialization', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rupantor-db-test-'));
    initDb();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seeds a fresh database with the expected shape and no licence fields', () => {
    const data = getDbData();
    expect(data).toEqual({ fonts: [], collections: [], scripts: [] });
    expect(data).not.toHaveProperty('licenseKey');
    expect(data).not.toHaveProperty('deviceId');
  });

  it('persists a saved key to disk', async () => {
    await saveDbData('fonts', [{ name: 'Inter' }]);
    const onDisk = JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
    expect(onDisk.fonts).toEqual([{ name: 'Inter' }]);
  });

  // The reason writes are queued at all: two saves fired back-to-back (the
  // fonts and scripts effects both run on mount) must not clobber each other
  // via a stale read of the cache.
  it('does not lose a write when two saves are fired without awaiting', async () => {
    const first = saveDbData('fonts', [{ name: 'Inter' }]);
    const second = saveDbData('scripts', [{ name: 'cleanup.jsx' }]);
    await Promise.all([first, second]);

    const onDisk = JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
    expect(onDisk.fonts).toEqual([{ name: 'Inter' }]);
    expect(onDisk.scripts).toEqual([{ name: 'cleanup.jsx' }]);
  });

  it('applies concurrent writes in call order', async () => {
    const writes = [1, 2, 3, 4, 5].map(n => saveDbData('fonts', [{ n }]));
    await Promise.all(writes);
    const onDisk = JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
    expect(onDisk.fonts).toEqual([{ n: 5 }]);
  });

  // Regression for L-2: saveDbData used to swallow its own rejection, so the
  // renderer was told nothing when a write failed.
  it('rejects to the caller when the underlying write fails', async () => {
    const spy = vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveDbData('fonts', [])).rejects.toThrow('disk full');
    spy.mockRestore();
  });

  // ...and the queue must survive that rejection, or one failure poisons the
  // chain and every later save is rejected without ever being attempted.
  it('keeps accepting writes after a failure', async () => {
    const spy = vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('transient'));
    await expect(saveDbData('fonts', [])).rejects.toThrow('transient');
    spy.mockRestore();

    await expect(saveDbData('fonts', [{ name: 'Recovered' }])).resolves.toBeUndefined();
    const onDisk = JSON.parse(fs.readFileSync(getDbPath(), 'utf8'));
    expect(onDisk.fonts).toEqual([{ name: 'Recovered' }]);
  });
});
