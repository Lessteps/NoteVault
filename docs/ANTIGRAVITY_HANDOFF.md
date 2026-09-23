# Antigravity Handoff — NoteVault Concept-Map UI & Canvas polish

**Read this whole file before touching code.** It is written to be executed by
an AI with a smaller reasoning budget, so every task is concrete: exact files,
exact function names, exact acceptance tests. Do the tasks **in order**. After
each task: run `python -m pytest tests/ -q` (must stay green) and, if you
changed app code, rebuild the exe (see §Build). Do **not** invent new
architecture; wire the pieces that already exist.

Project root: `C:\PROGRAMMING\PROJECTS\NoteVault`. UI text = Spanish, code/docs =
English. Run tests with `QT_QPA_PLATFORM=offscreen` and `PYTHONIOENCODING=utf-8`.

---

## STATE — what is already DONE (do not redo)

- **Concept-map builder (core, done):** `notevault_app/core/canvas_builder.py`.
  - `build_canvas(spec: dict) -> cf.CanvasDoc`, `write_canvas(path, spec)`,
    `create_map_in_vault(vault_root, rel_path, spec)`, `validate_spec(spec)`,
    `spec_from_yaml(text)`.
  - Layouts: `radial|tree|grid|column|row`. Spec format is documented in
    `docs/PLAN_CONCEPT_MAP_GENERATOR.md` (§1) and a working sample is
    `docs/samples/phase0_concept_map.yaml`.
  - Tests: `tests/test_canvas_builder.py` (19, green).
- **Canvas fixes (done, in the exe):** border/corner resize + cursor, group
  hollow interior, text cards render markdown, note-transclusion notes now open
  in the rich Editor (tables render), undo = 1 step per gesture with a 100-step
  history + dedup, canvas opens centred on its content.
  Relevant tests: `tests/test_canvas_interaction.py`, `tests/test_canvas_undo.py`,
  `tests/test_canvas_text_markdown.py`, `tests/test_transclusion_richmode.py`,
  `tests/test_canvas_arrow_stack.py`.

- **Concept-map UI (Task 1) — DONE.**
  `notevault_app/ui/components/notes/concept_map_panel.py` (`ConceptMapPanel`):
  order box, context-file picker, template combo + preview, extra instructions,
  destination + name, "Generar". It builds a prompt, calls the configured AI
  (`ai_client.AIWorker`; bridge providers copy the prompt and paste the YAML
  back; a pasted YAML order builds with no AI), compiles with `canvas_builder`,
  writes the `.canvas`, emits `map_created`/`open_requested`. Wired in
  `main_window.py` (center-stack index 9) and reached from the notes sidebar's
  🗺 button (`NotesSidebar.generate_map_requested`). Tests:
  `tests/test_concept_map_panel.py`.
- **Templates (Task 2) — DONE.** `canvas_builder.list_templates()`/
  `load_template()` read `docs/map_templates/*.yaml` (3 starters exist).
- **Corrections guide (Task 3) — DONE.** `docs/GUIA_MAPA_CONCEPTUAL.md`.

Remaining: Task 4 (verify note-card render) and Task 5 (the top-spacing bug,
needs a user screenshot). Everything else below Task 3 is still open.

---

## TASK 1 — "Mapas" panel in the notes module (reqs 1–5)

**Goal:** a user-friendly panel inside the notes area where the user (a) writes an
order in a chat box, (b) picks context files, (c) picks a template, and the app
generates a `.canvas` concept map in the vault. Model it on the existing AI chat
panel so you reuse working patterns.

### 1a. Study these existing files first (read, do not change yet)
- `notevault_app/ui/components/notes/ai_chat_panel.py` — an existing chat-style
  panel (class `AIChatPanel`). Copy its structure (input box, send button,
  message list) for the new panel. It talks to the model through
  `notevault_app/core/ai_client.py` (`BRIDGE_CLAUDE`, function that sends a
  prompt and returns text). **Reuse `ai_client` to turn the order into a spec.**
- `notevault_app/ui/main_window.py` — see how center panels are registered in
  `self._center_stack` and how the left nav switches them (search
  `_notas_center`, `_center_stack.addWidget`). You will add the new panel the
  same way.
- `notevault_app/ui/components/notes/markdown_editor.py` — `SplitNotes`/
  `MarkdownEditor` is the notes center. The new panel is a **sibling option**,
  not a replacement.
