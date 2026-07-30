import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDbData, saveDbData } from './db.js';

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
    titleBarStyle: 'hidden', // Make it look premium
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#fff'
    },
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
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
      if (targetApp !== 'Photoshop') {
        return resolve({ success: false, message: `AppleScript for ${targetApp} not implemented` });
      }

      const appleScript = `on run argv
        tell application id "com.adobe.Photoshop" to do javascript (POSIX file (item 1 of argv))
      end run`;

      execFile('osascript', ['-e', appleScript, '--', scriptPath], (error) => {
        if (error) resolve({ success: false, message: error.message });
        else resolve({ success: true, message: `Executed in ${targetApp} (Mac)` });
      });
    } 
    
    // 🪟 Windows 10/11 COM Object Execution
    else if (platform === 'win32') {
      if (targetApp !== 'Photoshop') {
        return resolve({ success: false, message: `COM execution for ${targetApp} not implemented` });
      }

      const encodedPath = Buffer.from(scriptPath).toString('base64');
      const psScript = `
        $ErrorActionPreference = 'Stop'
        $scriptPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedPath}'))
        if (-not (Test-Path -LiteralPath $scriptPath)) {
          throw "Script file does not exist at path: $scriptPath"
        }
        try {
          $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Photoshop.Application")
        } catch {
          $app = New-Object -ComObject Photoshop.Application
        }
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

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (e) {
    console.error('File read error:', e);
    return 'Error reading file.';
  }
});
// Note: Window Controls are natively handled by Electron's titleBarOverlay (WCO).
