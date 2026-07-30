import { BrowserWindow as e, app as t, ipcMain as n, net as r, protocol as i } from "electron";
import a from "path";
import { fileURLToPath as o } from "url";
import s from "fs";
import { exec as c } from "child_process";
import l from "os";
//#region electron/db.ts
function u() {
	return a.join(t.getPath("userData"), "rupantor_db.json");
}
function d() {
	let e = u();
	s.existsSync(e) || s.writeFileSync(e, JSON.stringify({
		fonts: [],
		collections: []
	}), "utf8");
}
function f() {
	try {
		return JSON.parse(s.readFileSync(u(), "utf8"));
	} catch {
		return {
			fonts: [],
			collections: []
		};
	}
}
function p(e, t) {
	let n = f();
	n[e] = t, s.writeFileSync(u(), JSON.stringify(n, null, 2), "utf8");
}
//#endregion
//#region electron/installFont.ts
async function m(e, t) {
	return new Promise((n) => {
		let r = a.basename(e), i = process.platform;
		if (i === "darwin") {
			let t = a.join(l.homedir(), "Library", "Fonts"), i = a.join(t, r);
			s.existsSync(t) || s.mkdirSync(t, { recursive: !0 });
			try {
				return e !== i && s.copyFileSync(e, i), n(!0);
			} catch (e) {
				return console.error("Mac Font Copy failed:", e), n(!1);
			}
		} else if (i === "win32") {
			let i = `${t} ${a.extname(r).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`, o = a.join(l.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"), u = a.join(o, r);
			s.existsSync(o) || s.mkdirSync(o, { recursive: !0 });
			try {
				e !== u && s.copyFileSync(e, u);
			} catch (e) {
				return console.error("Windows Copy failed:", e), n(!1);
			}
			let d = a.join(l.tmpdir(), "rupantor_install_font.ps1"), f = `
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
New-ItemProperty -Path $registryPath -Name "${i}" -Value "${r}" -PropertyType String -Force

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
				e ? (console.error("PowerShell failed:", e), n(!1)) : n(!0);
			});
		} else console.warn("Linux font installation is not implemented."), n(!1);
	});
}
//#endregion
//#region electron/main.ts
var h = a.dirname(o(import.meta.url));
process.env.APP_ROOT = a.join(h, "..");
var g = process.env.VITE_DEV_SERVER_URL, _ = a.join(process.env.APP_ROOT, "dist-electron"), v = a.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = g ? a.join(process.env.APP_ROOT, "public") : v;
var y;
function b() {
	y = new e({
		width: 1200,
		height: 800,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#050505",
			symbolColor: "#fff"
		},
		icon: a.join(process.env.VITE_PUBLIC, "logo.jpg"),
		webPreferences: {
			preload: a.join(h, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0,
			webSecurity: !0
		}
	}), g ? y.loadURL(g) : y.loadFile(a.join(v, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), y = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && b();
}), t.whenReady().then(() => {
	d(), i.handle("local", (e) => {
		let t = e.url.replace("local://", "");
		return r.fetch("file://" + decodeURIComponent(t));
	}), b();
}), n.handle("get-db-data", () => f()), n.on("save-db-data", (e, t, n) => p(t, n)), n.handle("install-font", async (e, t, n) => {
	console.log("Requested to install font:", n, t);
	let r = await m(t, n);
	return {
		success: r,
		message: r ? "Installed natively!" : "Failed to install"
	};
}), n.handle("execute-script", async (e, t, n) => new Promise((e) => {
	let r = process.platform;
	if (r === "darwin") {
		let r = "";
		if (n === "Photoshop") r = `tell application id "com.adobe.Photoshop" to do javascript (POSIX file "${t}")`;
		else return e({
			success: !1,
			message: `AppleScript for ${n} not implemented`
		});
		c(`osascript -e '${r}'`, (t) => {
			e(t ? {
				success: !1,
				message: t.message
			} : {
				success: !0,
				message: `Executed in ${n} (Mac)`
			});
		});
	} else if (r === "win32") {
		let r = "";
		if (n === "Photoshop") r = `
          try {
            $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Photoshop.Application")
          } catch {
            $app = New-Object -ComObject Photoshop.Application
          }
          $app.DoJavaScriptFile("${t}")
        `;
		else return e({
			success: !1,
			message: `COM execution for ${n} not implemented`
		});
		c(`powershell.exe -NoProfile -Command "${r.replace(/\n/g, ";")}"`, (t) => {
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
		return s.readFileSync(t, "utf8");
	} catch {
		return "Error reading file.";
	}
});
//#endregion
export { _ as MAIN_DIST, v as RENDERER_DIST, g as VITE_DEV_SERVER_URL };
