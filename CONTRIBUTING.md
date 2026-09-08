# Contributing to Rupantor

Thanks for wanting to help. Rupantor is free software and always will be —
there is no CLA, no contributor agreement, and no gatekeeping.

## Getting set up

```bash
git clone https://github.com/zihaaaad/Rupantor.git
cd Rupantor
npm install
npm run dev      # Vite + Electron with hot reload
```

You need Node 20+. Building the native font-install path requires Windows or
macOS; the rest of the app runs anywhere Electron does.

## Before you open a pull request

Run what CI runs:

```bash
npm run lint     # oxlint
npx tsc -b       # type-checks src/, electron/, and vite.config.ts
npm test         # vitest
npx vite build   # renderer + main + preload bundles
```

All four must pass. CI runs them on every PR, so it is faster to catch a
failure locally.

## How this codebase is organised

| Path | What lives there |
| --- | --- |
| `electron/main.ts` | Main process — IPC handlers, Adobe bridge, vault, updater |
| `electron/preload.ts` | The **only** bridge between renderer and OS |
| `electron/installFont.ts` | Native font install/uninstall per platform |
| `electron/db.ts` | Local JSON store, with serialized writes |
| `src/` | React renderer |
| `docs/` | The project site, served by GitHub Pages |

## Rules that are not negotiable

These exist because breaking them turns a bug into a security problem. If a
change needs to work around one, say so in the PR and we will find another way.

1. **`nodeIntegration` stays off and `contextIsolation` stays on.** The renderer
   reaches the OS only through `preload.ts`.
2. **Never interpolate a dynamic value straight into a shell, PowerShell, or
   AppleScript string.** Base64-encode it and decode inside the script — see
   `installFont.ts` for the pattern. This applies even when the script is
   already passed via `-EncodedCommand`.
3. **Any IPC handler that accepts a path must contain it.** Use
   `containedPath()` in `main.ts`. An unchecked path is an arbitrary file
   read or write.
4. **No telemetry, no analytics, no phoning home.** The single network request
   Rupantor makes is the GitHub update check. Keep it that way.

## Testing

Tests live next to the code as `*.test.ts` and run under Vitest. The suite
currently covers the pure main-process logic — registry naming and database
write serialization — which is where the bugs that shipped actually were.

If you fix a bug, add a test that fails without your fix. A quick way to check
it is worth having: reintroduce the bug and confirm the test goes red.

## Style

There is no formatter enforced in CI. Match the file you are editing.

Comments should explain **why**, not what — the existing ones are a fair guide.
A comment earns its place by recording something the next reader would
otherwise have to rediscover: a race, a platform quirk, a decision that looks
wrong until you know the constraint.

## Reporting bugs

Open an issue with your OS and version, the Rupantor version (Preferences →
Version), what you did, what you expected, and what happened. If it involves a
specific font or script, saying which one helps enormously.

For anything security-related, see [SECURITY.md](SECURITY.md) instead.

## Known work

[AUDIT.md](AUDIT.md) lists open findings with severity, exact locations, and
suggested fixes. It is a reasonable place to find something worth doing.
