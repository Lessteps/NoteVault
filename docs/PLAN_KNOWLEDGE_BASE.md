# Plan — Knowledge base + practice system + generated canvases (Math → English → Programming)

**Status:** approved direction, 2026-09-24. Mathematics first; English second; Programming last.
**Who:** Antigravity writes the content (mechanical, high volume). Claude writes the code
(indexer, practice UI, canvas generators, LaTeX). The user reviews and approves.

---

## 1. Principles

1. **The notes are the database.** One Markdown note per concept, per theorem and per exercise,
   with flat frontmatter. Human-readable, editable in NoteVault and Obsidian, synced by Syncthing.
2. **Canvases are generated views, never the source.** Code reads the notes and draws the
   canvas (area map, concept canvas, proof flow). Fix a note → regenerate → the canvas follows.
3. **Content lives in the vault; practice state lives in `.notevault/`.** Exercises and proofs
   are notes next to their concept (visible in the explorer). Intervals, grades, attempts,
   errors and mastery are JSON under `.notevault/estudio/` (existing rule: module data in one
   hidden folder). They join by the note's permanent `id`.
4. **Practice first.** Every concept produces things to *do*: recall cards, proofs to rebuild,
   exercises with a rubric. Reading is not studying.
5. **Stable ids.** `mat.logica.induccion`, `mat.logica.induccion.t02`, `mat.logica.induccion.e05`.
   Folders can be renamed or renumbered; the practice history survives because it is keyed on
   the id, not the path.

## 2. What already exists (inventory, 2026-09-24)

| Piece | File | State |
|---|---|---|
| SM-2 spaced repetition | `notevault_app/core/study_srs_manager.py` | Works. An item stores only `entity_id`; **no card content**, no proof mode. |
| Exercises | `core/study_exercise_manager.py` | Works, but exercise *definitions* are JSON in `.notevault` (not notes). 11 generic types. |
| Error log | `core/study_error_manager.py` | Works. 11 categories. |
| Daily queue (interleaved) | `core/study_daily_queue.py` | Works: SRS due + errors + pending exercises, interleaved by subject. |
| Queue panel / exercise dialog | `ui/components/notes/study_queue_panel.py`, `study_exercise_dialog.py` | **Queue panel not wired into the app.** |
| Subject workspaces | `core/workspace_manager.py` | Detects `Matemáticas/`, `Inglés/`, `Programación/` by folder (first 2 levels). |
| Concept-map builder | `core/canvas_builder.py` | YAML → canvas (radial/tree/grid, shapes). No groups. |
| Deliverable canvas builder | `core/deliverable_canvas.py` | JSON spec → methodology canvas (groups, labelled arrows). |
| Flowchart shapes | `ui/components/notes/canvas/shapes.py` | start_end, process, decision, io, connector… |
| Frontmatter parser | `core/frontmatter_utils.py` | **Flat only** (`key: value`, inline lists split on commas). |
| LaTeX rendering | — | **Missing** in the editor preview and in canvas cards. Blocker for pure math. |

## 3. Vault structure

```
C:\PROGRAMMING\                       (vault)
  Matemáticas\                        ← mother base of Mathematics
    00 Índice.md                      (existing, app-generated)
    00 Temario.md                     ← index: all areas/concepts as links (Antigravity)
    1 Lógica y demostración\
      00 Mapa — 1 Lógica y demostración.canvas   ← GENERATED (area map)
      1.10 Inducción matemática\
        1.10 Inducción matemática.md          ← concept note
        1.10 Inducción matemática — mapa.canvas  ← GENERATED (concept canvas)
        Demostraciones\1.10-T01 ….md          ← theorem/proof notes
        Ejercicios\1.10-E01 ….md              ← exercise notes
  Inglés\       (same skeleton later: unit folders with Práctica)
  Programación\ (same skeleton later; FULLSTACK_PRACTICE migrates into it)
```

