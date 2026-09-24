# Electron + TypeScript migration — MASTER HANDOFF

**Read this whole folder before touching code.** These files are written to be
executed by an AI with a smaller reasoning budget (Antigravity). Every task is
concrete: exact source file, exact destination file, exact acceptance test. Do
the batches **in order**. Do **not** invent architecture — it is already fixed
here and demonstrated by the reference module. When something is ambiguous, copy
the reference module's pattern; do not improvise.

- Project root (Windows): `C:\PROGRAMMING\PROJECTS\NoteVault`
- UI text = **Spanish**. Code, comments, commit messages, docs = **English**.
- One rule above all: **behaviour must not change.** This is a *translation*,
  Python → TypeScript, of logic that already works and is already tested. The
  files on disk a NoteVault vault produces must stay **byte-identical**
  (see `03_VAULT_CONTRACT.md`).

---

## 1. Why this exists (the goal)

NoteVault's UI is already HTML/CSS/TypeScript (React + Vite + Tailwind, in
`frontend/`). Today it runs in a **pywebview** window and talks to a **Python**
backend (`notevault_app/core` + `notevault_app/webapp`). We are moving to a
**pure-TypeScript Electron app**:

- **Electron** replaces pywebview as the desktop shell.
- The Python **core is ported to TypeScript** and runs in Electron's **main
  process** (Node). Python is deleted at the end.
- The React **renderer is reused as-is** — only its bridge changes transport.

End state: one language (TS), one runtime (Node/Electron), one build
(`electron-builder`), no Python.

## 2. Target architecture (FIXED — do not change)

Everything lives in `frontend/` (it becomes the whole app).

```
frontend/
  electron/
    main.ts        Electron main process: window, lifecycle, navigation guard,
                   registers the IPC handler. Runs in Node.
    preload.ts     contextBridge: exposes window.nv.invoke(method, args).
    ipc.ts         ipcMain.handle('nv', ...) → dispatches to the API registry.
    tsconfig.json  compiles electron/ + src/core + src/api for Node (CommonJS).
  src/
    core/          THE PORTED PYTHON CORE. Node-only (uses node:fs, node:path).
                   The renderer must NEVER import from here.
    api/           The ported webapp/modules — thin functions over core/ that
                   the IPC handler calls. Holds app state (active vault, managers).
    lib/           Renderer code (markdown, canvas geometry, …). Unchanged.
    components/    React UI. Unchanged.
    store/         Zustand stores. Unchanged.
    lib/bridge.ts  Renderer→backend. Gains an "electron" transport (see §4).
```

Rules:
- `src/core/**` and `src/api/**` run in the **main process** (Node). They may use
  `node:fs`, `node:path`, `node:crypto`, etc.
- `src/components/**`, `src/store/**`, `src/lib/**` run in the **renderer**
  (browser). They may **not** import `node:*` or `src/core`/`src/api`.
- Pure **types** shared by both go in `src/core/types.ts` (types only, no fs, no
  runtime code) and may be imported anywhere.

## 3. The IPC bridge (how renderer reaches the core)

This mirrors the current pywebview bridge one-to-one, so `bridge.ts` barely
changes.

- **Renderer** calls a method by name with positional args, exactly like today:
  `window.nv.invoke("habits_day", "2026-09-24")`.
- **preload.ts** forwards it: `ipcRenderer.invoke("nv", method, args)`.
- **main/ipc.ts** has a single handler:
  ```ts
  ipcMain.handle("nv", async (_e, method: string, args: unknown[]) => {
    const fn = registry[method];
    if (!fn) throw new Error(`Método desconocido: ${method}`);
    return await fn(...args);   // ApiError → rejects; renderer sees the message
  });
  ```
- `registry` is the object of all public API functions (the ported
  `NoteVaultApi` methods). See `src/api/registry.ts` (created by the API batch).

`ApiError` (see `src/core/errors.ts`, already provided) is thrown for expected,
user-facing failures; its message reaches the renderer as the rejection message,
exactly like the Python `ApiError` does today.

## 4. bridge.ts transport (already wired — see reference commit)

`src/lib/bridge.ts` gains a third transport, `electron`, chosen when
`window.nv` exists. The pywebview and http transports stay for now so the app
keeps running during the migration. This change is **already done** in the
reference commit — do not touch `bridge.ts` further unless a method name changed.

