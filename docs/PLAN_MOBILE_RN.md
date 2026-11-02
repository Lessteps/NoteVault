# Plan: NoteVault Mobile (React Native, Android first, then iPhone)

Status: **Phase 0 done** (2026-11-02), Phase 1 next. Repository: [`Lessteps/notevault-mobile`](https://github.com/Lessteps/notevault-mobile) (private for now).
Decisions: rewrite from scratch, broad feature parity, React Native + Expo, the vault is shared as a plain folder (including `.notevault/`),
**Android first, iPhone next**, **English by default with Spanish as an option**.

## 1. Context

- The previous app was Flutter/Android, written against the old Python desktop. It is preserved under the tag `flutter-legacy`
  of the mobile repository; `main` now holds the React Native app (history kept, nothing force-pushed).
- The only contract between desktop and mobile is the file format: [`VAULT_FORMAT.md`](VAULT_FORMAT.md). **The desktop wins**:
  a format change is made on the desktop first, then copied to mobile.
- Inherited rules that still apply: the interface is English by default with Spanish selectable; writers must produce byte-identical files;
  never autosave a note that was re-serialized and lost content; never overwrite a file another device changed.

## 2. Architecture (as built)

- **Expo SDK 58 (development build, not Expo Go) + React Native 0.88 + strict TypeScript.** Expo Router for navigation.
  Expo Go cannot be used: the vault folder picker needs a development build.
- **Vault access:** the person picks the folder once with `Directory.pickDirectoryAsync()` (`expo-file-system`). On Android the OS keeps the
  permission across restarts (`takePersistableUriPermission`); the app saves the folder URI and re-opens it on start. If the permission is
  gone, it asks to choose again. Sync between PC and phone is external (Syncthing, Drive, …); the app does not sync.
- **`VaultFS`** (`src/vault-fs`) is the only platform-dependent seam: `list`, `stat`, `readText`, `writeText`, `mkdirp`, `remove`, `rename`.
  - `ExpoVaultFS` walks `list()` from the picked root because SAF URIs are opaque (child URIs cannot be built by joining names). Folder
    listings are cached; `list()` always refreshes its folder.
  - `MemoryVaultFS` is the fake every test uses.
  - `safeWrite` refuses to overwrite a file whose modification time changed since it was read (`VaultConflictError`), writes a temp file
    (`*.nv-tmp`, hidden from the browser), reads it back, and swaps it in (rename where the platform can replace, otherwise in-place overwrite).
- **`vault-core`** (`src/vault-core`): the format layer. `text.ts`, `frontmatter.ts` and `format.ts` are **copied byte for byte** from
  `frontend/src/core/` (`text.ts`, `frontmatter.ts`, `vaultFormat.ts`). `npm run conformance` (run in CI) compares them with the desktop
  `main` and fails if they drift. Extracting a shared package is deferred until a second consumer needs it.
- **Layers:** `vault-core` → `VaultFS` → stores (zustand) → screens.
- **Internationalization:** English is the default for everyone; Spanish is chosen in Settings. A test enforces that both dictionaries have the
  same keys and placeholders.
- **Performance:** `.notevault/ejercicio/` weighs ~73 MB (the rest < 3 MB). Index on demand; never load it at startup. Consider excluding it
  from mobile sync if the medium is slow.
- **UI:** reproduce the desktop visual language later (square progress blocks, square empty checkboxes, accent top borders; see `AI_HANDBOOK.md`).
  Bottom tabs + a stack per module arrive with Phase 1.
- **Local notifications** for habits, calendar and reminders (`expo-notifications`, exact alarms) — Phase 1.
- **Not committed to the repo:** `android/` and `ios/` are generated (`expo prebuild` / EAS).

## 3. Phases

### Phase 0 — Foundations ✅ (2026-11-02)
Expo + strict TS + lint + Jest + CI; `VaultFS` over SAF/folders; folder picker with persisted permission; `vault-core` with conformance
check; notes browser and Markdown reader; English/Spanish; Settings (language, vault, support, about). 62 tests, typecheck, lint and the
Android JS bundle pass in CI. **Not yet run on a real phone** (no Android SDK on the development machine): the next step is a development
build via EAS or a machine with the SDK, to verify the picker and SAF on a real device.

### Phase 1 — Day to day
Notes (reading with Markdown ✅, then editing with Edit mode identical to Reading, using `safeWrite`), tasks with recurrence, habits,
calendar, quick capture, trash, notifications. Wiki-link navigation and note search.

### Phase 2 — Management
Areas, goals (with sub-goals and progress), Jira-like projects, finances, exercise, nutrition.

### Phase 3 — Learning
Mentor (area plan, agenda, “Start today”, session records), study and practice (attempts, errors, exams), web (bookmarks) and canvas (reading first).

### Phase 4 — iPhone
The code is already cross-platform. Needs: iOS folder-permission check on a real device (security-scoped access), an Apple Developer account,
and a Mac or EAS for builds. See `Mentor/Ruta Apps Multiplataforma` in the study vault for the learning plan.

Exit criterion of each phase: conformance against desktop fixtures passes and it was tried on a real phone with a copy of the vault.

## 4. Risks

| Risk | Mitigation |
|---|---|
| SAF is slow and has an awkward API (no real paths) | `VaultFS` isolates it; folder listings cached; test on a real device early (Phase 0 exit) |
| Sync conflicts (PC and phone write at once) | modification-time check, reload and warn; never overwrite blindly (`safeWrite`) |
| Format drift between desktop and mobile | copied `vault-core` + `npm run conformance` in CI |
| `.notevault/ejercicio/` is 73 MB | lazy loading; option to exclude it from sync |
| Broad parity is a lot of work | phases with verifiable exits; Phase 1 is already useful on its own |
| Expo changes every SDK | pin versions, read release notes before upgrading, `AGENTS.md` tells assistants to read the versioned docs |
| No Mac for iOS | EAS Build / GitHub Actions macOS runners; iPhone is Phase 4 |

## 5. Open questions

- Sync tool to recommend (Syncthing, Drive, other). It shapes conflict handling.
- Canvas and Mentor: editing or read-only in mobile v1?
- Publishing: GitHub Releases APK first; Google Play (one-time fee) when funds allow.
