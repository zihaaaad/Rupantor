let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	installFont: (fontPath, fontName) => electron.ipcRenderer.invoke("install-font", fontPath, fontName),
	getDbData: () => electron.ipcRenderer.invoke("get-db-data"),
	saveDbData: (key, value) => electron.ipcRenderer.send("save-db-data", key, value),
	executeScript: (scriptPath, targetApp) => electron.ipcRenderer.invoke("execute-script", scriptPath, targetApp),
	readFile: (filePath) => electron.ipcRenderer.invoke("read-file", filePath)
});
//#endregion
