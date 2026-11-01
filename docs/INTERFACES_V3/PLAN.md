# NoteVault — Interfaces V3 work package (for Antigravity)

Paste this whole file to Antigravity. Working dir: `frontend/`. UI text **Spanish**;
code/comments/docs/commits **English**. After every file: `npm run typecheck`
clean + `npx vitest run` green (from `frontend/`). **Commit AND push to
`web-migration`** after each area (`git push origin web-migration`). Never touch
`main`; never force-push or reset.

Four areas (A–D). Reference mock for Area A: **`docs/INTERFACES_V3/navbar_ref.png`**.

---

## Area A — Obsidian-style unified tab strip (main navbar redesign)

Reference: open `docs/INTERFACES_V3/navbar_ref.png`. It shows a single horizontal
**tab strip** across the top: left workspace icons (panel, folder, search,
bookmark), then the open **tabs** (e.g. "Graph view", "NoteVault",
"Canvas ×", "0.PYTHON_TRAINING_SYSTEM"), a "+" to open new, and window controls on
the right. Replicate this layout (reference-fidelity rule: verify by rendering).

Files: `frontend/src/components/Shell.tsx` (`TopBar`), `frontend/src/App.tsx`
(module/tab hosting), `frontend/src/store/app.ts` (tabs/active), the per-note
`TabBar` in `frontend/src/components/notes/EditorArea.tsx`.

A1. **Remove the redundant search bar from the top bar.** The `TopBar` search
("Buscar notas, abrir o crear…") duplicates the integrated Notes search
(`Ctrl P` / the search tab in the explorer). Delete it from `Shell.tsx`. Keep
`Ctrl P` opening the QuickSwitcher.

A2. **One unified top-level tab strip for everything.** Today modules switch via
the left icon rail (single view) and notes have their own inner `TabBar`. Unify:
opening **any** target — a module (Ejercicio, Calendario, Hábitos, Proyectos,
Metas, Finanzas, Notas, Navegador) **or** a note/canvas — creates a **tab** in the
top strip, like Obsidian. Clicking a tab activates it; closing (×) removes it.
- Model this in `store/app.ts` as a single ordered list of open tabs, where a tab
  is either `{kind:"module", id}` or `{kind:"note", path}` / `{kind:"canvas",
  path}` / `{kind:"web"}`. The left icon rail still exists as a launcher (opening a
  module focuses or creates its tab), but the **active view is driven by the active
  tab**.
- Keep the Notes module's internal behaviour working (a note tab shows the editor;
  the explorer/right bar belong to the Notes view). Do not regress the Estudio
  sub-bar.

A3. **Pin tabs (pinned tabs cannot be closed).** Right-click a tab → "Fijar" /
"Dejar de fijar" (and a pin affordance). A pinned tab shows a pin icon instead of
the × and cannot be closed by click/middle-click/Ctrl-W; unpinning restores ×.
Persist pinned tabs per vault (reuse `AppConfig` pinned-tabs storage if present).

Acceptance: the top strip shows every open module/note as a tab; the search bar is
gone; tabs can be pinned and pinned ones can't be closed; layout matches the mock.
typecheck + vitest green.
Commit: `feat(ui): unified Obsidian-style tab strip with pinning; remove redundant top search`.

## Area B — Canvas freeze on the math index / map

Bug: opening `Matemáticas/00 Mapa de Matemáticas.canvas` (and the índice) hangs the
app for a long time (it does not crash but freezes while loading). Files:
`frontend/src/components/canvas/CanvasView.tsx`, `CanvasNode.tsx`,
`frontend/src/core/canvas/canvasBuilder.ts`, `store/canvas.ts`.

Likely causes (profile to confirm): the whole canvas renders every node
synchronously with no virtualization; the Area-C auto-size-to-content change
measures/lays out every node on load; and under this machine's software rendering
(no GPU) a large canvas is very expensive.
- **Virtualise the canvas**: only render nodes/edges within (or near) the viewport;
  skip offscreen ones. Add overscan; update on pan/zoom.
- **Defer/cheapen initial layout**: compute node sizes once and cache; avoid
  re-measuring on every render; do heavy work off the first paint.
- Respect `html[data-perf="lite"]` (no heavy effects on canvas nodes).
- Test with the real `00 Mapa de Matemáticas.canvas` (large) — it must open
  smoothly.
Acceptance: the math map/index canvas opens without a visible freeze; panning/
zooming stays responsive; typecheck + vitest green.
Commit: `perf(canvas): virtualise rendering and cache node sizing so large maps open fast`.

## Area C — Practice system: make it visible and audit completeness

