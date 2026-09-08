# Rupantor — System Audit

**Audit date:** 8 September 2026
**Revision audited:** `master` @ `24d560f` plus the open-source conversion in this pass
**Auditor:** Claude Opus 5 (automated review, commissioned by Zihad Hasan)
**Scope:** Full repository — Electron main process, preload bridge, React renderer,
native OS integration, build/release pipeline, project site, and documentation.

> **Status: 16 of 18 findings are fixed** as of the remediation pass that followed
> this audit. Each finding below carries its own status line. Section 6 records
> what was done and what deliberately was not.

---

## 1. Executive summary

Rupantor is a **small, coherent, and genuinely well-built** Electron application.
The security fundamentals that most Electron apps get wrong are right here:
`contextIsolation` is on, `nodeIntegration` is off, a production CSP is applied,
every shell/PowerShell interpolation is base64-encoded against injection, and the
vault delete path does proper path containment. The recent removal of the
licensing system eliminated the app's only cloud dependency and its only
telemetry-shaped surface.

The weaknesses are not in what the code does — they are in **what nothing is
checking**. There are no tests, no CI on pull requests, `strict` is off, and the
entire `electron/` directory is excluded from type-checking altogether. For a
project that has just opened to outside contributors, that gap matters more than
any single bug below.

### Health at a glance

The "after" column reflects the remediation pass that followed this audit.

| Area | At audit | Now |
| --- | --- | --- |
| Electron security model | **Strong** | **Strong** |
| Command injection defence | **Strong** | **Strong** — plus `-EncodedCommand`, no temp scripts |
| IPC surface | **Needs work** — 3 handlers took arbitrary paths | **Strong** — all contained |
| Correctness | **Fair** — 3 user-visible bugs | **Good** — all 3 fixed, 2 with tests |
| Type safety | **Weak** — `strict` off, `electron/` unchecked | **Strong** — strict everywhere, all 3 projects checked |
| Automated testing | **Absent** | **Started** — 17 tests on main-process logic |
| CI coverage | **Weak** — tags only | **Good** — lint, types, tests, build on every PR |
| Accessibility | **Fair** — modals lacked dialog semantics | **Good** — roles, labels, focus trap and restore |
| Dependency hygiene | **Needs work** — 4 advisories | **Clean** — 0 advisories, Dependabot enabled |
| Open-source readiness | **Good** — missing contributor scaffolding | **Strong** — CONTRIBUTING, SECURITY, templates |

### Findings by severity

| Severity | Count | IDs |
| --- | --- | --- |
| High | 2 | H-1, H-2 |
| Medium | 8 | M-1 … M-8 |
| Low | 8 | L-1 … L-8 |
| Informational | 4 | I-1 … I-4 |

No critical findings. Nothing in this report was being actively exploited or
losing user data.

**Remediation status:** 16 fixed, 2 deliberately deferred (L-3 and I-1 — see
Section 6 for the reasoning).

---

## 2. System overview

### 2.1 Process topology

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer  (Chromium, contextIsolation: ON, nodeIntegration: OFF)
│                                                              │
│  React 19 + Vite      opentype.js parses font binaries       │
│  App.tsx  ──  Sidebar / Dashboard / AdobeScripts / Settings  │
│                                                              │
│  CSP (production): default-src 'self'; connect-src 'self'    │
│  Custom fonts render via the local:// protocol               │
└───────────────────────────┬──────────────────────────────────┘
                            │  contextBridge — 18 typed channels
                            │  (electron/preload.ts)
┌───────────────────────────┴──────────────────────────────────┐
│ Main  (Node)                                                 │
│                                                              │
│  db.ts          rupantor_db.json, serialized writes          │
│  installFont.ts registry + WM_FONTCHANGE  /  ~/Library/Fonts │
│  main.ts        Adobe bridge, vault, updater, local://       │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
  Windows registry    PowerShell COM       GitHub Releases
  + user font dir     / osascript          (update check only)
