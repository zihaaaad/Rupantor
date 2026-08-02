import { BrowserWindow as e, app as t, ipcMain as n, net as r, protocol as i } from "electron";
import a from "path";
import { fileURLToPath as o } from "url";
import s from "fs";
import c from "font-list";
import { exec as l, execFile as u } from "child_process";
import d from "os";
//#region electron/db.ts
function f() {
	return a.join(t.getPath("userData"), "rupantor_db.json");
}
function p() {
	let e = f();
	s.existsSync(e) || s.writeFileSync(e, JSON.stringify({
		fonts: [],
		collections: []
	}), "utf8");
}
function m() {
	try {
		return JSON.parse(s.readFileSync(f(), "utf8"));
	} catch {
		return {
			fonts: [],
			collections: []
		};
	}
}
async function h(e, t) {
	try {
		let n = m();
		n[e] = t, await s.promises.writeFile(f(), JSON.stringify(n, null, 2), "utf8");
	} catch (e) {
		console.error("Failed to save DB data:", e);
	}
}
//#endregion
//#region electron/installFont.ts
async function g(e, t) {
	return new Promise((n) => {
		let r = a.basename(e), i = process.platform;
		if (i === "darwin") {
			let t = a.join(d.homedir(), "Library", "Fonts"), i = a.join(t, r);
			s.existsSync(t) || s.mkdirSync(t, { recursive: !0 });
			try {
				return e !== i && !s.existsSync(i) && s.copyFileSync(e, i), n(!0);
			} catch (e) {
				return console.error("Mac Font Copy failed:", e), n(!1);
			}
		} else if (i === "win32") {
			let i = `${t} ${a.extname(r).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`, o = a.join(d.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"), c = a.join(o, r);
			s.existsSync(o) || s.mkdirSync(o, { recursive: !0 });
			try {
				e !== c && !s.existsSync(c) && s.copyFileSync(e, c);
			} catch (e) {
				return console.error("Windows Copy failed:", e), n(!1);
			}
			let u = Buffer.from(i).toString("base64"), f = Buffer.from(r).toString("base64"), p = a.join(d.tmpdir(), "rupantor_install_font.ps1"), m = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${u}'))
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
			l(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${p}"`, (e) => {
				e ? (console.error("PowerShell failed:", e), n(!1)) : n(!0);
			});
		} else console.warn("Linux font installation is not implemented."), n(!1);
	});
}
async function _(e, t) {
	return new Promise((n) => {
		let r = a.basename(e), i = process.platform;
		if (i === "darwin") {
			let e = a.join(d.homedir(), "Library", "Fonts"), t = a.join(e, r);
			try {
				return s.existsSync(t) && s.unlinkSync(t), n(!0);
			} catch (e) {
				return console.error("Mac Font Uninstallation failed:", e), n(!1);
			}
		} else if (i === "win32") {
			let e = `${t} ${a.extname(r).toLowerCase() === ".otf" ? "(OpenType)" : "(TrueType)"}`, i = a.join(d.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"), o = a.join(i, r);
			try {
				s.existsSync(o) && s.unlinkSync(o);
			} catch (e) {
				console.error("Windows font deletion failed:", e);
			}
			let c = Buffer.from(e).toString("base64"), u = a.join(d.tmpdir(), "rupantor_uninstall_font.ps1"), f = `
$registryName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${c}'))
$registryPath = "HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
$item = Get-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue
if ($item) {
    # File might be locked, but we remove the registry key so it unloads on next reboot at least.
    Remove-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue
}

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
				s.writeFileSync(u, f, "utf8");
			} catch {
				return n(!1);
			}
			l(`powershell.exe -ExecutionPolicy Bypass -NoProfile -File "${u}"`, (e) => {
				e ? (console.error("PowerShell uninstallation failed:", e), n(!1)) : n(!0);
			});
		} else n(!1);
	});
}
//#endregion
//#region electron/main.ts
var v = a.dirname(o(import.meta.url));
process.env.APP_ROOT = a.join(v, "..");
var y = process.env.VITE_DEV_SERVER_URL, b = a.join(process.env.APP_ROOT, "dist-electron"), x = a.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = y ? a.join(process.env.APP_ROOT, "public") : x;
var S;
i.registerSchemesAsPrivileged([{
	scheme: "local",
	privileges: {
		bypassCSP: !0,
		supportFetchAPI: !0,
		secure: !0,
		standard: !0
	}
}]);
function C() {
	S = new e({
		width: 1200,
		height: 800,
		icon: a.join(process.env.VITE_PUBLIC, "icon.png"),
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#050505",
			symbolColor: "#fff"
		},
		webPreferences: {
			preload: a.join(v, "preload.mjs"),
			nodeIntegration: !1,
			contextIsolation: !0,
			webSecurity: !0
		}
	}), y ? S.loadURL(y) : S.loadFile(a.join(x, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), S = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && C();
}), t.whenReady().then(() => {
	p(), i.handle("local", (e) => {
		let t = e.url.replace("local://", "");
		return r.fetch("file://" + decodeURIComponent(t));
	}), C();
}), n.handle("get-db-data", () => m()), n.on("save-db-data", (e, t, n) => h(t, n)), n.handle("install-font", async (e, t, n) => {
	console.log("Requested to install font:", n, t);
	let r = await g(t, n);
	return {
		success: r,
		message: r ? "Installed natively!" : "Failed to install"
	};
}), n.handle("uninstall-font", async (e, t, n) => {
	console.log("Requested to uninstall font:", n, t);
	let r = await _(t, n);
	return {
		success: r,
		message: r ? "Uninstalled natively!" : "Failed to uninstall"
	};
}), n.handle("execute-script", async (e, t, n) => new Promise((e) => {
	let r = process.platform;
	if (r === "darwin") {
		let r = "com.adobe.Photoshop", i = "do javascript";
		n === "Illustrator" ? r = "com.adobe.illustrator" : n === "After Effects" && (r = "com.adobe.AfterEffects", i = "DoScriptFile"), u("osascript", [
			"-e",
			`on run argv
        tell application id "${r}" to ${i} (POSIX file (item 1 of argv))
      end run`,
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
		if (n === "After Effects") return e({
			success: !1,
			message: "Windows execution for After Effects currently unsupported"
		});
		let r = "Photoshop.Application";
		n === "Illustrator" && (r = "Illustrator.Application"), u("powershell.exe", [
			"-NoProfile",
			"-Command",
			`
        $ErrorActionPreference = 'Stop'
        $scriptPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(t).toString("base64")}'))
        if (-not (Test-Path -LiteralPath $scriptPath)) {
          throw "Script file does not exist at path: $scriptPath"
        }
        try {
          $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("${r}")
        } catch {
          $app = New-Object -ComObject ${r}
        }
        
        if ("${n}" -eq "Illustrator") {
            $app.DoJavaScriptFile($scriptPath)
        } else {
            $app.DoJavaScriptFile($scriptPath)
        }
        
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
}), n.handle("write-file", async (e, t, n) => {
	try {
		return await s.promises.writeFile(t, n, "utf8"), { success: !0 };
	} catch (e) {
		return console.error("File write error:", e), { success: !1 };
	}
}), n.handle("copy-to-vault", async (e, n) => {
	try {
		let e = a.join(t.getPath("userData"), "Vault");
		s.existsSync(e) || s.mkdirSync(e, { recursive: !0 });
		let r = a.basename(n), i = Date.now() + "_" + r, o = a.join(e, i);
		return await s.promises.copyFile(n, o), o;
	} catch (e) {
		return console.error("Vault copy error:", e), n;
	}
}), n.handle("get-system-fonts", async () => {
	let e = [];
	try {
		e = (await c.getFonts()).map((e) => e.replace(/^"|"$/g, ""));
	} catch (e) {
		console.error("Failed to get system fonts via font-list:", e);
	}
	if (process.platform === "win32") try {
		let t = (e) => new Promise((t) => {
			l(`reg query "${e}"`, (e, n) => {
				if (e || !n) {
					t([]);
					return;
				}
				let r = [], i = n.split("\n");
				for (let e of i) if (e = e.trim(), e.includes("REG_SZ")) {
					let t = e.split("REG_SZ");
					if (t.length > 0) {
						let e = t[0].trim().replace(/\s+\((TrueType|OpenType|All res|Type 1|PostScript|120|8,10,12,14,18,24.*)\)$/i, "");
						e && r.push(e);
					}
				}
				t(r);
			});
		}), [n, r] = await Promise.all([t("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"), t("HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")]), i = [...n, ...r];
		i.length > 0 && (e = Array.from(/* @__PURE__ */ new Set([...e, ...i])));
	} catch (e) {
		console.error("Failed to get system fonts via reg query:", e);
	}
	return e;
});
//#endregion
export { b as MAIN_DIST, x as RENDERER_DIST, y as VITE_DEV_SERVER_URL };
