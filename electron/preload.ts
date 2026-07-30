import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  installFont: (fontPath: string, fontName: string) => ipcRenderer.invoke('install-font', fontPath, fontName),
  getDbData: () => ipcRenderer.invoke('get-db-data'),
  saveDbData: (key: string, value: any) => ipcRenderer.send('save-db-data', key, value),
  executeScript: (scriptPath: string, targetApp: string) => ipcRenderer.invoke('execute-script', scriptPath, targetApp),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
});
