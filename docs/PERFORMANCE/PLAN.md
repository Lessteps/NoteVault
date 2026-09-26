# NoteVault — Performance & Settings work package (for Antigravity)

Paste this whole file to Antigravity as the task. Working dir: `frontend/`.
Read `docs/ELECTRON_MIGRATION/00_MASTER_HANDOFF.md` and `01_CONVENTIONS.md` first
for the house style. UI text is **Spanish**; code, comments, docs, commits are
**English**. Never advance with a red test or a type error (`npm run typecheck`
+ `npx vitest run` from `frontend/` after every file). Commit + push after each
phase to branch `web-migration`.

## Why this exists (the real problem)

On the user's machine (physical console session, NVIDIA RTX 3050 + AMD Radeon)
Chromium/Electron cannot initialise **any** GPU backend: `getGPUFeatureStatus()`
reports `gpu_compositing: disabled_software`, `2d_canvas: disabled_software`,
`rasterization: disabled_software`; ANGLE is `(gl=none, angle=none)`; every GPU
device is `active:false`; DX12 and Vulkan report "Not supported". So **the entire
UI is rasterised and composited on the CPU**. That is why loading tabs, resizing
to fill the window, and switching notes feel slow — it is not the React code
(the store, the CodeMirror editor and the markdown render are already memoised
and efficient).

We solve this on two tracks. Both ship.

1. **Try to enable hardware acceleration** from inside the app (GPU switches,
   selectable ANGLE backend, a rendering mode). Forcing `ignore-gpu-blocklist`
   and `use-angle=d3d11|gl|d3d9` did **not** activate the GPU in testing, so
   treat this track as best-effort: attempt it, expose the real GPU status to
   the user, and let them pick a backend — but **do not assume it will work**.
2. **Make software rendering cheap** (the guaranteed win): a "lite" performance
   mode that strips the CSS effects that are expensive without a GPU, plus list
   virtualisation and `content-visibility`. This is what actually makes the app
   fast on this machine.

Everything is controlled from a new **Settings panel** ("Configuración").

## Fixed facts about the codebase (do not rediscover)

- Config persistence: `frontend/src/api/appConfig.ts` → `AppConfig`, stored in
  `~/.notevault/settings.json`. Follow the existing `get_theme`/`set_theme`
  pattern. `appConfig.ts` is Node-only and is imported by the Electron main
  process, so `electron/main.ts` can read settings directly at startup.
- Electron main: `frontend/electron/main.ts`. GPU command-line switches MUST be
  appended **before** `app.whenReady()`.
- App-level IPC methods: `frontend/src/api/modules/app.ts` (`appApi`), registered
  in `frontend/src/api/registry.ts`. The renderer calls them through
  `frontend/src/lib/bridge.ts` (add typed wrappers there).
- Icon rail (left, module buttons + theme toggle at the bottom):
  `frontend/src/components/Shell.tsx` → `IconRail`. Add the settings (gear)
  button next to the theme toggle.
- Dialogs use the shared host in `frontend/src/components/ui` (`DialogHost`,
  and the `openMenu`/dialog helpers). Follow an existing dialog such as
  `frontend/src/components/notes/PropertiesDialog.tsx` for structure.
- Theme is applied by setting `document.documentElement.dataset.theme`. Use the
  same mechanism for the performance mode: `document.documentElement.dataset.perf`.
- Global styles: `frontend/src/styles.css` (Tailwind v4 + CSS variables on
  `:root`). This is where the expensive effects live.

---

## Phase 0 — Rendering config + GPU switches (main process)

Goal: the app applies GPU/rendering switches at launch based on a persisted
setting, and can report the real GPU status.

1. In `appConfig.ts`, add a `rendering` settings group with getters/setters,
   defaulting sensibly:
   ```ts
   // shape stored under settings.rendering
   // { mode: "auto" | "hardware" | "software",
   //   angle: "default" | "d3d11" | "d3d11on12" | "gl" | "d3d9" | "vulkan",
   //   liteEffects: boolean,   // strip expensive CSS
   //   reduceMotion: boolean } // disable non-essential animation
   get_rendering(): Rendering            // returns the group merged over defaults
   set_rendering(patch: Partial<Rendering>): Rendering
   ```
   Defaults: `{ mode: "auto", angle: "default", liteEffects: false, reduceMotion: false }`.
   Add a unit test `appConfig`-style if one exists for settings; otherwise a
   small `rendering` round-trip test in a new `*.test.ts` under `src/api`.

