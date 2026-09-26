# NoteVault — Practice System V2 work package (for Antigravity)

Paste this whole file to Antigravity as the task. Working dir: `frontend/`.
Read `docs/ELECTRON_MIGRATION/01_CONVENTIONS.md` (house style),
`docs/PLAN_PRACTICE_SYSTEM.md` (the existing engine this V2 builds on) and
`docs/VAULT_FORMAT.md` (the on-disk contract) before coding. UI text is
**Spanish**; code, comments, docs and commits are **English**. Never advance
with a red test or a type error (`npm run typecheck` + `npx vitest run` from
`frontend/` after every file). Commit + push after each phase to `web-migration`.

## Why this exists (what is wrong today)

The practice engine already exists and is good at the *piece* level
(`frontend/src/core/practice/`: `modes.ts`, `disciplineCatalog.ts`,
`exerciseNote.ts`, `ledger.ts`, `attempts.ts`, `recommender.ts`, `grading.ts`,
`studyArea.ts`; UI in `frontend/src/components/practice/` and
`frontend/src/components/study/StudyPanel.tsx`). What is wrong is the **UX and
the model around it**:

1. **It picks exercises a priori.** The learner never says *what* skill they want
   to train or *how*. Each exercise note carries a fixed `mode`, and the system
   just serves them. The user wants to choose skill + difficulty + quantity +
   assistance, like the programming trainer below, and get exercises specialised
   to *that topic's concepts* and *that skill*.
2. **There is no topic-level progress.** You cannot see, for a concrete topic,
   your mastery per skill and per difficulty, how many exercises establish
   mastery, or when a topic is "complete".
3. **No exams, no aggregated progress view, no spaced-repetition surface** the
   user can actually see.
4. **Math has no drawing input** — typing equations on a keyboard is painful.
5. **Opening the practice view lags.**

This V2 keeps the strong engine and reforms the model + UX. It is
**subject-agnostic**: the same framework serves mathematics, programming and
English; only each subject's *skill catalogue* differs (already the case in
`modes.ts`, which tags every mode with its subjects).

### Design invariants (do not violate — from prior user decisions)

- **Study/practice lives inside the Notes module** as the right contextual
  sub-bar ("Estudio"), not as an icon-rail module.
- **Grading is 100% by AI**, and every AI call must be runnable by *any* local AI
  through the existing transports (HTTP bridge and file handoff) — never depend
  on a specific vendor or a vision model for core flows.
- **All module data lives under one container folder** (`.notevault/…`). Every
  vault-format change here must be written into `docs/VAULT_FORMAT.md` and be
  mobile-compatible (the Dart app reads the same files).
- **Do not clone Anki.** Spaced repetition is a scheduler under the hood, not the
  product surface.
- On-demand exercises are **specialised to the topic's concepts and the chosen
  skill** (the topic manifest gives the AI the concept context). This is *not*
  the generic generator that was rejected before.

### The programming trainer the user wants mirrored (reference)

| # | Mode | Description |
|---|------|-------------|
| 1 | IMPLEMENT | Write code that solves a concrete task from scratch. |
| 2 | DEBUG | Find and fix errors in realistic working-looking code. Intermediate/Advanced. |
| 3 | REFACTOR | Improve real working code. Requires an assistance level. |

Quantity: 3-5 short / 6-10 full / 11+ saturation / "all sub-cases" / "you decide".
Difficulty: Beginner (fundamentals; not for DEBUG) · Intermediate · Advanced.
Assistance: **No Help** (trainer lists *what* bad practices exist, not where) ·
**Helper** (what to do, why, and how, step by step — text hints only, never a full
solution). Assistance is always delivered as hints.

Mathematics must get the analogous set, plus a **"solve by process"** skill: work
a problem step by step using the appropriate study technique, graded on the
process, not only the final answer.

---

## Architecture — the generalised "Topic Mastery" framework

Add one concept on top of the engine: the **Topic**, discovered by tags, so any
folder in any subject becomes practice-ready with no bespoke code.

- A folder becomes a **Topic** when it contains a **topic manifest**: a note with
  `type: topic` (tag `tema`) in its frontmatter. Recommended name `_tema.md`
  (hidden-ish, sorts first) or any note carrying that frontmatter.
