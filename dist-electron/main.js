import { BrowserWindow, app, ipcMain, net, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { exec } from "child_process";
import os from "os";
//#region electron/db.ts
function getDbPath() {
	return path.join(app.getPath("userData"), "rupantor_db.json");
}
function initDb() {
	const dbPath = getDbPath();
	if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({
		fonts: [],
		collections: []
	}), "utf8");
}
function getDbData() {
	try {
		return JSON.parse(fs.readFileSync(getDbPath(), "utf8"));
	} catch {
		return {
			fonts: [],
			collections: []
		};
	}
}
function saveDbData(key, value) {
	const data = getDbData();
	data[key] = value;
	fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), "utf8");
}
//#endregion
//#region electron/installFont.ts
async function installFontToOS(fontPath, fontName) {
	return new Promise((resolve) => {
		const fileName = path.basename(fontPath);
		const platform = process.platform;
		if (platform === "darwin") {
			const macFontsDir = path.join(os.homedir(), "Library", "Fonts");
			const targetPath = path.join(macFontsDir, fileName);
			if (!fs.existsSync(macFontsDir)) fs.mkdirSync(macFontsDir, { recursive: true });
			try {
				if (fontPath !== targetPath) fs.copyFileSync(fontPath, targetPath);
				return resolve(true);
			} catch (e) {
				console.error("Mac Font Copy failed:", e);
				return resolve(false);
			}
		} else if (platform === "win32") {
			const registryName = `${fontName} ${path.extname(fileName).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`;
			const userFontsDir = path.join(os.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts");
			const targetPath = path.join(userFontsDir, fileName);
			if (!fs.existsSync(userFontsDir)) fs.mkdirSync(userFontsDir, { recursive: true });
			try {
				if (fontPath !== targetPath) fs.copyFileSync(fontPath, targetPath);
			} catch (e) {
				console.error("Windows Copy failed:", e);
				return resolve(false);
			}
			const ps1Path = path.join(os.tmpdir(), "rupantor_install_font.ps1");
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
				fs.writeFileSync(ps1Path, psScript, "utf8");
			} catch (e) {
				return resolve(false);
			}
			exec(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${ps1Path}"`, (error) => {
				if (error) {
					console.error("PowerShell failed:", error);
					resolve(false);
				} else resolve(true);
			});
		} else {
			console.warn("Linux font installation is not implemented.");
			resolve(false);
		}
	});
}
//#endregion
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win;
function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#050505",
			symbolColor: "#fff"
		},
		icon: path.join(process.env.VITE_PUBLIC, "logo.jpg"),
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: true
		}
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(RENDERER_DIST, "index.html"));
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
	initDb();
	protocol.handle("local", (request) => {
		const url = request.url.replace("local://", "");
		return net.fetch("file://" + decodeURIComponent(url));
	});
	createWindow();
});
ipcMain.handle("get-db-data", () => getDbData());
ipcMain.on("save-db-data", (event, key, value) => saveDbData(key, value));
ipcMain.handle("install-font", async (event, fontPath, fontName) => {
	console.log("Requested to install font:", fontName, fontPath);
	const success = await installFontToOS(fontPath, fontName);
	return {
		success,
		message: success ? "Installed natively!" : "Failed to install"
	};
});
ipcMain.handle("execute-script", async (event, scriptPath, targetApp) => {
	return new Promise((resolve) => {
		const platform = process.platform;
		if (platform === "darwin") {
			let appleScript = "";
			if (targetApp === "Photoshop") appleScript = `tell application id "com.adobe.Photoshop" to do javascript (POSIX file "${scriptPath}")`;
			else return resolve({
				success: false,
				message: `AppleScript for ${targetApp} not implemented`
			});
			exec(`osascript -e '${appleScript}'`, (error) => {
				if (error) resolve({
					success: false,
					message: error.message
				});
				else resolve({
					success: true,
					message: `Executed in ${targetApp} (Mac)`
				});
			});
		} else if (platform === "win32") {
			let psScript = "";
			if (targetApp === "Photoshop") psScript = `
          try {
            $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Photoshop.Application")
          } catch {
            $app = New-Object -ComObject Photoshop.Application
          }
          $app.DoJavaScriptFile("${scriptPath}")
        `;
			else return resolve({
				success: false,
				message: `COM execution for ${targetApp} not implemented`
			});
			exec(`powershell.exe -NoProfile -Command "${psScript.replace(/\n/g, ";")}"`, (error) => {
				if (error) resolve({
					success: false,
					message: error.message
				});
				else resolve({
					success: true,
					message: `Executed in ${targetApp} (Windows)`
				});
			});
		} else resolve({
			success: false,
			message: "Unsupported Operating System"
		});
	});
});
ipcMain.handle("read-file", async (event, filePath) => {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch (e) {
		return "Error reading file.";
	}
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
