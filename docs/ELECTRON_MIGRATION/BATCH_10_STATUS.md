# Batch 10 — Cutover status (packaging verified)

Live notes on the Electron packaging + run verification. Updated as work lands.

## ✅ Verified working (in this cloud container, headless via xvfb)

- **The Electron app boots.** `vite build` produces `dist/` (renderer),
  `dist-electron/main.js` and `dist-electron/preload.mjs`. Launching the dev
  bundle loads the React renderer with no crash.
- **The IPC bridge works end to end.** A real round-trip through
  `window.nv.invoke` → preload → `ipcMain` → registry → `AppState` → TS core →
  disk succeeded: `app_info`, `tasks_create`, `tasks_list` returned correct data
  against a real vault.
- **The packaged app runs.** `electron-builder --dir` produces
  `release/linux-unpacked/notevault-ui`; launched under xvfb it loads the
  renderer and its startup API calls (e.g. `home_overview`) resolve with **no
  "Método desconocido" and no handler errors**.

## Bugs found by actually running it (fixed)

1. **`__dirname is not defined`** — vite bundles `electron/main` as an ES
   module, so `__dirname` was undefined and the window never loaded. Fixed by
   deriving it from `import.meta.url`. (commit on main)
2. **Stale-bundle gotcha** — `electron-builder --dir` packages whatever is in
   `dist-electron/` *without* rebuilding. Always run `npm run build` (or the
   `electron:build` script, which does) before packaging, or the app ships an
   out-of-date registry.

## Packaging config

`frontend/package.json` `build` field: `appId com.notevault.app`,
`productName NoteVault`, win target `nsis`, output `release/`. Added `author`
and `repository` to silence electron-builder warnings.

- **Windows `.exe`:** `cd frontend && npm run electron:build` (runs typecheck +
  vite build + electron-builder). Produces the NSIS installer in
  `frontend/release/`. Must run on Windows (or Linux + wine); this container
  builds the Linux target only.
- **App icon:** currently the default Electron icon. For a custom one, drop a
  **256×256** `frontend/build/icon.ico` (NSIS rejects smaller). The repo's
  `assets/notevault.ico` is only 16×16, so it is intentionally not wired up yet.

## Remaining before full cutover

1. Finish the remaining API modules (Antigravity + Claude, in progress).
2. Wire the enforced WEB browser window as a second Electron BrowserWindow
   (currently `web_open` falls back to the system browser).
3. Once every module is ported and green, delete the Python app
   (`notevault_app/`, `run_web.py`, `run_app.py`, PyInstaller specs) and update
   `docs/WEB_UI.md`.
4. Build and smoke-test the Windows `.exe` on the user's machine.