- The manifest declares:
  ```yaml
  ---
  type: topic            # tag: tema
  subject: mathematics   # mathematics | programming | english
  title: "1.1 Números naturales, enteros y racionales"
  skills: [solve, process, true_false, counterexample, find_error, drill]  # from the subject catalogue
  mastery:
    min_per_skill: 6        # minimum exercises per skill to establish mastery
    target_difficulty: 3    # 1..3 (Beginner..Advanced); topic needs max difficulty
    exam: required          # a passed topic exam is required for "complete"
  exam_group: "aritmetica-basica"   # topics graded together in one exam
  ---
  ```
- Files inside the topic folder tagged `type: exercise` (existing) or
  `type: theory` contribute to it. A folder with such tagged files, but no
  manifest, is offered a one-click "Convertir en tema" that writes a manifest.
- **Progress per topic** = a matrix of `skill × difficulty`, derived from
  `attempts` + `ledger`. Each cell has: attempts, passes, best difficulty
  reached, skill state (Not started / Practicing / Consolidated — already in
  `ledger.ts`). A topic is **complete** when, for every declared skill, the
  learner has reached `target_difficulty` with the skill Consolidated **and** the
  topic exam is passed.
- This is identical across subjects; only `skills` differ (validated against
  `modes.ts`/`disciplineCatalog.ts` for the manifest's `subject`).

New core module `frontend/src/core/practice/topic.ts` owns: manifest parse/write,
topic discovery (scan a folder for the manifest + tagged files), the progress
matrix computation, and the mastery/completeness rule. Add `topic.test.ts`.

Progress + config are **derived from attempts/ledger** (no new source of truth
where avoidable). Any new persisted state goes under `.notevault/estudio/` and is
documented in `VAULT_FORMAT.md`.

---

## Phase 0 — Kill the lag when opening practice

Goal: opening the Estudio sub-bar and the practice view is instant.

1. Profile `StudyPanel.tsx`, `PracticeView.tsx` and `recommender.ts`. The likely
   causes: the recommender scans/reads the whole vault synchronously on open, and
   the panel recomputes on every render. Fix by: computing the snapshot once,
   off the render path (async, cached, invalidated on tree/attempt changes);
   memoising selectors; and not re-reading notes already in the store.
2. Ensure LaTeX/markdown in the statement/hints render once (memoised on content)
   — reuse the `ReadView` memo pattern.
3. Respect the new `html[data-perf="lite"]` mode shipped by the performance work
   package (avoid heavy effects in the practice panels).

Acceptance: opening Estudio and starting a practice on a large vault shows no
visible stall; typecheck + vitest green.
Commit: `perf(practice): remove lag when opening the study panel and practice view`.

## Phase 1 — Skill catalogue reform (per-subject skills + difficulty + assistance)

Goal: a first-class, subject-agnostic notion of **skill**, difficulty and
assistance, reusing `modes.ts`.

1. In `modes.ts` (or a new `skills.ts` beside it), define per subject the ordered
   list of trainable **skills** and, for each, whether it supports Assistance
   (No Help / Helper) and which difficulty levels apply (mirror the programming
   table: Beginner not available for DEBUG-like skills). Mathematics skills:
   `solve`, **`process`** (new — step-by-step using a named study technique),
   `prove`, `counterexample`, `true_false`, `find_error`, `drill`, `explain`.
   Keep programming (`implement`/`debug`/`refactor`/`design`/…) and English as is.
2. Add the `process` mode to the catalogue with a `judge_focus` that grades the
   *procedure and the technique used*, not only the final answer, and an
   assistance protocol (hints name the next step / the technique, never the
   answer).
3. Difficulty is the existing 1..3 scale (Beginner/Intermediate/Advanced) —
   expose labels and the "Beginner not allowed for skill X" rule as data.
4. Assistance levels (`no_help`, `helper`) as data on each skill; delivered as
   hints only (the grader/generator must never emit a full worked solution under
   Helper).

Acceptance: unit tests for the catalogue (math exposes `process`; difficulty and
assistance rules queryable); typecheck + vitest green.
Commit: `feat(practice): first-class skills with difficulty and assistance per subject`.

## Phase 2 — The per-folder Practice Configurator (ask, don't pre-pick)

Goal: entering a topic folder offers a **configurator** that reacts to the
topic, then builds a session — replacing a-priori selection.

1. When the active folder/note is inside a Topic, the Estudio sub-bar shows a
   **"Practicar este tema"** entry that opens the configurator (a panel/dialog):
   - Reads the topic manifest. If the topic is **theoretical** (skills lean to
     `prove`/`explain`/`true_false`) vs **practical** (`solve`/`process`/`drill`)
     it pre-selects and orders the offered skills accordingly.
   - Controls: **Skill** (from the topic's declared skills), **Difficulty**
     (Beginner/Intermediate/Advanced, disabled where the skill forbids it),
     **Quantity** (3-5 / 6-10 / 11+ / "todos los sub-casos" / "decide tú"),
     **Assistance** (No Help / Helper) where the skill supports it.
   - Shows, inline, the learner's current state for that skill×difficulty on this
     topic (from the progress matrix) so the choice is informed.
2. On start, build the session: prefer existing tagged exercise notes in the
   topic that match (skill, difficulty); when there are not enough, request the
   AI to produce ones **specialised to this topic's concepts and skill** (using
   the manifest + the topic's theory notes as context) through the existing
   transports. Never generic. Save generated exercises as normal exercise notes
   in the topic (so progress accrues and they are reusable).
3. The session runs in `PracticeView`, adapted per skill (Phase 3.9 of the old
   plan): text answer, code answer, drill, or the drawing surface (Phase 7).
   Assistance surfaces as progressive hints; grading stays 100% AI.

Acceptance: entering a topic offers the configurator; a session honours the
chosen skill/difficulty/quantity/assistance; generated exercises are concept-
specific and saved. typecheck + vitest green (unit-test the session builder's
selection/fallback logic with a stubbed transport).
Commit: `feat(practice): per-topic practice configurator (choose skill, difficulty, quantity, assistance)`.

## Phase 3 — Topic model (tag-driven) + mastery metric

Goal: implement `topic.ts` per the Architecture section.

1. Manifest parse/write; folder→Topic discovery; "Convertir en tema" action that
   writes a manifest for a folder that already has tagged exercises.
2. Progress matrix `skill × difficulty` from `attempts`/`ledger`; mastery rule
   (`min_per_skill`, `target_difficulty`, exam) and a single **completeness %**
   plus a boolean "tema completo".
3. Surface, in the Estudio sub-bar for a topic, a **"Práctica general"** view: the
   skill matrix, missing skills, exercises-per-skill counts, difficulty reached,
   and the spaced-repetition due items for this topic (from `recommender.ts`).
   This is where 1.3.9 (see your skills, what's missing, qty, difficulty) lives,
   and where spaced repetition finally becomes visible.

Acceptance: `topic.test.ts` covers manifest round-trip, discovery, matrix and the
completeness rule; the Práctica general view renders them. typecheck + vitest green.
Commit: `feat(practice): tag-driven topics with a skill×difficulty progress matrix`.

## Phase 4 — Add `tema` tags to the generated math content

Goal: the existing math knowledge base becomes topic-compatible.

1. Write a one-off maintenance script under `frontend/tools/` (Node, TS) that,
   for each concrete math topic folder under the vault's Matemáticas tree, creates
   a `_tema.md` manifest (subject `mathematics`, sensible default `skills`,
   `mastery` and `exam_group` by area). Idempotent; never overwrites an existing
   manifest; prints what it did.
2. Do **not** hardcode content — infer `title` from the folder, `skills` from the
   exercises present. Leave a report the user can review.

Acceptance: running the script on a sample area produces valid manifests that
`topic.ts` reads; existing tests green.
Commit: `chore(practice): add topic manifests to the math knowledge base`.

## Phase 5 — Exam system

Goal: exams that certify a topic (or an `exam_group`) at max difficulty across
its skills.

1. An **exam** assembles, per topic (and grouped with topics sharing
   `exam_group`), a set covering each declared skill at `target_difficulty`.
   Prefer existing exercises; fill gaps via the AI (concept-specialised).
2. It runs as a timed, no-assistance session; grading is AI, aggregated into a
   per-skill verdict and an overall pass/fail. A pass marks the topic's `exam`
   requirement satisfied (persist under `.notevault/estudio/exams/…`,
   documented in `VAULT_FORMAT.md`).
3. Grouped exams: when several topics share `exam_group`, offer one exam spanning
   them; results update each topic's completeness.

Acceptance: an exam can be assembled, run, graded and recorded; completeness
flips when passed. Unit-test assembly + aggregation with a stubbed grader.
typecheck + vitest green.
Commit: `feat(practice): topic and grouped exams at target difficulty`.

## Phase 6 — Aggregated progress dashboard (in Notes)

Goal: a "Vista general"-style aggregated view where the learner selects areas and
sees topic progress by skill.

1. A new view reachable from the Notes module (a tab in the Estudio sub-bar, or a
   full-width view like the existing "Vista General") that lists **areas →
   topics**, each topic showing its completeness %, per-skill state and difficulty
   reached, and exam status. Filter by subject/area and by skill.
2. Purely derived from `topic.ts` + `ledger` + exams; no new persisted state.
3. Subject-agnostic: the same view serves programming and English topics.

Acceptance: the dashboard renders real progress for the seeded topics; filtering
works; typecheck + vitest green.
Commit: `feat(practice): aggregated topic-progress dashboard`.

## Phase 7 — Math drawing input (canvas → LaTeX → AI text)

Goal: answer/scratch math by drawing instead of typing, integrated into the
practice interface.

1. Add a **math input surface** to `PracticeView` for math skills (a toggle
   "✏️ Dibujar"), built on the existing canvas/drawing stack (`store/canvas.ts`,
   `components/canvas/`). It is a scratch surface whose output is **LaTeX/Markdown
   text**, not an image.
2. Recognition: implement **local, heuristic stroke/shape recognition** that maps
   drawn structures to LaTeX (e.g. a radical stroke → `\sqrt{…}`, a horizontal bar
   with terms above/below → `\frac{…}{…}`, digits/letters via a small offline
   recogniser), plus a **symbol palette** fallback so nothing depends on a vision
   model. The surface continuously produces the LaTeX equivalent and shows it
   rendered (KaTeX) for confirmation.
3. The confirmed LaTeX is inserted into the answer as text and sent to the AI
   through the normal transports — so grading stays vendor-agnostic and works with
   any local AI. Keep the palette usable even when recognition is uncertain.
4. Scope honestly: ship the palette + `\sqrt`/`\frac`/superscript/subscript/basic
   operators recognition first; leave full handwriting recognition as a follow-up
   marked in `PROGRESS.md`.

Acceptance: in a math practice, the drawing surface produces correct LaTeX for the
supported shapes, renders it, and submits it as text; the palette covers the rest.
typecheck + vitest green (unit-test the shape→LaTeX mapping with synthetic strokes).
Commit: `feat(practice): math drawing input that produces LaTeX for the AI`.

## Phase 8 — Verify, document, mobile contract

1. `npm run typecheck` clean, `npx vitest run` all green, `npm run electron:build`
   launches and the flows work end to end.
2. Update `docs/VAULT_FORMAT.md` with: the topic manifest (`type: topic`), the
   exam records, and any new `.notevault/estudio/…` files — and state the
   **mobile contract** (the Dart app must read the same manifests/records).
3. Update `docs/PLAN_PRACTICE_SYSTEM.md` to point to this V2 for the reformed UX
   (supersedes the a-priori selection and unblocks concept-specialised, user-
   directed generation in place of the old ON-HOLD generic generator).
4. Keep `docs/PRACTICE_V2/PROGRESS.md` (create it): one line per phase — phase,
   commit hash, tests green.
Commit: `docs(practice): document topic model, exams and the mobile contract`.

## Guardrails

- Behaviour changes only where a requirement asks. Do not break existing practice
  notes; extend, don't rewrite, the engine.
- Never commit with a red test or type error. Stay on `web-migration`; never touch
  `main`; never force-push or reset.
- Respect the design invariants above (Estudio lives in Notes; AI-only grading via
  any local AI; single data folder + mobile parity; concept-specialised
  generation, never generic).
- When unsure about a subject's skills, read `modes.ts`/`disciplineCatalog.ts`;
  when unsure about storage, read `VAULT_FORMAT.md`. Do not invent parallel state.
