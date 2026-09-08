import path from 'path';
import os from 'os';

/**
 * Path containment for anything the renderer hands to the main process.
 *
 * The renderer is CSP-locked and loads no remote content, so a hostile
 * renderer already implies a compromised install. These guards are
 * defence-in-depth: the app parses untrusted font binaries with a third-party
 * library in that renderer, and an unrestricted write channel would turn any
 * parser bug into "overwrite a startup script".
 */

/**
 * Windows paths are case-insensitive, and this matters more than it looks.
 * `local://` URLs are parsed with the drive letter as the URL host, which
 * Chromium lowercases — so a perfectly valid `C:\Users\...\Vault\x.ttf`
 * arrives as `c:/users/.../vault/x.ttf`. A case-sensitive comparison would
 * reject it and every custom font would silently stop rendering.
 */
function normalize(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Resolve `candidate` and return the resolved path only if it sits inside one
 * of `roots`. Returns null otherwise.
 *
 * The trailing-separator comparison is deliberate: without it, a sibling
 * directory whose name merely starts with a root's name — "VaultOld" next to
 * "Vault" — passes the check. Resolving first is what defeats `..` traversal.
 */
export function containedPath(candidate: unknown, roots: string[]): string | null {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;

  const resolved = path.resolve(candidate);
  const normalized = normalize(candidate);

  for (const root of roots) {
    const normalizedRoot = normalize(root);
    if (normalized === normalizedRoot || normalized.startsWith(normalizedRoot + path.sep)) {
      return resolved;
    }
  }
  return null;
}

/**
 * Directories a font may legitimately be read from for preview: the vault,
 * plus the OS font locations, since system fonts are enumerated from there.
 */
export function fontReadRoots(vaultDir: string, platform: NodeJS.Platform = process.platform): string[] {
  const roots = [vaultDir];

  if (platform === 'win32') {
    roots.push(path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'));
    roots.push(path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts'));
  } else if (platform === 'darwin') {
    roots.push(path.join(os.homedir(), 'Library', 'Fonts'));
    roots.push('/Library/Fonts');
    roots.push('/System/Library/Fonts');
  }

  return roots;
}