- `notevault_app/ui/components/file_explorer.py` — how notes are listed; a new
  `.canvas` appears after `populate_tree`/refresh.

### 1b. New file `notevault_app/ui/components/notes/concept_map_panel.py`
Create `class ConceptMapPanel(QWidget)` with this exact layout (Spanish labels):

- Title row: label "Generador de mapas conceptuales".
- **Orden** (`QPlainTextEdit`, placeholder "Describe el mapa: idea central,
  conceptos, y forma (radial / árbol / lista)…").
- **Archivos de contexto**: a list widget + a "Añadir archivos…" button
  (`QFileDialog.getOpenFileNames`, filter `*.md *.canvas *.txt`). Store the
  chosen `Path`s in `self._context_paths`. Show each file name with an "x" to
  remove it. These files' text is read and prepended to the prompt (req 2 & 3).
- **Plantilla**: a `QComboBox` populated from `list_templates()` (see Task 3) +
  a "Vista previa" that shows the template's YAML in a read-only box (req 5).
- **Contexto/órdenes adicionales**: a second small `QPlainTextEdit` (optional
  extra instructions, req 3).
- **Carpeta destino + nombre**: a read-only path label defaulting to the current
  vault folder, a "Elegir…" button, and a `QLineEdit` for the file name
  (default "Mapa.canvas").
- **Botones**: "Generar" (primary) and, next to it, "Enviar a IA" is the same
  action — generating IS asking the model. A status label at the bottom.

Signals to expose: `map_created = Signal(Path)` (emit after writing, so the
explorer refreshes) and `open_requested = Signal(Path)`.

### 1c. The "Generar" flow (the important part)
On click:
1. Build the prompt with this exact template (keep it in one function
   `_build_prompt(order, context_texts, extra, template_yaml) -> str`):
   ```
   You convert a request into a NoteVault canvas SPEC (YAML only, no prose).
   Follow this schema exactly:
   <paste the schema summary from docs/PLAN_CONCEPT_MAP_GENERATOR.md §1>
   TEMPLATE (use its structure as the shape to fill):
   <template_yaml or "none">
   CONTEXT FILES:
   <each file: "### <name>\n<text truncated to ~4000 chars>">
   EXTRA INSTRUCTIONS:
   <extra or "none">
   USER ORDER:
   <order>
   Return ONLY a YAML document with keys: title, layout, defaults?, nodes, edges.
   ```
2. Call the model: `from ...core import ai_client; reply = ai_client.ask(prompt)`
   (use whatever the send function in `ai_client.py` is actually called — read
   the file; `BRIDGE_CLAUDE` is the entry). Do this on a worker thread or with
   the same async pattern `AIChatPanel` already uses, so the UI does not freeze.
3. Extract the YAML from `reply` (strip ```` ```yaml ```` fences if present) →
   `spec = canvas_builder.spec_from_yaml(text)`.
4. `errors = canvas_builder.validate_spec(spec)`. If not empty, show them in the
   status label and STOP (do not write a broken file).
5. `out = canvas_builder.create_map_in_vault(vault_root, rel_path, spec)`.
6. `self.map_created.emit(out)`; set status "Mapa creado: <name>". Offer an
   "Abrir" button that emits `open_requested`.

**Fallback when the model is unavailable:** if `ai_client.ask` raises or returns
empty, and the order text itself is already valid YAML, parse it directly with
`spec_from_yaml` and continue from step 4. This lets the user paste a spec
straight in.

### 1d. Wire it into the app
- In `main_window.py`, instantiate `ConceptMapPanel`, add it to `_center_stack`,
  and add a left-nav entry (find the existing notes nav buttons and copy one).
  Connect `map_created` → refresh the file explorer (`self._explorer.populate_tree`
  or the existing refresh) and `open_requested` → `self._open_notes_path(path)`.
- Keep it as **one more option inside the notes panel** (req 4), next to the
  editor, not a modal.

### 1e. Acceptance
- `tests/test_concept_map_panel.py`: construct the panel with a temp vault,
  set `_context_paths`, call `_build_prompt(...)` and assert the prompt contains
  the schema, the template, the context file text, and the order. Then feed a
  known-good YAML string through `spec_from_yaml`+`create_map_in_vault` and
  assert a `.canvas` is written that `cf.load` reads with the expected counts.
  (Do NOT call the real model in tests — test `_build_prompt` and the
  write path only.)

---

## TASK 2 — Templates (req 5)

**Goal:** the panel can consume reusable structure templates.

- New folder `docs/map_templates/` with 3 starter YAML files (copy the shape of
  `docs/samples/phase0_concept_map.yaml`):
  - `radial_central.yaml` — one root + N children, `layout: radial`.
  - `tree_hierarchy.yaml` — root → level-1 → level-2, `layout: tree`.
  - `steps_column.yaml` — ordered steps, `layout: column`.
  Each file starts with a top `# name: <Spanish display name>` comment line.
- New functions in `canvas_builder.py`:
  - `list_templates() -> list[dict]` returning `[{"name","path","yaml"}]` read
    from `docs/map_templates/*.yaml` (name = the `# name:` comment or the file
    stem).
  - `load_template(name) -> str` returning the raw YAML.
- The panel's `QComboBox` is filled from `list_templates()`; selecting one shows
  its YAML in the preview box and passes it as `template_yaml` in the prompt.
- Acceptance: `tests/test_map_templates.py` — `list_templates()` finds the 3
  files; each template's YAML passes `validate_spec` after `spec_from_yaml`.

---

## TASK 3 — Corrections guide file (req 9)

Create `docs/GUIA_MAPA_CONCEPTUAL.md` **in Spanish** (user-facing). It must
explain, step by step, how the user corrects a generated map while building
"step 1.1" as a template:
1. Cómo abrir el panel "Mapas" y generar.
2. Cómo editar el `.canvas` resultante a mano (mover, redimensionar, Alt+clic
   duplica, flechas conectan, Ctrl+Z 100 pasos).
3. Cómo guardar una versión buena como plantilla: copiar el YAML del spec
   generado a `docs/map_templates/<nombre>.yaml` y añadir `# name:`.
4. Cómo reportar una corrección: una sección "Correcciones pendientes" con
   formato fijo `- [fecha] <qué está mal> → <qué se espera>`, que el usuario
   rellena y la IA (tú, Antigravity, o Claude) lee para ajustar el generador o
   el prompt.
Keep it short and practical.

---

## TASK 4b — Tables in free TEXT cards render as a grid — DONE

Valid markdown pipe tables now render as a real grid in a `TextNodeItem`
(verified with a pixmap: header shade + cell borders + 2 columns). The frequent
failure was a table written WITHOUT its `|---|` separator row, which markdown
does not treat as a table; `items._tolerant_table_md()` now inserts the missing
separator at render time (display-only, `node.text` unchanged). Tests in
`tests/test_canvas_text_markdown.py` (`TestTableTolerance`). If a user still sees
stacked lines, their card has no pipes at all — advise pipe syntax or a `.md`
note embed.
**Pasting** a table (Ctrl+V) is handled too: `qt_markdown.clipboard_markdown()`
turns clipboard HTML tables (copied from a rendered note, a browser, a
spreadsheet) or tab-separated text into a pipe table. Inside an edited card it
is done by `items._CardTextItem.keyPressEvent`; on the empty board
`CanvasView.paste()` creates a new card sized to the table. Copied canvas cards
are tagged on the clipboard with `CANVAS_CLIP_MIME` so Ctrl+V still duplicates
cards. Tests: `tests/test_canvas_paste_table.py`. Historical notes on the harder
proxy approach kept below in case a proportional overlay is ever wanted.

A free `TextNodeItem` (canvas/items.py) renders markdown via
`self._text.document().setMarkdown(...)` on a `QGraphicsTextItem`. A pipe table
**does** become a `QTextTable`, but `QGraphicsTextItem` draws no cell borders and
collapses the columns, so it looks like stacked lines (user screenshot).
`style_document`/`style_table` set the border on the table format but the graphics
text item ignores it. Options, in order of preference:
1. Set an explicit table width and cell padding on the `QTextTableFormat` and a
   `QTextFrameFormat` border AFTER `setMarkdown` in `TextNodeItem._render_markdown`
   (mirror `note_view.style_table`), then verify a border actually paints in a
   `QGraphicsTextItem` (write an offscreen pixmap test that samples border
   pixels). If `QGraphicsTextItem` still won't paint borders, do (2).
2. For a card whose text contains a pipe table, render it through a
   `QGraphicsProxyWidget` holding a small read-only `NoteTextBrowser` (which DOES
   draw the grid, like note cards) instead of the `QGraphicsTextItem`. Reuse the
   `NoteNodeItem` proxy pattern.
Meanwhile the working guidance for users: put real tables in a **note** embed
(a `.md` file dropped on the board), which already renders tables with a grid.

## TASK 4 — Verify req 8 (canvas note cards = normal notes)

Note cards (`NoteNodeItem` in `canvas/items.py`) already render markdown through
`NoteTextBrowser.load_markdown` → `style_document`, which styles tables
(`note_view.py:style_document` calls `style_table`). **Verify** with a test and
only fix if it fails:
- `tests/test_canvas_note_render.py`: build a `NoteNodeItem` whose note body has
  a heading and a markdown table; assert the viewer document contains a
  `QTextTable` (iterate `doc.rootFrame().childFrames()`) and the heading block
  has `headingLevel() == 1`. If the table is missing, the fix is to call
  `style_tables(doc)` (or `setMarkdown` before styling) inside the card's
  `_render` — mirror exactly what `NoteTextBrowser.load_markdown` does.

---

## TASK 5 — Bug "espacio superior" in a text card (needs the user)

The user reports the top spacing of a text card only appears after two clicks.
A headless measurement of the rendered document was **identical** before and
after an edit cycle, so it could not be reproduced here. **Do not guess.** Add a
line to `docs/GUIA_MAPA_CONCEPTUAL.md` "Correcciones pendientes" asking the user
for a screenshot circling the exact area and the exact click sequence. Only act
once that is provided.

---

## FUTURE (do NOT start; note only) — WEB module (req 5.2)

A future "WEB" panel: an embedded browser (QtWebEngine) with navigation, content
restrictions, Chrome login, data persistence, and embedding web pages into
canvases as interactive nodes. This comes AFTER one more pending module. Leave it
untouched for now.

---

## Build (after any app-code change)
```
cd C:\PROGRAMMING\PROJECTS\NoteVault
python -m PyInstaller NoteVault.spec --noconfirm
cp dist/NoteVault.exe NoteVault.exe        # fails if the app is open → ask user to close it
```
The user launches from `NoteVault.exe`, so it MUST be rebuilt and copied after
every change. Pure-core changes (e.g. `canvas_builder.py`, templates, docs) do
not need a rebuild.

## Golden rules
- Never revert changes you don't understand; append, don't rewrite.
- Every task ends with `python -m pytest tests/ -q` green.
- UI strings Spanish; code/docs English.
- Do not touch `FULLSTACK_FACTORY`, and mirror any vault-format change in the
  mobile `vault_format.dart` (none of the tasks above change the format).

---

## WEB module (implemented by Claude, 2026-09-23) — rules for any future edit

Read `docs/PLAN_WEB_MODULE.md` first. Hard rules:

1. NEVER import `PySide6.QtWebEngine*` at module level anywhere. Always go through
   `notevault_app.core.web_runtime.load()` (or `ui/components/web/engine.py`).
2. NEVER remove the QtWebEngine entries from `excludes` in `NoteVault.spec`. The engine
   lives in the separate `web_runtime/` folder; bundling it would add ~400 MB to every start.
3. The browser profile (cookies, logins) stays in `~/.notevault/web_profile`, never in the vault.
4. After any change to the WEB files, run:
   `python -m pytest tests/test_web_store.py tests/test_web_module.py -q`
   and, after rebuilding the exe, `NoteVault.exe --web-selftest=%TEMP%\st.json` (expect `"ok": true`).
5. If PySide6 is upgraded, rebuild the engine: `python tools/build_web_runtime.py`.

---

## Deliverable canvases — generation task (standard of 2026-09-23)

The user will ask you to generate the canvases of the other deliverables "like Problem Statement H".

1. Read `docs/SKILL_CANVAS_STEP_REPLICATION.md` completely. It is the contract.
2. Open the reference canvas `…/PHASE_0_PROBLEM_RECOGNITION/1.Problem_Statement/1.Problem_statement_h.canvas`
   in the app once and look at one micro-step (e.g. 1.1.2): header → How-to note → Example output,
   all arrows labelled.
3. For each deliverable, list ALL micro-steps of its master (`N.Name.md`) before drawing anything.
   The canvas must have exactly those micro-steps, same numbers.
4. Write every How-to note with `howto_note(...)` (4 sections). Never produce the legacy
   "operation + Partial output" pair; never call `add_substep_block`/`add_substeps` for new work.
5. Build with `add_micro_steps(...)`; label every link (`link_label`).
6. Run the acceptance checklist of the SKILL (section 7) and report which items you verified.
7. Warn the user to close each canvas in the app before writing it.
