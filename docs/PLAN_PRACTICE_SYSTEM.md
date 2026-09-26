# PLAN — NoteVault Practice System (the "teacher")

> [!NOTE]
> **REFORMADO POR PRACTICE V2 (`docs/PRACTICE_V2/PLAN.md`)**:
> La experiencia de práctica, configuración y generación fue reformada e implementada en V2:
> 1. **UX dirigida por el usuario**: supera la selección a priori rígida; el estudiante configura directamente tema, skill, dificultad (fácil, media, difícil), cantidad y nivel de asistencia (`TopicConfiguratorDialog`).
> 2. **Generación especializada por concepto**: sustituye al antiguo generador genérico (que estaba en ON-HOLD), permitiendo prácticas y variantes calibradas por concepto y topic manifest.
> 3. **Modelo de temas y exámenes**: manifiestos `_tema.md` (`type: topic`), matriz de avance `skill × dificultad`, exámenes por tema o grupos de temas (`.notevault/estudio/exams/<slug>.json`), dashboard agregado de progreso y entrada matemática por trazo/dibujo local a LaTeX.

Status: active (reformed by Practice V2). Owner of design: Claude. Executors: Claude, then Antigravity. Written 2026-09-24.

**If you are an AI continuing this work: read §0, then jump to §12 (Progress log) and continue
from the first task whose box is not checked. Never redo a checked task. Tick the box and add a
one-line note in the same turn you finish a task.**

---

## 0. Rules for whoever executes this plan

1. Work from `C:\PROGRAMMING\PROJECTS\NoteVault`. Python 3.13, PySide6 6.11. Run tests with
   `python -m pytest tests -q` (unittest-style files, pytest runs them). All tests must pass before
   a task is ticked.
2. **The app never executes the learner's code, SQL or Git commands.** It reads the answer and
   judges it like a teacher: correctness by reasoning, good practices, and corrected examples.
   Do not add subprocess runners, sandboxes, database connections or `exec()` of answers.
   The only thing computed deterministically is arithmetic of math drills (§6.7), which is
   comparing numbers, not running a program.
3. **Notes are the source of truth.** Exercises are Markdown notes inside the vault. Everything
   the app learns about the learner (attempts, errors, SRS state, ledger) lives in
   `.notevault/estudio/…` keyed by the note `id`, never written back into the note.
