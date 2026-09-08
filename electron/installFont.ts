import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const WINDOWS_FONTS_REGISTRY = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';

function windowsUserFontsDir(): string {
  return path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
}

function macFontsDir(): string {
  return path.join(os.homedir(), 'Library', 'Fonts');
}

/**
 * The value name Windows uses for a font in the Fonts registry key.
 *
 * This has to include the subfamily. Keying on the family alone means every
 * style of one family collides on a single value: installing "Inter Bold"
 * overwrites the value pointing at "Inter Regular", and uninstalling either
 * removes the key both were relying on. Windows itself names these
 * "Arial (TrueType)" / "Arial Bold (TrueType)", so Regular stays bare and
 * every other style is suffixed.
 */
function registryValueName(familyName: string, styleName: string, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const typeLabel = ext === '.otf' ? '(OpenType)' : '(TrueType)';
  const style = (styleName || '').trim();
  const isRegular = style === '' || style.toLowerCase() === 'regular';
  return isRegular ? `${familyName} ${typeLabel}` : `${familyName} ${style} ${typeLabel}`;
}

/** The pre-fix, family-only name. Only used to clean up older installs. */
function legacyRegistryValueName(familyName: string, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const typeLabel = ext === '.otf' ? '(OpenType)' : '(TrueType)';
  return `${familyName} ${typeLabel}`;
}

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

/**
 * Run a PowerShell script without ever putting it on disk.
 *
 * The previous approach wrote a .ps1 to the temp directory and executed it by
 * path with -ExecutionPolicy Bypass, which left a window where another local
 * process could swap the file between write and execute. -EncodedCommand
 * passes the script inline instead, so there is no file and no window.
 *
 * Dynamic values are still base64-encoded and decoded inside the script:
 * -EncodedCommand protects the transport, not the interpolation, so a font
 * named `'; rm -rf ...` would otherwise still break out of its quotes.
 */
function runPowerShell(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], (error) => {
      if (error) {
        console.error('PowerShell failed:', error);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

const BROADCAST_FONT_CHANGE = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FontInstaller {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$HWND_BROADCAST = [IntPtr]0xFFFF
$WM_FONTCHANGE = 0x001D
[FontInstaller]::PostMessage($HWND_BROADCAST, $WM_FONTCHANGE, [IntPtr]::Zero, [IntPtr]::Zero)
`;

export async function installFontToOS(
  fontPath: string,
  fontName: string,
  fontStyle: string = 'Regular'
): Promise<boolean> {
  const fileName = path.basename(fontPath);

  // ==========================================
  // 🍏 macOS Installation
  // ==========================================
  if (process.platform === 'darwin') {
    const targetPath = path.join(macFontsDir(), fileName);
    try {
      if (!fs.existsSync(macFontsDir())) fs.mkdirSync(macFontsDir(), { recursive: true });
      if (fontPath !== targetPath && !fs.existsSync(targetPath)) {
        fs.copyFileSync(fontPath, targetPath);
      }
      return true;
    } catch (e) {
      console.error('Mac Font Copy failed:', e);
      return false;
    }
  }

  // ==========================================
  // 🪟 Windows 10/11 Installation
  // ==========================================
  if (process.platform === 'win32') {
    const userFontsDir = windowsUserFontsDir();
    const targetPath = path.join(userFontsDir, fileName);

    try {
      if (!fs.existsSync(userFontsDir)) fs.mkdirSync(userFontsDir, { recursive: true });
      if (fontPath !== targetPath && !fs.existsSync(targetPath)) {
        fs.copyFileSync(fontPath, targetPath);
      }
    } catch (e) {
      console.error('Windows Copy failed:', e);
      return false;
    }

    const script = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(registryValueName(fontName, fontStyle, fileName))}'))
$fileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(fileName)}'))
New-ItemProperty -Path "${WINDOWS_FONTS_REGISTRY}" -Name $registryName -Value $fileName -PropertyType String -Force | Out-Null
${BROADCAST_FONT_CHANGE}`;

    return runPowerShell(script);
  }

  // ==========================================
  // 🐧 Linux Fallback
  // ==========================================
  console.warn('Linux font installation is not implemented.');
  return false;
}

export async function uninstallFontFromOS(
  fontPath: string,
  fontName: string,
  fontStyle: string = 'Regular'
): Promise<boolean> {
  const fileName = path.basename(fontPath);

  if (process.platform === 'darwin') {
    const targetPath = path.join(macFontsDir(), fileName);
    try {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      return true;
    } catch (e) {
      console.error('Mac Font Uninstallation failed:', e);
      return false;
    }
  }

  if (process.platform === 'win32') {
    const targetPath = path.join(windowsUserFontsDir(), fileName);

    try {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    } catch (e) {
      // The file may be locked by a running app. Press on and at least drop
      // the registry entry, so the font unloads on the next reboot.
      console.error('Windows font deletion failed:', e);
    }

    // The legacy family-only value is removed ONLY when its data still points
    // at this exact file. Fonts installed before the naming fix used that name
    // for every style, so deleting it blindly while uninstalling "Inter Bold"
    // would rip out the entry a separately-installed "Inter Regular" depends on.
    const script = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(registryValueName(fontName, fontStyle, fileName))}'))
$legacyName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(legacyRegistryValueName(fontName, fileName))}'))
$fileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(fileName)}'))
$registryPath = "${WINDOWS_FONTS_REGISTRY}"

Remove-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue

if ($legacyName -ne $registryName) {
    $existing = Get-ItemProperty -Path $registryPath -Name $legacyName -ErrorAction SilentlyContinue
    if ($existing -and $existing.$legacyName -eq $fileName) {
        Remove-ItemProperty -Path $registryPath -Name $legacyName -ErrorAction SilentlyContinue
    }
}
${BROADCAST_FONT_CHANGE}`;

    return runPowerShell(script);
  }

  return false;
}

// Exported for unit tests — the naming rule is the whole of M-1 and is worth
// pinning down, but the install path itself can't run outside Windows.
export const __testables = { registryValueName, legacyRegistryValueName };