```

### 2.2 Trust boundaries

There are exactly three, and it is worth being precise about which are real:

1. **Renderer → Main (IPC).** The nominal boundary. In practice the renderer
   ships inside the same signed-or-unsigned bundle as main, loads no remote
   content, and is CSP-locked — so a hostile renderer implies the attacker
   already replaced the app. This is why findings H-1/H-2 are rated High rather
   than Critical: they are **defence-in-depth failures**, not live holes.
2. **App → OS (registry, filesystem, process spawn).** The real privilege
   surface. Handled correctly: per-user install locations (`HKCU`,
   `%LOCALAPPDATA%`, `~/Library/Fonts`) mean Rupantor never needs administrator
   rights, which is the right call and rarer than it should be.
3. **App → untrusted file input.** Fonts and `.jsx` scripts arrive from
   anywhere. `opentype.parse` runs on attacker-influenced bytes in the renderer;
   `.jsx` contents are executed by Adobe, not by Rupantor.

### 2.3 Data flow: importing and installing a font

```
drop/pick file
  → processFile()          size cap 20 MB, opentype.parse for family/style
  → copyToVault()          main copies into userData/Vault/<ts>_<name>
  → FontFace(local://…)    renderer registers the face for preview
  → saveDbData('fonts')    serialized JSON write
  → installFont()          copy to user font dir, write HKCU value,
                           broadcast WM_FONTCHANGE  (Windows)
```

Every step is `await`ed and failures surface as toasts — with the exception noted
in **M-2**.

---

## 3. Findings

Each finding lists severity, location, the defect, why it matters, and a fix.

### HIGH

---

#### H-1 — `electron/` is excluded from type-checking entirely

**Status: FIXED.** `tsconfig.electron.json` added and referenced from `tsconfig.json`, so `tsc -b` now covers the main process. Fixing it immediately surfaced 9 errors — the `VITE_PUBLIC` one below plus 8 unused-parameter warnings — all resolved.

**Location:** `tsconfig.app.json:34` (`"include": ["src"]`),
`tsconfig.node.json:23` (`"include": ["vite.config.ts"]`)

`npm run build` runs `tsc -b`, which resolves only those two projects. The
`electron/` directory — main process, preload bridge, native font installer — is
matched by **neither**. It reaches the bundle through `vite-plugin-electron`,
which transpiles without type-checking.

Type errors in the main process therefore ship silently. This is not
hypothetical: type-checking `electron/` in isolation surfaces a real one
immediately.

```
electron/main.ts(29,21): error TS2345:
  Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

That is `path.join(process.env.VITE_PUBLIC, 'icon.png')` — safe at runtime only
because line 17 assigns `VITE_PUBLIC` unconditionally. Nothing enforces that
ordering, and the next such mistake may not be benign.

**Why it matters:** the main process is the half of the app with filesystem,
registry, and process-spawn access. It is the half you least want unchecked, and
it is the only half that is.

**Fix:** add a third project, `tsconfig.electron.json`, with
`"include": ["electron"]` and Node types, and reference it from `tsconfig.json`
so `tsc -b` picks it up. Then fix the one error it reports (assert or guard
`VITE_PUBLIC`).

---

#### H-2 — Three IPC handlers accept arbitrary filesystem paths

**Status: FIXED.** `containedPath()` extracted in `main.ts` and applied to `local://`, `read-file`, and `write-file`; `delete-from-vault` now uses the shared helper too. `local://` is restricted to the vault plus OS font directories, and the two file handlers to the vault alone.

**Location:** `electron/main.ts:135` (`local://`), `:276` (`read-file`),
`:286` (`write-file`)

None of these constrain the path they are handed:

```ts
// main.ts:135 — reads any file on disk, by design of the handler
protocol.handle('local', (request) => {
  const decodedPath = decodeURIComponent(request.url.replace(/^local:\/\//, ''));
  return net.fetch(pathToFileURL(decodedPath).href);
});

// main.ts:286 — writes any file on disk
ipcMain.handle('write-file', async (event, filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf8');
```

`local://` grants arbitrary file **read** to anything running in the renderer.
`write-file` grants arbitrary file **write** — the more serious of the two, since
it can overwrite a startup script or a config file.

The exploit path requires renderer code execution, which the CSP and the absence
of remote content make unlikely today. But the app parses untrusted font
binaries with a third-party library in that very renderer, so "unlikely" is
carrying real weight here.

**Notably, the correct pattern already exists in this codebase** — `delete-from-vault`
at `main.ts:314` does exactly the right thing:

```ts
const resolvedPath = path.resolve(filePath);
if (resolvedPath.startsWith(vaultDir + path.sep) && fs.existsSync(resolvedPath)) {
```

**Fix:** apply that same containment to all three. `read-file`/`write-file`
should accept only paths under the vault. `local://` should accept only the vault
plus the OS font directories. This is a contained change — the guard is already
written and tested in one place; it needs to be extracted and reused.

---

### MEDIUM

---

#### M-1 — Font styles of the same family collide in the Windows registry

**Status: FIXED.** The registry value name now includes the subfamily, matching how Windows names its own entries. Uninstall removes the legacy family-only key only when its data still points at the same file, so a mixed old/new install cannot lose an entry. Covered by 11 tests, verified to fail against the old behaviour.

**Location:** `electron/installFont.ts:37` and `:125`; callers at
`src/App.tsx:421`, `:427`, `:559`, `:563`

The registry value name is derived from the **family** name only:

```ts
const registryName = `${fontName} ${typeLabel}`;   // "Inter (TrueType)"
```

and every caller passes `font.fontFamily` — the family, never the subfamily. So
`Inter Regular` and `Inter Bold` both resolve to the value name
`Inter (TrueType)`.

**Consequences:**
- Installing the second style **overwrites** the first style's registry value.
  The registry now points at only one file; the other is installed on disk but
  unregistered.
- Uninstalling *either* style removes the **shared** key, silently deactivating
  the other — which Rupantor's UI will still show as Active.

Anyone managing a real type family — the app's core audience — hits this
immediately.

**Fix:** build the registry name from family **and** subfamily (`"Inter Bold
(TrueType)"`), matching what Windows itself writes. Note this needs a migration
thought: fonts installed by earlier versions carry the old family-only key.

---

#### M-2 — The grid toggle reports success even when the OS install fails

**Status: FIXED.** Both paths now share one `setFontActive` helper that returns success, and callers flip state only on `true`.

**Location:** `src/App.tsx:568`

```ts
const res = await window.electronAPI.installFont(font.path, font.fontFamily);
if (res.success) toast.success(`Installed ${font.name} to OS`);
else toast.error(`Failed to install ${font.name}`);
...
setFonts(prev => prev.map(f => f === font ? { ...f, active: !f.active } : f));  // unconditional
```

The state flip happens regardless of the result. A failed install still leaves
the card reading **Active**, and that lie is persisted to the database on the
next save.

The context-menu path for the identical operation (`toggleSelectedActive`,
`App.tsx:415-437`) gets this right — it collects a `successToggles` set and flips
only those. The two paths disagree.

**Fix:** move the `setFonts` call inside the `res.success` branch, mirroring
`toggleSelectedActive`. Better still, extract one shared `toggleFontActive`
helper so the two paths cannot drift again.

---

#### M-3 — Font identity key collides between custom and system fonts

**Status: FIXED.** A single `fontId()` helper keys on `isSystem` as well as name and style, and is used for React keys, selection, and delete matching.

**Location:** `src/App.tsx:525` (`key={id}`), `:401` (delete filter), and every
`selectedIds` operation

Font identity is `` `${font.name}-${font.style}` `` everywhere — with no
`isSystem` component. A custom upload of a font the OS already has (importing
`Inter-Regular.ttf` when Inter is installed system-wide is entirely normal)
produces two entries with the **same identity**.

**Consequences:**
- Duplicate React `key` on sibling elements — React logs a warning and may
  reconcile the wrong node.
- Clicking one card selects both.
- Deleting the custom one also filters the system one out of the list
  (`App.tsx:401` matches on name+style alone). Cosmetic only, since system fonts
  are re-enumerated from the OS at next launch — but confusing in the moment.

**Fix:** include `isSystem` (and ideally `path`) in the identity key.

---

#### M-4 — No CI validates a pull request

**Status: FIXED.** `.github/workflows/ci.yml` runs lint, type-check, tests, and build on every pull request and every push to `master`.

**Location:** `.github/workflows/build.yml:3-6`

```yaml
on:
  push:
    tags:
      - 'v*'
```

The only workflow triggers on version tags. Nothing runs `tsc`, `oxlint`, or a
build on a push to `master` or on a PR.

This was defensible while the repo was a solo commercial project. Now that the
README invites pull requests, **the first thing a contributor's PR meets is
nothing at all** — and the first signal that it broke the build arrives when a
release is cut.

**Fix:** add a lightweight `ci.yml` on `pull_request` and `push: [master]`
running `npm ci && npm run lint && npx tsc -b && npx vite build`. Roughly two
minutes per run.

---

#### M-5 — `npm install` in CI defeats the lockfile

**Status: FIXED.** Both workflows use `npm ci`.

**Location:** `.github/workflows/build.yml:64`

`npm install` may resolve newer versions than `package-lock.json` pins, so the
artifact users download is not reproducible from the committed lockfile — and a
compromised or broken transitive release can enter a build with no commit to
show for it.

**Fix:** `npm ci`. It is also faster.

---

#### M-6 — No automated tests of any kind

**Status: FIXED (started).** Vitest added with 17 tests across the two highest-value pure targets: registry naming (M-1) and database write serialization (L-2). Renderer tests remain future work.

**Location:** repository-wide; no test runner in `package.json`

There is no test framework, no test file, and no `test` script. Every finding in
this report was found by reading, and every regression will be too.

The highest-value targets are pure and easy to test today:
- `installFont.ts` registry-name derivation (would have caught **M-1** outright)
- `db.ts` write serialization under concurrent saves
- `findAfterEffectsPath` version-sorting
- the vault path-containment guard (and its H-2 siblings once fixed)

**Fix:** add Vitest — it shares Vite's config, so setup is near-zero — and start
with those four. This is the single highest-leverage item in the report.

---

#### M-7 — `strict` is disabled, and enabling it is free

**Status: FIXED.** `strict: true` on all three projects. As measured, `src/` needed no changes.

**Location:** `tsconfig.app.json`, `tsconfig.node.json` — neither sets `strict`

TypeScript runs in non-strict mode: no `strictNullChecks`, no
`noImplicitAny`. Combined with `getDbData(): any` (`db.ts:24`) and
`getDbData: () => Promise<any>` in the preload types, whole data paths are
effectively untyped.

**Measured, not assumed:** compiling `src/` with `"strict": true` produces
**zero errors**. The renderer is already strict-clean. `electron/` under strict
produces exactly the one error in H-1.

**Fix:** set `"strict": true` in both configs and fix the single error. This is a
one-line change with an immediate, permanent payoff, and it is rare to find it
this cheap.

---

#### M-8 — Four dependency advisories, one of which ships to users

**Status: FIXED.** `npm audit` reports 0 vulnerabilities. `.github/dependabot.yml` added for npm (weekly, minor/patch grouped) and GitHub Actions (monthly).

**Location:** `package-lock.json`; confirmed with `npm audit` and `npm ls`

| Package | Severity | Reaches | Path |
| --- | --- | --- | --- |
| `js-yaml` | High | **Shipped app** | `electron-updater@6.8.9 → js-yaml@4.3.0` |
| `fast-uri` | High | Build only | `electron-builder → app-builder-lib → ajv` |
| `nanoid` | High | Build only | `vite → postcss` |
| `@xmldom/xmldom` | Moderate | Build only | `electron-builder → app-builder-lib → plist` |

Three are development-only and cannot be reached by an installed copy of
Rupantor. **`js-yaml` is the exception** — it arrives through
`electron-updater`, a runtime dependency, and is what parses the `latest.yml`
update manifest fetched from GitHub Releases.

The advisory is quadratic CPU consumption while resolving `!!omap`
(CVE-2026-59870, unpatched in 3.x/4.x). Exploiting it in Rupantor would require
serving a hostile `latest.yml`, which means either compromising the project's
own GitHub Releases or breaking TLS — so practical risk is low, and the impact
ceiling is a hung update check rather than code execution. It should still be
patched, because it is the one advisory a user's machine can actually touch.

**Fix:** `npm audit fix` resolves all four. Verified by dry run: every fix is a
transitive patch/minor bump with no breaking major upgrade and no change to a
direct dependency. Follow with `npm run build` to confirm, and commit the
updated lockfile.

**Process gap behind it:** nothing watches for this. Dependabot alerts are
enabled on the repository (GitHub reported these on push) but no automated
update path exists.

**Fix:** add `.github/dependabot.yml` for the `npm` ecosystem on a weekly
schedule. Combined with the PR CI from M-4, dependency bumps then arrive as
pre-validated pull requests.

---

### LOW

---

#### L-1 — `copyToVault` silently falls back to the original path

**Status: FIXED.** Returns `null` on failure. Callers still import the asset — losing the user's import would be worse — but warn that it depends on the original file.
**Location:** `electron/main.ts:310`

On copy failure the handler returns `originalPath`, so the app records a path
outside the vault while telling the user the asset is vaulted. The vault's core
promise — "deleting your original download won't break your library" — is
quietly void for that asset, and `delete-from-vault` will later refuse it
(correctly) with a confusing warning.

**Fix:** return an explicit failure and surface it, rather than degrading
silently.

---

#### L-2 — Database write failures are invisible to the renderer

**Status: FIXED.** Promoted to `ipcMain.handle`; `saveDbData` propagates rejections while keeping the write queue alive, and the renderer toasts on failure. Two tests cover it.
**Location:** `electron/main.ts:150`, `electron/db.ts:31-35`

`save-db-data` is a fire-and-forget `ipcMain.on`. A failed write (disk full,
permissions, file locked) is logged to a console nobody is watching. The user
believes their library is saved; it is not.

**Fix:** promote to `ipcMain.handle`, return the write result, and toast on
failure.

---

#### L-3 — No list virtualization with hundreds of fonts

**Status: DEFERRED.** This is a real cost but an unmeasured one, and the audit's
own advice was to measure first. Virtualizing changes scroll, selection, and
shift-range behaviour, so it is not worth doing speculatively.
**Location:** `src/App.tsx:522-580`

Every font in `filteredAndSortedFonts` renders a card with a live preview in its
own family. A typical Windows install enumerates 300–500 families; a designer's
machine can carry far more. All render eagerly on every filter/sort/preview-text
change.

**Fix:** virtualize the grid (`@tanstack/react-virtual` is the light option), or
paginate. Worth measuring before building.

---

#### L-4 — Modals lack dialog semantics and focus management

**Status: FIXED.** A `useDialog` hook adds focus-in, a Tab trap, and focus restore; all three modals carry `role="dialog"`, `aria-modal`, and `aria-labelledby`.
**Location:** `SettingsModal.tsx:49`, `AdobeScripts.tsx:162`, `App.tsx:604`

The overlays are plain `div`s. No `role="dialog"`, no `aria-modal="true"`, no
focus trap, and focus is not restored to the trigger on close. Escape-to-close
and visible close buttons are implemented, and the font cards and sidebar have
had genuine keyboard/ARIA care — so this is the one gap in an otherwise
respectable accessibility story.

**Fix:** add the roles, trap focus while open, restore focus on close.

---

#### L-5 — Temp PowerShell script is a TOCTOU window

**Status: FIXED.** Scripts run via `-EncodedCommand`; no file is written to disk, so the window is gone. Inner base64 encoding of dynamic values is retained — `-EncodedCommand` protects the transport, not the interpolation.
**Location:** `electron/installFont.ts:57-88`, `:141-172`

The installer writes a `.ps1` into `os.tmpdir()` then executes it by path with
`-ExecutionPolicy Bypass`. Between write and execute, another local process
could swap the file.

Severity is Low because `os.tmpdir()` on Windows is the per-user
`%LOCALAPPDATA%\Temp`, so an attacker positioned to win this race already has
that user's privileges. The dynamic values are base64-encoded, which correctly
neutralises the injection risk that would otherwise dominate here.

**Fix:** pass the script via `-EncodedCommand` (base64 UTF-16LE) on stdin/argv
and skip the temp file entirely.

---

#### L-6 — `save-db-data` accepts arbitrary keys from the renderer

**Status: FIXED.** Writes are allowlisted to the same keys the read side exposes.
**Location:** `electron/main.ts:150`

`saveDbData(key, value)` writes any key the renderer names into the DB JSON. The
read side (`get-db-data`, `main.ts:146`) is properly narrowed to
`{ fonts, collections, scripts }` — the write side is not. Impact dropped
considerably when the license fields were removed; it remains an
unnecessary asymmetry.

**Fix:** validate `key` against the same allowlist the read side uses.

---

#### L-7 — Script duplicate-detection and IDs are filename-based

**Status: PARTIALLY FIXED.** IDs now use `crypto.randomUUID()`. Duplicate detection is still filename-based — changing it alters import behaviour users may rely on, so it is left as a deliberate product decision.
**Location:** `src/App.tsx:271`, `AdobeScripts.tsx:73`, `:88`

Duplicates are detected by filename alone, so two genuinely different
`cleanup.jsx` files from different projects cannot coexist. IDs are
`` `${file.name}-${Date.now()}` ``, which collide if two files are imported
within the same millisecond (unlikely — the loop awaits a file copy — but free
to eliminate).

**Fix:** `crypto.randomUUID()` for IDs; hash or path for duplicate detection.

---

#### L-8 — Object URL is never revoked

**Status: FIXED.** Revoked in a `finally` once the face is parsed.
**Location:** `src/App.tsx:290`

`URL.createObjectURL(fontPayload.file)` is used as the fallback when no vault
path exists, and never `revokeObjectURL`'d — the blob is pinned for the session.
Rare in practice (it requires the vault copy to have failed) and small, but it is
a leak.

---

### INFORMATIONAL

---

#### I-1 — Package name does not match the product
`package.json:2` is `"name": "zcentre"` while the product, `appId`, repo, and
site are all Rupantor. Harmless to the build; confusing in a public repo.

**Status: DEFERRED — deliberately.** Electron derives `app.getName()` from
`package.json`, and `app.getPath('userData')` derives from that in turn. In
packaged builds electron-builder's `productName` ("Rupantor") wins, but the
exact precedence is worth confirming on a real install before touching it:
if it resolves differently than expected, renaming moves every user's
`userData` directory and their font library and scripts vanish from the app's
point of view. A cosmetic naming inconsistency is not worth that risk without
a migration path and a test install. Left for a deliberate decision.

#### I-2 — Documentation claimed a limitation the code does not have
`release_notes.md` stated "After Effects automation is currently macOS-only",
but `main.ts:186-197` implements Windows AE via `findAfterEffectsPath()` and
`afterfx.exe -r`. **Corrected in this pass.**

#### I-3 — The retired Firebase project should be decommissioned
Licensing is gone from the code, but the `rupantorcrm` Firebase project, its
Firestore data, and the Hosting site for the deleted admin panel still exist
server-side. They now serve no purpose and represent standing customer PII
(names, emails, device IDs).

Worth noting: the Firebase config committed at `electron/firebaseLicense.ts`
carried the literal placeholder `REDACTED_FIREBASE_API_KEY`, not a live key — so
**no credential was ever exposed in this repository's history** (verified with
`git log -S`). It does mean released builds could not reach Firestore, and
license checks would have failed into the offline path.

