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
      // Mac user fonts go to ~/Library/Fonts
      const macFontsDir = path.join(os.homedir(), 'Library', 'Fonts');
      const targetPath = path.join(macFontsDir, fileName);

      if (!fs.existsSync(macFontsDir)) fs.mkdirSync(macFontsDir, { recursive: true });

      try {
        if (fontPath !== targetPath) fs.copyFileSync(fontPath, targetPath);
        // Mac CoreText automatically monitors the Fonts folder. No registry or broadcast required!
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
      
      // Install to Current User to bypass Admin UAC prompts
      const userFontsDir = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
      const targetPath = path.join(userFontsDir, fileName);

      if (!fs.existsSync(userFontsDir)) fs.mkdirSync(userFontsDir, { recursive: true });

      try {
        if (fontPath !== targetPath) fs.copyFileSync(fontPath, targetPath);
      } catch (e) {
        console.error('Windows Copy failed:', e);
        return resolve(false);
      }

      // PowerShell script to update Registry and broadcast WM_FONTCHANGE
      const ps1Path = path.join(os.tmpdir(), 'rupantor_install_font.ps1');
      const psScript = `
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
New-ItemProperty -Path $registryPath -Name "${registryName}" -Value "${fileName}" -PropertyType String -Force

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
      } catch (e) {
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
