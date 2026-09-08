import { describe, it, expect } from 'vitest';
import { __testables } from './installFont.js';

const { registryValueName, legacyRegistryValueName } = __testables;

// These cover finding M-1: the registry value name used to be built from the
// family alone, so every style of one family collided on a single value.
describe('registryValueName', () => {
  it('leaves Regular bare, matching how Windows itself names the value', () => {
    expect(registryValueName('Inter', 'Regular', 'Inter-Regular.ttf')).toBe('Inter (TrueType)');
  });

  it('treats an empty style as Regular', () => {
    expect(registryValueName('Inter', '', 'Inter.ttf')).toBe('Inter (TrueType)');
  });

  it('is case-insensitive about "regular"', () => {
    expect(registryValueName('Inter', 'regular', 'Inter.ttf')).toBe('Inter (TrueType)');
  });

  it('suffixes every other style', () => {
    expect(registryValueName('Inter', 'Bold', 'Inter-Bold.ttf')).toBe('Inter Bold (TrueType)');
    expect(registryValueName('Inter', 'Italic', 'Inter-Italic.ttf')).toBe('Inter Italic (TrueType)');
  });

  it('gives two styles of one family distinct names — the M-1 regression', () => {
    const regular = registryValueName('Inter', 'Regular', 'Inter-Regular.ttf');
    const bold = registryValueName('Inter', 'Bold', 'Inter-Bold.ttf');
    expect(regular).not.toBe(bold);
  });

  it('labels OpenType by extension, case-insensitively', () => {
    expect(registryValueName('Inter', 'Bold', 'Inter-Bold.otf')).toBe('Inter Bold (OpenType)');
    expect(registryValueName('Inter', 'Bold', 'Inter-Bold.OTF')).toBe('Inter Bold (OpenType)');
  });

  it('trims stray whitespace around the style', () => {
    expect(registryValueName('Inter', '  Bold  ', 'Inter-Bold.ttf')).toBe('Inter Bold (TrueType)');
  });

  it('handles non-Latin family names without mangling them', () => {
    expect(registryValueName('নিকোশ', 'Bold', 'nikosh-bold.ttf')).toBe('নিকোশ Bold (TrueType)');
  });
});

describe('legacyRegistryValueName', () => {
  // Uninstall consults this to clean up entries written before the fix, but
  // only when the value still points at the same file.
  it('reproduces the old family-only name regardless of style', () => {
    expect(legacyRegistryValueName('Inter', 'Inter-Bold.ttf')).toBe('Inter (TrueType)');
    expect(legacyRegistryValueName('Inter', 'Inter-Regular.ttf')).toBe('Inter (TrueType)');
  });

  it('matches the new name for Regular, so uninstall skips the legacy branch', () => {
    expect(legacyRegistryValueName('Inter', 'Inter-Regular.ttf'))
      .toBe(registryValueName('Inter', 'Regular', 'Inter-Regular.ttf'));
  });

  it('differs from the new name for other styles, so the legacy branch runs', () => {
    expect(legacyRegistryValueName('Inter', 'Inter-Bold.ttf'))
      .not.toBe(registryValueName('Inter', 'Bold', 'Inter-Bold.ttf'));
  });
});
