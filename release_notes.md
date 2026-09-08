# Rupantor Release Notes

## Font Management
- Import `.ttf`/`.otf` fonts via drag-and-drop or file picker; preview them alongside your system fonts.
- Install/uninstall custom fonts directly to the OS — Windows (registry + `WM_FONTCHANGE` broadcast) and macOS (`~/Library/Fonts`).
- Grid and list views, search, sort, and filter by system vs. custom fonts.

## Adobe JSX Automation
- Store and run ExtendScript (`.jsx`) automation directly against Photoshop, Illustrator, and After Effects.
- Windows: COM bridge via PowerShell. macOS: AppleScript/`osascript`.
- Built-in script editor with save-in-place.

## Free and open source
- Every feature is unlocked for everyone — no licence key, no account, no trial, no paid tier.
- MIT licensed: use it commercially, modify it, redistribute it.
- Fully offline. Nothing but the GitHub update check ever leaves your machine.

## Auto-Updates
- Checks for updates on launch and periodically while running; installs on your confirmation.

## Known limitations
- Windows and macOS only (no Linux build).
- macOS builds target Apple Silicon; Intel Macs run them under Rosetta.
- Installers are not yet code-signed — Windows SmartScreen / macOS Gatekeeper may show an "unrecognized developer" warning on first run.
