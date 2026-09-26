# NoteVault — Interfaces fixes work package (for Antigravity)

Paste this whole file to Antigravity as the task. Working dir: `frontend/`.
Read `docs/ELECTRON_MIGRATION/01_CONVENTIONS.md` first. UI text **Spanish**;
code/comments/docs/commits **English**. After every file: `npm run typecheck`
clean + `npx vitest run` green (from `frontend/`). Commit + push after each area
to branch `web-migration`. Never touch `main`; never force-push or reset.

Note: another agent may be finishing the `docs/PRACTICE_V2/PLAN.md` package in
parallel on the same branch. Do NOT revert its edits; if you touch a file it also
changed, rebase/merge cleanly and keep both changes.

Six independent areas (A–F). Do them in order but each stands alone.

---

## Area A — Ejercicio (gym) module + Vista General

Files: `frontend/src/components/exercise/ExerciseModule.tsx`,
`frontend/src/components/home/HomeModule.tsx`, `frontend/src/store/player.ts`,
`frontend/src/components/english/EnglishPlayer.tsx` (reference media player),
exercise API in `frontend/src/api/modules/` and `frontend/src/core/` (exercise
manager). "Ejercicio" here is the **fitness routine** module (weight/reps/demo
videos), not study practice.

A1. **Regression: the demo-video player is gone.** Before the migration, clicking
an exercise's **name** opened its video; now the player is missing. In
`ExerciseModule.tsx` there is an `onVideo(ex)` path and `ex.has_video` /
`video_path`, but the player that actually plays the file is not wired.
- Make the exercise **name** (and the existing "Video" button) open a media
  player for `ex.video_path`. Reuse the media surface used by the English player
  (`store/player.ts` / `EnglishPlayer`) or a small `<video>` modal; it must play
  local vault video files. Ensure video playback is allowed (see Area F note on
  webPreferences if a webview is involved — here a plain `<video>` element is
  simplest and safe).
- Acceptance: clicking an exercise with a video opens it and it plays; exercises
  without a video show no control. typecheck + vitest green.

A2. **Vista General → Ejercicio card shows today's exercises with checks.** Today
the card is only a stat tile (`eDone/total`). Make the Ejercicio card list
**today's exercises** with a checkbox each (like the Tareas/Hábitos cards), so the
user checks them off from the overview, and show today's progress as
`hechos/total`. Reuse the existing `Row` + checkbox pattern in `HomeModule.tsx`
and the exercise "done" toggle already in the module.
- Acceptance: the overview lists today's exercises, checking one persists and
  updates the count; typecheck + vitest green.
Commit: `feat(exercise): play demo videos and show today's exercises in the overview`.

## Area B — Notes: right panel collapse + live refresh on internal changes

B1. **The right panel of the Notes module cannot be collapsed.** The header has a
`PanelRight` toggle (`toggleInspector`) but the right panel (Inspector / the
"Estudio · Nota" sub-bar) does not actually hide. Fix the toggle so the right
panel collapses/expands reliably, and add a visible close (×) affordance on the
panel itself. Keep the Estudio sub-bar's own tab behaviour. Files:
`frontend/src/components/notes/EditorArea.tsx` (NoteHeader),
`frontend/src/components/notes/Inspector.tsx`,
`frontend/src/components/notes/NotesModule.tsx`, `frontend/src/store/app.ts`
(`inspectorOpen`/`toggleInspector`).

B2. **Moving a file/folder inside the vault makes it disappear until reload, and
internal edits don't refresh the view.** The user moved the math syllabus into the
`Matemáticas` folder and it stopped being visible. The file tree, the note view
and any open canvas must **update live** on any internal change (create, move,
rename, delete, edit). Files: `frontend/src/core/fileWatcher.ts`,
`frontend/electron/*.ts` (watcher wiring), `frontend/src/store/app.ts`
(`refreshTree`/`pathRenamed`/`pathDeleted`), `frontend/src/components/notes/
FileTree.tsx` / `Explorer.tsx`, canvas store `store/canvas.ts` +
`components/canvas/CanvasView.tsx`.
- Ensure the file watcher emits on move/rename and the tree re-reads; a note or
  canvas whose file changed on disk reloads (respect the existing conflict
  handling for unsaved edits). An open canvas must reflect added/removed nodes
  when its `.canvas` file changes.
