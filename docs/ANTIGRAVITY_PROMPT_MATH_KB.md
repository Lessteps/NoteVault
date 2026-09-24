# Prompt for Antigravity — build the Pure Mathematics knowledge base (v2, with canvases)

Copy everything below the line into Antigravity. Version 2 (2026-09-24): Antigravity now also
builds the canvas generator and generates the canvases. Area 1 notes are already written.

---

You are building, concept by concept, the Pure Mathematics knowledge base of my vault: for each concept a concept note, one proof note per key result, 6–10 exercise notes, **and its generated canvases**. This is long, careful work. Quality beats speed: every example, counterexample and proof must be correct and checked. Work autonomously; stop only where this prompt says STOP.

## 0. Read first (mandatory, in this order)

1. `C:\PROGRAMMING\.agents\skills\knowledge-base-math\SKILL.md` — the notes contract. All of it is binding, especially §3 (language and notation), §4 (sections become canvas cards), §5 (pedagogy and exercise mix), §6 (truth) and §8 (learned rules — they changed today).
2. `C:\PROGRAMMING\.agents\skills\canvas-knowledge-base\SKILL.md` — **the canvas contract. All of it is binding.** Canvases are produced only by the generator `tools\kb_canvas.py`; you never write coordinates or edit a `.canvas` by hand.
3. `C:\PROGRAMMING\PROJECTS\NoteVault\docs\PLAN_KNOWLEDGE_BASE.md` — why the base is shaped this way (sections 1, 3, 4, 5).
4. `C:\PROGRAMMING\PROJECTS\NoteVault\docs\knowledge_base\SYLLABUS_MATH.md` — the only source for numbers, titles, ids, key results and prerequisites.
5. The three templates in `C:\PROGRAMMING\PROJECTS\NoteVault\docs\knowledge_base\templates\`.
6. **The reference concept**, all 10 files: `C:\PROGRAMMING\PROJECTS\NoteVault\docs\knowledge_base\examples\Matemáticas\1 Lógica y demostración\1.10 Inducción matemática\`. Your notes must match it in structure, length, tone and rigor.
7. `C:\PROGRAMMING\PROJECTS\NoteVault\notevault_app\core\deliverable_canvas.py` — the code you model the generator on (its `_Builder`).

## 1. Current state (do not redo)

- Area 1 Lógica y demostración: all 11 concepts written, validator `0 problem(s)`, `00 Temario.md` created. Done.
- `tools\check_kb_notes.py` was fixed today: a concept whose syllabus key results are `—` may use bullets in `## Resultados clave`. Do not edit the validator.
- The canvas generator `tools\kb_canvas.py` **does not exist yet**. Building it is your next task.

## 2. Work list

