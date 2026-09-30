# PLAN NOTAS V5 — Notes / Study module (English, self-contained)

Repo: `C:\PROGRAMMING\PROJECTS\NoteVault`, branch `web-migration`, app in `frontend/` (Electron + Vite + React + TS + Tailwind, CodeMirror 6).
Vault root (user data) is `C:\PROGRAMMING` (Matemáticas, Programación, Inglés, `_skills/`…).

## Rules for the executor (read first, do not ask questions)
1. Work top to bottom. Never stop to ask: every decision is already made below. If a detail is missing, pick the simplest option that satisfies the acceptance criteria and note it in the commit body.
2. Adapt to the current code: locate things with Grep, do not trust line numbers.
3. After each phase: `cd frontend && npx tsc -b && npx vitest run` must pass. Add/adjust a test for new pure logic.
4. One commit per phase, clear message, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
5. End of ALL work: `cd frontend && npm run electron:build` (the user runs the `.exe`), then `git push origin web-migration`.
6. UI text is Spanish; code, comments, commits are English. Do not touch `FULLSTACK_FACTORY`. Keep token use low: read only the files named.

## STATUS

DONE (commits `21101db`, `c2aeff8`):
- Item 1: `ResumenView` had no scroll container, so its content overflowed under the "Backlinks & Menciones" bar. Wrapped in `h-full overflow-y-auto`.
- Items 1.1/1.2: expanded topic card now shows `SkillMatrix` (competencies × ★/★★/★★★, passes/required). Grid uses `items-start` so expanding one card no longer stretches its row neighbour. Helper `skillMatrix()` in `src/lib/areaOverview.ts`.
- Item 3: `StudyPanel` (which held the Repaso tab) was never rendered anywhere. Added `components/study/ReviewPanel.tsx` (+ `useReviewPanel` store), a right-panel face and a launcher button (CalendarClock) below "Esquema de la nota" in `PanelLaunchers.tsx`; `RightPanel.tsx` renders it.

PHASES A-E ARE DONE (see the phases below for the original spec; commits: A `70cc406`, B `6c8d5c9` + `c1361d3`, C `e0fe75c`, D `431c7fc` + `8b3e93a`, E `a9e1498`). Verified: full test suite green; B and E were run live against DeepSeek on a temp copy of topic 1.1 (plan written into the .practica.md, exercises generated into Ejercicios/<skill>/, syllabus wizard walked all 7 steps, canvas mode produced a valid 8-node canvas with labelled arrows); A and D were driven in a browser harness.

Known gaps / next steps for whoever continues:
- Table cells in edit mode show the cell's raw Markdown only while that cell has focus (rendered otherwise).
- Drawing pad: no "Reconocer con IA" (vision) button yet; recognition is offline templates (digits, + - = x / ( ) < >, fractions, roots, exponents). Add more glyph templates in `lib/glyphRecognizer.ts` if a symbol is misread.
- Chat modes: the wizard is prompt-driven (no UI checklist for extensions); theory/practice/canvas per topic are created afterwards with the "Nuevo tema" and "Generar canvas" modes.
- Verify by hand in the built app: Repaso launcher, split drawing pad, exercise folder view, Modes menu.

---

## PHASE A — Edit mode must look like Read mode (item 5)

Problem: edit mode (CodeMirror, `components/notes/SourceEditor.tsx` + `lib/livePreview.ts` + `lib/mdPreview.ts`) only hides inline marks line by line. Frontmatter is raw text, tables are pipes, LaTeX is raw `$..$`.

Target (Obsidian "Live Preview"): every construct renders like `ReadView` (`lib/markdown.ts` `renderMarkdown`) EXCEPT the one the cursor is inside, which shows raw Markdown. Tables render as HTML tables and STAY rendered even while the cursor is in them (edited through the cell widgets, see A3).

