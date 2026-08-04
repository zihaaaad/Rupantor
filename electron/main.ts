import { app, BrowserWindow, ipcMain, protocol, net, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDbData, saveDbData } from './db.js';
import { checkLicenseOnline, deactivateDevice, type RemoteLicenseDoc } from './firebaseLicense.js';
import { randomUUID } from 'crypto';
import fontList from 'font-list';
import { autoUpdater } from 'electron-updater';

// How long a device may keep running on the last known-good Firestore
// answer without being able to reach the internet at all.
const LICENSE_CACHE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
// Re-check cadence while the app is running, mirroring the update-check
// interval — so a revoked/refunded license takes effect without requiring
// a restart, not just at the next launch.
const LICENSE_RECHECK_MS = 4 * 60 * 60 * 1000;

function getDeviceId(): string {
  const existing = getDbData().deviceId;
  if (existing) return existing;
  const id = randomUUID();
  saveDbData('deviceId', id);
  return id;
}

function toLicensePayload(data: RemoteLicenseDoc) {
  return { name: data.name, email: data.email, plan: data.plan, issuedAt: Date.now(), expiresAt: data.expiresAt };
}

async function refreshLicenseStatus(): Promise<{ valid: boolean; reason?: string; payload?: ReturnType<typeof toLicensePayload> }> {
  const licenseKey = getDbData().licenseKey;
  if (!licenseKey) return { valid: false, reason: 'No license activated.' };

  const deviceId = getDeviceId();
  try {
    const result = await checkLicenseOnline(licenseKey, deviceId);
    if (result.ok) {
      await saveDbData('licenseCache', { data: result.data, cachedAt: Date.now() });
      return { valid: true, payload: toLicensePayload(result.data) };
    }
    return { valid: false, reason: result.reason };
  } catch (err) {
    console.error('License check failed (offline, or Firebase misconfigured):', err);
    const cache = getDbData().licenseCache; // read fresh, not a pre-await snapshot
    if (cache && Date.now() - cache.cachedAt < LICENSE_CACHE_GRACE_MS) {
      return { valid: true, payload: toLicensePayload(cache.data) };
    }
    return { valid: false, reason: 'Could not reach the license server, and the offline grace period has expired. Please reconnect to the internet.' };
  }
}

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

  win.webContents.on('did-finish-load', () => {
    checkForUpdates();
  });
}

function checkForUpdates() {
  // Suppress errors if run in dev mode without a package.json github block
  autoUpdater.checkForUpdatesAndNotify().catch(() => console.log("AutoUpdater not running in dev"));
}

// Re-check periodically so a release pushed while the app is already
// running (not just at launch) still reaches the user.
setInterval(checkForUpdates, 4 * 60 * 60 * 1000); // every 4 hours

// Same idea for licensing: if it's revoked/refunded while the app is
// already open, this catches it without waiting for a restart.
setInterval(async () => {
  if (!getDbData().licenseKey) return;
  const status = await refreshLicenseStatus();
  if (!status.valid) {
    win?.webContents.send('license-invalidated', status.reason);
  }
}, LICENSE_RECHECK_MS);

// Setup autoUpdater listeners
autoUpdater.on('update-available', (info) => {
  win?.webContents.send('update-available', info);
});
autoUpdater.on('update-downloaded', (info) => {
  win?.webContents.send('update-downloaded', info);
});
autoUpdater.on('update-not-available', () => {
  win?.webContents.send('update-not-available');
});
autoUpdater.on('error', (err) => {
  win?.webContents.send('update-error', err?.message || String(err));
});
ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});
ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('check-for-updates', () => checkForUpdates());

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

  // Only in production — the Vite dev server needs inline/eval scripts for
  // HMR that this CSP would block. The `local://` protocol is registered
  // with bypassCSP: true above, so custom fonts still load fine under this.
  if (!VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';"
          ]
        }
      });
    });
  }

  // Custom protocol to load local fonts bypassing web security
  protocol.handle('local', (request) => {
    const url = request.url.replace('local://', '');
    return net.fetch('file://' + decodeURIComponent(url));
  });

  createWindow();
});