**Task A — build the generator (once).** Implement exactly §2, §3, §4, §5 and §6 of `canvas-knowledge-base\SKILL.md`:
- `C:\PROGRAMMING\PROJECTS\NoteVault\tools\kb_canvas.py` (CLI `concept | area | subject | all`, the public functions listed in §2, the constants of §2.1, the layouts of §3–§5, the manifest of §6);
- the manifest key `kb_canvas_manifest` → `.notevault/estudio/kb_canvas_manifest.json`, added in the same change to `notevault_app\core\vault_format.py` (`LAYOUT`), `C:\PROGRAMMING\PROJECTS\notevault_mobile\lib\core\vault_format.dart` (`layout`) and `docs\VAULT_FORMAT.md`. Add only that line in each file, at the end of the `study_*` entries; do not reformat or touch any other line (another agent may be editing nearby);
- `tools\render_canvas.py` (§7 visual);
- `tests\test_kb_canvas.py` with every check listed in §7.
Acceptance: `python -m pytest tests\test_kb_canvas.py -q` passes, then the whole suite `python -m pytest tests -q` passes (if a test outside your files fails, report it; do not "fix" other people's code). Render the canvas of the reference concept 1.10 and look at the PNG; fix the generator until nothing overlaps and every label is readable.

**Task B — Area 1 canvases.** Run `python tools\kb_canvas.py area "C:\PROGRAMMING\Matemáticas\1 Lógica y demostración"` and `python tools\kb_canvas.py subject "C:\PROGRAMMING\Matemáticas"`. Render the area map and three concept canvases (1.1, 1.7, 1.10) to PNG in `C:\PROGRAMMING\PROJECTS\NoteVault\docs\knowledge_base\renders\` and look at them. Then **STOP** and report (section 7). I will review the canvases and Area 1 before you continue.

**Task C — after I approve:** Areas 2 → 18 in syllabus order, concept by concept (99 concepts), each concept with its canvas and each area with its area map. Report after each block (I, II, III, IV, V, VI) and continue without waiting unless I say otherwise.

## 3. Procedure for EACH concept (repeat exactly)

1. **Read the syllabus row**: number, exact title, id, key results (each one becomes a proof note T01, T02… in that order, with the key result text as its exact title), prerequisites.
2. **Read the concept notes of its prerequisites** that already exist in the vault, to reuse their notation and link to them. Do not contradict them.
3. **Plan before writing** (in your head or scratch, not in the vault):
   - the 3+ examples and 2+ no-examples, and what each one shows;
   - the 8–15 cards and their types (≥ 4 types, including `definicion`, one `enunciado` per key result, at least one `hipotesis`);
   - the exercise set: 6–10 exercises with difficulty ≥ 2 easy (1–2), ≥ 2 medium (3), ≥ 2 hard (4–5); ≥ 3 different `practice` types; ≥ 1 of `contraejemplo` / `verdadero_falso` / `encontrar_error`; in areas 1–4 and 6–18 at least half `demostracion`.
4. **Write the files** from the templates, in this folder layout:
   ```
   C:\PROGRAMMING\Matemáticas\<area n> <area title>\<number> <title>\<number> <title>.md
   C:\PROGRAMMING\Matemáticas\<area n> <area title>\<number> <title>\Demostraciones\<number>-T<NN> <key result text>.md
   C:\PROGRAMMING\Matemáticas\<area n> <area title>\<number> <title>\Ejercicios\<number>-E<NN> <exercise title>.md
   ```
   Area folder names are in the syllabus headings (e.g. `2 Conjuntos`, `3 Relaciones y funciones`).
   Required extension, per concept:
   - Concept note: all 11 sections; Intuición 80–250 words; ≥ 3 examples; ≥ 2 no-examples; ≥ 3 common errors; every prerequisite as a `**Requiere**` connection plus the real forward uses (`**Se usa en**`); every Conexiones reason ≤ 50 characters (it becomes an arrow label); 8–15 cards.
   - Proof notes: one per key result; ≥ 3 steps each (typically 5–10); every Por qué ≤ 80 characters (arrow label); a checked counterexample for every hypothesis (or `*(no removible: …)*`); ≥ 2 variants.
   - Exercise notes: 6–10, each with 1–3 escalating hints, a complete model solution, a rubric of exactly 5 `- [ ] (1) …` items, and `## Errores típicos` (plural) with ≥ 1 item.
5. **Verify the mathematics** before running the validator:
   - recompute every number, example and counterexample (write the arithmetic out);
   - reread every proof: does each Por qué really justify its step? would the steps still make sense if shuffled and put back in order?
   - check every hint does not give away the solution and every rubric item can be seen in an answer.
6. **Validate** (from `C:\PROGRAMMING\PROJECTS\NoteVault`):
   ```
   python tools\check_kb_notes.py "C:\PROGRAMMING\Matemáticas\<area n> <area title>\<number> <title>"
   ```
   Required: `0 problem(s)`. Warnings about links to notes that do not exist yet are expected. Fix the notes and rerun until clean. Never edit the validator or the syllabus to make a check pass.
7. **Generate the concept canvas**: `python tools\kb_canvas.py concept "<concept folder>"`. If it prints `kept (user-edited)`, do not touch the user's canvas; mention it in the report.
8. **Log** one line in `C:\PROGRAMMING\PROJECTS\NoteVault\docs\knowledge_base\PROGRESS_MATH.md` in the format at the top of that file, adding `— canvas ok`, with honest notes (doubts, anything you are not fully sure of, prerequisites that felt missing).

At the end of each area: run the validator on the area folder and on `C:\PROGRAMMING\Matemáticas`; run `python tools\kb_canvas.py area "<area folder>"` and `python tools\kb_canvas.py subject "C:\PROGRAMMING\Matemáticas"`; render the area map to PNG and look at it; fix anything wrong (in the notes or in the generator, never in the canvas).

## 4. Hard rules

- The syllabus decides numbers, titles, ids, key results and prerequisites. If you think it is wrong or missing something, **write it in the progress notes**; do not change it and do not add unlisted concepts.
- Never modify a note whose frontmatter says `status: reviewed` or `status: locked`. New notes are always `status: draft`, `verified: false`.
- **Canvases:** only through `tools\kb_canvas.py`. Never write coordinates, never hand-edit or delete a `.canvas`, never overwrite a canvas the user edited (the manifest handles it).
- In `C:\PROGRAMMING\PROJECTS\NoteVault` you may create/modify **only**: `tools\kb_canvas.py`, `tools\render_canvas.py`, `tests\test_kb_canvas.py`, the single manifest line in `notevault_app\core\vault_format.py` and in `docs\VAULT_FORMAT.md`, `docs\knowledge_base\PROGRESS_MATH.md`, and PNGs in `docs\knowledge_base\renders\`. In `notevault_mobile` only the manifest line of `lib\core\vault_format.dart`. **Never touch `notevault_app\core\practice\`, `notevault_app\ui\`, or `docs\PLAN_PRACTICE_SYSTEM.md`** — Claude is working there in parallel. Do not rebuild the exe.
- Never modify `FULLSTACK_FACTORY`, `Programación\` or `Inglés\`.
- Never copy text from books or websites; write every explanation, exercise and solution yourself. Classic exercises are fine in your own words.
- Never invent facts. If you are not sure a statement is true, leave it out and say so in the progress notes.
- Spanish content; English term in parentheses at the first definition; LaTeX only with `$…$` and `$$…$$`; no math inside Markdown tables.
- If I correct something about notes, add the rule to §8 of `knowledge-base-math\SKILL.md`; about canvases, to §9 of `canvas-knowledge-base\SKILL.md` — in the same turn — and apply it to everything still `draft` (regenerate canvases).
- STOP and ask only if: a folder cannot be created, the validator or the generator crashes (not "reports problems": crashes) and you cannot find the cause, or a key result in the syllabus is false as stated.

## 5. `00 Temario.md`

Already created for Area 1. Keep it: when an area is finished, make sure every concept of that area appears as `- [[<number> <title>]] — <key results in words, or "conceptos base">`. Update nothing else in that folder (never `00 Índice.md`, which the app owns).

## 6. Canvas file names (from the canvas skill §1)

- Concept: `<concept folder>\<number> <title> — mapa.canvas`
- Area: `<area folder>\00 Mapa — <area n> <area title>.canvas`
- Subject: `C:\PROGRAMMING\Matemáticas\00 Mapa de Matemáticas.canvas`

## 7. Report (after Task B and after each block)

- Concepts done, with counts of cards, proofs and exercises per concept, and the practice-type mix.
- The validator summary for the area folder and for `C:\PROGRAMMING\Matemáticas`.
- Canvases written (and any `.nuevo.canvas`), the test result of `tests\test_kb_canvas.py` and of the whole suite, and the paths of the PNGs you looked at, with one sentence on what you checked in each.
- The full list of notes/doubts from PROGRESS_MATH.md for that block.
- Any rule you would add to either skill, as a proposal.