**Recommendation:** export anything needed for records, notify any existing
licence holders that the app is now free, then delete the Firebase project.

#### I-4 — Bundle exceeds the 500 kB warning threshold
`vite build` warns on the renderer chunk; `opentype.js` is the bulk of it. It
loads from local disk, so startup cost is small. Lazy-loading the parser at
first import would clear it if desired.

---

## 4. What the codebase gets right

An audit that lists only faults misrepresents the system. These are deliberate,
correct decisions worth preserving through any refactor:

- **Electron hardening is textbook.** `contextIsolation: true`,
  `nodeIntegration: false`, a preload bridge exposing named channels rather than
  `ipcRenderer` itself, a production CSP, and — added this pass — a
  `setWindowOpenHandler` + `will-navigate` guard so external links go to the
  system browser and the window can never navigate away from the bundled app.
- **Injection defence is consistent and correct.** Every dynamic value crossing
  into PowerShell is base64-encoded and decoded inside the script; AppleScript
  receives the path through `argv` rather than string interpolation; COM
  target names come from a fixed set. This is the failure mode that sinks most
  apps doing Adobe automation, and it is handled properly throughout.
- **Per-user installs.** `HKCU`, `%LOCALAPPDATA%\...\Fonts`, `~/Library/Fonts` —
  Rupantor never requests administrator rights. Many commercial font managers do.
