# BATCHES 1–8 — port the Python core to TypeScript

> Do these **after** Batch 0 and **strictly in order** (1 → 8). Each batch is one
> Antigravity task; paste its section. Before starting, read
> `01_CONVENTIONS.md`, `02_MODULE_MAP.md`, `03_VAULT_CONTRACT.md`, and study the
> reference module `src/core/frontmatter.ts` + `frontmatter.test.ts`.
> Every destination lives under `frontend/src/core/`.

## The loop you repeat for EVERY file (do not skip a step)

1. Open the Python source. Understand what it does. Do **not** redesign it.
2. Create the destination `.ts` file (name from `02_MODULE_MAP.md`). Port
   function by function, applying `01_CONVENTIONS.md` literally. Keep function
   names, argument order, return shapes and **on-disk key strings** identical.
3. Port that module's pytest file to `<name>.test.ts` next to it (see
   CONVENTIONS §Tests). Keep every assertion and its intent. If the Python test
   imports `notevault_app.webapp` (the API), skip it here — it ports in Batch 9.
4. If the module writes vault files, add a **golden-file test**
   (`03_VAULT_CONTRACT.md`): the ported code, given fixed inputs, must produce
   bytes identical to the Python-generated fixture in `src/core/__golden__/`.
5. Run `npm run typecheck` (clean) and `npx vitest run` (all green).
6. Move to the next file. When the batch's files are all done, commit:
   `port(core): <batch name> to TypeScript` and push.

**Never advance with a red test or type error.** Later batches import earlier
ones; a wrong foundation breaks everything downstream.

Golden fixtures: generate them from Python once with `tools/gen_golden.py`
(create it — see `03_VAULT_CONTRACT.md`) BEFORE Python is deleted. Commit the
fixtures under `frontend/src/core/__golden__/<module>/`.

---

## BATCH 1 — Foundations

Already done (reference): `errors.ts`, `store`… no — **only** `errors.ts`,
`text.ts`, `num.ts`, `dates.ts`, `frontmatter.ts` exist. Port the rest:

| Source | Dest | Gotchas |
|---|---|---|
| `core/store.py` | `store.ts` | The big one. `new_id`, `slug`, quote/unquote, encode/decode, `read_doc`/`parse_doc`/`dump_doc` (typed frontmatter — byte-critical), `write_text` (atomic, `\n` newline), `load_json`/`write_json` (`indent=2`, trailing `\n` — see `dump_json`), `to_trash`, `MtimeCache`. `str.maketrans` accent table in `slug` → a char-map replace. Use `crypto` for `new_id`. **Golden-test `dump_doc` and `write_json`.** |
| `core/vault_format.py` | `vaultFormat.ts` | `LAYOUT` dict (the whole path contract), constants, `is_sync_conflict`, `DATETIME_FMT`, type lists. Pure data + helpers. Everything downstream imports this — get the strings EXACT. |
| `core/recurrence.py` | `recurrence.ts` | `Recurrence.parse`/`to_string`/occurrences. Date math via `dates.ts`. |
| `core/file_kinds.py` | `fileKinds.ts` | `kind_for`, extension sets, `badge_for`. |
| — new | `paths.ts` | Helpers named in CONVENTIONS: `relPosix(root, p)`, `insideVault`, glob helper. Uses `node:path`/`node:fs`. |

Tests: `test_vault_format.py` → `vaultFormat.test.ts` (+ store round-trip tests
you write). Golden: `store` (`dump_doc`, `write_json`).
Commit: `port(core): foundations (store, vaultFormat, recurrence, fileKinds)`.

## BATCH 2 — Vault & notes

