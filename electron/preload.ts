import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
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
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});