Context (already verified): Practice V2 **is built** — `TopicConfiguratorDialog`,
`TopicGeneralView`, `TopicDashboardView`, `ExamRunnerModal`, `MathDrawingInput`,
`StudyPanel` wiring, the skills catalogue in `core/practice/modes.ts`, and the 41
`_tema.md` manifests exist in the real vault under `Matemáticas/…`. **But the user
does not see the alternative math modes** (solve, process, prove, counterexample,
find_error, drill, explain) or the configurator. This is a **discovery/surfacing**
problem, not a rebuild. Review Antigravity's own practice logs
(`docs/PRACTICE_V2/PROGRESS.md`) and fix the surfacing.

C1. **Topic detection must walk UP the tree.** The Estudio sub-bar only shows the
"Tema"/configurator when `studyTopicGet(path).is_topic` is true. Ensure detection
finds the nearest ancestor `_tema.md` from **any** note or folder inside a topic
subtree (e.g. an exercise note in `1.1 …/Ejercicios/…` must resolve to the topic
`1.1 …`). Verify `api.studyTopicGet` / `core/practice/topic.ts` climbs parents to
the manifest; fix if it only checks the exact folder. Add a test.

C2. **Make the modes visible.** When inside a topic, the Estudio panel must clearly
present "Practicar este tema" → the configurator with the **skill picker** listing
the topic's math skills (solve, process, prove, counterexample, true_false,
find_error, drill, explain), plus difficulty, quantity and assistance. Confirm the
configurator actually lists these for a math topic; if the topic manifests declare
too few skills, widen the default skill set for math topics.

C3. **Audit completeness against `docs/PRACTICE_V2/PLAN.md`.** Verify each phase is
actually reachable in the UI: per-topic configurator, `skill × difficulty` progress
matrix (Tema view), exams (ExamRunnerModal), the aggregated dashboard, and the math
drawing input inside a practice session. List in `docs/INTERFACES_V3/PROGRESS.md`
anything built-but-unreachable and wire it up. The user should be able to: open a
math topic → choose a skill + difficulty + assistance → practise → see progress.

Acceptance: opening any note/folder inside a seeded math topic shows the
configurator and the full skill list; a practice session runs per chosen
skill/difficulty; the Tema progress matrix, exams and dashboard are reachable.
typecheck + vitest green.
Commit: `fix(practice): surface the topic configurator and math modes from any note in a topic`.

## Area D — Webview must persist across tab switches; perf + security

Bug: switching between the webview and other views **loses the webview and closes
all its tabs**; it should stay alive (with its session and history) until the user
closes it. Files: `frontend/src/components/web/WebModule.tsx`, the browsing surface
/ `BrowserPanel`, `frontend/electron/main.ts`/`ipc.ts` (WebContentsView),
`store/app.ts`.

D1. **Keep the browser alive.** The embedded `WebContentsView` (and its tabs) must
**persist** when the user switches to another module/tab and come back unchanged —
same pages open, same scroll, still logged in. Do not destroy the WebContentsView on
view switch; **hide** it (detach from layout / set bounds offscreen or
`setVisible(false)`) and restore it when the web tab is active. Persist the session
partition (`persist:nvweb`) and the history as today. Only closing the web tab (or
ending the session) tears it down.

D2. **Performance.** Avoid recreating the view; throttle nothing needed; ensure the
guest uses the GPU switches the app already sets and doesn't block on the main
process. Keep it smooth under software rendering.

D3. **Security.** Guest runs sandboxed, `contextIsolation` on, no Node integration,
its own partition; enforce the existing content rules (blocklist/allowlist/limits)
on guest navigation; block popups/new-window to unknown origins (open in system
browser instead); keep the app window's navigation guard intact.

Acceptance: open pages in the browser, switch to Notes and back — the pages and
login are still there; history persists; blocked sites show the notice; no Node in
the guest. typecheck + vitest green; `npm run electron:build` launches and browsing
survives view switches.
Commit: `fix(web): persist the embedded browser across view switches; harden perf and security`.

## Area E — Verify & document

1. `npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
   launches; smoke-test each area in the built app.
2. Note any vault-format/config change in `docs/VAULT_FORMAT.md` with the
   mobile-parity note (e.g. pinned-tabs storage).
3. `docs/INTERFACES_V3/PROGRESS.md` (create it): one line per area — area, commit,
   tests green, plus the practice-completeness audit from C3.
Commit: `docs(interfaces): document the V3 interface changes`.

## Guardrails

- Behaviour changes only where an item asks. Never commit with a red test or type
  error. Stay on `web-migration`; never touch `main`. Commit **and push** each area.
- Respect the invariants: Estudio lives inside Notes; explorer shows only notes +
  code; single data folder + mobile parity; practice generation stays
  concept-specialised, never generic.
- Where a screenshot is given (navbar), replicate it faithfully and verify by
  rendering before declaring done.