4. **Grading is 100 % AI**, but whenever the app has evidence (drill arithmetic, the rubric, the
   model solution, the learner's error history) it is handed to the AI inside the grading prompt.
5. **Any AI can run any AI function**, through three transports that return the same JSON (§7):
   HTTP (LM Studio / Ollama / OpenAI-compatible, already in `core/ai_client.py`), clipboard
   bridge (Claude web / ChatGPT / Antigravity, already in `ai_client.py`) and **file handoff**
   (new: request/response files in the vault that an editor agent processes).
6. UI text is Spanish. Code, identifiers, prompts to the AI and the error log are English.
7. Every vault-format change goes into **both** `notevault_app/core/vault_format.py` and
   `C:\PROGRAMMING\PROJECTS\notevault_mobile\lib\core\vault_format.dart`, and into
   `docs/VAULT_FORMAT.md`.
8. After any code change: rebuild the executable, because the user opens the app through it:
   `python -m PyInstaller NoteVault.spec --noconfirm` then copy `dist\NoteVault.exe` over
   `NoteVault.exe` in the repo root. If the app is open, ask the user to close it first.
9. Verify UI through the real event chain (open the note through `MarkdownEditor.open_note`, click
   buttons with `QTest`), and grab a screenshot (`widget.grab().save(path)`) and look at it before
   calling a UI task done.
10. Do not modify `C:\PROGRAMMING\Programación\FULLSTACK_PRACTICE` (the user's own training
    systems). They are **inspiration**: read them, do not port their runner.

---

## 1. Goal

When the user opens a practice note, NoteVault shows an interactive practice view instead of the
Markdown editor: statement, answer area, escalating hints, a timer, a submit button that sends the
answer to an AI teacher, and a result card with score, rubric, classified errors, feedback and a
corrected example. Every attempt feeds an English error log that any AI reads before generating or
reviewing exercises, and feeds spaced repetition so the exercise comes back when it should.

The practice differs by **discipline** and by **cognitive act** (mode), because that is how the
user's own training systems work: Python/JS/SQL train IMPLEMENT/DEBUG/REFACTOR, Git trains
EXECUTE/FIX/WORKFLOW, and math, English and geometry each need their own acts.

The user's targets (calibrate difficulty and generation with them):
- English: reach **C1**; today **A2** (was B1+ before stopping).
- Programming: relearn from zero — programming logic, databases, Python, JS, Git.
- Mathematics: fast calculation, concept recall, proofs, abstract thinking.

---

## 2. What the user's training systems teach us (design inputs)

Source: `C:\PROGRAMMING\Programación\FULLSTACK_PRACTICE\` — `1.PYTHON\0.PYTHON_TRAINING_SYSTEM.md`,
`2.JAVSCRIPT\0.JAVASCRIPT_TRAINING_SYSTEM.md`, `3.POSTGREESQL\0.POSTGRESQL_TRAINING_SYSTEM.md`,
`6.GIT\0.GIT_TRAINING_SYSTEM.md`, `coach\` (profile, recommender), `.agents\skills\coach\SKILL.md`.

Carry these into the app:

| Training-system idea | Where it lives in the app |
|---|---|
| Skill Ledger `Not started → Practicing → Consolidated`; consolidate only after Advanced DEBUG/REFACTOR (or all 3 difficulties) | `core/practice/ledger.py` (Phase 6) |
| **Anchors**: real, non-cosmetic failure modes per skill, incl. AI-typical ones | `core/practice/discipline_catalog.py` → grading prompt + error classification + generation |
| Current Chapter = mandatory focus inside a skill | frontmatter `chapter:` on the exercise; generation prompt |
| Modes differ by act; "no shared template across modes" | `core/practice/modes.py` |
| Mastery signal: exact expected result, never the process | section `## Señal de dominio` in programming notes; given to the AI judge |
| Never hand over the solution; name the blocking concept and ask a guiding question | grading prompt rule for non-correct verdicts |
| Assistance `Helper → No Help` (= faded worked examples) | frontmatter `assistance:`; hints policy |
| Protocol Skill 8 (hypothesis → evidence → root cause vs symptom) inside every DEBUG | `debug` mode judge focus |
| Framing rule: every exercise is a real automation/backend task, no `data1` placeholders | discipline `framing` text → generation + judging |
| Recommender: repeated weakness ≥ 2 → DEBUG session; chapter complete → integration | `core/practice/recommender.py` (Phase 6) |
| 4 Metas: atomic concept → integration → judgment → project | ladder used by the recommender (Phase 6) |

Explicitly **not** carried over: the `solve(*args)` runner and any execution of answers (rule 0.2).

---

## 3. Verified inventory of the current code (2026-09-24)

Paths relative to `notevault_app/`.

- **Live note editor**: `ui/components/notes/markdown_editor.py`, class `MarkdownEditor` (L180),
  hosted by `ui/components/notes/split_notes.py` `SplitNotes` (L95). `ui/components/editor_panel.py`
  is legacy and unused.
- Open path: `NotesSidebar._on_item_clicked` → `MainWindow._open_notes_path` (main_window.py L621)
  → `SplitNotes.open_note` (L425) → `MarkdownEditor.open_note(path, line=0, new_tab=False)` (L817).
- `MarkdownEditor._init_ui` (L217) builds `self._stack` (QStackedWidget): 0 `_rich`, 1 `_raw`,
  2 `_read`, 3 `CanvasView` (L272-276). **The practice view becomes index 4.**
- `MarkdownEditor._load_into_view(note)` (L1100) already special-cases canvas (hides
  `_toolbar_host`, `_ws_frame`, `_mentions`, sets stack 3, returns). Practice follows the same
  pattern. Guards that also need the practice case: `_capture_current` (L1220), `close_tab`
  (L869), `open_note` goto-line (L823), `refresh_mentions` (L1164), `_on_backlinks_count_changed`
  (L1170).
- `_OpenNote` (L113): `path, frontmatter (raw text incl. ---), body, kind ("note"|"code"|"canvas"),
  dirty, pinned`.
- Frontmatter: `core/frontmatter_utils.py` — `parse_frontmatter(text) -> (dict, body)` (L20),
  `dump_frontmatter(dict)`, `update_frontmatter(full_text, updates)`. Flat only; inline `[a, b]`
  lists; `VALID_TYPES` already contains `"exercise"`.
- Study backend (not wired to any UI): `core/study_srs_manager.py` `StudySRSManager`
  (`register_item(entity_id, entity_type, subject, topic, source_note, difficulty)` returns the
  existing item if present; `review(srs_id, quality 0-5)` SM-2; `due_items`), storage
  `.notevault/estudio/srs/<id>.json`. `core/study_error_manager.py` `StudyErrorManager`
  (`record_error(...)`, 11 `ERROR_CATEGORIES`), storage `.notevault/estudio/errores/`.
  `core/study_exercise_manager.py` stores JSON exercises (not used by this plan: our exercises are
  notes). `ui/components/notes/study_queue_panel.py` and `study_exercise_dialog.py` exist but are
  not wired (the dialog has a `NameError`: `Path` not imported at L62).
- AI: `core/ai_client.py` — `AIConfig` (`.is_bridge`), `send_chat(cfg, messages)`,
  `AIWorker(QThread)` with `finished_ok(str)`/`failed(str)`, `build_bridge_prompt(messages)`,
  `BRIDGE_URLS`, `AI_MODES`. Config persisted by `config.AppConfig.get_ai_config()`.
  Chat panel bridge flow: `ui/components/notes/ai_chat_panel.py` `_run_bridge` (L552, copies prompt
  and opens URL), `paste_reply` (L564).
- English audio already exists: `ui/components/notes/english_audio_panel.py`
  (`ListeningPanel`, `SpeakingPanel` recording with `QtMultimedia.QAudioSource`, TTS).
- No timer/pomodoro anywhere. No LaTeX rendering anywhere. Markdown renders with Qt's
  `QTextDocument.setMarkdown` via `NoteTextBrowser.load_markdown` (`note_view.py` L617/L637).
- Vault format: `core/vault_format.py` `LAYOUT` has `study_*` keys; the Dart map
  (`notevault_mobile/lib/core/vault_format.dart`) has **no** `study_*`/`workspace*` keys.
  `tests/test_vault_format.py` does not snapshot `LAYOUT`, so adding keys is safe.
- Styling: inline stylesheets with dark hex constants (`BG_PAGE #1a1a1e`, `BG_BAR #202024`,
  `BORDER #33333e`, `TEXT #dcdde0`, `TEXT_DIM #888895`, `ACCENT #7c5af0`, `GREEN #3fb950`) that
  `ui/theme.py` re-tints for the light theme. Use the same constants; colours painted with
  `QColor` must go through `theme.tint()`.
- Math exercise notes already exist in the KB format (`docs/knowledge_base/templates/exercise.md`,
  reference folder `docs/knowledge_base/examples/Matemáticas/1 Lógica y demostración/1.10 Inducción
  matemática/Ejercicios/`). The practice view must open them **unchanged**.

---

## 4. Architecture

```
            ┌──────────────────────── Practice note (.md, source of truth) ───────────────────────┐
            │ frontmatter: type: exercise · subject · discipline · skill · mode · difficulty · … │
            │ sections: Enunciado · Código · Pistas · Solución · Rúbrica · Errores típicos · …   │
            └──────────────────────────────────────┬──────────────────────────────────────────────┘
                                                   │ parse (core/practice/exercise_note.py)
 ┌───────────────┐   ┌──────────────────┐   ┌──────▼─────────┐   ┌────────────────────────────┐
 │ modes.py      │──▶│ discipline_      │──▶│ PracticeView   │──▶│ grading.py (prompt + parse)│
 │ (act, answer  │   │ catalog.py       │   │ (UI, timer,    │   └──────────┬─────────────────┘
 │  kind, timer, │   │ (skills, anchors,│   │  hints, submit)│              │ transport
 │  judge focus) │   │  framing)        │   └──────┬─────────┘   ┌──────────▼─────────────────┐
 └───────────────┘   └──────────────────┘          │             │ HTTP · clipboard · handoff │
                                                   │             └──────────┬─────────────────┘
                                                   ▼  GradeResult (JSON)    │
                     ┌────────────────────────────────────────────────────────▼──────────────┐
                     │ attempts.py (.notevault/estudio/intentos) · error_log.py (English log) │
                     │ StudySRSManager.review(quality)  · ledger.py / recommender.py (Ph. 6)  │
                     └────────────────────────────────────────────────────────────────────────┘
```

Layers:

| Layer | Shared or specific | Files |
|---|---|---|
| A. Theory (concept notes, cards) | shared structure | existing KB notes; indexer in Phase 6 |
| B. Practice engine | shared, written once | `core/practice/*` |
| C. Modes (one per cognitive act) | shared catalogue, reused across subjects | `core/practice/modes.py` |
| D. Discipline specs (inspired by the training systems) | one per discipline | `core/practice/discipline_catalog.py` (+ vault override in Phase 9) |
| E. Tools for user-supplied content (video, subtitles, recorder) | English only | Phase 7 |

---

## 5. File formats (contracts — do not change without updating this section)

### 5.1 Practice note

A note is a practice note when its frontmatter has `type: exercise`.

Frontmatter keys (flat YAML, numbers that look like versions must be quoted, no commas inside
list items):

| Key | Required | Values | Notes |
|---|---|---|---|
| `id` | yes | stable dotted id, e.g. `mat.logica.induccion.e01`, `prog.python.s06.e01` | key for attempts/SRS |
| `title` | yes | text | |
| `subject` | yes | `mathematics` \| `programming` \| `english` \| `general` | |
| `type` | yes | `exercise` | |
| `mode` | no | a mode id of §6.1 | if absent, derived from `practice` via `PRACTICE_ALIASES`, else `solve` |
| `practice` | no (math KB) | `demostracion`, `calculo`, `problema`, `contraejemplo`, `verdadero_falso`, `encontrar_error`, `explicar` | legacy math key, mapped to a mode |
| `discipline` | no | a discipline id of §6.2 | default per subject: `math_general`, `programming_logic`, `english_grammar` |
| `skill` | no | skill code inside the discipline, e.g. `"06"` | quoted |
| `chapter` | no | free text focus inside the skill | |
| `difficulty` | no | 1-5 | default 2 |
| `minutes` | no | int | default timer length |
| `timer` | no | `pomodoro` \| `stopwatch` \| `off` \| `<N>m` | overrides the mode default |
| `assistance` | no | `helper` \| `nohelp` | `nohelp` hides hints until the learner asks twice |
| `level` | no (English) | `A1`…`C2` | CEFR target used by the judge |
| `drill` | drill mode only | a drill kind of §6.7 | |
| `items` | drill mode only | int, default 20 | |
| `concept` | no | concept id | links the exercise to its concept note |
| `status`, `verified` | no | as in the KB | |

Sections (H2, Spanish; the parser also accepts the English alias in brackets):

| Section | Alias | Content | Shown to learner |
|---|---|---|---|
| `## Enunciado` | `Statement` | the task | yes |
| `## Código` | `Code` | one fenced block given to the learner (debug/refactor/read) | yes |
| `## Pistas` | `Hints` | `### Pista N` subsections, or `- ` bullets | one at a time |
| `## Solución` | `Solution` | model answer | only after submitting or giving up |
| `## Rúbrica` | `Rubric` | `- [ ] (1) item` lines (5 in math KB) | after grading, with hits |
| `## Errores típicos` | `Typical errors` | `- **category:** text` | never (judge only) |
| `## Señal de dominio` | `Mastery signal` | exact expected result/behaviour | never (judge only) |

### 5.2 Attempts — `.notevault/estudio/intentos/<key>.json`

`<key>` = `att_` + first 12 hex chars of `sha256(note_id)`.

```json
{
  "note_id": "mat.logica.induccion.e01",
  "note_path": "Matemáticas/1 Lógica y demostración/1.10 Inducción matemática/Ejercicios/1.10-E01 ….md",
  "draft": "text the learner is typing (autosaved)",
  "attempts": [
    {
      "at": "2026-09-24T18:03:11",
      "mode": "prove", "discipline": "math_general", "skill": "", "subject": "mathematics",
      "answer": "…", "hints_used": 1, "seconds": 842, "solution_seen": false,
      "transport": "http|bridge|handoff|local",
      "score": 80, "quality": 4, "verdict": "partial",
      "rubric": [true, true, true, false, true],
      "errors": [ {"category": "logical", "anchor": "", "description": "…", "evidence": "…", "fix": "…"} ],
      "feedback": "…", "next_step": "…", "example": "…"
    }
  ]
}
```

### 5.3 Error records — extend `.notevault/estudio/errores/<id>.json`

New optional fields added to `sanitize_error`: `discipline`, `skill`, `mode`, `anchor`,
`description_en`, `fix_en`, `note_id`, `last_seen`. Repeat detection: an unresolved error with the
same `subject + discipline + skill + (anchor or category)` is updated (`repeat_count += 1`,
`last_seen`) instead of creating a new file.

### 5.4 English error digest — `.notevault/estudio/errores/ERROR_LOG.md`

Regenerated after every graded attempt. Plain English Markdown that any AI reads before generating
or reviewing exercises:

```
# NoteVault learner error log
Generated 2026-09-24T18:03. Unresolved errors, most repeated first.

## mathematics
- [x3] logical · math_general · anchor: "induction step assumes P(n+1)" — Assumed what had to be proved in the inductive step. Fix: start from P(n) and derive P(n+1). Last seen 2026-09-24 in mat.logica.induccion.e01.
…
```

### 5.5 Grade JSON (what every transport must return)

```json
{
  "score": 0,
  "verdict": "correct | partial | incorrect",
  "rubric": [true, false, true, true, false],
  "errors": [
    {"category": "one of ERROR_CATEGORIES", "anchor": "exact anchor text from the list or \"\"",
     "description": "English, one sentence", "evidence": "short quote from the answer",
     "fix": "English, how to fix it"}
  ],
  "feedback": "Spanish, 2-5 sentences, teacher voice",
  "next_step": "Spanish, one concrete action",
  "example": "optional corrected snippet (code, SQL, command, formula or sentence)"
}
```

`quality` (0-5, for SRS) is computed by the app, not by the AI (§6.5).

### 5.6 File handoff — `.notevault/estudio/handoff/`

- Request: `requests/<req_id>.json` = `{"id", "kind": "grade"|"generate", "created", "note_id",
  "note_path", "messages": [...], "response_file": "responses/<req_id>.json"}` plus
  `requests/<req_id>.md` = the flattened prompt (`build_bridge_prompt`) followed by an
  instruction block telling the agent to write the JSON of §5.5 to the response path.
- Response: `responses/<req_id>.json` (the grade JSON; a Markdown file containing a fenced JSON
  block is also accepted).
- `req_id` = `req_` + `YYYYmmddHHMMSS` + `_` + 6 hex.
- The app polls the response path every 2 s while the practice view waits; when it appears the
  app parses it, records the attempt and moves the request to `requests/done/`.

---

## 6. Engine specification (`notevault_app/core/practice/`)

### 6.1 `modes.py`

```python
@dataclass(frozen=True)
class PracticeMode:
    id: str             # English id used in frontmatter
    label: str          # Spanish UI label
    act: str            # English description of the cognitive act (goes into prompts)
    answer_kind: str    # "text" | "code" | "short" | "drill"
    timer: str          # default timer spec, same syntax as frontmatter `timer`
    judge_focus: str    # English: what the judge must check for this act
    subjects: tuple     # subjects where it makes sense

MODES: dict[str, PracticeMode]
PRACTICE_ALIASES: dict[str, str]   # math `practice:` value -> mode id
def mode_for(frontmatter: dict) -> PracticeMode
```

MVP catalogue (16 modes):

| id | label | subjects | answer | default timer | judge focus (summary) |
|---|---|---|---|---|---|
| `prove` | Demostración | math | text | pomodoro | every step justified, hypotheses used, no circularity |
| `solve` | Problema | math, general | text | pomodoro | correct result + justified procedure |
| `counterexample` | Contraejemplo | math | text | 15m | object satisfies hypotheses and violates the claim, verified |
| `true_false` | Verdadero o falso | math, english | text | 10m | verdict + proof or counterexample |
| `find_error` | Encontrar el error | math, english, programming | text | 15m | exact location, why it is wrong, correction |
| `explain` | Explicar (Feynman) | all | text | 10m | accuracy, completeness, own words, example |
| `drill` | Cálculo rápido | math | drill | 5m | deterministic (§6.7) |
| `implement` | Implementar | programming | code | pomodoro | correct behaviour by reasoning on mastery signal, edge cases, practices |
| `debug` | Depurar | programming | code | pomodoro | each bug: line, why, fix; hypothesis → evidence → root cause vs symptom |
| `refactor` | Refactorizar | programming | code | pomodoro | same behaviour, criteria met, readability |
| `design` | Diseño (esquema/arquitectura) | programming | code | pomodoro | constraints, normalization, types, trade-offs justified |
| `commands` | Secuencia de comandos | programming | code | 15m | commands reach the stated repo state; safe choices (revert vs reset…) |
| `translate` | Traducir | english | text | 10m | meaning, grammar, natural register for the CEFR level |
| `rewrite` | Reescribir / corregir | english | text | 10m | errors fixed, target structure used, level-appropriate |
| `writing` | Redacción libre | english | text | pomodoro | CEFR criteria: task, coherence, range, accuracy |
| `cloze` | Completar huecos | english, programming | short | 5m | each blank correct in context |

### 6.2 `discipline_catalog.py`

```python
@dataclass(frozen=True)
class Skill:
    code: str                 # "06"
    title: str                # Spanish
    anchors: tuple            # English failure modes

@dataclass(frozen=True)
class Discipline:
    id: str
    subject: str
    title: str                # Spanish
    modes: tuple              # allowed mode ids
    framing: str              # English: how exercises must be framed (from the training systems)
    skills: tuple             # of Skill

DISCIPLINES: dict[str, Discipline]
DEFAULT_DISCIPLINE: dict[str, str]  # subject -> discipline id
def discipline_for(frontmatter: dict) -> Discipline
def skill_of(discipline, code) -> Skill | None
```

MVP catalogue (extension: **10 disciplines**, every programming skill with **≥ 2 anchors**
taken from the user's training systems, English and math skills with ≥ 3 anchors):

| id | subject | modes | skills (MVP) |
|---|---|---|---|
| `math_general` | mathematics | prove, solve, counterexample, true_false, find_error, explain | proof writing, calculation, concept recall, abstract thinking |
| `math_drill` | mathematics | drill | arithmetic, fractions, powers, percent, derivatives |
| `programming_logic` | programming | implement, find_error, explain, cloze | control flow, data structures, decomposition, tracing |
| `python` | programming | implement, debug, refactor, explain | the 15 Ledger skills of `0.PYTHON_TRAINING_SYSTEM.md` |
| `javascript` | programming | implement, debug, refactor, explain | the 14 Ledger skills of `0.JAVASCRIPT_TRAINING_SYSTEM.md` |
| `sql` | programming | design, implement, debug, refactor, explain | the 13 Ledger skills of `0.POSTGRESQL_TRAINING_SYSTEM.md` |
| `git` | programming | commands, find_error, explain | the 9 Ledger skills of `0.GIT_TRAINING_SYSTEM.md` |
| `english_grammar` | english | rewrite, find_error, cloze, translate, true_false | tenses, articles & determiners, prepositions, word order, conditionals, passive, relative clauses, reported speech |
| `english_vocabulary` | english | cloze, translate, explain | collocations, phrasal verbs, false friends (ES→EN), word formation |
| `english_writing` | english | writing, rewrite | paragraph, email, opinion essay |

### 6.3 `exercise_note.py`

```python
@dataclass
class ExerciseNote:
    path: Path | None
    note_id: str
    title: str
    frontmatter: dict
    subject: str
    discipline: str
    skill: str
    mode: str
    difficulty: int
    minutes: int
    timer: str
    assistance: str
    level: str
    statement: str
    code: str               # content of the fenced block in ## Código, without fences
    code_lang: str
    hints: list[str]
    solution: str
    rubric: list[str]       # item text without "- [ ] (1) "
    typical_errors: list[tuple[str, str]]   # (category, text)
    mastery_signal: str
    drill: str
    items: int

def is_practice_frontmatter(fm: dict) -> bool          # fm.get("type") == "exercise"
def parse_exercise(text: str, path: Path | None = None) -> ExerciseNote
```

Parsing rules: split frontmatter with `frontmatter_utils.parse_frontmatter`; sections are H2
(`## `); `### Pista N` sub-headings or `- `/`N.` bullets inside `## Pistas` become hints; the H1
title, if present, is used when `title` is missing; `note_id` falls back to the file stem.

### 6.4 `timer.py` (pure logic)

```python
@dataclass(frozen=True)
class TimerSpec:
    kind: str            # "countdown" | "stopwatch" | "pomodoro" | "off"
    seconds: int         # work length (countdown/pomodoro)
    break_seconds: int   # pomodoro break, 300

def parse_timer(value: str | None, minutes: int = 0, default: str = "stopwatch") -> TimerSpec
```

Priority: frontmatter `timer` → frontmatter `minutes` (countdown) → mode default. `pomodoro` =
25 min + 5 min break. `"8m"`, `"8 min"`, `"8"` → countdown 480 s.

### 6.5 `grading.py`

```python
@dataclass
class GradeError: category: str; anchor: str; description: str; evidence: str; fix: str

@dataclass
class GradeResult:
    score: int; verdict: str; rubric: list[bool]; errors: list[GradeError]
    feedback: str; next_step: str; example: str; raw: str

class GradeParseError(ValueError): ...

def build_grading_messages(ex: ExerciseNote, answer: str, *, hints_used: int, seconds: int,
                           solution_seen: bool, recent_errors: list[dict]) -> list[dict]
def parse_grade_reply(text: str, rubric_len: int) -> GradeResult
def quality_from(result: GradeResult, hints_used: int, solution_seen: bool) -> int
```

- System message: the judge persona ("You are NoteVault's practice judge: a demanding but kind
  teacher. You never execute code; you read it and reason about its behaviour …"), the mode's
  `act` and `judge_focus`, the discipline `framing`, the skill title and anchors, the CEFR level
  for English, and the output contract (§5.5, JSON only, feedback in Spanish, descriptions in
  English, never reveal the full solution unless the verdict is `correct` — otherwise name the
  blocking concept and ask one guiding question in `next_step`; always include a short corrected
  `example` when there is an error).
- User message: statement, given code, rubric (numbered), model solution and typical errors
  (marked "for the judge only"), mastery signal, the learner's answer, hints used, time spent,
  whether the solution was seen, and up to 15 recent unresolved errors of the same subject
  (to flag repeats).
- `parse_grade_reply`: accept raw JSON, a ```json fenced block, or the first `{…}` span; clamp
  score to 0-100; normalise verdict; pad/truncate `rubric` to `rubric_len`; unknown categories →
  `conceptual`. Raise `GradeParseError` with a Spanish message when no JSON object is found.
- `quality_from`: score ≥ 90 → 5, ≥ 75 → 4, ≥ 60 → 3, ≥ 40 → 2, ≥ 20 → 1, else 0; −1 if
  `hints_used ≥ 2`; capped at 2 if `solution_seen`; never below 0.

### 6.6 `attempts.py`, `error_log.py`, `handoff.py`

```python
class PracticeAttemptStore:
    def __init__(self, vault_root: Path)
    def load(self, note_id: str) -> dict
    def attempts(self, note_id: str) -> list[dict]
    def draft(self, note_id: str) -> str
    def save_draft(self, note_id: str, note_path: str, text: str) -> None
    def record(self, ex: ExerciseNote, note_path: str, *, answer: str, hints_used: int,
               seconds: int, solution_seen: bool, transport: str,
               result: GradeResult | None, quality: int) -> dict   # clears the draft

# error_log.py
def record_grade_errors(vault_root: Path, ex: ExerciseNote, result: GradeResult,
                        answer: str) -> list[dict]
def recent_errors(vault_root: Path, subject: str, limit: int = 15) -> list[dict]
def write_error_digest(vault_root: Path) -> Path
def apply_result(vault_root: Path, ex: ExerciseNote, note_path: str, *, answer: str,
                 hints_used: int, seconds: int, solution_seen: bool, transport: str,
                 result: GradeResult) -> dict
    # records attempt + errors + digest + SRS review; returns the attempt dict

# handoff.py
def new_request_id() -> str
def write_request(vault_root: Path, kind: str, messages: list[dict], meta: dict) -> str
def response_path(vault_root: Path, req_id: str) -> Path
def read_response(vault_root: Path, req_id: str) -> str | None
def close_request(vault_root: Path, req_id: str) -> None
def pending_requests(vault_root: Path) -> list[str]
```

SRS link (inside `apply_result`): `StudySRSManager(vault).register_item(entity_id=note_id,
entity_type="exercise", subject=subject, topic=skill or discipline, source_note=note_path,
difficulty=difficulty)` then `.review(item["id"], quality)`.

### 6.7 `drills.py` (math fast calculation — deterministic, offline)

```python
@dataclass(frozen=True)
class DrillItem: prompt: str; answer: str; kind: str

DRILL_KINDS: dict[str, str]        # kind -> Spanish label
def generate(kind: str, count: int, difficulty: int = 2, seed: int | None = None) -> list[DrillItem]
def check(item: DrillItem, given: str) -> bool
def summarize(results: list[tuple[DrillItem, str, bool, float]]) -> GradeResult
```

Kinds (MVP 5): `arithmetic` (integer + − × ÷ exact), `fractions` (answer `a/b` reduced or
equivalent), `powers` (powers and perfect roots), `percent` (x % of y, exact decimals),
`derivatives` (polynomial derivative; answer checked by evaluating both expressions at 5 points
with a safe AST evaluator that allows only numbers, `x`, `+ - * / ^ **`, parentheses and implicit
multiplication like `6x^2`). Difficulty 1-5 scales operand size. `summarize` builds a
`GradeResult` locally (score = accuracy %, speed noted in feedback; wrong items become
`calculation` errors with description `"<kind>: expected <a>, got <b>"`). No AI call.

---

## 7. Practice view (`notevault_app/ui/components/notes/practice/`)

Files:
- `__init__.py` → exports `PracticeView`.
- `practice_timer.py` → `PracticeTimer(QWidget)`: shows `mm:ss` and phase label ("Trabajo",
  "Descanso", "Libre"); buttons ▶/⏸ and ↺; `configure(spec: TimerSpec)`, `start()`, `pause()`,
  `reset()`, `elapsed_seconds() -> int`, signal `finished()` (countdown end or pomodoro work end:
  flashes the label in accent colour and plays `QApplication.beep()`). Pomodoro switches to break
  automatically.
- `practice_view.py` → `PracticeView(QWidget)`.
- `drill_panel.py` → `DrillPanel(QWidget)` for `mode: drill`.

`PracticeView` API:
```python
class PracticeView(QWidget):
    edit_requested = Signal()                    # user wants the Markdown editor
    open_note_requested = Signal(Path)
    def __init__(self, vault_root: Path, parent=None)
    def set_vault(self, vault_root: Path) -> None
    def load(self, path: Path, text: str) -> None
```

Layout (top to bottom, inside a `QScrollArea`, max content width 860 px, centred):
1. Header card: title (18 px bold); chips `subject · discipline/skill · mode label · ★ difficulty`;
   right side: `PracticeTimer` + button «Editar nota».
2. «Enunciado»: `NoteTextBrowser` rendering the statement Markdown (+ the `## Código` block).
3. «Tu respuesta»: `QPlainTextEdit` — monospace (`theme.CODE_FONT_FAMILY`) when the mode's
   `answer_kind` is `code`, note font otherwise; min height 220 px; placeholder text per mode;
   draft autosaved 800 ms after typing; the timer auto-starts on the first keystroke.
4. Hints row: button «Pista (n/N)» reveals the next hint into a hints box (each hint numbered);
   hidden when the note has no hints; with `assistance: nohelp` the first press asks for
   confirmation.
5. Action row: «Entregar para corrección» (primary, accent), «Me rindo / ver solución» (ghost),
   and a status label (transport + waiting state).
6. Result card (hidden until graded): big score `NN/100` coloured by verdict (green ≥ 75, amber
   ≥ 40, red below), verdict label, rubric checklist (✓/✗ per item), errors list
   (`category · anchor` bold + English description + fix), «Retroalimentación» (Spanish feedback),
   «Siguiente paso», «Ejemplo corregido» (monospace block) and the model solution (collapsed
   «Ver solución modelo»).
7. History line: «N intentos · mejor NN · último <fecha>».

Submit flow:
- Empty answer → status «Escribe una respuesta primero».
- `cfg = AIConfig.from_dict(AppConfig.get_ai_config())`; messages = `build_grading_messages(...)`.
- **HTTP** (`not cfg.is_bridge`): `AIWorker(cfg, messages)`; on `finished_ok` → parse → apply.
  On `failed` → show the error and offer «Usar archivo de intercambio» (handoff).
- **Bridge** (`cfg.is_bridge`): copy `build_bridge_prompt(messages)` + the JSON contract to the
  clipboard, open `BRIDGE_URLS[cfg.provider]`, **also** write a handoff request, and show
  «Pegar corrección» (reads the clipboard) while polling the handoff response every 2 s.
- **Handoff only**: available from the error state; writes the request and polls.
- On a parse error: keep the raw reply visible and let the learner retry «Pegar corrección».
- After a result: `apply_result(...)` (attempt + errors + digest + SRS), render the result card,
  refresh the history line, disable the answer (button «Nuevo intento» re-enables it and resets
  hints/timer).

Integration in `markdown_editor.py`:
1. Import `from .practice import PracticeView` and `from ....core.practice.exercise_note import
   is_practice_frontmatter`.
2. `_OpenNote.__init__`: add `self.practice = False` and `self.show_practice = True`.
3. `open_note`: after building a `"note"` kind `_OpenNote`, set
   `note.practice = is_practice_frontmatter(parse_frontmatter(fm + "\n")[0])` when `fm` is not
   empty.
4. `_init_ui`: after the canvas, `self._practice = PracticeView(self.vault.vault_root)`,
   connect `edit_requested` → `self._practice_edit`, `self._stack.addWidget(self._practice)  # 4`.
5. `_load_into_view`: right after the canvas branch, if `note.practice and note.show_practice`:
   hide `_toolbar_host`, `_ws_frame`, `_mentions`; `self._stack.setCurrentIndex(4)`;
   `self._practice.load(note.path, note.frontmatter + note.body)`; status text
   «Práctica · <mode label>»; return. Otherwise make sure a practice note in edit mode shows the
   «▶ Practicar» button (step 7).
6. Guards: `_capture_current` returns early when the current note is showing the practice view;
   `refresh_mentions` / `_on_backlinks_count_changed` skip it; `open_note` goto-line skips it.
7. `_practice_edit()`: `note.show_practice = False`, reload the view. Add a toolbar button
   `self._practice_btn` («▶ Practicar», visible only when `note.practice`), whose click sets
   `show_practice = True`, saves pending edits (`save_current()`) and reloads.
8. Vault switch: wherever `MarkdownEditor` receives a new vault, call
   `self._practice.set_vault(...)`.

---

## 8. Study techniques → where they live

| Technique | Implemented by |
|---|---|
| Retrieval practice / testing effect | every submit is recall; proof ladder L5 (blank); cards (Phase 6) |
| Spacing | `StudySRSManager.review` on every graded attempt; skill-level spacing (Phase 6) |
| Interleaving | mixed daily queue across skills once `Practicing` (Phase 6) |
| Faded worked examples | `assistance: helper → nohelp`; escalating hints; proof ladder levels |
| Self-explanation / elaboration | `explain` mode; "Por qué" per proof step; debug protocol |
| Deliberate practice | error digest → generation targets repeated anchors (Phase 4); recommender (Phase 6) |
| Desirable difficulty | fresh generated variants instead of repeating the same exercise (Phase 4/6) |
| Mastery learning | ledger consolidation only after Advanced judgment modes (Phase 6) |
| Immediate feedback | result card with rubric, errors and corrected example |
| Timeboxing | per-mode timer, pomodoro |
| Comprehensible input i+1, shadowing, narrow listening, sentence mining | English tools (Phase 7) |
| Feynman technique | `explain` / `writing` modes |

---

## 9. Phases

Extension targets are minimums. "MVP" = Phases 1-3.

### Phase 1 — Engine core (MVP)
Create `notevault_app/core/practice/` with `__init__.py`, `modes.py` (16 modes), 
`discipline_catalog.py` (10 disciplines), `exercise_note.py`, `timer.py`, `grading.py`,
`attempts.py`, `error_log.py`, `handoff.py`, `drills.py` (5 kinds). Extend
`core/study_error_manager.py` (§5.3). Add vault keys (§10).
Tests: `tests/test_practice_engine.py` — parse every reference math exercise
(`docs/knowledge_base/examples/.../Ejercicios/*.md`) and the sample notes of §11 (hints count,
rubric = 5, mode mapping); timer parsing; grade parsing (raw JSON, fenced, embedded, garbage →
`GradeParseError`); `quality_from` table; attempts round-trip; error repeat detection; digest
content; handoff write/read/close; drills generate+check for every kind incl. equivalent answers
(`1/2` vs `2/4`, `6x^2` vs `6*x**2`).

### Phase 2 — Practice view (MVP)
Create `ui/components/notes/practice/` (§7) and hook `markdown_editor.py` (§7 integration).
Tests: `tests/test_practice_view.py` (offscreen) — opening a practice note through
`MarkdownEditor.open_note` shows stack index 4; a normal note still shows 0/1/2; «Editar nota»
switches to the editor and «▶ Practicar» back; hints reveal one at a time; submitting with a
monkeypatched `send_chat` returning a fixed JSON renders the score and writes the attempt,
the error file, the digest and an SRS item; drill panel end-to-end with typed answers.
Visual check: grab screenshots of a math `prove` note, a programming `debug` note and a drill,
look at them, fix layout issues.

### Phase 3 — AI protocol docs and invocation prompts (MVP)
- `docs/AI_PRACTICE_PROTOCOL.md`: the contract of §5.5-5.6 for any AI, with a worked example.
- `docs/prompts/GRADE_PENDING_PRACTICE.md`: ready-to-paste prompt for an editor agent
  (Antigravity, Claude Code, Cursor, a local model with file tools): "for every request in
  `<vault>/.notevault/estudio/handoff/requests/*.json` without a response, grade it following
  the embedded messages and write `responses/<id>.json`".
- Rebuild `NoteVault.exe` (rule 0.8).

### Phase 4 — Exercise generation — SUPERSEDED BY PRACTICE V2 (2026-09-26)
> **Actualización V2**: Superado por Practice V2 (`docs/PRACTICE_V2/PLAN.md`). La generación genérica previa en ON-HOLD ha sido reemplazada por generación dirigida por el usuario (`TopicConfiguratorDialog`) y especializada por concepto dentro de los manifiestos de tema (`_tema.md`), con ensamblaje de exámenes calibrados por dificultad (`src/core/practice/exams.ts`).

El texto original se conserva a continuación como referencia histórica:
- `core/practice/generation.py`: `build_generation_messages(discipline, skill, mode, count,
  difficulty, *, concept_note_text="", chapter="", level="", recent_errors=[], assistance)` —
  embeds the discipline framing, anchors, mode act, the note format of §5.1, the study-technique
  rules (variety of modes, escalating hints, rubric of 5 observable items, target the learner's
  repeated anchors, never repeat an existing exercise title) and asks for N complete notes
  separated by a marker line `===NOTE===`. `parse_generated_notes(text) -> list[str]`;
  `write_generated_notes(folder, notes) -> list[Path]` (filenames `<prefix>-E<NN> <title>.md`,
  never overwriting).
- UI: in `_update_workspace_bar` action buttons, add «Generar ejercicios» for concept notes
  (math) and a dialog `ui/components/notes/practice/generate_dialog.py` (discipline, skill,
  mode, count 3-10, difficulty, assistance, chapter) available from any note of a subject.
  Transports: HTTP, bridge (paste back), handoff (`kind: "generate"`).
- `tools/check_practice_notes.py`: validator for non-math practice notes (required keys, sections
  per mode: `debug`/`refactor` need `## Código`; `implement` needs `## Señal de dominio`; 5 rubric
  items; 1-3 hints). Math notes keep using `tools/check_kb_notes.py`.
- Templates: `docs/knowledge_base/templates/exercise_programming.md`,
  `exercise_english.md`, `drill.md`.
- Extension: generation must produce valid notes for every (discipline, mode) pair of §6.2;
  test with a canned AI reply.

### Phase 5 — Proof ladder (math)
Practice view for `type: theorem` notes (the KB proof notes: numbered `**Paso:**`/`**Por qué:**`
steps). Levels L1 strategy recall, L2 order shuffled steps (drag list), L3 fill hidden steps,
L4 justify (steps shown, "Por qué" hidden), L5 blank proof, L6 prove a variant (from
`## Variantes para practicar`). L2 is checked locally; the rest by the AI judge with the proof as
model. Each level is its own SRS item (`entity_type="proof_L<n>"`); failing drops one level.

### Phase 6 — Ledger, recommender, daily queue ("Estudio" hub)
- `core/practice/ledger.py`: per discipline and skill status with the training-system rules;
  storage `.notevault/estudio/ledger/<discipline>.json`.
- Skill-level spacing: a consolidated skill becomes due after its interval; when due, the queue
  asks the generator (Phase 4) for a **fresh** exercise instead of repeating an old one.
- `core/practice/recommender.py`: repeated anchor ≥ 2 → debug/find_error session on that skill;
  all skills of a chapter practicing → integration exercise; else next skill; later projects.
- Concept cards: indexer that reads `## Tarjetas` of concept notes (`### T<n> · <type>` +
  `**P:**`/`**R:**`) into SRS items (`entity_type="card"`), gated by «estudiado».
- UI (design changed 2026-09-24, user decision): **not** a general module in the IconRail. The
  study features live inside the Notes module as a contextual right-side sub-bar
  (`ui/components/estudio/study_sidebar.py`, hosted by `SplitNotes` next to the note area). It
  appears automatically while the active note is inside a study area — a subject root folder
  (`Matemáticas`, `Programación`, `Inglés` and their workspace aliases) or a folder right below
  it (e.g. `Matemáticas/1 Lógica y demostración/`), or a folder whose notes carry a study
  `subject:` — and hides otherwise. Detection lives in one function,
  `core/practice/study_area.py::detect_study_area`. Its content is scoped to that area: the
  daily queue (due SRS exercises and cards + recommendations, interleaved across skills;
  `StudyQueuePanel`), the ledger of the area's disciplines and its concepts, the error log of
  the subject, and «Practicar ahora», which opens the exercise in the same notes editor (the
  practice view shows it).
- Integration exercises are marked in frontmatter with `integration: true` (also accepted:
  `meta: 2`, or a `skills:` list with ≥ 2 codes); a "chapter" is the exercise's folder
  (`Ejercicios/` folds into its concept folder) within one discipline.

### Phase 7 — English toolset (the user brings the content)
- `ui/components/english/media_player.py`: `QMediaPlayer` + `QVideoWidget`, open a local video,
  load `.srt`/`.vtt` (EN and optional ES) with dual subtitles that can be hidden, sentence list
  with click-to-seek, previous/next sentence, repeat sentence, A-B loop, speed 0.5-1.5.
- Shadowing mode: auto-pause after each subtitle line, record the learner (reuse the
  `QAudioSource` code of `english_audio_panel.py`), replay original vs recording.
- Sentence mining: button on the current line → creates a vocabulary/cloze practice note (or SRS
  card) with the sentence, the timestamp link and a translation slot filled by the AI.
- Timestamp links in notes (`[mm:ss](nv://media?file=…&t=…)`) that open the player at that time.
- CEFR: English exercises carry `level`; the judge grades against it; writing uses CEFR criteria.
- The app never searches for or downloads films.

### Phase 8 — LaTeX rendering
Render `$…$`/`$$…$$` in the practice view, result card and reading mode. Evaluate `ziamath`
(pure Python → SVG, keeps the exe small) first; fall back to the separately shipped WebEngine
runtime with KaTeX only if needed.

### Phase 9 — Discipline specs in the vault
Allow overriding/adding disciplines with `.notevault/estudio/disciplinas/<id>.json` (same fields
as `Discipline`), editable by the user and by Antigravity; Antigravity writes the Mathematics and
English training systems in the style of the user's `0.*_TRAINING_SYSTEM.md` and converts them.

### Phase 10 — Abstract thinking and geometry
Modes `construct` (build an object with properties), `generalize` (vary hypotheses), and
`figure` (exercise with a figure spec — points, segments, circles, angles — rendered to SVG by
`core/practice/figures.py`, judged by the AI with the numeric data).

### Phase 11 — Mobile parity
Port the practice view (read + answer + submit through handoff) to `notevault_mobile`.

---

## 10. Vault format additions (Phase 1)

Add to `LAYOUT` in `vault_format.py` **and** `layout` in `vault_format.dart` (Dart: also add the
existing `workspaces_dir`, `workspace` and every `study_*` key, with a comment saying the mobile
app must keep these files untouched when syncing), and document them in `docs/VAULT_FORMAT.md`:

| key | path |
|---|---|
| `study_attempts_dir` | `.notevault/estudio/intentos` |
| `study_attempt` | `.notevault/estudio/intentos/{id}.json` |
| `study_error_digest` | `.notevault/estudio/errores/ERROR_LOG.md` |
| `study_handoff_dir` | `.notevault/estudio/handoff` |
| `study_handoff_request` | `.notevault/estudio/handoff/requests/{id}.json` |
| `study_handoff_response` | `.notevault/estudio/handoff/responses/{id}.json` |
| `study_ledger_dir` | `.notevault/estudio/ledger` (Phase 6) |
| `study_ledger` | `.notevault/estudio/ledger/{id}.json` (Phase 6) |

---

## 11. Sample practice notes (fixtures and generation examples)

`docs/knowledge_base/examples/practice/` — one per non-math discipline family, written to the
format of §5.1, used by the tests and as few-shot examples for generation:

1. `P-DRILL-01 Fracciones sprint.md` — `mode: drill`, `drill: fractions`, `items: 15`, `timer: 5m`.
2. `P-PY-06-E01 Webhook que traga errores.md` — python, skill `"06"`, `mode: debug`, 25-40 lines
   in `## Código`, 3 bugs traced to anchors, mastery signal.
3. `P-SQL-07-E01 Upsert idempotente de webhooks.md` — sql, skill `"07"`, `mode: implement`.
4. `P-GIT-07-E01 Commit en la rama equivocada.md` — git, skill `"07"`, `mode: commands`.
5. `P-EN-GR-E01 Present perfect vs past simple.md` — english_grammar, `mode: rewrite`,
   `level: B1`.

---

## 12. Progress log

Tick a box only when its tests pass. Add `— <date> <who>: <one line>`.

**Phase 1 — Engine core**
- [x] 1.1 `core/practice/modes.py` (16 modes, aliases, `mode_for`) — 2026-09-24 Claude(subagent): 16 modes, 7 `practice:` aliases, `mode_for` falls back to `solve`
- [x] 1.2 `core/practice/discipline_catalog.py` (10 disciplines, anchors from training systems) — 2026-09-24 Claude(subagent): 10 disciplines; py 15 / js 14 / sql 13 / git 9 ledger skills with anchors from the training systems, math/English ≥3 anchors
- [x] 1.3 `core/practice/exercise_note.py` — 2026-09-24 Claude(subagent): fence-aware H2 parser with English aliases; all 7 math KB exercises parse unchanged
- [x] 1.4 `core/practice/timer.py` — 2026-09-24 Claude(subagent): `parse_timer` (timer → minutes → mode default)
- [x] 1.5 `core/practice/grading.py` — 2026-09-24 Claude(subagent): judge prompt + `JSON_CONTRACT`, tolerant `parse_grade_reply`, `quality_from`
- [x] 1.6 `core/practice/attempts.py` + `error_log.py` + extend `study_error_manager.py` — 2026-09-24 Claude(subagent): attempts JSON, error log + `ERROR_LOG.md` digest, `apply_result`; error manager gained §5.3 fields and repeat detection (key also includes `topic` so legacy callers keep distinct topics)
- [x] 1.7 `core/practice/handoff.py` — 2026-09-24 Claude(subagent): request .json + .md prompt, .json or .md response, close to `requests/done/`
- [x] 1.8 `core/practice/drills.py` — 2026-09-24 Claude(subagent): 5 kinds, restricted AST evaluator for derivatives, local `summarize`
- [x] 1.9 vault keys in Python + Dart + `docs/VAULT_FORMAT.md` — 2026-09-24 Claude(subagent): LAYOUT + Dart layout (also workspaces/study_*) + new «Estudio» section in VAULT_FORMAT.md
- [x] 1.10 sample notes of §11 — 2026-09-24 Claude(subagent): 5 notes; Python bugs checked by running the snippet, SQL checked on PostgreSQL 18, Git sequences replayed in a scratch repo
- [x] 1.11 `tests/test_practice_engine.py` green — 2026-09-24 Claude(subagent): 33 tests; full suite 541 passed

**Phase 2 — Practice view**
- [x] 2.1 `practice_timer.py` — 2026-09-24 Claude: countdown/stopwatch/pomodoro, overtime shown in red
- [x] 2.2 `practice_view.py` (layout, hints, submit, result card, history) — 2026-09-24 Claude
- [x] 2.3 transports: HTTP, bridge + paste, handoff polling — 2026-09-24 Claude: handoff also copies a ready-to-paste invocation line
- [x] 2.4 `drill_panel.py` — 2026-09-24 Claude
- [x] 2.5 hook into `markdown_editor.py` (stack 4, guards, «Editar nota» / «▶ Practicar») — 2026-09-24 Claude: also blocks window shortcuts (Ctrl+B, Ctrl+L…) from editing the hidden editor while practising
- [x] 2.6 `tests/test_practice_view.py` green + screenshots checked — 2026-09-24 Claude: 13 tests; math prove, python debug + result card, drill, english checked with native rendering

**Phase 3 — Protocol and prompts**
- [x] 3.1 `docs/AI_PRACTICE_PROTOCOL.md` — 2026-09-24 Claude
- [x] 3.2 `docs/prompts/GRADE_PENDING_PRACTICE.md` — 2026-09-24 Claude
- [x] 3.3 full test suite green + `NoteVault.exe` rebuilt — 2026-09-24 Claude: 554 passed; built in `dist\` (copy over the root exe once the app is closed)

Known gaps left for later phases: LaTeX shows as source (Phase 8); a handoff request left
pending when the learner switches note is not re-attached when the note is reopened (it can still
be answered, but the result is only ingested while the view waits).

**Phase 4 — Generation**: [ ] 4.1 generation.py · [ ] 4.2 dialog + workspace button · [ ] 4.3 check_practice_notes.py · [ ] 4.4 templates
**Phase 5 — Proof ladder**
- [x] 5.1 ladder engine — 2026-09-24 Claude(subagent): `core/practice/ladder.py` (tolerant `parse_proof`, levels, local L2 check, unlock/drop replayed from attempts, judge messages); `apply_result` gained `entity_type=` (SRS `proof_L<n>`)
- [x] 5.2 ladder view — 2026-09-24 Claude(subagent): `practice/ladder_view.py` (level pills, mouse-drag step list, HTTP/bridge/handoff + resume), editor stack 5 + «▶ Practicar demostración»; `tests/test_proof_ladder.py` 16 tests, suite 634 passed (only the known KB failures)
**Phase 6 — Estudio hub**
- [x] 6.1 ledger — 2026-09-24 Claude(subagent): `ledger.py` replays attempts per skill (first attempt → Practicing; Advanced judgment mode without help, or all 3 difficulty bands → Consolidated; due after 7 d, doubled per passed review; a failure lapses it); `exercise_index.py` derives math skills from the mode; persisted per discipline
- [x] 6.2 recommender — 2026-09-24 Claude(subagent): remediation (anchor ≥ 2 → debug/find_error of that skill or concept), integration, spaced skill review, next skill; only existing notes (never attempted → SRS due), else «No hay ejercicios de … todavía»; interleaved daily queue
- [x] 6.3 card indexer — 2026-09-24 Claude(subagent): `cards.py` tolerant `parse_cards` (one function), gated by `estudiado: true` or a first attempt on an exercise of the concept, 10 new cards/day in the queue
- [x] 6.4 Estudio sub-bar UI (Notes module) — 2026-09-24 Claude(subagent): `study_sidebar.py` in `SplitNotes` (Hoy / Ledger / Errores, «Practicar ahora»), scoped by `detect_study_area`; 26 tests in `tests/test_practice_ledger.py`; screenshots checked in dark and light
**Phase 7 — English tools**
- [x] 7.1 player + subtitles — 2026-09-24 Claude(subagent): `core/english/subtitles.py` (line-oriented SRT/VTT parser, utf-8/utf-8-sig/cp1252, tags/ASS/entities stripped, EN+ES paired by max overlap) + `ui/components/english/media_player.py` (`MediaPlayerWindow`, shared top-level window: video or audio-only, sibling `.en/.es/.srt/.vtt` auto-load, EN/ES toggles, painted sentence list with click-to-seek, prev/next/repeat, A-B, 0.5-1.5×, keyboard shortcuts)
- [x] 7.2 shadowing — 2026-09-24 Claude(subagent): pause at each line end, optional auto-record (`recorder.py`, QAudioSource → WAV), «▶ Original» / «▶ Mi voz» / «Continuar»
- [x] 7.3 sentence mining — 2026-09-24 Claude(subagent): `core/english/mining.py` → `Inglés/Minería/EN-MIN mm-ss ….md`, english_vocabulary `translate` or `cloze`, timestamp link, ES subtitle as reference, empty «Traducción» slot; opens in the practice view (stack 4)
- [x] 7.4 timestamp links — 2026-09-24 Claude(subagent): `[mm:ss](nv://media?file=<vault-relative>&t=<s>)` via a `QDesktopServices` "nv" handler (reading mode, practice view) + click in the rich editor / Ctrl+click in Markdown mode (`ui/components/english/links.py`); video/audio passed to `open_note` or clicked as an embed open in the player; 21 tests in `tests/test_english_tools.py`
**Phase 8 — LaTeX**
- [x] 8.1 renderer evaluation — 2026-09-24 Claude(subagent): ziamath 0.13 (pure Python, STIX Two Math) → SVG with `svg2=False` → QSvgRenderer PNG at the screen DPR; baseline via `AlignBaseline` + an anchor font whose descent covers the formula depth (Qt draws `AlignMiddle` pictures centred in the line, so it cannot be used); no WebEngine
- [x] 8.2 integration — 2026-09-24 Claude(subagent): `practice/math_render.py` (`render_math`, `markdown_with_math`, `typeset_document`); statement, hints, solution, rubric, errors, feedback, next step, example and reading mode (`NoteTextBrowser.load_markdown`); off for `subject: programming`; spec bundles ziamath/ziafont/latex2mathml data
- [x] gap: pending handoff request re-attached on reopening the note (ingested at once if the response already exists; «Descartar solicitud»; request meta now also carries answer, hints_used, seconds, solution_seen) — 2026-09-24 Claude(subagent)
**Phase 9 — Vault discipline specs**: [ ] 9.1 loader · [ ] 9.2 Math + English training systems
**Phase 10 — Abstract + geometry**: [ ] 10.1 modes · [ ] 10.2 figures
**Phase 11 — Mobile**: [ ] 11.1 port