## 5. Workflow — the loop you repeat for every batch

For each batch in `02_MODULE_MAP.md`, in order:

1. Read the batch prompt in `prompts/BATCH_<n>_*.md`. It lists the exact Python
   source files and their TypeScript destinations.
2. For each file: port it following `01_CONVENTIONS.md`. Keep function names and
   behaviour identical. Comments in English, short, matching the source's intent.
3. Port that module's **pytest** file to **vitest** (`*.test.ts`) — same test
   names, same assertions. See `01_CONVENTIONS.md` §Tests.
4. Run the checks (from `frontend/`):
   ```
   npm run typecheck        # tsc, must be clean
   npx vitest run           # all tests green
   ```
5. If the module writes vault files, run the **golden-file** check in
   `03_VAULT_CONTRACT.md` for it (byte-identical to Python output).
6. Commit: `git commit -m "port(core): <module> to TypeScript"`.
   Branch: `session/awesome-gates-q76geq` (the existing PR branch), or a child
   branch `electron-migration` if told to. Push after each batch.

**Never move to the next batch with red tests or a type error.** A batch depends
on the ones before it; if the foundation is wrong everything downstream breaks.

## 6. What NOT to port (drop these)

These are Qt-only or dead in the web app. Do not port them:

- `core/qt_markdown.py` — markdown is already rendered in TS (`src/lib/markdown.ts`).
- `core/web_runtime.py` — Qt WebEngine packaging; Electron replaces it.
- `core/notifier.py` — Qt tray notifications; the web path already exists in
  `webapp/notify.py`, which **is** ported (batch: API/system).
- Anything importing `PySide6` (only the three files above do).
- `run_app.py`, the whole `notevault_app/ui/` Qt app, and the PyInstaller specs
  (`NoteVault.spec`, `web_runtime.spec`) — deleted in the final batch.

## 7. Definition of done

- Every module in `02_MODULE_MAP.md` (except the drop list) is ported and its
  tests are green in vitest.
- `npm run typecheck` clean; `npx vitest run` all green.
- All golden-file checks pass (`03_VAULT_CONTRACT.md`).
- `npm run electron:dev` opens the app; every module works end to end.
- `npm run electron:build` produces `NoteVault.exe` (electron-builder).
- `notevault_app/` (Python) and the PyInstaller specs are deleted; the repo has
  no Python left except, if any, throwaway scripts under `tools/` used to
  generate golden fixtures.

## 8. Order of batches (see 02 for file lists)

0. **Scaffold** — Electron shell + build config + bridge transport. *(DONE in the
   reference commit; verify it runs.)*
1. **Foundations** — errors, store, vaultFormat, frontmatter, recurrence,
   fileKinds, paths. *(store/vaultFormat/frontmatter DONE as the reference — copy
   their style for the rest.)*
2. **Vault + notes** — vaultManager, vaultIndex, notesService, attachments,
   markdownUtils, tagIndex, templates, dailyNotes, layouts.
3. **Simple managers** — taskManager, habitManager, areaManager.
4. **Bigger managers** — financeManager, goalManager, projectManager,
   scheduleManager (+ scheduleFormat, recurrence already done), exerciseManager,
   workspaceManager, knowledgeGraph, moduleAttachments.
5. **Practice subsystem** — everything under `core/practice/**` +
   `study_*` managers + math_tools + code_runner.
6. **English** — `core/english/**` + english grammar/vocabulary managers +
   market_skill_manager.
7. **Canvas** — canvasFormat, canvasBuilder, canvasMethodology,
   deliverableCanvas.
8. **AI + web** — aiClient, webStore.
9. **API layer** — port `webapp/modules/**`, `webapp/api.py`, `webapp/media.py`,
   `webapp/notify.py` → `src/api/**` + `src/api/registry.ts`; wire IPC.
10. **Cutover** — electron-builder config, remove pywebview/http transports if
    desired, delete Python, rebuild `NoteVault.exe`, update `docs/WEB_UI.md`.

See `01_CONVENTIONS.md` (how), `02_MODULE_MAP.md` (what → where),
`03_VAULT_CONTRACT.md` (the byte-exact contract), and the reference module in
`src/core/store.ts` + `src/core/store.test.ts` (the pattern to copy).