- Respect the memory rule: the explorer shows only notes and code scripts (with
  distinct icons, natural sort); module data folders and attachments never appear.
- Acceptance: moving the syllabus into Matemáticas keeps it visible and correctly
  placed without a manual reload; editing a file updates the view. typecheck +
  vitest green.
Commit: `fix(notes): collapsible right panel and live tree/canvas refresh on internal changes`.

## Area C — Math canvas templates redesign

The current math canvas templates are inefficient. Reform the **box (node)
categories** and the rendering. Files: `frontend/src/core/canvas/canvasBuilder.ts`
(+ methodology templates it reads), `frontend/src/components/canvas/CanvasNode.tsx`
(node rendering/sizing), the math **index** canvas generator, and the templates
under `docs/` / `frontend` used to build them.

C1. **New box categories per concept** (drop the old ones):
- **Definición**: short, explanatory-enough, simple, **with visual examples**.
- **Ejemplos**: a dedicated examples box.
- **Contraejemplos + errores comunes**: merge counterexamples with common errors
  into one box.
- **Remove "Intuición"** entirely.
- **Remove the "Práctica" box** from the template — practice now lives in the
  Practice V2 topic system, not on the concept canvas.

C2. **Boxes must show ALL their text.** Nodes must auto-size to fit their full
content (no inner scroll, no shrinking the text to fit). Make `CanvasNode`/the
builder compute node height from the content so every box displays completely.

C3. **The Matemáticas index canvas is unreadable** — boxes are too small for the
amount of text, so you cannot see all the areas/topics. Fix the index generator so
index boxes size to their text and the whole map is legible.

C4. **Review the index coverage.** Check that the Matemáticas index actually covers
all the important areas and topics (start from fundamentals per the syllabus rule);
report gaps in `docs/INTERFACES_V2/PROGRESS.md` and, if trivial, add the missing
index entries. Do not invent deep content — just ensure structural coverage.

Remember the reference-fidelity rule: if the user provided template screenshots,
replicate them element by element and verify visually (grab a canvas render and
compare) before declaring done.
- Acceptance: a concept canvas shows Definición (with visual examples), Ejemplos,
  and Contraejemplos+errores comunes, each fully visible; no Intuición/Práctica
  boxes; the index canvas is legible. typecheck + vitest green.
Commit: `feat(canvas): redesign math concept templates and fix index legibility`.

## Area D — Knowledge graph actually renders

File: `frontend/src/components/notes/GraphPanel.tsx` (draws on a `<canvas>` with a
force `layout()`), `frontend/src/core/knowledgeGraph.ts` (node/edge data). The
graph is implemented but "nothing visible" — almost certainly one of:
1. The `<canvas>` element has no pixel size (0×0). Size it from its container via a
   `ResizeObserver` (set `canvas.width/height` to the client size × devicePixelRatio)
   before drawing; redraw on resize.
2. `knowledgeGraph` returns no edges because wikilinks/backlinks are not indexed
   for the current vault. Verify it builds nodes from notes and edges from
   `[[wikilinks]]`/links, and that the panel isn't filtered to an empty subject.
Make it behave like Obsidian's graph: nodes for notes, edges for links, drag/zoom
already present — just ensure it draws and is populated. Add/adjust a test in
`knowledgeGraph.test.ts` proving edges are produced from linked notes.
- Acceptance: opening the graph on a vault with linked notes shows a populated,
  visible graph that pans/zooms; typecheck + vitest green.
Commit: `fix(graph): size the canvas and populate nodes/edges so the graph renders`.

## Area E — Canvas editing features

File: `frontend/src/components/canvas/CanvasView.tsx` (+ `CanvasNode.tsx`,
`store/canvas.ts`). Groups, a 20px grid (`GRID`, `snapTo`), a context menu and
some shortcuts already exist — extend them:

E1. **Create an (empty) group from the right-click menu on empty canvas.** Today
"Agrupar" only wraps a selection. Add a context-menu action on empty space that
creates a new empty group at the cursor (resizable, labelable).

