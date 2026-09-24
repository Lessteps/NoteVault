# BATCH 9 — API layer + IPC wiring (makes the app work end to end)

> Do this after Batches 1–8 are green. This is the batch that connects the ported
> core to the renderer. Read `00_MASTER_HANDOFF.md` §3–4 again first.
> Everything here lands under `frontend/src/api/`.

The Python side is `notevault_app/webapp/`. `NoteVaultApi` (in `api.py`) is one
class built from mixins (`webapp/modules/*.py`), holding state (`_root`, `_vault`,
`_service`, `_window`, `_unsaved`, per-vault managers) and calling the core. In
TypeScript there are no mixins: **each mixin method becomes a plain exported
function** that reads/writes a shared `AppState`, and a single `registry` maps the
method name the renderer calls (snake_case) to that function.

## Step 1 — AppState (port of api.py's state + helpers)

Create **`src/api/appState.ts`**:
- A module-singleton `state` with: `root: string`, `vault: VaultManager`,
  `service: NotesService`, `window: BrowserWindow | null`, `unsaved: number`,
  `closeOk: boolean`.
- Helpers ported from `api.py`: `open(vaultPath)`, `rel(path)`,
  `resolve(rel, {mustExist, allowRoot})` (the vault-confinement guard — port it
  **exactly**, it is security-critical), `entry(item)`.
- `setWindow(win)` — called by `electron/main.ts` after `createWindow()` so
  native methods (dialogs, close) can reach the window.
- Drop `_lock` (single-threaded). Keep every validation and error message.

Add to `electron/main.ts` after creating the window:
`import { setWindow } from "../src/api/appState"; setWindow(win);` and initialise
the vault on `app.whenReady` (`open(getActiveVaultPath())`).

## Step 2 — the Managers bundle (context.py)

Create **`src/api/context.ts`**: `getManagers()` returns the per-vault bundle
(HabitManager, ExerciseManager, TaskManager, ProjectManager, AreaManager,
GoalManager, FinanceManager, ScheduleManager with the Goal/Project/Finance
calendar sources registered). Rebuild + cache when `state.root` changes; `fresh()`
clears in-memory caches. Mirror `context.py` exactly.

## Step 3 — port each module

For each `webapp/modules/<m>.py` → `src/api/<m>.ts`: every `def foo(self, ...)`
becomes `export function foo(...)`; `self._x` → `state.x` / helpers / managers.
Keep the exact method names, argument order, return shapes, validation and Spanish
error messages. Files (see `02_MODULE_MAP.md` for the table):
`common`, `files`, `notesExtras`, `tasks`, `habits`, `calendar`, `projects`,
`goals`, `finance`, `exercise`, `home`, `vaults`, `assistant`, `canvas`,
`practice`, `ladder`, `study`, `web`, `englishPlayer`, plus `media` (from
`webapp/media.py`) and `notify` (from `webapp/notify.py`).

### Native / OS methods — replace pywebview with Electron

Port these with Electron APIs (import from `electron` in the main process):

| Python (pywebview) | Electron replacement |
|---|---|
| `window.create_file_dialog(OPEN_DIALOG, ...)` | `dialog.showOpenDialog(win, { filters, properties })` |
| save dialog (`save_text_as`) | `dialog.showSaveDialog(win, {...})` |
| `open_with_system(path)` / reveal | `shell.openPath(path)` / `shell.showItemInFolder(path)` |
| `open_external(url)` | `shell.openExternal(url)` (http/https/mailto only — keep the guard) |
| `close_window` / `_unsaved` | `state.window?.close()`; keep the unsaved-count gate |
| WEB browser window (`web.py`) | a second `BrowserWindow` **without** the `nv` preload (no bridge), with the rule-enforcing monitor ported from `BrowserSession` |
| exercise/English media server (`media.py`) | a Node `http` server on 127.0.0.1 with random tokens + Range (port `_Handler` faithfully) |
| task reminders (`notify.py`) | already Node-shaped (`child_process`); port as-is |

Each affected function is small; keep its behaviour and its confinement checks.

## Step 4 — the registry (the IPC surface)

Replace the stub **`src/api/registry.ts`** with the real map. Its keys are the
**exact method-name strings the renderer calls** (snake_case), values are the
ported functions:
```ts
import * as tasks from "./tasks";
import * as habits from "./habits";
// ...import every module...
export const registry: Record<string, (...args: unknown[]) => unknown> = {
  app_info: appInfo, stats, set_theme: setTheme, open_external: openExternal,
  // ...tasks_list: tasks.tasksList, habits_day: habits.habitsDay, ...
};
```
**Verification (do this):** every method name used in `src/lib/bridge.ts` (grep
for `call<...>("<name>"` and `invoke("<name>"`) must be a key in `registry`.
Write a tiny test `src/api/registry.test.ts` that imports the list of names from
bridge.ts (or a hardcoded list you extract) and asserts each is in `registry` —
this catches every missing wire at once.

## Step 5 — port ALL the API tests (the acceptance suite)

Port every `test_webapp_*.py` → `src/api/<m>.test.ts`. These call the API
functions the same way the Python tests call `NoteVaultApi` methods, against a
temp vault. Keep **every** assertion, especially the security/confinement ones
(`../`, absolute paths, `.trash`, symlinks, YAML injection, opaque media ids,
grade-request id checks). List:
`test_webapp_api, tasks, habits, calendar, projects, goals, finance, exercise,
vaults, assistant, canvas, practice, ladder, study, notes_extras, web,
english_player, notify`.

For AI calls, mock `send_chat` (vitest `vi.spyOn(aiClient, "sendChat")`), exactly
as the Python tests mock `notevault_app.core.ai_client.send_chat`.

## Acceptance
```
npm run typecheck      # clean
npx vitest run         # ALL green, including every ported test_webapp_* and registry.test.ts
npm run electron:dev   # open the app and exercise EACH module by hand:
```
Notas (open/edit/save, search, graph, properties, assistant), Tareas, Hábitos,
Calendario, Proyectos, Metas, Finanzas, Ejercicio (video), Vista General, Canvas,
Práctica + Escalera (mock or real AI), Estudio, Mapa conceptual, WEB (browser
window + rules), Reproductor de inglés, vista dividida, paleta de comandos.

Commit per module (`port(api): <module>`), push. When every module works end to
end, proceed to `BATCH_10_CUTOVER.md`.