- **Serialized database writes.** `db.ts` chains writes through a promise queue
  so concurrent saves cannot clobber each other via a stale read — a race most
  projects discover only after losing user data.
- **Path containment in `delete-from-vault`.** Resolves first and compares with a
  trailing separator, so a sibling `VaultOld` directory cannot pass the check.
  Exactly right; it just needs to be applied in three more places (H-2).
- **Version-agnostic Adobe discovery.** `findAfterEffectsPath` scans and sorts
  installed versions instead of pinning a year, so it does not break annually.
- **The release pipeline is genuinely well-designed.** A single pre-matrix job
  creates the draft release (avoiding the classic duplicate-draft race), the
  pushed tag is the single source of truth for the version, and un-drafting is
  the deliberate final step that triggers auto-updates.
- **Failure honesty in the UI.** Vault deletion failures produce a warning that
  distinguishes "removed from library" from "removed from disk" instead of
  claiming blanket success.

---

## 5. Open-source readiness

The project became MIT-licensed and licence-key-free in this pass. Remaining gaps
are conventions contributors expect:

| Item | Status |
| --- | --- |
| `LICENSE` (MIT) | Present |
| README with build instructions | Present |
| Project site with no paywall | Present |
| `CONTRIBUTING.md` | Present |
| `CODE_OF_CONDUCT.md` | **Missing** — the one remaining gap |
| Issue / PR templates | Present |
| `SECURITY.md` (disclosure contact) | Present |
| CI on pull requests | Present (M-4) |
| Tests a contributor can run | Present (M-6) — `npm test` |
| `dependabot.yml` | Present (M-8) |

