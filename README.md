<div align="center">

# Rupantor

**A free, open-source font manager and Adobe automation hub for Windows and macOS.**

Install fonts straight to your OS, preview them instantly, and run ExtendScript
automation in Photoshop, Illustrator, and After Effects — from one native app.

[**Download**](https://github.com/zihaaaad/Rupantor/releases/latest) ·
[**Website**](https://zihaaaad.github.io/Rupantor) ·
[**Report a bug**](https://github.com/zihaaaad/Rupantor/issues) ·
[**Support the project**](#support-the-project)

![MIT licensed](https://img.shields.io/badge/license-MIT-6d8cff)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-a5abb8)
![Free forever](https://img.shields.io/badge/price-free%20forever-34d399)

</div>

---

## Free, all of it

Every feature is free, for everyone, forever. There is no licence key, no
account, no trial timer, and no paid tier — personal or commercial use alike.
The source is MIT licensed: fork it, change it, ship your own build.

## Features

- **One-click OS font install.** Drop in `.ttf`/`.otf` files, preview the
  waterfall, then install or uninstall them for real — via the Windows registry
  plus a `WM_FONTCHANGE` broadcast, or `~/Library/Fonts` on macOS.
- **Native Adobe execution.** Store `.jsx` scripts and run them in Photoshop,
  Illustrator, and After Effects through a COM bridge on Windows and
  AppleScript on macOS.
- **Local asset vault.** Imported fonts and scripts are copied into a
  persistent vault, so deleting the original download never breaks your library.
- **Full Unicode support.** Bangla, Arabic, Cyrillic, and CJK fonts import and
  render cleanly.
- **Built-in script editor.** Tweak a variable and save in place.
- **Auto-updates.** Checked on launch and every four hours, installed on your
  confirmation, straight from GitHub Releases.

## Install

Grab the Windows installer or the macOS `.dmg` from the
[latest release](https://github.com/zihaaaad/Rupantor/releases/latest), run it,
and open the app. That is the entire setup.

Builds are not code-signed — a certificate is an ongoing cost this project does
not carry — so Windows SmartScreen or macOS Gatekeeper will warn you on first
run. The source is right here if you would rather build it yourself.

## Architecture

- **Shell:** Electron, with `contextIsolation` on and `nodeIntegration` off — the
  renderer reaches the OS only through a typed IPC bridge (`electron/preload.ts`).
  External links are handed to the system browser rather than opened in-app.
- **UI:** React + TypeScript, built with Vite.
- **Local data:** fonts, scripts, and collections are stored in a JSON file under
  the OS app-data directory; writes are serialized so concurrent saves can't
  clobber each other. Nothing leaves your machine.
- **Font install:** copies the font file and registers it in the Windows registry
  (`HKCU\...\Fonts` + `WM_FONTCHANGE`) or into `~/Library/Fonts` on macOS.
- **Adobe automation:** on Windows, Photoshop and Illustrator run through a
  PowerShell-driven COM bridge (dynamic values are base64-encoded before
  interpolation to avoid injection) and After Effects runs via `afterfx.exe -r`,
  auto-discovered under `C:\Program Files\Adobe` rather than pinned to one
  yearly release; on macOS all three run through AppleScript/`osascript`.

## Development

```bash
git clone https://github.com/zihaaaad/Rupantor.git
cd Rupantor
npm install
npm run dev      # Vite + Electron in dev mode
npm run build    # type-check, build, and package installers (no publish)
npm run release  # same, but publishes to GitHub Releases (used by CI)
npm run lint     # oxlint
```

## Release pipeline

To cut a release: **just push a tag** (`git tag v1.2.3 && git push origin v1.2.3`).
`package.json`'s `version` is not the source of truth; the pushed tag is.
`.github/workflows/build.yml` syncs `package.json` to the tag before building, so
the built artifacts, the release filename, and the auto-updater's manifest can't
disagree with what was actually tagged.

From there it builds on Windows and macOS in parallel, each job publishing its
installer plus the `latest.yml` / `latest-mac.yml` / `.blockmap` metadata
`electron-updater` needs to a draft GitHub Release via `electron-builder`. A final
job un-drafts the release, which is what makes already-installed copies pick up
the update.

## Audit

A full system audit — architecture, trust boundaries, security posture, and a
prioritized list of findings — lives in [AUDIT.md](AUDIT.md).

## Contributing

Issues and pull requests are welcome — bug reports, fixes, features, docs, or
translations. There is no CLA and no gatekeeping.

## Support the project

Rupantor is free and always will be. If it saves you time, a donation covers the
hours behind new features, bug fixes, and testing against each new Adobe release.
Entirely optional.

| Method | Details |
| --- | --- |
| **bKash** | `01732109847` (Send Money) |
| **Nagad** | `01732109847` (Send Money) |
| **Bank** | Islami Bank Bangladesh PLC · Bogura branch<br>Zihad Hasan · `20501120207611108` |

Just as valuable, and free: star the repo, file a good bug report, or send a
pull request.

## Licence

MIT — see [LICENSE](LICENSE). Use it, modify it, redistribute it, commercially
or otherwise.