A1. New file `src/lib/livePreviewBlocks.ts`: a CodeMirror `StateField<DecorationSet>` (block widgets MUST come from a StateField, not from the existing ViewPlugin). Register it in `SourceEditor.tsx` next to `livePreview` (not for `code` files). Scan the doc with the markdown syntax tree (`syntaxTree(state)`) or simple line scanning, and emit `Decoration.replace({ widget, block: true })` for:
  - Frontmatter (`---` … `---` at doc start) → widget rendering the same card as `FrontmatterCard` in `ReadView.tsx` (export a plain-DOM version or render via `createRoot`). Cursor inside → raw.
  - Tables (GFM pipe tables) → widget that renders `<table class="nv-prose">` using the same CSS as read mode. NEVER revert to raw when the cursor enters (A3).
  - Display math `$$ … $$` (multi-line) → KaTeX widget (`katex.renderToString(..., {displayMode:true, throwOnError:false})`). Cursor inside → raw.
  - Horizontal rules `---`, fenced code blocks (render like read mode, raw when cursor inside), blockquotes/callouts if `renderMarkdown` supports them.
A2. Inline math `$…$` in `mdPreview.ts`/`livePreview.ts`: add a `math` mark kind → `Decoration.replace` with a KaTeX inline widget on lines the cursor does not touch. Extend `linePreview` (pure function, keep it testable) to return `math: Array<{from,to,tex}>`. Reuse whatever KaTeX import `lib/markdown.ts` already uses.
A3. Table editing: each cell in the widget is `contenteditable`; on `input`/`blur` rebuild the pipe-table text for that block and dispatch a CodeMirror transaction replacing the block range (preserve column alignment row). Tab moves to next cell, Enter adds a row at the end. Widgets must implement `eq()` so re-render does not steal focus.
A4. CSS: widgets use the same `.nv-prose` classes as `ReadView`, so read and edit are visually identical (same font size 15px, width 820px, already set in `SourceEditor.tsx` theme).
A5. Tests: `linePreview` math ranges; table parse/serialize round trip (`lib/tableMd.ts` pure helpers).
Acceptance: open `1.1 Números naturales…md` in Editar: frontmatter shows as a card, headings/bold/lists/tables/LaTeX look like Lectura; clicking a paragraph reveals only that line's raw text; tables never turn into pipes.
Commit: `feat(notes): block live preview in edit mode — frontmatter card, tables, KaTeX`.

---

## PHASE B — Re-evaluate practice for a topic (item 2.1.4 + 4 + 4.1)  ← most important

Goal: an AI pass reads a topic's theory and decides which existing skills/competencies to practise, per difficulty, with exercise counts; the result is stored in the topic's `.practica.md` and drives "Practicar tema".

B1. Core: new `src/core/practice/practicePlan.ts` (pure, testable):
  - `buildReevaluationPrompt({ topicTitle, topicType, theoryNotes, skillCatalog, skillTemplates })` → messages. Skill catalog comes from `core/practice/skills.ts`/`disciplineCatalog.ts`/`topicType.ts` (already model skills per discipline and topic type teórico/práctico). The prompt MUST list the valid skill codes and require ONLY JSON:
    `{"skills":[{"skill":"<code>","difficulties":{"1":n,"2":n,"3":n},"why":"<one line>"}],"summary":"<one line>"}`.
  - `parsePracticePlan(reply, validSkillCodes)` → validates (unknown skills dropped, counts clamped 0–12, at least one skill), returns `PracticePlan`.
  - `renderPlanSection(plan)` / `applyPlanToPracticaFile(text, plan)`: writes a fenced section between markers `<!-- nv:plan:start -->` … `<!-- nv:plan:end -->` (a Markdown table skill × difficulty counts + rationale) and a `practice_plan` key in the `.practica.md` frontmatter (JSON string). Idempotent: replaces the section if present.