---

## 6. Remediation — what was done

All of Phases 1 to 3 and most of Phase 4 were completed in the pass following
this audit. Everything below was verified with `npx tsc -b`, `npm run lint`,
`npm test`, and `npx vite build` before commit.

**Phase 1 — close the verification gap** *(done)*
1. `tsconfig.electron.json` added to the build graph; the 9 errors it exposed fixed. *(H-1)*
2. `strict: true` on all three projects. *(M-7)*
3. `ci.yml` runs lint, type-check, tests, and build on every PR, using `npm ci`. *(M-4, M-5)*

**Phase 2 — fix what users actually hit** *(done)*
4. Registry name includes the subfamily, with a safe legacy-key migration. *(M-1)*
5. One shared `setFontActive`; state flips only on confirmed success. *(M-2)*
6. `fontId()` keys on `isSystem` as well as name and style. *(M-3)*
7. DB write failures propagate and surface as a toast. *(L-2)*

**Phase 3 — harden the IPC and dependency surface** *(done)*
8. `npm audit fix` — 0 advisories remain — plus `dependabot.yml`. *(M-8)*
9. `containedPath()` extracted and applied to all four path-taking handlers. *(H-2)*
10. `save-db-data` keys allowlisted. *(L-6)*
11. PowerShell runs via `-EncodedCommand`; no temp script on disk. *(L-5)*
12. `copyToVault` returns null instead of a misleading fallback path. *(L-1)*

