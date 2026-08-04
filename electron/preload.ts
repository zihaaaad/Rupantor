import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  installFont: (fontPath: string, fontName: string) => ipcRenderer.invoke('install-font', fontPath, fontName),
  uninstallFont: (fontPath: string, fontName: string) => ipcRenderer.invoke('uninstall-font', fontPath, fontName),
  getDbData: () => ipcRenderer.invoke('get-db-data'),
  saveDbData: (key: string, value: any) => ipcRenderer.send('save-db-data', key, value),
  executeScript: (scriptPath: string, targetApp: string) => ipcRenderer.invoke('execute-script', scriptPath, targetApp),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  copyToVault: (filePath: string) => ipcRenderer.invoke('copy-to-vault', filePath),
  deleteFromVault: (filePath: string) => ipcRenderer.invoke('delete-from-vault', filePath),
  getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),
  onUpdateAvailable: (callback: (info: any) => void) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback: (info: any) => void) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('update-not-available', listener);
    return () => ipcRenderer.removeListener('update-not-available', listener);
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (key: string) => ipcRenderer.invoke('activate-license', key),
  deactivateDevice: () => ipcRenderer.invoke('deactivate-device'),
  onLicenseInvalidated: (callback: (reason: string) => void) => {
    const listener = (_event: unknown, reason: string) => callback(reason);
    ipcRenderer.on('license-invalidated', listener);
    return () => ipcRenderer.removeListener('license-invalidated', listener);
  },
});