B2. API `study_topic_reevaluate(folder)` in `src/api/modules/study.ts` (register in `bridge.ts` as `studyTopicReevaluate`): read theory notes of the folder (same code as `study_topic_session_build`), `skillTemplates(app, folder)` (already exists, reads `_skills/*.md`), call AI via `sendChat(AIConfig.fromDict(AppConfig.get_ai_config()), …)`; bridge providers → throw `ApiError`. Write plan to `<topic>/<topic>.practica.md` (create via `ensureTopicViewFiles` if missing), also update the topic manifest `skills` list with the chosen skills. Clear caches (`clearStudySnapshotCache`, `clearExerciseIndexCache`). Return `{ok, plan, path}`.
B3. UI: in `TopicFileView.tsx` header add an icon button (lucide `RefreshCcw`/`Wand2`, title "Re-evaluar práctica con IA") next to Recargar; shows spinner, toast with the summary, then `refresh()`. Also show the plan table in `TopicGeneralView` ("Plan de práctica de la IA").
B4. "Practicar tema" (`TopicConfiguratorDialog.tsx`, section "3. Cantidad de ejercicios"): add a first option **"Lo que decidió la IA"** (`QuantityOption` value `"ai"`, default when a `practice_plan` exists). When selected, count = plan[skill][difficulty]. `study_topic_session_build`/`buildTopicSession` (`core/practice/sessionBuilder.ts`) must accept `"ai"` and read the plan from the `.practica.md`; if there is no plan, run B2 first automatically. Skills list in the dialog should be pre-filtered/ordered by the plan.
B5. Exercise file layout: generated exercises must be written to `<topic>/Ejercicios/<skill>/<NN> <title>.md` (one sub-folder per skill). Check `sessionBuilder.ts` where `path` is computed and make it so; do not move existing files.
B6. Live acceptance test (do it, report results in the commit body): run B2 on `Matemáticas/1 Aritmética elemental y operativa/1.1 Números naturales, enteros y recta numérica` and confirm the `.practica.md` plan section appears and "Practicar tema" with "Lo que decidió la IA" creates files under `Ejercicios/<skill>/`. If no AI provider is configured in this environment, unit-test B1 with a fake reply and state that the live run could not be done.
Commit: `feat(study): AI re-evaluation of a topic's practice plan drives Practicar tema`.

---

## PHASE C — Exercise folders UI (item 4.2.1)

- In the explorer, `Ejercicios/<skill>` folders: clicking the folder NAME (see `openFolderView` in `components/notes/FileTree.tsx`) opens an **exercise-set view** instead of a plain toggle. Implement view file kind `ejercicios` handled in `EditorArea.tsx` (`isViewFile`) or, simpler, detect folder path segment `Ejercicios/<skill>` in `openFolderView`.
- New `components/practice/ExerciseFolderView.tsx`: lists the folder's exercise notes as a left rail (title, done/pending) and renders the selected one with the existing `PracticeView` (`components/practice/PracticeView.tsx`); Prev/Next buttons and ←/→ keys move between exercises without leaving the tab. Data: `api.listDir(folder)` + `api.readNote`.
Commit: `feat(practice): open an exercise sub-folder as a navigable set`.

---

## PHASE D — LaTeX drawing pad as a split view (item 4.2.2)

Current: `components/practice/MathDrawingInput.tsx` is embedded in the answer box and its heuristic recogniser misreads digits (a hand-drawn "5" gives "- x").
- D1. Remove the inline embed. Add a launcher button below Repaso in `PanelLaunchers.tsx` (icon `PenTool`, "Dibujar LaTeX"). Clicking it: creates `<folder of active note>/Dibujo LaTeX <n>.canvas` (use `api.canvasCreate(title, folder)`) and opens it in the split side pane (`useApp.getState().openSide(path)`; `SidePane` in `EditorArea.tsx` currently renders notes → extend it to render `CanvasView` when the side path ends in `.canvas`).
- D2. Drawing surface = the existing infinite canvas (`components/canvas/*`). Add a "ink" tool that stores strokes on the canvas; a floating preview card shows the KaTeX render of the recognised LaTeX plus an editable LaTeX field and an "Insertar en la nota" button (inserts `$…$` at the cursor of the main note, or copies the LaTeX to the answer field of the open exercise).
- D3. Recognition (`lib/mathRecognizer.ts`, pure): segment strokes into symbols by proximity/overlap, normalise each symbol, classify with a template matcher ($P point-cloud recogniser) seeded with templates for digits 0-9, `+ − × ÷ = ( ) x y n`, `<`, `>`, `√`, fraction bar, `^` exponent by relative position; then lay out sequentially (superscript/fraction by geometry). Unit test with synthetic strokes for digits. Add a button "Reconocer con IA" that renders the strokes to PNG and sends it to the configured multimodal provider (`sendChat` with an image part; skip with a toast when the provider has no vision support).
Commit: `feat(practice): LaTeX drawing pad as a split canvas with better recognition`.

