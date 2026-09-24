# Module map — every file → its TypeScript destination

Destinations are under `frontend/src/core/**` (domain logic, Node) and
`frontend/src/api/**` (the API layer). Do the batches **in order**; a batch may
import anything from earlier batches. Test files port **with** their module (see
§Tests). Skip everything in `00_MASTER_HANDOFF.md` §6.

Legend: ✅ = already ported as the reference (copy its style).

---

## Batch 1 — Foundations  →  `src/core/`

| Python (`notevault_app/`) | TypeScript (`frontend/src/core/`) | Notes |
|---|---|---|
| `webapp/errors.py` | `errors.ts` ✅ | `ApiError`. |
| `core/store.py` | `store.ts` ✅ | JSON/text I/O, ids, atomic writes. **Reference module.** |
| `core/vault_format.py` | `vaultFormat.ts` ✅ | `LAYOUT`, constants, `is_sync_conflict`. Byte-critical. |
| `core/frontmatter_utils.py` | `frontmatter.ts` ✅ | parse/dump/surgical key edit. Byte-critical. |
| `core/recurrence.py` | `recurrence.ts` | repeat rules. |
| `core/file_kinds.py` | `fileKinds.ts` | note/code/canvas classification. |
| — (new helpers) | `paths.ts`, `text.ts`, `dates.ts`, `num.ts`, `fraction.ts` | provided stubs; fill as batches need them. |

Tests: `test_vault_format.py` → `vaultFormat.test.ts`. (recurrence is covered by
manager tests.)

## Batch 2 — Vault & notes  →  `src/core/`

| Python | TypeScript | Notes |
|---|---|---|
| `core/vault_manager.py` | `vaultManager.ts` | vault root, note_paths walk, create/rename/trash. |
| `core/vault_index.py` | `vaultIndex.ts` | in-memory note text index (mtime-validated). |
| `core/notes_service.py` | `notesService.ts` | notes facade used by the API. |
| `core/attachments.py` | `attachments.ts` | attachment resolve/add; `fs_path`, ext sets. |
| `core/module_attachments.py` | `moduleAttachments.ts` | per-module attachments. |
| `core/markdown_utils.py` | `markdownUtils.ts` | link/heading extraction (server-side only). |
| `core/tag_index.py` | `tagIndex.ts` | inverted #tag → paths. |
| `core/templates.py` | `templates.ts` | template list/expand. |
| `core/daily_notes.py` | `dailyNotes.ts` | today's note. |
| `core/layouts.py` | `layouts.ts` | saved panel distributions. |
| `core/file_watcher.py` | `fileWatcher.ts` | use `chokidar`, or skip for v1 (renderer refreshes). |
| `core/reminder_scheduler.py` | `reminderScheduler.ts` | due-reminder logic (the timer runs in the API/main). |

Tests: `test_tag_index`, `test_layouts`, `test_templates_daily_notes`,
`test_note_move`, `test_backlinks`, `test_search_operators` → matching
`*.test.ts`. (Some of these currently exercise the API — port them in Batch 9 if
they import `webapp`; port here if they import `core` only. Check the imports.)

## Batch 3 — Simple managers  →  `src/core/`

| Python | TypeScript |
|---|---|
| `core/task_manager.py` | `taskManager.ts` |
| `core/habit_manager.py` | `habitManager.ts` |
| `core/area_manager.py` | `areaManager.ts` |

Behaviour tested via Batch 9's `test_webapp_tasks` / `test_webapp_habits`; also
`test_subtasks_and_calendar` (core parts).

## Batch 4 — Bigger managers  →  `src/core/`

| Python | TypeScript |
|---|---|
| `core/finance_manager.py` | `financeManager.ts` |
| `core/goal_manager.py` | `goalManager.ts` |
| `core/project_manager.py` | `projectManager.ts` |
| `core/schedule_manager.py` | `scheduleManager.ts` |
| `core/schedule_format.py` | `scheduleFormat.ts` |
| `core/exercise_manager.py` | `exerciseManager.ts` |
| `core/workspace_manager.py` | `workspaceManager.ts` |
| `core/knowledge_graph.py` | `knowledgeGraph.ts` |

Tests: `test_finances`, `test_goals_and_foundations`, `test_projects`,
`test_project_enhancements`, `test_schedule_manager`, `test_knowledge_graph`,
`test_frontmatter_and_workspaces`, `test_submetas_views` → `*.test.ts`.

## Batch 5 — Practice / study subsystem  →  `src/core/practice/` + `src/core/`

