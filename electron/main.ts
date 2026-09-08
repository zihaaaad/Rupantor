import { app, BrowserWindow, ipcMain, protocol, net, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { initDb, getDbData, saveDbData } from './db.js';
import { containedPath, fontReadRoots } from './pathGuard.js';
import fontList from 'font-list';
import { autoUpdater } from 'electron-updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

// Held in a const rather than read back from process.env at the point of
// use: TypeScript's narrowing of process.env.X doesn't survive into a
// function body, and path.join needs a definite string.
const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;
process.env.VITE_PUBLIC = VITE_PUBLIC;

let win: BrowserWindow | null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { bypassCSP: true, supportFetchAPI: true, secure: true, standard: true } }
]);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(VITE_PUBLIC, 'icon.png'),
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

  // The UI links out to the project site and repo. Without this, Electron
  // would open them in a bare in-app BrowserWindow; hand them to the user's
  // real browser instead, and never let the app window itself navigate away
  // from the bundled renderer.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win?.webContents.getURL()) {
      event.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });

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

  // Custom protocol to load local fonts bypassing web security. Restricted to
  // the vault and the OS font directories - it previously served any file on
  // disk to anything running in the renderer.
  protocol.handle('local', (request) => {
    const urlPath = request.url.replace(/^local:\/\//, '');
    const decodedPath = decodeURIComponent(urlPath);
    const safePath = containedPath(decodedPath, fontReadRoots(getVaultDir()));
    if (!safePath) {
      console.error('Blocked local:// request outside the font directories:', decodedPath);
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(safePath).href);
  });

  createWindow();
});

function getVaultDir(): string {
  return path.join(app.getPath('userData'), 'Vault');
}

// Database IPC. Only exposes the app-data keys the renderer actually
// consumes, rather than handing the whole store over wholesale.
ipcMain.handle('get-db-data', () => {
  const { fonts, collections, scripts } = getDbData();
  return { fonts, collections, scripts };
});
// Mirrors the read side's narrowing: the renderer may only write the keys it
// is allowed to read back, rather than any key it names.
const SAVABLE_KEYS = new Set(['fonts', 'collections', 'scripts']);

// handle, not on: a fire-and-forget write meant a full disk or a locked file
// was logged to a console nobody watches while the user believed their
// library was saved.
ipcMain.handle('save-db-data', async (_event, key: string, value: unknown) => {
  if (!SAVABLE_KEYS.has(key)) {
    console.error('Rejected save for unknown DB key:', key);
    return { success: false, message: `Unknown database key: ${key}` };
  }
  try {
    await saveDbData(key, value);
    return { success: true };
  } catch (e) {
    console.error('Failed to save DB data:', e);
    return { success: false, message: (e as Error).message };
  }
});

import { installFontToOS, uninstallFontFromOS } from './installFont.js';

// IPC Handlers for Phase 2 (Installing Fonts)
ipcMain.handle('install-font', async (_event, fontPath, fontName, fontStyle) => {
  const success = await installFontToOS(fontPath, fontName, fontStyle);
  return { success, message: success ? 'Installed natively!' : 'Failed to install' };
});

ipcMain.handle('uninstall-font', async (_event, fontPath, fontName, fontStyle) => {
  const success = await uninstallFontFromOS(fontPath, fontName, fontStyle);
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
ipcMain.handle('execute-script', async (_event, scriptPath, targetApp) => {
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

        # Photoshop and Illustrator's COM Application objects both expose
        # DoJavaScriptFile — the app being automated is already selected via
        # $comName above, so no per-app branching is needed here.
        $app.DoJavaScriptFile($scriptPath)

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
ipcMain.handle('read-file', async (_event, filePath) => {
  const safePath = containedPath(filePath, [getVaultDir()]);
  if (!safePath) return { success: false, message: 'Refused: file is outside the vault.' };
  try {
    const content = await fs.promises.readFile(safePath, 'utf8');
    return { success: true, content };
  } catch (e) {
    console.error('File read error:', e);
    return { success: false, message: 'Error reading file.' };
  }
});

ipcMain.handle('write-file', async (_event, filePath, content) => {
  const safePath = containedPath(filePath, [getVaultDir()]);
  if (!safePath) {
    console.error('Blocked write outside the vault:', filePath);
    return { success: false };
  }
  try {
    await fs.promises.writeFile(safePath, content, 'utf8');
    return { success: true };
  } catch (e) {
    console.error('File write error:', e);
    return { success: false };
  }
});

// Returns null rather than falling back to the original path. Handing back an
// unvaulted path made the app record an asset as vaulted when it was not,
// which silently voids the vault's one promise - that deleting your original
// download will not break your library - and later confuses delete-from-vault.
ipcMain.handle('copy-to-vault', async (_event, originalPath) => {
  try {
    const vaultDir = getVaultDir();
    if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });

    const fileName = path.basename(originalPath);
    // Timestamp prefix so same-named files from different folders coexist.
    const destPath = path.join(vaultDir, Date.now() + '_' + fileName);

    await fs.promises.copyFile(originalPath, destPath);
    return destPath;
  } catch (e) {
    console.error('Vault copy error:', e);
    return null;
  }
});

ipcMain.handle('delete-from-vault', async (_event, filePath) => {
  try {
    const safePath = containedPath(filePath, [getVaultDir()]);
    if (safePath && fs.existsSync(safePath)) {
      await fs.promises.unlink(safePath);
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