---

## PHASE E — AI chat modes (items 2.1.1 – 2.1.3)

Where: `components/notes/AssistantPanel.tsx` `Composer` (has the "Generar temario" button, `generateSyllabus`) and `api/modules/study.ts` (`study_generate_syllabus` is a one-shot; replace it by the wizard below).

E0. Mode menu: replace the single button by a "Modos" popover with: **Generar temario**, **Generar canvas**, **Nuevo tema en un área**, **Re-evaluar práctica** (Phase B). Selecting one sets `assistant.mode` (store `store/assistant.ts`) and injects that mode's system prompt; the chat stays a normal conversation.
E1. Safe action protocol (needed because the chat must create files): the model may end a reply with a fenced block ```` ```nv-action ```` containing JSON `{"action":"create_topic"|"create_note"|"create_canvas"|"write_skill"|"set_practice_plan","args":{…}}`. The renderer shows a confirmation card (“Aplicar / Descartar”, listing exact paths). On Apply it calls a new API `assistant_apply_action(action, args)` which validates: paths must resolve inside the vault (`app.resolve`), no `..`, no overwrite of existing files unless `args.overwrite===true` and the user confirmed, extension allow-list (`.md`, `.canvas`). Never write without the click.
E2. **Generar temario** wizard (state machine kept in the store, each step is a normal AI turn with a step-specific system prompt built by `core/assistantFlows/syllabus.ts`):
  1. Collect `Área` (e.g. JavaScript, Cálculo diferencial).
  2. Collect `Objetivo` (concrete outcome; drives depth).
  3. Diagnostic: AI asks the minimum questions (max 5, one message) to learn starting point, needed depth, missing prerequisites, WITHOUT asking the user to choose technical levels; it infers them from the answers.
  4. Prerequisites: AI lists required knowledge and whether a `Fase 0` is needed.
  5. `Foco` (purpose inside the area, e.g. Backend); it steers content but must not block complementary knowledge.
  6. Suggested extensions: AI lists complementary areas (TypeScript, Testing, Node.js, Patrones de diseño…) as checkboxes; user accepts/rejects/ignores.
  7. Generate: AI returns the full syllabus JSON (phases, dependencies, order, areas → topics). Then create folders + `.resumen.md` (existing `ensureOverviewFile`/`overviewFileText`), and per topic the theory `.md` and `.practica.md` following `_skills/resumen_teorico_skill.md` and `_skills/practica_skill.md`, and canvases per E3. Consistency rule: topic ids/titles identical across theory, practice and canvas.
  Persist the wizard answers in the conversation so a partial run can resume.
E3. **Generar canvas**: prompt is built from `_skills/canvas_skill.md` (Matemáticas) or the FULLSTACK canvas skills (`docs/SKILL_CANVAS_STEP_REPLICATION.md`, `docs/canvas_specs`) chosen by subject. The agent can (a) edit those skill files on request (`write_skill` action, confirmation required), (b) take an example canvas the user attaches (`@canvas` context chip, already supported by the composer) and derive a reusable template into `_skills/canvas_templates/<name>.md`, updating it iteratively when asked. Canvas creation uses `api.canvasCreate` + the existing canvas builder (`core/canvas/canvasBuilder.ts`).
E4. **Nuevo tema en un área**: user picks/mentions an area; AI proposes topic number+title consistent with numbering (natural order), creates folder + theory `.md` + `.practica.md` (+ optional canvas), runs Phase B re-evaluation for it.
Commit per mode: `feat(assistant): <mode>`; wizard core has unit tests with a fake AI client.

---

## PHASE F — Wrap-up
`npx tsc -b && npx vitest run`, `npm run electron:build`, `git push origin web-migration`. Report per phase: done / not done and why.
