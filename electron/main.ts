import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDbData, saveDbData } from './db.js';
import fontList from 'font-list';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { bypassCSP: true, supportFetchAPI: true, secure: true, standard: true } }
]);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    titleBarStyle: 'hidden', // Make it look premium
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#fff'
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true // Important for production
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  initDb();
  
  // Custom protocol to load local fonts bypassing web security
  protocol.handle('local', (request) => {
    const url = request.url.replace('local://', '');
    return net.fetch('file://' + decodeURIComponent(url));
  });

  createWindow();
});

// Database IPC
ipcMain.handle('get-db-data', () => getDbData());
ipcMain.on('save-db-data', (event, key, value) => saveDbData(key, value));

import { installFontToOS, uninstallFontFromOS } from './installFont.js';

// IPC Handlers for Phase 2 (Installing Fonts)
ipcMain.handle('install-font', async (event, fontPath, fontName) => {
  console.log('Requested to install font:', fontName, fontPath);
  const success = await installFontToOS(fontPath, fontName);
  return { success, message: success ? 'Installed natively!' : 'Failed to install' };
});

ipcMain.handle('uninstall-font', async (event, fontPath, fontName) => {
  console.log('Requested to uninstall font:', fontName, fontPath);
  const success = await uninstallFontFromOS(fontPath, fontName);
  return { success, message: success ? 'Uninstalled natively!' : 'Failed to uninstall' };
});

// Window Controls
// ... (Skipping minimize/maximize/close) ...

import { exec, execFile } from 'child_process';
import fs from 'fs';

// Phase 3: Adobe Script Execution (Cross-Platform)
ipcMain.handle('execute-script', async (event, scriptPath, targetApp) => {
  return new Promise((resolve) => {
    const platform = process.platform;

    // 🍏 macOS AppleScript Execution
    if (platform === 'darwin') {
      let appId = 'com.adobe.Photoshop';
      let command = 'do javascript';
      
      if (targetApp === 'Illustrator') {
        appId = 'com.adobe.illustrator';
      } else if (targetApp === 'After Effects') {
        appId = 'com.adobe.AfterEffects';
        command = 'DoScriptFile';
      }

      const appleScript = `on run argv
        tell application id "${appId}" to ${command} (POSIX file (item 1 of argv))
      end run`;

      execFile('osascript', ['-e', appleScript, '--', scriptPath], (error) => {
        if (error) resolve({ success: false, message: error.message });
        else resolve({ success: true, message: `Executed in ${targetApp} (Mac)` });
      });
    } 
    
    // 🪟 Windows 10/11 COM Object Execution
    else if (platform === 'win32') {
      if (targetApp === 'After Effects') {
        return resolve({ success: false, message: `Windows execution for After Effects currently unsupported` });
      }

      let comName = 'Photoshop.Application';
      if (targetApp === 'Illustrator') comName = 'Illustrator.Application';

      const encodedPath = Buffer.from(scriptPath).toString('base64');
      const psScript = `
        $ErrorActionPreference = 'Stop'
        $scriptPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPath}'))
        if (-not (Test-Path -LiteralPath $scriptPath)) {
          throw "Script file does not exist at path: $scriptPath"
        }
        try {
          $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("${comName}")
        } catch {
          $app = New-Object -ComObject ${comName}
        }
        
        if ("${targetApp}" -eq "Illustrator") {
            $app.DoJavaScriptFile($scriptPath)
        } else {
            $app.DoJavaScriptFile($scriptPath)
        }
        
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
      `;

      execFile('powershell.exe', ['-NoProfile', '-Command', psScript], (error) => {
        if (error) resolve({ success: false, message: error.message });
        else resolve({ success: true, message: `Executed in ${targetApp} (Windows)` });
      });
    } 
    
    // Unsupported OS
    else {
      resolve({ success: false, message: 'Unsupported Operating System' });
    }
  });
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (e) {
    console.error('File read error:', e);
    return 'Error reading file.';
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (e) {
    console.error('File write error:', e);
    return { success: false };
  }
});

ipcMain.handle('copy-to-vault', async (event, originalPath) => {
  try {
    const vaultDir = path.join(app.getPath('userData'), 'Vault');
    if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
    
    const fileName = path.basename(originalPath);
    // Add timestamp to prevent overwriting files with the same name
    const safeName = Date.now() + '_' + fileName;
    const destPath = path.join(vaultDir, safeName);
    
    await fs.promises.copyFile(originalPath, destPath);
    return destPath;
  } catch (e) {
    console.error('Vault copy error:', e);
    return originalPath; // fallback to original if it fails
  }
});

ipcMain.handle('delete-from-vault', async (event, filePath) => {
  try {
    const vaultDir = path.join(app.getPath('userData'), 'Vault');
    // Basic security check to ensure we only delete within the Vault
    if (filePath.startsWith(vaultDir) && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return { success: true };
    }
    return { success: false, message: 'File not in vault or does not exist' };
  } catch (e) {
    console.error('Vault delete error:', e);
    return { success: false, message: (e as Error).message };
  }
});

ipcMain.handle('get-system-fonts', async () => {
  let fontNames: string[] = [];
  try {
    const fonts = await fontList.getFonts();
    fontNames = fonts.map((f: string) => f.replace(/^"|"$/g, ''));
  } catch (e) {
    console.error('Failed to get system fonts via font-list:', e);
  }

  // Windows: Native Registry Query via reg.exe (extremely fast, completes in <50ms)
  if (process.platform === 'win32') {
    try {
      const runRegQuery = (keyPath: string) => new Promise<string[]>((resolve) => {
        exec(`reg query "${keyPath}"`, (error, stdout) => {
          if (error || !stdout) {
            resolve([]);
            return;
          }
          const list: string[] = [];
          const lines = stdout.split('\n');
          for (let line of lines) {
            line = line.trim();
            if (line.includes('REG_SZ')) {
              const parts = line.split('REG_SZ');
              if (parts.length > 0) {
                const fontName = parts[0].trim().replace(/\s+\((TrueType|OpenType|All res|Type 1|PostScript|120|8,10,12,14,18,24.*)\)$/i, '');
                if (fontName) {
                  list.push(fontName);
                }
              }
            }
          }
          resolve(list);
        });
      });

      const [hklmFonts, hkcuFonts] = await Promise.all([
        runRegQuery('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'),
        runRegQuery('HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')
      ]);

      const regFonts = [...hklmFonts, ...hkcuFonts];
      if (regFonts.length > 0) {
        fontNames = Array.from(new Set([...fontNames, ...regFonts]));
      }
    } catch (err) {
      console.error('Failed to get system fonts via reg query:', err);
    }
  }

  return fontNames;
});
// Note: Window Controls are natively handled by Electron's titleBarOverlay (WCO).
