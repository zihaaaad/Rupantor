# Rupantor — System Audit

**Audit date:** 8 September 2026
**Revision audited:** `master` @ `24d560f` plus the open-source conversion in this pass
**Auditor:** Claude Opus 5 (automated review, commissioned by Zihad Hasan)
**Scope:** Full repository — Electron main process, preload bridge, React renderer,
native OS integration, build/release pipeline, project site, and documentation.

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

| Area | Verdict |
| --- | --- |
| Electron security model | **Strong** — isolation, CSP, no remote content, external links sandboxed |
| Command injection defence | **Strong** — base64 encoding on every dynamic PowerShell/AppleScript value |
| IPC surface | **Needs work** — three handlers accept arbitrary filesystem paths |
| Correctness | **Fair** — 3 confirmed user-visible bugs, all in the font install/state path |
| Type safety | **Weak** — `strict` off; `electron/` not type-checked at all |
| Automated testing | **Absent** — no test framework, no test files |
| CI coverage | **Weak** — builds on tags only; nothing validates a PR |
| Accessibility | **Fair** — good keyboard/ARIA work on cards; modals lack dialog semantics |
| Open-source readiness | **Good** — MIT, clean README and site; missing contributor scaffolding |

### Findings by severity

| Severity | Count | IDs |
| --- | --- | --- |
| High | 2 | H-1, H-2 |
| Medium | 7 | M-1 … M-7 |
| Low | 8 | L-1 … L-8 |
| Informational | 4 | I-1 … I-4 |

No critical findings. Nothing in this report is being actively exploited or is
losing user data today.

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

**Location:** `.github/workflows/build.yml:64`

`npm install` may resolve newer versions than `package-lock.json` pins, so the
artifact users download is not reproducible from the committed lockfile — and a
compromised or broken transitive release can enter a build with no commit to
show for it.

**Fix:** `npm ci`. It is also faster.

---

#### M-6 — No automated tests of any kind

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

### LOW

---

#### L-1 — `copyToVault` silently falls back to the original path
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
**Location:** `electron/main.ts:150`, `electron/db.ts:31-35`

`save-db-data` is a fire-and-forget `ipcMain.on`. A failed write (disk full,
permissions, file locked) is logged to a console nobody is watching. The user
believes their library is saved; it is not.

**Fix:** promote to `ipcMain.handle`, return the write result, and toast on
failure.

---

#### L-3 — No list virtualization with hundreds of fonts
**Location:** `src/App.tsx:522-580`

Every font in `filteredAndSortedFonts` renders a card with a live preview in its
own family. A typical Windows install enumerates 300–500 families; a designer's
machine can carry far more. All render eagerly on every filter/sort/preview-text
change.

**Fix:** virtualize the grid (`@tanstack/react-virtual` is the light option), or
paginate. Worth measuring before building.

---

#### L-4 — Modals lack dialog semantics and focus management
**Location:** `SettingsModal.tsx:49`, `AdobeScripts.tsx:162`, `App.tsx:604`

The overlays are plain `div`s. No `role="dialog"`, no `aria-modal="true"`, no
focus trap, and focus is not restored to the trigger on close. Escape-to-close
and visible close buttons are implemented, and the font cards and sidebar have
had genuine keyboard/ARIA care — so this is the one gap in an otherwise
respectable accessibility story.

**Fix:** add the roles, trap focus while open, restore focus on close.

---

#### L-5 — Temp PowerShell script is a TOCTOU window
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
**Location:** `electron/main.ts:150`

`saveDbData(key, value)` writes any key the renderer names into the DB JSON. The
read side (`get-db-data`, `main.ts:146`) is properly narrowed to
`{ fonts, collections, scripts }` — the write side is not. Impact dropped
considerably when the license fields were removed; it remains an
unnecessary asymmetry.

**Fix:** validate `key` against the same allowlist the read side uses.

---

#### L-7 — Script duplicate-detection and IDs are filename-based
**Location:** `src/App.tsx:271`, `AdobeScripts.tsx:73`, `:88`

Duplicates are detected by filename alone, so two genuinely different
`cleanup.jsx` files from different projects cannot coexist. IDs are
`` `${file.name}-${Date.now()}` ``, which collide if two files are imported
within the same millisecond (unlikely — the loop awaits a file copy — but free
to eliminate).

**Fix:** `crypto.randomUUID()` for IDs; hash or path for duplicate detection.

---

#### L-8 — Object URL is never revoked
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
| `CONTRIBUTING.md` | **Missing** |
| `CODE_OF_CONDUCT.md` | **Missing** |
| Issue / PR templates | **Missing** |
| `SECURITY.md` (disclosure contact) | **Missing** — matters for an app that writes to the registry |
| CI on pull requests | **Missing** (M-4) |
| Tests a contributor can run | **Missing** (M-6) |

---

## 6. Prioritized remediation plan

Ordered by leverage — what most reduces the chance of a bad release per hour
spent.

**Phase 1 — Close the verification gap (highest leverage)**
1. Add `tsconfig.electron.json` to the build graph; fix the one error. *(H-1)*
2. Turn on `strict` in all three configs. *(M-7 — measured at zero cost for `src/`)*
3. Add `ci.yml` running lint + typecheck + build on PRs, with `npm ci`. *(M-4, M-5)*

Phase 1 is roughly an afternoon and makes every later change safer.

**Phase 2 — Fix what users actually hit**
4. Registry name must include the subfamily, with a migration path. *(M-1)*
5. Toggle state only on confirmed success; unify the two paths. *(M-2)*
6. Add `isSystem` to the font identity key. *(M-3)*
7. Surface DB write failures. *(L-2)*

**Phase 3 — Harden the IPC surface**
8. Extract the vault containment guard; apply to `read-file`, `write-file`, and
   `local://`. *(H-2)*
9. Allowlist `save-db-data` keys. *(L-6)*
10. Switch PowerShell to `-EncodedCommand`. *(L-5)*

**Phase 4 — Sustainability**
11. Vitest, starting with the four pure targets in M-6.
12. `CONTRIBUTING.md`, `SECURITY.md`, issue templates.
13. Decommission the Firebase project. *(I-3)*
14. Dialog semantics and focus management. *(L-4)*
15. Virtualize the font grid once measured. *(L-3)*

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
was measurable (strict-mode cost, `electron/` type-check coverage, secret history),
by running the check rather than estimating it. No fixes from Sections 3 or 6 have
been applied — this pass was scoped to analysis, with the single exception of the
documentation correction noted in I-2.*