E2. **Resize + thickness from any side.** A note/group must be resizable from
**every edge and corner** (8 handles), not just a corner. Add edge/corner resize
handles to nodes and groups. "Grosor" (border thickness) — expose a thickness
control for shapes/notes/groups (a small handle or a context-menu/inspector
option) so the user can change the outline weight.

E3. **Quick-access tool buttons `z x c v b n m`.** Add an on-canvas toolbar whose
buttons map to these keys, matching what the shortcuts already do (e.g. `b` groups)
and covering the core tools: select/hand, text note, shape, link/edge, group,
image, connector — assign each to one of z,x,c,v,b,n,m and show the letter on the
button. Keep the existing keyboard handling in sync.

E4. **Toggle the grid off.** Add a toolbar toggle that hides the visual grid and
disables snapping (`snapTo` already gates on a boolean). Persist the choice
per-user (localStorage is fine for this per-view preference).
- Acceptance: right-click creates an empty group; nodes/groups resize from all
  sides and support a thickness change; the z–m toolbar switches tools; the grid
  can be turned off. typecheck + vitest green.
Commit: `feat(canvas): empty groups, all-side resize + thickness, tool shortcuts bar, grid toggle`.

## Area F — Rebuild the in-app web browser from scratch

The current `WebModule.tsx` only manages bookmarks/history/rules and delegates
page opening to a **separate** Electron window — there is no embedded browsing
surface, and it lives in the icon rail. Rebuild a real in-app browser.

Requirements:
- **F1 Embedded browsing surface** using Electron's `WebContentsView` (preferred)
  or a `<webview>` tag, with a **persistent session partition**
  (`persist:nvweb`) so logins/cookies survive restarts (**F2 history with login /
  saved sessions**). Address bar, back/forward/reload, and the page rendered
  inside the app.
- **F2 History** persisted (reuse the existing web history storage) and
  **bookmarks** (reuse `webBookmark*` APIs) — keep the good parts of the current
  module, drop the "opens a separate window" model.
- **F3 Video playback works** (the previous webview blocked it). Configure
  `webPreferences` so media plays; do not disable the features video needs.
- **F4 Compatibility + security to interact**: keep `contextIsolation` and the
  navigation guard for the *app* window, but the browsing surface is a sandboxed
  guest with its own partition; enforce the existing content rules
  (`WebRules`/blocklist/allowlist/limits) on the guest's navigation, replacing a
  blocked page with the notice as today. No Node integration in the guest.
- **F5 Put the browser in the RIGHT sidebar** — a browser icon in the right bar of
  the Notes module (next to Estudio/Nota) that opens the browsing surface as a
  right-side panel, per the user's request, while the full Web management (rules,
  usage, bookmarks list) can stay as a module/tab.
- Keep the rules engine and usage tracking working against the embedded guest.

Files: `frontend/src/components/web/WebModule.tsx` (+ a new browsing surface
component), `frontend/electron/main.ts`/`ipc.ts` (WebContentsView wiring, partition,
webPreferences, navigation/rule enforcement), the web API modules and
`frontend/src/lib/bridge.ts`.
- Acceptance: you can type a URL, browse inside the app, play a video, stay logged
  in across restarts, bookmarks/history work, blocked sites show the notice, and a
  browser icon in the right sidebar opens the surface. typecheck + vitest green;
  `npm run electron:build` launches and browsing works.
Commit: `feat(web): embedded browser (WebContentsView) with sessions, video, rules and right-bar entry`.

## Area H — Vista General (Home) visual redesign

The user provided a reference mockup: **`docs/INTERFACES_V2/vista_general_ref.webp`**
— open it and replicate it element by element (reference-fidelity rule: verify by
rendering before declaring done). Redesign **only the Vista General main content**
(`frontend/src/components/home/HomeModule.tsx` and its parts under
`frontend/src/components/common/`). **Do NOT change the right sidebar** (Agenda &
Calendario / Próximas actividades / Scratchpad) — leave it exactly as it is today.
This supersedes/absorbs task **A2** (the exercise card): the new "Ejercicio —
Sábado" panel covers it. Keep all A1 behaviour.