**Phase 4 — sustainability** *(mostly done)*
13. Vitest with 17 tests on registry naming and DB write serialization. *(M-6)*
14. `CONTRIBUTING.md`, `SECURITY.md`, issue and PR templates. *(added)*
15. `useDialog` hook — focus trap, focus restore, dialog roles on all 3 modals. *(L-4)*
16. `crypto.randomUUID()` for script IDs; object URL revoked. *(L-7 partial, L-8)*

### Deliberately not done

**L-3 (virtualize the font grid)** — a real cost, but unmeasured, and
virtualizing changes scroll, selection, and shift-range behaviour. The audit
said measure first; that still stands.

**I-1 (rename the package from `zcentre`)** — `app.getPath('userData')`
derives from the package name, so getting the precedence wrong against
electron-builder's `productName` would strand every existing user's library.
Not worth it for a cosmetic fix without a test install and a migration path.

**L-7 (filename-based duplicate detection)** — the ID collision is fixed, but
changing what counts as a duplicate alters import behaviour users may rely on.
That is a product decision, not a bug fix.

**I-3 (decommission Firebase)** — requires console access; only the project
owner can do it.

**`CODE_OF_CONDUCT.md`** — worth adding, but it should be a choice the
maintainer makes rather than a file dropped in by a tool.

