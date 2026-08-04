# Rupantor

Rupantor is a native desktop app for Windows and macOS that centralizes font management and Adobe automation for creative professionals: import, preview, and install/uninstall fonts directly to the OS, and store/run ExtendScript (`.jsx`) automation against Photoshop, Illustrator, and After Effects.

## Architecture

- **Shell:** Electron, with `contextIsolation` enabled and `nodeIntegration` disabled — the renderer talks to the OS only through a typed IPC bridge (`electron/preload.ts`).
- **UI:** React + TypeScript, built with Vite.
- **Local data:** fonts/scripts/collections are cached in a local JSON file under the OS's app-data directory; writes are serialized to avoid races between concurrent saves.
- **Licensing:** license keys are Firestore document IDs, validated against Firebase (`electron/firebaseLicense.ts`) with an offline grace-period cache so the app keeps working briefly without a connection. `firestore.rules` is the actual security boundary — it restricts what a customer's copy of the app can write (device-tracking fields only) versus what only the admin control panel can do (create/revoke/edit licenses).
- **Admin control panel:** a small standalone static site (`admin/`) deployed on Firebase Hosting, gated to a single admin account, for issuing and managing licenses without touching Firestore by hand.
- **Font install:** native OS integration — copies the font file and registers it via the Windows registry (`HKCU\...\Fonts` + a `WM_FONTCHANGE` broadcast) or into `~/Library/Fonts` on macOS.
- **Adobe automation:** on Windows, Photoshop/Illustrator run via a PowerShell-driven COM bridge (all dynamic values base64-encoded before interpolation to avoid injection) and After Effects runs via `afterfx.exe -r`, auto-discovered under `C:\Program Files\Adobe` rather than pinned to one yearly release; on macOS, all three run via AppleScript/`osascript`.

## Development

```
npm install
npm run dev      # Vite + Electron in dev mode
npm run build    # type-check, build, and package installers (no publish)
npm run release  # same, but publishes to GitHub Releases (used by CI)
```

## Release pipeline

To cut a release: **just push a tag** (`git tag v1.2.3 && git push origin v1.2.3`) — no manual version bump needed. `package.json`'s `version` is not the source of truth; the pushed tag is. `.github/workflows/build.yml` syncs `package.json` to match the tag before building, so it's impossible for the built artifacts, the release filename, and the auto-updater's manifest to disagree with what was actually tagged.

From there: it builds on Windows and macOS in parallel, and each job publishes its installer plus the `latest.yml`/`latest-mac.yml`/`.blockmap` metadata `electron-updater` needs directly to a draft GitHub Release via `electron-builder`. Once both platforms finish, a final job un-drafts the release, which is what makes already-installed copies of the app pick up the update (checked on launch and every 4 hours while running).

## License

All rights reserved. Unauthorized reproduction or reverse engineering is prohibited.
