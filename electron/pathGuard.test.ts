import { describe, it, expect } from 'vitest';
import path from 'path';
import { containedPath, fontReadRoots } from './pathGuard.js';

const isWindows = process.platform === 'win32';
const VAULT = isWindows ? 'C:\\Users\\tester\\AppData\\Roaming\\Rupantor\\Vault' : '/home/tester/.config/Rupantor/Vault';
const inVault = (name: string) => path.join(VAULT, name);

describe('containedPath', () => {
  it('accepts a file directly inside the root', () => {
    expect(containedPath(inVault('123_Inter.ttf'), [VAULT])).toBe(path.resolve(inVault('123_Inter.ttf')));
  });

  it('accepts a file in a subdirectory of the root', () => {
    const nested = path.join(VAULT, 'sub', 'x.ttf');
    expect(containedPath(nested, [VAULT])).toBe(path.resolve(nested));
  });

  it('rejects a path outside the root', () => {
    const outside = isWindows ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/passwd';
    expect(containedPath(outside, [VAULT])).toBeNull();
  });

  // The exact trap the original delete-from-vault guard was written to avoid.
  it('rejects a sibling directory whose name starts with the root name', () => {
    expect(containedPath(VAULT + 'Old' + path.sep + 'x.ttf', [VAULT])).toBeNull();
  });

  it('rejects traversal back out of the root', () => {
    const escape = path.join(VAULT, '..', '..', 'secrets.txt');
    expect(containedPath(escape, [VAULT])).toBeNull();
  });

  it('normalises traversal that stays inside the root', () => {
    const winding = path.join(VAULT, 'sub', '..', 'Inter.ttf');
    expect(containedPath(winding, [VAULT])).toBe(path.resolve(inVault('Inter.ttf')));
  });

  it('rejects non-string and empty input', () => {
    expect(containedPath(undefined, [VAULT])).toBeNull();
    expect(containedPath(null, [VAULT])).toBeNull();
    expect(containedPath('', [VAULT])).toBeNull();
    expect(containedPath(42, [VAULT])).toBeNull();
  });

  it('accepts a match against any of several roots', () => {
    const other = isWindows ? 'C:\\Windows\\Fonts' : '/Library/Fonts';
    const file = path.join(other, 'arial.ttf');
    expect(containedPath(file, [VAULT, other])).toBe(path.resolve(file));
  });

  it('rejects everything when given no roots', () => {
    expect(containedPath(inVault('x.ttf'), [])).toBeNull();
  });

  // Regression guard. local:// URLs are parsed with the drive letter as the URL
  // host, which Chromium lowercases, so a valid vault path reaches the handler
  // as "c:/users/...". A case-sensitive check would reject it and every custom
  // font would silently stop rendering.
  it.runIf(isWindows)('accepts a Windows path whose case differs from the root', () => {
    const lowercased = inVault('123_Inter.ttf').toLowerCase();
    expect(containedPath(lowercased, [VAULT])).not.toBeNull();
  });

  it.runIf(isWindows)('accepts forward slashes on Windows', () => {
    const forward = inVault('123_Inter.ttf').replace(/\\/g, '/');
    expect(containedPath(forward, [VAULT])).not.toBeNull();
  });
});

describe('fontReadRoots', () => {
  it('always includes the vault', () => {
    expect(fontReadRoots(VAULT, 'win32')).toContain(VAULT);
    expect(fontReadRoots(VAULT, 'darwin')).toContain(VAULT);
    expect(fontReadRoots(VAULT, 'linux')).toContain(VAULT);
  });

  it('adds the OS font directories on Windows and macOS', () => {
    expect(fontReadRoots(VAULT, 'win32').length).toBeGreaterThan(1);
    expect(fontReadRoots(VAULT, 'darwin')).toContain('/System/Library/Fonts');
  });

  it('falls back to the vault alone on unsupported platforms', () => {
    expect(fontReadRoots(VAULT, 'linux')).toEqual([VAULT]);
  });
});
