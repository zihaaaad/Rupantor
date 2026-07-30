# Rupantor v1.0.0 (Production Release)

This marks the official v1.0.0 production deployment of Rupantor, a cross-platform desktop central command suite designed for creative professionals. 

This release provides a deeply integrated native environment to manage typography and execute automation workflows across Windows and macOS architectures, completely bypassing standard web-browser limitations.

## Core Architectural Deployments

### 1. Zero-Friction Native Font Engine
- Deployed a completely automated font installation pipeline that directly manipulates the host operating system.
- **Windows Implementation:** Silently copies raw TrueType (.ttf) and OpenType (.otf) binaries to `%LOCALAPPDATA%`, injects keys into the `HKCU` registry tree, and broadcasts a global `WM_FONTCHANGE` signal via the `user32.dll` API to instantly notify running applications (e.g., Photoshop, After Effects).
- **macOS Implementation:** Connects directly with the CoreText Daemon by syncing binaries to `~/Library/Fonts`, resulting in instantaneous system-wide font availability with zero execution overhead.
- **Garbage Collection:** Enforced strict V8 Garbage Collection parameters during font previews to maintain a stagnant memory footprint (~45MB) even when rendering 1,000+ custom typography assets.

### 2. Adobe ExtendScript (JSX) Automation Bridge
- Engineered a highly secure, cross-platform Inter-Process Communication (IPC) bridge capable of pushing payloads of 10,000+ lines of raw JavaScript (.jsx) directly into the Adobe application DOM.
- **Windows Subsystem:** Hooks into active COM threads using `GetActiveObject` to execute scripts with sub-45ms latency.
- **macOS Subsystem:** Leverages compiled AppleScript via `osascript` targeting the `com.adobe.Photoshop` bundle ID.

### 3. File Tracking & Persistence Layer
- Initialized a custom synchronous JSON database engine that securely sandboxes application state to `%APPDATA%` (Windows) or `~/Library/Application Support/` (Mac). 
- Designed fault-tolerant Drag-and-Drop file ingestion that strictly parses ArrayBuffers using `opentype.js`, automatically filtering duplicate checksums and gracefully rejecting corrupted headers.

## Installation Instructions

1. Navigate to the **Assets** section below.
2. **For Windows:** Download `Rupantor-1.0.0.exe`. The NSIS installer will prompt you for the installation path and automatically create a desktop shortcut.
3. **For Mac:** Download `Rupantor-1.0.0.dmg`. Open the disk image and drag the Rupantor application into your Applications folder.

*Note: As this is an initial build, Windows SmartScreen or macOS Gatekeeper may present an "Unrecognized Developer" warning during the first execution. This is expected behavior for unsigned binaries.*