---

## 7. Appendix — changes made in this pass

The open-source conversion that preceded this audit, for the record:

**Removed:** `ActivateLicense.tsx`, `electron/firebaseLicense.ts`, the `admin/`
licence control panel, `firestore.rules`, `firebase.json`, `.firebaserc`, `.env`,
and the `firebase` dependency. In the main process: the Firestore check, the
14-day offline grace cache, the 4-hour revocation re-check, and device-ID
tracking. In the bridge: four licence IPC channels. In the local database:
`licenseKey`, `licenseCache`, `deviceId`.

**Added:** a "free and open source" row in Preferences linking to the source and
donation page, and the `setWindowOpenHandler` / `will-navigate` guard those first
external links required.

**Rewritten:** the project site (`docs/`) — pricing tiers and licence-purchase
instructions replaced with a donation section (bKash, Nagad, bank transfer) and
an FAQ; the README; and the release notes and social copy.

**Net effect on the runtime:** the application now makes exactly one network
request — the GitHub update check. It has no accounts, no keys, and no server
dependency of any kind.

---

*Findings were verified by reading the code at the cited lines and, where a claim
was measurable (strict-mode cost, `electron/` type-check coverage, secret history,
dependency advisories and the safety of their fixes), by running the check rather
than estimating it.*

*The audit was written first and the fixes applied second, against the findings as
written. Section 6 records what was done; the four deferrals there are stated with
their reasoning rather than quietly dropped.*