2. In `electron/main.ts`, **before** `app.whenReady()`, read
   `AppConfig.get_rendering()` and apply switches:
   - `mode === "software"` → `app.disableHardwareAcceleration()`.
   - otherwise (auto/hardware) → append:
     `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`;
     and if `angle !== "default"` → `appendSwitch("use-angle", angle)`;
     for `angle === "vulkan"` also `appendSwitch("enable-features", "Vulkan")`.
   - Wrap each in try/catch; never let a bad setting stop startup.
   Keep it small and readable; add a one-line English comment explaining why.

3. Add a main-side helper to read GPU status (used by the IPC method in Phase 1):
   `async function gpuStatus() { return { features: app.getGPUFeatureStatus(),
   info: await app.getGPUInfo("basic") }; }` — return the feature-status map and
   the active GPU device string(s).

Acceptance: `npm run typecheck` clean; app still launches; changing
`settings.json` `rendering.mode` to `software` and relaunching disables HW accel
(observable: `getGPUFeatureStatus` unchanged is fine — just no crash).
Commit: `feat(perf): rendering settings and GPU switches at launch`.

## Phase 1 — IPC + bridge

1. In `api/modules/app.ts` (`appApi`), add:
   - `get_rendering()` → `AppConfig.get_rendering()`.
   - `set_rendering(patch)` → validate/clamp fields (only the allowed enum
     values; booleans coerced), persist, return the merged result.
   - `gpu_status()` → call the Phase 0 main helper (lazy `require("electron")`,
     as `open_external` already does, so the module stays unit-testable) and
     return `{ features, active: string[], angle: string }`. If Electron is not
     present (unit tests), return `{ features: {}, active: [], angle: "" }`.
   - `relaunch_app()` → `app.relaunch(); app.exit(0);` (lazy require). Used to
     apply GPU-mode changes.
2. Register these in `api/registry.ts` next to the other app methods.
3. In `lib/bridge.ts`, add typed wrappers: `getRendering()`, `setRendering(patch)`,
   `gpuStatus()`, `relaunchApp()`.
4. Add `app_info` (or a new call) exposure of the current rendering settings if
   convenient, so the renderer can hydrate without an extra round-trip.

Acceptance: typecheck + vitest green (add a small test for `set_rendering`
clamping invalid enums to defaults).
Commit: `feat(perf): IPC for rendering settings, GPU status and relaunch`.

## Phase 2 — Settings panel ("Configuración")

Goal: a dialog reachable from a gear button in the icon rail, with a
**Rendimiento** section.

1. Add a gear button in `Shell.tsx` `IconRail`, directly above/below the theme
   toggle (`Settings` icon from `lucide-react`). It opens a new settings dialog
   (a zustand `open` flag or the shared dialog host — match how other dialogs are
   opened).
2. New component `frontend/src/components/settings/SettingsDialog.tsx`:
   - **Rendimiento** section:
     - "Modo de renderizado": segmented control Auto / Hardware / Software.
     - "Backend de gráficos (ANGLE)": dropdown (Automático, Direct3D 11,
       D3D11on12, OpenGL, Direct3D 9, Vulkan) — enabled only when mode ≠ Software.
     - "Reducir efectos visuales" toggle (`liteEffects`).
     - "Reducir animaciones" toggle (`reduceMotion`).
     - **Estado de GPU**: read `gpuStatus()` and show, in Spanish, whether
       hardware acceleration is active or the app is running on CPU, plus the
       active GPU name (or "Ninguna — renderizado por software"). Give a short
       hint when software: "La app está usando la CPU. Activa 'Reducir efectos
       visuales' para más fluidez."
   - Changing `mode` or `angle` requires a restart: show a "Reiniciar para
     aplicar" button that calls `relaunchApp()`. `liteEffects`/`reduceMotion`
     apply live (no restart).
   - Persist every change immediately via `setRendering`.
   - **Apariencia** section: move the existing theme toggle here too (keep the
     rail button as a shortcut).