| Source | Dest | Gotchas |
|---|---|---|
| `core/vault_manager.py` | `vaultManager.ts` | `note_paths` walk (skip `.`-folders, module data), `create_note`/`rename`/`delete`→trash. Uses store + vaultFormat. |
| `core/vault_index.py` | `vaultIndex.ts` | mtime-validated in-memory index; drop the walk-interval only if a test needs determinism. |
| `core/notes_service.py` | `notesService.ts` | facade; bookmarks, search, mentions/backlinks, children_of. |
| `core/attachments.py` | `attachments.ts` | `fs_path`, `resolve`, ext sets (`IMAGE_EXTS`, `AUDIO_EXTS`, `VIDEO_EXTS`). |
| `core/module_attachments.py` | `moduleAttachments.ts` | |
| `core/markdown_utils.py` | `markdownUtils.ts` | link/heading/tag extraction (server-side). |
| `core/tag_index.py` | `tagIndex.ts` | inverted `#tag`→paths; fence-aware regex. |
| `core/templates.py` | `templates.ts` | `{{var}}` expansion incl. `{{date:%d/%m/%Y}}` via `dates.formatDate`. |
| `core/daily_notes.py` | `dailyNotes.ts` | |
| `core/layouts.py` | `layouts.ts` | |
| `core/file_watcher.py` | `fileWatcher.ts` | use `chokidar`, or export a no-op + a `refresh()` the renderer already calls; note which you chose. |
| `core/reminder_scheduler.py` | `reminderScheduler.ts` | due-reminder computation only; the timer lives in the API/main. |

Tests: `test_tag_index`, `test_layouts`, `test_templates_daily_notes`,
`test_note_move`, `test_backlinks`, `test_search_operators` (port the ones that
import only `core`; the rest go to Batch 9). Golden: none new (writes go through
`store`, already covered) except confirm note create/rename bytes.
Commit: `port(core): vault manager, index, notes service and helpers`.

## BATCH 3 — Simple managers

| Source | Dest |
|---|---|
| `core/task_manager.py` | `taskManager.ts` |
| `core/habit_manager.py` | `habitManager.ts` |
| `core/area_manager.py` | `areaManager.ts` |

Gotchas: habit rates count only scheduled days; removing all habits must NOT
reinstall the 15 defaults (there is a test for this — keep it). Golden-test the
habit day file and the task file. Behaviour tests arrive via Batch 9.
Commit: `port(core): task, habit and area managers`.

## BATCH 4 — Bigger managers

| Source | Dest |
|---|---|
| `core/finance_manager.py` | `financeManager.ts` |
| `core/goal_manager.py` | `goalManager.ts` |
| `core/project_manager.py` | `projectManager.ts` |
| `core/schedule_manager.py` | `scheduleManager.ts` |
| `core/schedule_format.py` | `scheduleFormat.ts` |
| `core/exercise_manager.py` | `exerciseManager.ts` |
| `core/workspace_manager.py` | `workspaceManager.ts` |
| `core/knowledge_graph.py` | `knowledgeGraph.ts` |

Gotchas: money is integer cents throughout (no floats). ScheduleManager
registers calendar sources (Goal/Project/Finance) — keep that wiring. Golden-test
each manager's entity file (finance movement, goal, project, issue, exercise
log). Tests: `test_finances`, `test_goals_and_foundations`, `test_projects`,
`test_project_enhancements`, `test_schedule_manager`, `test_knowledge_graph`,
`test_frontmatter_and_workspaces`, `test_submetas_views` (core-only parts).
Commit: `port(core): finance, goals, projects, schedule, exercise, workspaces`.

## BATCH 5 — Practice / study subsystem  → `src/core/practice/` + `src/core/`

Port every file listed under Batch 5 in `02_MODULE_MAP.md`. Order inside the
batch: `modes` → `disciplineCatalog` → `exerciseNote` → `grading` → `attempts` →
`cards` → `timer` → `studyArea` → `ledger` → `errorLog` → `exerciseIndex` →
`recommender` → `handoff` → `ladder` → `drills`; then `studySrsManager`,
`studyErrorManager`, `studyExerciseManager`, `studyDailyQueue`, `mathTools`,
`codeRunner`.

Gotchas:
- `drills.py` uses `Fraction` and `ast` for safe polynomial eval. Create
  `src/core/fraction.ts` (exact rational: numerator/denominator, gcd-reduced,
  add/sub/mul/div/eq, from-string) and a tiny **safe** expression evaluator
  (recursive-descent for `+ - * / ^` and `x`; NO `eval`). Golden/behaviour:
  `test_practice_engine` covers this.