"Mother base" = each subject root with the same skeleton, plus cross-subject links
(e.g. `1.10 Inducción` ↔ recursion in Programming). The workspace system already keys on
these three roots, so no new detection is needed.

Formats: `docs/knowledge_base/templates/{concept,theorem,exercise}.md`.
Syllabus (numbers, titles, ids, key results, prerequisites): `docs/knowledge_base/SYLLABUS_MATH.md`
— 18 areas, 110 concepts, pure math from logic to metric spaces.
Validator: `tools/check_kb_notes.py`. Reference concept: `docs/knowledge_base/examples/…/1.10 Inducción matemática/`.

## 4. The practice system

### 4.1 What is practised, and how

| Unit | Source in the notes | Practice mode | Graded by |
|---|---|---|---|
| **Card** (definition, statement, hypothesis, strategy, counterexample, error…) | `## Tarjetas` of the concept note (`### Tn · tipo`, **P:**/**R:**) | Recall: see P, answer aloud/on paper, reveal R | Self: Otra vez / Difícil / Bien / Fácil → SM-2 grade 1/3/4/5 |
| **Proof** | theorem note | **Proof ladder** (below), scheduled by SRS | Self, with the steps as checklist; optional AI check |
| **Exercise** | exercise note | Attempt → hints on demand → solution → rubric | Rubric 0–5 = SM-2 grade; wrong → error log with category |
| **Quick calculation** (later) | generated by code from parameterised templates | Timed drills | Automatic |

### 4.2 The proof ladder (new; built on SM-2)

A proof is not memorised by rereading. Each theorem note is one SRS item with a `level`:

| Level | Task | Built from |
|---|---|---|
| L1 Strategy | "Which technique, and what is the key idea?" | Estrategia + Idea clave |
| L2 Order | The steps shuffled; put them in order (Parsons problem) | Demostración steps |
| L3 Gaps | Some steps hidden; write them | Demostración steps |
| L4 Justify | Steps shown; write each *Por qué* | Por qué lines |
| L5 Blank | Write the whole proof; compare step by step | whole proof |
| L6 Variant | Prove a variant; check each hypothesis's counterexample | Variantes + Si se quita |

Grade ≥ 4 at a level → promote one level (interval continues growing). Lapse (grade < 3) →
demote one level, interval resets. This is why every proof step must be one action with a
short reason: the note *is* the exercise generator.

### 4.3 Scheduling rules (to avoid drowning)

- A concept's cards and proofs enter the queue only after the concept is **introduced**
  (user opens it and marks "estudiado", or completes its first exercise). Otherwise 110
  concepts × 10 cards = 1,100 cards due on day one.
- Daily caps: new cards per day, new proofs per day, total minutes; overdue reviews first.
- Interleave within the subject (mix concepts) and across subjects (existing queue).
- An exercise solved with grade 5 is scheduled far away; one failed comes back soon, and its
  error goes to the error log for targeted remediation.
- Mastery of a concept = weighted aggregate of its cards, proofs and exercises (computed, never stored in the note).

## 5. The canvas layer (generated)

**Binding standard (2026-09-24): `C:\PROGRAMMING\.agents\skills\canvas-knowledge-base\SKILL.md`.**
It wins over this section: exact file names (`— mapa`, `00 Mapa — <area>`), layout constants,
the generator `tools/kb_canvas.py` (built and run by Antigravity) and the manifest. Mastery
colours on the maps are applied later by the app, not written by the generator.

| Canvas | Generated from | Shows |
|---|---|---|
| **Area map** `00 Mapa del área.canvas` | frontmatter `prerequisites` of the area's concepts | One card per concept; arrows = prerequisites labelled with the Conexiones reason; **card colour = mastery** (red/yellow/green/grey not started) → the map is also the progress dashboard |
| **Concept canvas** `<n> <title>.canvas` | concept note sections + its theorem and exercise notes | The anatomy in SKILL §4: idea → definition → notation; examples (green) and no-examples (red); one group per theorem with the proof as a chain of flowchart shapes (hypotheses = io, steps = process, case splits = decision, conclusion = start_end), each arrow labelled with the step's *Por qué*; errors (yellow); exercises as file cards |
| **Subject map** `00 Mapa.canvas` | all areas | Areas as groups, cross-area prerequisite arrows |

Regeneration safety: a generated canvas stores the hash of what was generated. On regenerate,
if the user edited it since, the new version is written as `….nuevo.canvas` instead of
overwriting (same spirit as "never autosave a lossy re-serialization").

## 6. Division of labour and phases

| Phase | Who | What | Gate |
|---|---|---|---|
| 0 | Claude (done) | Plan, syllabus, templates, reference concept 1.10, validator + tests, skill, Antigravity prompt | — |
| 1 | Antigravity | **Pilot: Area 1 Lógica y demostración** (11 concepts, ~17 proofs, ~75 exercises) + `00 Temario.md` | **User reviews Area 1**; corrections go into the skill §8 |
| 2 | Claude (parallel to 1) | LaTeX rendering (editor + canvas cards); KB indexer (notes → SRS items with card content, proof level); practice session UI (cards, proof ladder, exercises with rubric); wire the queue panel; "estudiado" gating + daily caps; vault_format keys in `.py` **and** `.dart`; rebuild exe | Tests + visual check with the pilot notes |
| 3 | **Antigravity** (changed 2026-09-24) | Build `tools/kb_canvas.py` per `canvas-knowledge-base/SKILL.md` (concept canvas with proof flow, area map, subject map, manifest safety, tests, PNG render) and generate the canvases of every validated area | Tests + PNG visual check; user reviews Area 1 canvases |
| 4 | Antigravity | Areas 2–18, block by block, validator 0 problems per concept | User spot-checks per block |
| 5 | Claude | Quick-calculation drills (parameterised generators, timer) | — |
| 6 | Both | English: syllabus + templates (vocabulary/grammar/listening units; card types: cloze, translation, production) | — |
| 7 | Both | Programming: migrate `FULLSTACK_PRACTICE` (Skill Ledger → concept folders; IMPLEMENT/DEBUG/REFACTOR → exercise `practice` types; code exercises run with `code_runner.py`) | — |

LaTeX option to evaluate first in phase 2: `ziamath` (pure-Python LaTeX math → SVG, small,
rendered with `QSvgRenderer`), keeping the exe light; fall back to KaTeX inside the separate
WebEngine runtime only if quality is insufficient.

## 7. Things not yet considered (and the decision taken)

1. **LaTeX does not render in NoteVault yet** → phase 2, first item. Obsidian renders it meanwhile.
2. **Wrong math gets memorised.** AI-written proofs and counterexamples can be wrong → every
   note starts `verified: false`; the practice UI shows a "reportar error en el contenido"
   button that logs the note for review; the user marks `status: reviewed` after checking.
3. **Card flood** → introduction gating + daily caps (4.3).
4. **Renames break history** → permanent ids (principle 5); the syllabus freezes numbers/titles.
5. **Regenerating content over the user's edits** → Antigravity never touches `reviewed`/`locked` notes.
6. **Generated canvases over manual edits** → hash check, write `.nuevo.canvas` (section 5).
7. **Proofs cannot be auto-graded** → rubric + step checklist self-grading; optional AI review via `ai_client.py`.
8. **Copyright** → no copied textbook text; books only cited as further reading.
9. **Frontmatter parser is flat** → templates use flat keys only, quoted numbers, no commas in list items.
10. **Mobile parity** → any new layout key in `vault_format.py` also in `vault_format.dart`; practice on the phone later reads the same notes.
11. **Scale** → ~110 concepts, ~190 proofs, ~700 exercises ≈ 1,000 notes: the explorer's natural
    numbering and the generated maps keep it navigable; nothing is hand-linked twice.
12. **Stale skill for canvases** → `.agents/AGENTS.md` pointed Antigravity to the legacy 4-node
    canvas format; fixed to point to the current standard.
