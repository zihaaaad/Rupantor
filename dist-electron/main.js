import { BrowserWindow as e, app as t, ipcMain as n, net as r, protocol as i } from "electron";
import a from "path";
import { fileURLToPath as o } from "url";
import s from "fs";
import { exec as c, execFile as l } from "child_process";
import u from "os";
//#region electron/db.ts
function d() {
	return a.join(t.getPath("userData"), "rupantor_db.json");
}
function f() {
	let e = d();
	s.existsSync(e) || s.writeFileSync(e, JSON.stringify({
		fonts: [],
		collections: []
	}), "utf8");
}
function p() {
	try {
		return JSON.parse(s.readFileSync(d(), "utf8"));
	} catch {
		return {
			fonts: [],
			collections: []
		};
	}
}
async function m(e, t) {
	try {
		let n = p();
		n[e] = t, await s.promises.writeFile(d(), JSON.stringify(n, null, 2), "utf8");
	} catch (e) {
		console.error("Failed to save DB data:", e);
	}
}
//#endregion
//#region electron/installFont.ts
async function h(e, t) {
	return new Promise((n) => {
		let r = a.basename(e), i = process.platform;
		if (i === "darwin") {
			let t = a.join(u.homedir(), "Library", "Fonts"), i = a.join(t, r);
			s.existsSync(t) || s.mkdirSync(t, { recursive: !0 });
			try {
				return e !== i && s.copyFileSync(e, i), n(!0);
			} catch (e) {
				return console.error("Mac Font Copy failed:", e), n(!1);
			}
		} else if (i === "win32") {
			let i = `${t} ${a.extname(r).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`, o = a.join(u.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"), l = a.join(o, r);
			s.existsSync(o) || s.mkdirSync(o, { recursive: !0 });
			try {
				e !== l && s.copyFileSync(e, l);
			} catch (e) {
				return console.error("Windows Copy failed:", e), n(!1);
			}
			let d = Buffer.from(i).toString("base64"), f = Buffer.from(r).toString("base64"), p = a.join(u.tmpdir(), "rupantor_install_font.ps1"), m = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${d}'))
$fileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${f}'))
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
New-ItemProperty -Path $registryPath -Name $registryName -Value $fileName -PropertyType String -Force

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
				s.writeFileSync(p, m, "utf8");
			} catch {
				return n(!1);
			}
			c(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${p}"`, (e) => {
				e ? (console.error("PowerShell failed:", e), n(!1)) : n(!0);
			});
		} else console.warn("Linux font installation is not implemented."), n(!1);
	});
}
async function g(e, t) {
	return new Promise((n) => {
		let r = a.basename(e), i = process.platform;
		if (i === "darwin") {
			let e = a.join(u.homedir(), "Library", "Fonts"), t = a.join(e, r);
			try {
				return s.existsSync(t) && s.unlinkSync(t), n(!0);
			} catch (e) {
				return console.error("Mac Font Uninstallation failed:", e), n(!1);
			}
		} else if (i === "win32") {
			let e = `${t} ${a.extname(r).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`, i = a.join(u.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"), o = a.join(i, r);
			try {
				s.existsSync(o) && s.unlinkSync(o);
			} catch (e) {
				console.error("Windows font deletion failed:", e);
			}
			let l = Buffer.from(e).toString("base64"), d = a.join(u.tmpdir(), "rupantor_uninstall_font.ps1"), f = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${l}'))
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
Remove-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue

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
				s.writeFileSync(d, f, "utf8");
			} catch {
				return n(!1);
			}
			c(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${d}"`, (e) => {
				e ? (console.error("PowerShell uninstallation failed:", e), n(!1)) : n(!0);
			});
		} else n(!1);
	});
}
//#endregion
//#region electron/main.ts
var _ = a.dirname(o(import.meta.url));
process.env.APP_ROOT = a.join(_, "..");
var v = process.env.VITE_DEV_SERVER_URL, y = a.join(process.env.APP_ROOT, "dist-electron"), b = a.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = v ? a.join(process.env.APP_ROOT, "public") : b;
var x;
i.registerSchemesAsPrivileged([{
	scheme: "local",
	privileges: {
		bypassCSP: !0,
		supportFetchAPI: !0,
		secure: !0,
		standard: !0
	}
}]);
function S() {
	x = new e({
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#050505",
			symbolColor: "#fff"
		},
		icon: a.join(process.env.VITE_PUBLIC, "icon.ico"),
		webPreferences: {
			preload: a.join(_, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0,
			webSecurity: !0
		}
	}), v ? x.loadURL(v) : x.loadFile(a.join(b, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), x = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && S();
}), t.whenReady().then(() => {
	f(), i.handle("local", (e) => {
		let t = e.url.replace("local://", "");
		return r.fetch("file://" + decodeURIComponent(t));
	}), S();
}), n.handle("get-db-data", () => p()), n.on("save-db-data", (e, t, n) => m(t, n)), n.handle("install-font", async (e, t, n) => {
	console.log("Requested to install font:", n, t);
	let r = await h(t, n);
	return {
		success: r,
		message: r ? "Installed natively!" : "Failed to install"
	};
}), n.handle("uninstall-font", async (e, t, n) => {
	console.log("Requested to uninstall font:", n, t);
	let r = await g(t, n);
	return {
		success: r,
		message: r ? "Uninstalled natively!" : "Failed to uninstall"
	};
}), n.handle("execute-script", async (e, t, n) => new Promise((e) => {
	let r = process.platform;
	if (r === "darwin") {
		if (n !== "Photoshop") return e({
			success: !1,
			message: `AppleScript for ${n} not implemented`
		});
		l("osascript", [
			"-e",
			"on run argv\n        tell application id \"com.adobe.Photoshop\" to do javascript (POSIX file (item 1 of argv))\n      end run",
			"--",
			t
		], (t) => {
			e(t ? {
				success: !1,
				message: t.message
			} : {
				success: !0,
				message: `Executed in ${n} (Mac)`
			});
		});
	} else if (r === "win32") {
		if (n !== "Photoshop") return e({
			success: !1,
			message: `COM execution for ${n} not implemented`
		});
		l("powershell.exe", [
			"-NoProfile",
			"-Command",
			`
        $ErrorActionPreference = 'Stop'
        $scriptPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(t).toString("base64")}'))
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
      `
		], (t) => {
			e(t ? {
				success: !1,
				message: t.message
			} : {
				success: !0,
				message: `Executed in ${n} (Windows)`
			});
		});
	} else e({
		success: !1,
		message: "Unsupported Operating System"
	});
})), n.handle("read-file", async (e, t) => {
	try {
		return await s.promises.readFile(t, "utf8");
	} catch (e) {
		return console.error("File read error:", e), "Error reading file.";
	}
});
//#endregion
export { y as MAIN_DIST, b as RENDERER_DIST, v as VITE_DEV_SERVER_URL };