- `grading.py` builds the AI JSON contract and parses replies — port the JSON
  extraction (fenced + raw + brace-scan) faithfully; the UI depends on it.
- `handoff.py` writes request/response files under `.notevault/estudio/handoff` —
  byte-critical, golden-test it.
- `studySrsManager` (SM-2 scheduling) — port the interval math exactly; test
  `test_study_srs_and_errors`.
- `codeRunner.py` uses `subprocess`; port with `child_process` but keep it OFF by
  default / behind the same guard the Python has. Note the sandbox in a comment.

Tests: `test_practice_engine`, `test_practice_ledger`, `test_proof_ladder`,
`test_study_exercises`, `test_study_srs_and_errors`, `test_math_module`.
Commit: `port(core): practice and study subsystem`.

## BATCH 6 — English  → `src/core/english/` + `src/core/`

| Source | Dest | Gotchas |
|---|---|---|
| `core/english/subtitles.py` | `english/subtitles.ts` | SRT/VTT parse, cue pairing (bisect → binary search), sibling-file detection. |
| `core/english/media_links.py` | `english/mediaLinks.ts` | `nv://media?file=&t=` build/parse — must match `src/lib/player.ts` on the renderer. |
| `core/english/mining.py` | `english/mining.ts` | builds `type: exercise` notes; byte-critical → golden-test. |
| `core/english/audio.py` | `english/audio.ts` | WAV header math. |
| `core/english_grammar_manager.py` | `englishGrammarManager.ts` | |
| `core/english_vocabulary_manager.py` | `englishVocabularyManager.ts` | |
| `core/market_skill_manager.py` | `marketSkillManager.ts` | |

Tests: `test_english_tools`, English parts of `test_ai_modes`. Golden: `mining`.
Commit: `port(core): english subtitles, mining and managers`.

## BATCH 7 — Canvas  → `src/core/canvas/`

| Source | Dest | Gotchas |
|---|---|---|
| `core/canvas_format.py` | `canvas/canvasFormat.ts` | `CanvasNode`/`CanvasEdge`/`CanvasDoc` with `to_dict` key order (byte-critical, Obsidian-compatible). Align types with the renderer's `src/lib/canvas.ts` (reuse/extend, don't duplicate). |
| `core/canvas_builder.py` | `canvas/canvasBuilder.ts` | spec→canvas layouts (radial/tree/grid/column/row); `spec_from_yaml` via js-yaml; `validate_spec`. |
| `core/canvas_methodology.py` | `canvas/canvasMethodology.ts` | |
| `core/deliverable_canvas.py` | `canvas/deliverableCanvas.ts` | |

Tests (core-only, DROP the Qt canvas UI tests — see `02_MODULE_MAP.md`):
`test_canvas_builder`, `test_canvas_format`, `test_canvas_methodology`,
`test_deliverable_canvas`, `test_canvas_edges`, `test_canvas_drawing`,
`test_canvas_shapes`, `test_kb_canvas`. Golden: `.canvas` output of the builder.
Commit: `port(core): canvas format, builder and methodology`.

## BATCH 8 — AI client & web store

| Source | Dest | Gotchas |
|---|---|---|
| `core/ai_client.py` | `aiClient.ts` | `PROVIDERS`, `BRIDGE_URLS`, `AIConfig`, `build_messages`, `build_bridge_prompt`, `list_models`, `send_chat`. Replace `requests`/urllib with `fetch` (Node 18+); no Qt worker — the call is awaited by IPC. Keep the API-key handling: it is never returned to the renderer (`has_key` only). |
| `core/web_store.py` | `webStore.ts` | WEB bookmarks/history/usage/rules; `normalize_url`, `host_of`, `Restrictions` (blocklist/allowlist/limits/relax phrase), `UsageMeter`, `blocked_page_html`. Byte-critical for its JSON files → golden-test. |

Tests: `test_web_store`, `test_ai_modes`. Golden: web store files.
Commit: `port(core): AI client and web store`.

---

When Batches 1–8 are green (`npm run typecheck` + `npx vitest run`), proceed to
`BATCH_09_API.md`.