| Python | TypeScript |
|---|---|
| `core/practice/modes.py` | `practice/modes.ts` |
| `core/practice/discipline_catalog.py` | `practice/disciplineCatalog.ts` |
| `core/practice/exercise_note.py` | `practice/exerciseNote.ts` |
| `core/practice/grading.py` | `practice/grading.ts` |
| `core/practice/attempts.py` | `practice/attempts.ts` |
| `core/practice/cards.py` | `practice/cards.ts` |
| `core/practice/drills.py` | `practice/drills.ts` (needs `fraction.ts` + safe expr parser) |
| `core/practice/error_log.py` | `practice/errorLog.ts` |
| `core/practice/exercise_index.py` | `practice/exerciseIndex.ts` |
| `core/practice/handoff.py` | `practice/handoff.ts` |
| `core/practice/ladder.py` | `practice/ladder.ts` |
| `core/practice/ledger.py` | `practice/ledger.ts` |
| `core/practice/recommender.py` | `practice/recommender.ts` |
| `core/practice/study_area.py` | `practice/studyArea.ts` |
| `core/practice/timer.py` | `practice/timer.ts` |
| `core/study_daily_queue.py` | `studyDailyQueue.ts` |
| `core/study_error_manager.py` | `studyErrorManager.ts` |
| `core/study_exercise_manager.py` | `studyExerciseManager.ts` |
| `core/study_srs_manager.py` | `studySrsManager.ts` |
| `core/math_tools.py` | `mathTools.ts` |
| `core/code_runner.py` | `codeRunner.ts` (uses `child_process`; sandbox note in the batch prompt) |

Tests: `test_practice_engine`, `test_practice_ledger`, `test_proof_ladder`,
`test_study_exercises`, `test_study_srs_and_errors`, `test_math_module` →
`*.test.ts`.

## Batch 6 — English  →  `src/core/english/` + `src/core/`

| Python | TypeScript |
|---|---|
| `core/english/audio.py` | `english/audio.ts` |
| `core/english/media_links.py` | `english/mediaLinks.ts` |
| `core/english/mining.py` | `english/mining.ts` |
| `core/english/subtitles.py` | `english/subtitles.ts` |
| `core/english_grammar_manager.py` | `englishGrammarManager.ts` |
| `core/english_vocabulary_manager.py` | `englishVocabularyManager.ts` |
| `core/market_skill_manager.py` | `marketSkillManager.ts` |

Tests: `test_english_tools`, plus the English parts of `test_ai_modes`.

## Batch 7 — Canvas  →  `src/core/canvas/`

| Python | TypeScript |
|---|---|
| `core/canvas_format.py` | `canvas/canvasFormat.ts` (align with existing `src/lib/canvas.ts` types) |
| `core/canvas_builder.py` | `canvas/canvasBuilder.ts` |
| `core/canvas_methodology.py` | `canvas/canvasMethodology.ts` |
| `core/deliverable_canvas.py` | `canvas/deliverableCanvas.ts` |

Tests (core only): `test_canvas_builder`, `test_canvas_format`,
`test_canvas_methodology`, `test_deliverable_canvas`, `test_canvas_edges`,
`test_canvas_drawing`, `test_canvas_shapes`, `test_kb_canvas` → `*.test.ts`.
**Drop** the Qt canvas tests (see §Tests to drop).

## Batch 8 — AI & web store  →  `src/core/`

| Python | TypeScript | Notes |
|---|---|---|
| `core/ai_client.py` | `aiClient.ts` | providers, `send_chat` (fetch), `build_messages`, `build_bridge_prompt`, `BRIDGE_URLS`. Use `fetch` (Node 18+). No Qt worker — the call is awaited by IPC. |
| `core/web_store.py` | `webStore.ts` | WEB bookmarks/history/usage/rules. |

Tests: `test_web_store`, `test_ai_modes` → `*.test.ts`.

## Batch 9 — API layer  →  `src/api/`

Port each `webapp/modules/<m>.py` to `src/api/<m>.ts` as a set of exported
functions (drop the Python mixin classes; a mixin method `def foo(self, ...)`
becomes `export function foo(...)` that reads/writes the shared `AppState`).