3. On app startup (in `App.tsx` `init` or a small effect), read the rendering
   settings and set `document.documentElement.dataset.perf` to `"lite"` when
   `liteEffects`, and toggle a `data-motion="reduced"` attribute for
   `reduceMotion`. Update these attributes immediately when the toggles change.

Acceptance: dialog opens, toggles persist across relaunch, GPU status renders,
"Reiniciar" relaunches. typecheck + vitest green.
Commit: `feat(settings): configuración dialog with performance controls`.

## Phase 3 — "Lite" performance mode (the real speedup)

Goal: under `html[data-perf="lite"]`, remove the CSS that is expensive without a
GPU. Audit `styles.css` and component classes for these and neutralise them in
lite mode:

- `backdrop-filter` / `filter: blur(...)` → remove (replace glass panels with a
  solid `--nv-panel` background).
- Large/multi-layer `box-shadow` → replace with a 1px border or a single subtle
  shadow.
- `color-mix(...)` used at paint time in hot surfaces (e.g. the CodeMirror
  active-line `color-mix` in `SourceEditor.tsx` theme, hover states) → precompute
  to a static CSS variable for lite mode.
- Heavy `linear/radial-gradient` backgrounds on large surfaces → flat colour.
- `transition`/`animation` on frequently-repainted elements → disabled under
  `html[data-motion="reduced"]` and under lite mode; also honour
  `@media (prefers-reduced-motion: reduce)`.

Implement with a `:root[data-perf="lite"]` (and `[data-motion="reduced"]`) block
in `styles.css` that overrides the expensive declarations, so nothing is
duplicated in components. Keep the normal (GPU) look untouched when lite is off.

Acceptance: with lite on, a grep/visual check shows no `backdrop-filter`/blur is
painted; the app still looks clean (solid panels, thin borders). typecheck +
vitest green.
Commit: `perf(ui): lite mode strips GPU-expensive effects`.

## Phase 4 — Higher-level rendering optimisations

These help in every mode, most of all on CPU:

1. **Virtualise long lists** so only visible rows mount:
   - `components/notes/FileTree.tsx` (large vaults),
   - search results and `BacklinksBar` lists in `EditorArea.tsx`/Explorer,
   - any table/list that can exceed ~200 rows.
   Use a tiny windowing approach (measure row height, render the visible slice +
   a small overscan on scroll). Do NOT add a heavy dependency; a ~40-line
   windowing hook is enough. Keep behaviour identical (keyboard nav, selection).
2. **`content-visibility: auto`** on offscreen blocks of the reading view
   (`ReadView` article children / long notes) with a sensible
   `contain-intrinsic-size`, so the browser skips layout/paint of offscreen
   content. Verify scroll-to-line and reveal still work.
3. Confirm CodeMirror is using its default viewport rendering (it is) — do not
   change it; just verify large files scroll smoothly in lite mode.

Acceptance: opening a large vault and a long note is visibly smoother; all
existing tests green; scroll-to-line/backlink reveal still work.
Commit: `perf(ui): virtualise long lists and skip offscreen paint`.

## Phase 5 — Verify & document

1. `npm run typecheck` clean, `npx vitest run` all green.
2. `npm run electron:build`; launch `release/win-unpacked/NoteVault.exe`; open
   Settings → confirm GPU status shows, toggles work, "Reiniciar" applies mode.
3. Update `docs/WEB_UI.md` (or add `docs/PERFORMANCE/README.md`) with: what the
   rendering modes do, that this machine runs on CPU and why lite mode helps, and
   how to change the ANGLE backend.
4. Append a short line per phase to `docs/PERFORMANCE/PROGRESS.md` (create it):
   phase, commit hash, tests green.
Commit: `docs(perf): document rendering modes and settings`.

## Guardrails

- Behaviour must not change except where a setting asks for it. Default settings
  keep today's look (lite off, auto GPU).
- Never commit with a red test or a type error. Stay on `web-migration`; never
  touch `main`; never force-push or reset.
- Be honest in the GPU-status UI: if hardware acceleration is unavailable, say
  so plainly and point the user to lite mode — do not claim the GPU is active
  when `getGPUFeatureStatus()` says software.
