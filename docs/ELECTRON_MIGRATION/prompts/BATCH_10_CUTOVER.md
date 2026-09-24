# BATCH 10 — Cutover: build the .exe, delete Python, finish

> Do this only when Batches 0–9 are green and the app works end to end in
> `npm run electron:dev`. This batch removes Python and produces the shippable
> Electron app.

## Step 1 — production build + installer

```
cd frontend
npm run electron:build      # tsc -b + vite build + electron-builder
```
- Produces `frontend/release/NoteVault Setup <version>.exe` (NSIS) and an
  unpacked app. Launch the built app and smoke-test the main modules.
- Add an app icon: put `build/icon.ico` and reference it in the electron-builder
  `win` config (`"icon": "build/icon.ico"`). Reuse the existing brand icon.
- If `NoteVault.exe` (a single portable exe) is wanted instead of an installer,
  set `"win": { "target": "portable" }`; the output is `release/NoteVault <ver>.exe`.

## Step 2 — trim the bridge (optional)

Once Electron is the only shell, you may remove the `pywebview` and `http`
transports from `src/lib/bridge.ts`, leaving only `electron`. Keep it if you still
want the browser-based dev server; otherwise delete `webapp/devserver.py` usage.
Run `npm run typecheck` + `npx vitest run` after.

## Step 3 — delete Python and Qt

Delete, and confirm the app still builds and runs after each deletion group:
- `notevault_app/` (the whole Python package: `core/`, `webapp/`, `ui/`, `config.py`).
- `run_web.py`, `run_app.py`.
- `NoteVault.spec`, `web_runtime.spec`, `tools/build_web_runtime.py`.
- `requirements*.txt` / `pyproject.toml` / Python-only CI.
- The old `tests/` Python suite (its behaviour now lives in `frontend/src/**/*.test.ts`).
- Keep `tools/gen_golden.py` until every golden test is green, then delete it and
  the `__golden__` fixtures may stay (they are cheap regression guards) or be
  removed — your call.
- The old root `NoteVault.exe` (the Qt build) — delete it; the real build is under
  `frontend/release/`.

Keep `docs/`, `docs/knowledge_base/`, `docs/map_templates/`, `docs/samples/`
(fixtures/reference the TS tests still read).

## Step 4 — docs

- Rewrite `docs/WEB_UI.md`: the app is now **Electron + TypeScript**; replace the
  pywebview run/build instructions with:
  ```
  cd frontend && npm install
  npm run electron:dev      # dev, hot reload
  npm run electron:build    # production build + installer (release/)
  ```
  Keep the migration table (all ✅) and the Security section (update pywebview →
  Electron: contextIsolation on, nodeIntegration off, preload exposes only
  nv.invoke, navigation guard, CSP, media server on 127.0.0.1, WEB window without
  the bridge).
- Update the root `README.md` run instructions.
- Move `docs/ELECTRON_MIGRATION/` to `docs/archive/` (or delete) once done.

## Step 5 — final acceptance

- `npm run typecheck` clean; `npx vitest run` all green.
- `npm run electron:build` produces the installer; the installed app runs and every
  module works against a real vault (test with a copy of
  `docs/knowledge_base/examples`).
- No Python remains in the repo (`git grep -l "import PySide6"` and
  `find . -name "*.py" -not -path "./docs/*"` return nothing meaningful).
- A vault written by the new app is byte-compatible with one written by the old
  Python app (golden tests green).

Commit: `chore(cutover): Electron/TS build, remove Python and Qt`.
Open/refresh the PR describing the new stack. Done.
