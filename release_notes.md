# Rupantor Release Notes

## Font Management
- Import `.ttf`/`.otf` fonts via drag-and-drop or file picker; preview them alongside your system fonts.
- Install/uninstall custom fonts directly to the OS — Windows (registry + `WM_FONTCHANGE` broadcast) and macOS (`~/Library/Fonts`).
- Grid and list views, search, sort, and filter by system vs. custom fonts.

## Adobe JSX Automation
- Store and run ExtendScript (`.jsx`) automation directly against Photoshop, Illustrator, and After Effects.
- Windows: COM bridge via PowerShell. macOS: AppleScript/`osascript`.
- Built-in script editor with save-in-place.

## Licensing
- One-time purchase, yearly or lifetime plans.
- Device-limited activation with self-service deactivation (Settings → Deactivate This Device) if you need to move to a new machine.
- Works offline for a grace period if you lose connectivity mid-session.

## Auto-Updates
- Checks for updates on launch and periodically while running; installs on your confirmation.

## Known limitations
- Windows and macOS only (no Linux build).
- After Effects automation is currently macOS-only.
- Installers are not yet code-signed — Windows SmartScreen / macOS Gatekeeper may show an "unrecognized developer" warning on first run.