| Python | TypeScript |
|---|---|
| `webapp/modules/common.py` | `api/common.ts` |
| `webapp/modules/context.py` | `api/context.ts` (the Managers bundle → `getManagers()`) |
| `webapp/media.py` | `api/media.ts` (Node http server for exercise/English media) |
| `webapp/notify.py` | `api/notify.ts` (already Node-shaped; `child_process`) |
| `webapp/modules/files.py` | `api/files.ts` |
| `webapp/modules/notes_extras.py` | `api/notesExtras.ts` |
| `webapp/modules/tasks.py` | `api/tasks.ts` |
| `webapp/modules/habits.py` | `api/habits.ts` |
| `webapp/modules/calendar.py` | `api/calendar.ts` |
| `webapp/modules/projects.py` | `api/projects.ts` |
| `webapp/modules/goals.py` | `api/goals.ts` |
| `webapp/modules/finance.py` | `api/finance.ts` |
| `webapp/modules/exercise.py` | `api/exercise.ts` |
| `webapp/modules/home.py` | `api/home.ts` |
| `webapp/modules/vaults.py` | `api/vaults.ts` (native dialogs via Electron `dialog`) |
| `webapp/modules/assistant.py` | `api/assistant.ts` |
| `webapp/modules/canvas.py` | `api/canvas.ts` |
| `webapp/modules/practice.py` | `api/practice.ts` |
| `webapp/modules/ladder.py` | `api/ladder.ts` |
| `webapp/modules/study.py` | `api/study.ts` |
| `webapp/modules/web.py` | `api/web.ts` (browser window = a second `BrowserWindow`) |
| `webapp/modules/english_player.py` | `api/englishPlayer.ts` |
| `webapp/api.py` | `api/appState.ts` (the `_open/_resolve/_rel/_entry` helpers + state) |
| — | `api/registry.ts` — collects every exported API function into one object for IPC |

**Native/OS-specific methods** that used pywebview's `window.create_file_dialog`
or `_window`: replace with Electron equivalents — `dialog.showOpenDialog`,
`dialog.showSaveDialog`, `shell.openPath`, `shell.openExternal`, a second
`BrowserWindow` for WEB. Each affected method is flagged in the batch prompt.

Tests — **port ALL of these** to `src/api/*.test.ts` (they are the acceptance
suite; keep every assertion, including the security ones):
`test_webapp_api`, `test_webapp_tasks`, `test_webapp_habits`,
`test_webapp_calendar`, `test_webapp_projects`, `test_webapp_goals`,
`test_webapp_finance`, `test_webapp_exercise`, `test_webapp_vaults`,
`test_webapp_assistant`, `test_webapp_canvas`, `test_webapp_practice`,
`test_webapp_ladder`, `test_webapp_study`, `test_webapp_notes_extras`,
`test_webapp_web`, `test_webapp_english_player`, `test_webapp_notify`.

## Batch 10 — Cutover

- `electron-builder` config in `package.json` (appId, win target, icon, files);
  `npm run electron:build` produces `NoteVault.exe`.
- Optionally remove the `pywebview` and `http` transports from `bridge.ts`,
  leaving only `electron`.
- Delete `notevault_app/`, `run_web.py`, `run_app.py`, `NoteVault.spec`,
  `web_runtime.spec`, `tools/build_web_runtime.py`, `pyproject`/requirements.
- Update `docs/WEB_UI.md` (now "Electron/TS"), delete the pywebview instructions.
- Keep any `tools/gen_golden_*.py` used to produce fixtures until all golden
  checks pass, then delete.

---

## Tests to DROP (they test the deleted Qt UI — do not port)

`test_qt_markdown`, `test_md_highlighter`, `test_markdown_mouse_select`,
`test_editor_responsive`, `test_responsive_layout`, `test_split_notes`,
`test_sidebar_dnd`, `test_workspace_ui`, `test_hotkeys`, `test_table_grid`,
`test_concept_map_panel`, `test_practice_view`, `test_english_module`,
`test_programming_module`, `test_linked_folder_notes`, `test_editor_*`, and the
Qt canvas UI tests: `test_canvas_view`, `test_canvas_interaction`,
`test_canvas_undo`, `test_canvas_resize`, `test_canvas_polish`,
`test_canvas_note_edit`, `test_canvas_notes`, `test_canvas_outline*`,
`test_canvas_paste_table`, `test_canvas_micro_step`, `test_canvas_embed`,
`test_canvas_media`, `test_canvas_arrow_stack`, `test_canvas_duplicate_connect`,
`test_canvas_v2`, `test_canvas_text_markdown`, `test_transclusion_*`,
`test_bookmarks_rich`, `test_check_kb_notes`, `test_webui_e2e` (replaced by a new
Playwright-against-Electron e2e in Batch 10, optional).

If unsure whether a test is UI-only: open it. If it imports `PySide6`,
`notevault_app.ui`, or `QApplication`, **drop it**. If it imports only
`notevault_app.core` or `notevault_app.webapp`, **port it**.