Layout to match, top to bottom (center column):

1. **Header row**: title **"Vista General"** with a small pill badge to its right
   ("Sprint v2.4" in the mock — use a real value such as the vault/version).
   Subtitle line under it (e.g. "Vault Programming · Modo Productividad Profunda").
   On the right of the row: a date pill with a calendar icon (today's long date in
   Spanish) and the existing **"+ Nueva Nota"** button (teal/cyan accent).

2. **Focus banner** (full-width hero card, subtle gradient): a small chip
   "NOTEVAULT FOCUS ENGINE" + a streak chip ("🔥 N Días de Racha activa"); a large
   welcome heading ("¡Bienvenido de nuevo! Mantén el enfoque…"); a one-line summary
   built from real data ("Tienes 12 hábitos programados, 3 ejercicios… y 2
   revisiones… pendientes."); and on the right a segmented filter **Todos ·
   Hábitos · Código · Notas** that filters what the dashboard emphasises.

3. **Five stat cards in a row**, each: uppercase title, a small status badge, a big
   number/fraction, a short subtitle, and a **mini sparkline** in the card's accent
   colour. Use the real modules and colours:
   - **Hábitos de hoy** — `hechos/total` + "% " badge — cyan.
   - **Ejercicio** — `hechos/total` + day badge — amber.
   - **Proyectos** — issues-in-sprint + "N Activos" badge — purple.
   - **Tareas para hoy** — count + "Al día"/overdue badge — blue.
   - **Finanzas** — balance + trend badge (e.g. "+14.2%") — green.
   Reuse the existing chart helpers in `components/common/charts.tsx` for the
   sparklines (add a small area/line sparkline if none exists).

4. **Two large panels side by side**:
   - **Hábitos de hoy** — header with a `hechos/total` badge; a **two-column**
     list of habits, each a checkbox + emoji icon + label (some with an extra like
     "Programar NoteVault 0/3 hrs"). Checking persists (reuse today's toggle).
   - **Ejercicio — <día>** — header with `hechos/total` badge; a list of the day's
     exercises, each showing name + short description + a pill with sets/reps
     ("3 × 15-20 seg"); a footer line "Rango de descanso: … · Total estimado: …".
     Checking an exercise persists (this is A2, done here).

5. **Bottom row (two panels)**: **"Analítica Semanal — Horas de Código vs.
   Hábitos"** (a chart with a legend Hábitos / Horas Código) and **"Progreso de
   Objetivos — Consistencia y Maestría"** (reuse the goals data). Match the mock's
   card styling (rounded, subtle border, dark surface, accent sparklines/legends).

Style: dark surfaces, rounded cards, thin borders, accent-coloured sparklines and
chips, emoji icons — as in the mock. Keep it responsive and honour
`html[data-perf="lite"]` (no heavy blur/shadow under lite mode). All numbers come
from real data (habits, exercise, projects, tasks, finance, goals) — no hardcoded
figures.

- Acceptance: the Vista General matches the reference image (verify by rendering
  and comparing), the right sidebar is unchanged, every figure is real and
  interactive where the mock implies it, typecheck + vitest green.
Commit: `feat(home): redesign the Vista General to match the reference mockup`.

## Area G — Verify & document

1. `npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
   launches; smoke-test each area in the built app.
2. Note any vault-format change (e.g. web session storage location) in
   `docs/VAULT_FORMAT.md` with the mobile-parity note.
3. Keep `docs/INTERFACES_V2/PROGRESS.md` (create it): one line per area — area,
   commit hash, tests green, and the index-coverage report from C4.
Commit: `docs(interfaces): document the interface fixes and index coverage`.

## Guardrails

- Behaviour changes only where an item asks. Never commit with a red test or type
  error. Stay on `web-migration`; never touch `main`.
- Respect the design invariants: Estudio lives inside Notes; the explorer shows
  only notes + code; all module data under one folder with mobile parity;
  practice/exercise generation stays concept-specialised (Practice V2), never
  generic.
- Where a screenshot was provided (templates), replicate it faithfully and verify
  by rendering before declaring done.
