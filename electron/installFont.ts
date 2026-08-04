import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function installFontToOS(fontPath: string, fontName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const fileName = path.basename(fontPath);
    const platform = process.platform;

    // ==========================================
    // 🍏 macOS Installation
    // ==========================================
    if (platform === 'darwin') {
      const macFontsDir = path.join(os.homedir(), 'Library', 'Fonts');
      const targetPath = path.join(macFontsDir, fileName);

      if (!fs.existsSync(macFontsDir)) fs.mkdirSync(macFontsDir, { recursive: true });

      try {
        if (fontPath !== targetPath && !fs.existsSync(targetPath)) {
          fs.copyFileSync(fontPath, targetPath);
        }
        return resolve(true);
      } catch (e) {
        console.error('Mac Font Copy failed:', e);
        return resolve(false);
      }
    } 
    
    // ==========================================
    // 🪟 Windows 10/11 Installation
    // ==========================================
    else if (platform === 'win32') {
      const ext = path.extname(fileName).toLowerCase();
      const typeLabel = ext === '.otf' ? '(OpenType)' : '(TrueType)';
      const registryName = `${fontName} ${typeLabel}`;
      
      const userFontsDir = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
      const targetPath = path.join(userFontsDir, fileName);

      if (!fs.existsSync(userFontsDir)) fs.mkdirSync(userFontsDir, { recursive: true });

      try {
        if (fontPath !== targetPath && !fs.existsSync(targetPath)) {
          fs.copyFileSync(fontPath, targetPath);
        }
      } catch (e) {
        console.error('Windows Copy failed:', e);
        return resolve(false);
      }

      // Safe Base64 Encoding to prevent Command Injection
      const encodedRegistry = Buffer.from(registryName).toString('base64');
      const encodedFile = Buffer.from(fileName).toString('base64');

      const ps1Path = path.join(os.tmpdir(), 'rupantor_install_font.ps1');
      const psScript = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedRegistry}'))
$fileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedFile}'))
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
New-ItemProperty -Path $registryPath -Name $registryName -Value $fileName -PropertyType String -Force

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
      
      try {
        fs.writeFileSync(ps1Path, psScript, 'utf8');
      } catch {
        return resolve(false);
      }

      exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${ps1Path}"`, (error) => {
        if (error) {
          console.error('PowerShell failed:', error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } 
    
    // ==========================================
    // 🐧 Linux Fallback
    // ==========================================
    else {
      console.warn('Linux font installation is not implemented.');
      resolve(false);
    }
  });
}

export async function uninstallFontFromOS(fontPath: string, fontName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const fileName = path.basename(fontPath);
    const platform = process.platform;

    if (platform === 'darwin') {
      const macFontsDir = path.join(os.homedir(), 'Library', 'Fonts');
      const targetPath = path.join(macFontsDir, fileName);
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        return resolve(true);
      } catch (e) {
        console.error('Mac Font Uninstallation failed:', e);
        return resolve(false);
      }
    } else if (platform === 'win32') {
      const ext = path.extname(fileName).toLowerCase();
      const typeLabel = ext === '.otf' ? '(OpenType)' : '(TrueType)';
      const registryName = `${fontName} ${typeLabel}`;
      
      const userFontsDir = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
      const targetPath = path.join(userFontsDir, fileName);

      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (e) {
        console.error('Windows font deletion failed:', e);
        // Continue to try and remove from registry
      }

      const encodedRegistry = Buffer.from(registryName).toString('base64');
      
      const ps1Path = path.join(os.tmpdir(), 'rupantor_uninstall_font.ps1');
      const psScript = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedRegistry}'))
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
$item = Get-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue
if ($item) {
    # File might be locked, but we remove the registry key so it unloads on next reboot at least.
    Remove-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue
}

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
      
      try {
        fs.writeFileSync(ps1Path, psScript, 'utf8');
      } catch {
        return resolve(false);
      }

      exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${ps1Path}"`, (error) => {
        if (error) {
          console.error('PowerShell uninstallation failed:', error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } else {
      resolve(false);
    }
  });
}