// Database IPC. Only exposes the app-data keys the renderer actually
// consumes here — licenseKey/licenseCache/deviceId are internal to the
// licensing flow (which has its own dedicated get-license-status channel)
// and have no reason to round-trip through the renderer.
ipcMain.handle('get-db-data', () => {
  const { fonts, collections, scripts } = getDbData();
  return { fonts, collections, scripts };
});
ipcMain.on('save-db-data', (event, key, value) => saveDbData(key, value));

// Licensing: Firestore is the source of truth (enables revocation, real
// server-side expiry, and device-limit enforcement — see firestore.rules
// and electron/firebaseLicense.ts). The last known-good answer is cached
// locally so the app still works offline for LICENSE_CACHE_GRACE_MS.
ipcMain.handle('get-license-status', () => refreshLicenseStatus());

ipcMain.handle('activate-license', async (event, licenseKey: string) => {
  const deviceId = getDeviceId();
  try {
    const result = await checkLicenseOnline(licenseKey, deviceId);
    if (result.ok) {
      await saveDbData('licenseKey', licenseKey);
      await saveDbData('licenseCache', { data: result.data, cachedAt: Date.now() });
      return { valid: true, payload: toLicensePayload(result.data) };
    }
    return { valid: false, reason: result.reason };
  } catch (err) {
    console.error('License activation failed:', err);
    return { valid: false, reason: 'Could not reach the license server. Check your internet connection and try again.' };
  }
});

// Lets a customer free up their own device slot (e.g. before wiping a PC)
// without needing you to manually edit Firestore for every case.
ipcMain.handle('deactivate-device', async () => {
  const licenseKey = getDbData().licenseKey;
  if (!licenseKey) return { ok: false, reason: 'No license activated.' };

  const result = await deactivateDevice(licenseKey, getDeviceId());
  if (result.ok) {
    await saveDbData('licenseKey', null);
    await saveDbData('licenseCache', null);
  }
  return result;
});

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

// Adobe ships a new After Effects folder per year (e.g. "Adobe After
// Effects 2024", "...2025") with no stable path across versions — scan
// for whatever's actually installed instead of hardcoding one year, so
// this doesn't silently stop working the moment a new version ships.
function findAfterEffectsPath(): string | null {
  const adobeDir = 'C:\\Program Files\\Adobe';
  try {
    const candidates = fs.readdirSync(adobeDir)
      .filter(name => /^Adobe After Effects/i.test(name))
      .sort()
      .reverse(); // newest year first
    for (const name of candidates) {
      const exePath = path.join(adobeDir, name, 'Support Files', 'afterfx.exe');
      if (fs.existsSync(exePath)) return exePath;
    }
  } catch {
    // Adobe dir missing entirely, or unreadable — treated the same as not found.
  }
  return null;
}

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
        const aePath = findAfterEffectsPath();
        if (aePath) {
          execFile(aePath, ['-r', scriptPath], (error) => {
            if (error) resolve({ success: false, message: error.message });
            else resolve({ success: true, message: `Executed in After Effects (Windows)` });
          });
          return;
        }
        return resolve({ success: false, message: 'Could not find an After Effects installation under C:\\Program Files\\Adobe.' });
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

// Lets the rejection propagate to the renderer instead of swallowing it
// into a string — a caller that doesn't check for an error string could
// otherwise "successfully" read an error message as if it were real file
// content, and if it later writes that back out, silently destroy the file.
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (e) {
    console.error('File read error:', e);
    return { success: false, message: 'Error reading file.' };
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
    // Resolve + compare with a trailing separator so a sibling directory
    // that merely starts with "Vault" (e.g. "VaultOld") can't pass this check.
    const resolvedPath = path.resolve(filePath);
    if (resolvedPath.startsWith(vaultDir + path.sep) && fs.existsSync(resolvedPath)) {
      await fs.promises.unlink(resolvedPath);
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
