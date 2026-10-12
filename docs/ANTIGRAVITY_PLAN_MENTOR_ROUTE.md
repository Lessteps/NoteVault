# Plan for Antigravity — finish the content of the Mentor route "Full stack web · automation"

To start or resume in any session, paste only this:

> Read `C:\PROGRAMMING\PROJECTS\NoteVault\docs\ANTIGRAVITY_PLAN_MENTOR_ROUTE.md` and execute it. Start with
> `node tools/programming_kb/status.mjs` and `node tools/programming_kb/exercises_status.mjs` (from
> `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`) and continue with the first work package that is not complete.

---

## 0. What this plan is (and is not)

The Mentor plan `C:\PROGRAMMING\.notevault\mentor\plans\2026-10-06_2027-04-05.json` ("Full stack web", 6 Oct 2026 → 5 Apr 2027,
profile: *full stack specialised in automation: Python, JavaScript, TypeScript, backend, frontend and databases*) schedules
these areas, in this order: **Fundamentals + Python + Backend → Databases → TypeScript + Frontend → Automation → Tooling and
Quality → Programming Logic**. The user opens topics from that plan and finds that most of them have a theory note and a map but
**no exercises**, and two whole areas have **no theory at all**. The Mentor's own coverage review says it: *"0 practice created
in all topics, Tooling has no theory"*.

This file is a **thin layer over an existing, complete contract**. Do not re-derive anything:

| Need | Where it lives (binding) |
|---|---|
| Exercise-note format, skills, difficulties, quality rules, validator | `docs\ANTIGRAVITY_PLAN_CONTENT_GENERATION.md` §3, §4, §6 |
| Theory-note + map procedure (`check_examples`, `finalize`, `links`) | `docs\ANTIGRAVITY_PROMPT_PROGRAMMING_KB.md` §4, §5 |
| Contract of a theory note | `Programación\_skills\resumen_teorico_skill.md` |
| How a topic is practised | `Programación\_skills\practica_skill.md` |
| Exact topic names | `Programación\00 Temario.md` (a topic's name = its folder name; `[[links]]` use it exactly) |

**What this file adds:** (a) the route-specific work order, (b) the exact counts to hit, (c) review gates, (d) the list of
things that look missing but are **not yours**, (e) the done-definition the Mentor checks.

Everything is written in **English**. Correctness of every code block is verified by **running it**, never by reasoning.

## 1. State on 2026-10-12 (do not redo)

Source of truth is always the two status tools; these numbers are only to size the job.

| Area | Theory + map | Exercise files today | Exercise files to write (phase `min`) |
|---|---|---|---|
| 1 Fundamentals | 75/75 | 56 | 418 |
| 2.1 Python | 22/22 | 0 | 132 |
| 2.2 JavaScript | 17/17 | 24 | 97 |
| 2.3 TypeScript | 16/16 | 0 | 96 |
| 4 Backend | 18/18 | 0 | 105 |
| 5 Frontend | 17/17 | 0 | 100 |
| 6 Databases | 17/17 | 20 | 91 |
| 7 Automation | 14/14 | 0 | 81 |
| 9 Tooling and Quality | **1/15** | 8 | 88 |
| 10 Programming Logic | **0/12** | 0 | 72 |
| **Route total** | **26 notes missing** | | **1280** |

`3 Desktop Apps (Electron)` and `8 Mobile` are **excluded by the Mentor plan** (`branchExcluded`). They are complete on theory.
Their exercises (105 + 76 files) are **last priority**: do them only after everything above is at the phase you are working on.

## 2. Explicit extension (the numbers you must hit)

| Deliverable | Minimum | Definition of done |
|---|---|---|
| Theory notes + generated maps | **26** (9.2–9.15, 10.1–10.12) | `status.mjs` shows `notes 15/15 maps 15/15` and `12/12`; `finalize` `BLOCKED 0`; `links` 0 unresolved |
| Exercises, phase **min** | **1280** on the route (+181 for areas 3 and 8) | `exercises_status.mjs` shows `min` complete for the area; `exercises_check.mjs "<regex>"` exits 0 |
| Exercises, phase **basic** | difficulty 1 → **3 per cell** | same, with `--phase basic` |
| Exercises, phase **ladder** | difficulty 2 → 2 and difficulty 3 → 2 per cell | same, with `--phase ladder` |

A **cell** is (topic, skill, difficulty) and the skills are the ones in the topic's `.practica.md` `skills:` line.
**Never edit that line.** Phases `basic` and `ladder` are not optional "if time permits": they are the second and third
milestones; do them in order after `min` is complete for the whole route.

## 3. Work order (this is the route's order, not alphabetical)

### Gate A — pilot: DONE and APPROVED (2026-10-12). Do NOT stop here any more.

The pilot (10.1 and 10.3: notes, maps, `min` + `basic` exercises) is finished and the user approved it. **Do not stop after it, do not
ask for permission, do not report and wait.** Continue straight to WP1 and then WP2, WP3, WP4 in order. The only legitimate reasons
to stop are: (a) the checker or a tool fails in a way you cannot fix (report it and stop), or (b) your usage limit.

### Working rhythm (this is a very large job: 26 notes + ~1450 files)

- Work in **batches of one topic**: write all its missing files → `exercises_check` for that topic → append one line to the log →
  next topic. Never write 100 files and check at the end.
- Commit and push **every 5 topics** (not only per area), so nothing is lost if the session ends:
  `git add Programación && git commit -m "vault: <area> <topics> content" && git push` from `C:\PROGRAMMING`.
- At the start of every session run both status tools and resume at the first topic that still has missing cells. Never redo a
  topic that the tools show as complete.
- After every commit, run `node tools/programming_kb/exercises_status.mjs` and put the "files still to write" number in the log
  line, so the user can see the number go down.

### WP1 — the 26 theory notes and maps

Order: `10 Programming Logic` 10.1 → 10.12 (the topic-by-topic content table is in
`ANTIGRAVITY_PLAN_CONTENT_GENERATION.md` WP1), then `9 Tooling and Quality` 9.2 → 9.15.
Topic types are printed by `status.mjs` (`[T]` / `[P]` / `[M]`); the type decides the style (see PROGRAMMING_KB §4 step 3).
Additional rules for area 9 (commands are version-sensitive):

- Run Git against a **temporary repo** (`git init` in the OS temp folder) and paste real output. State the Git version.
- Docker (9.7, 9.8): if `docker` is not installed on this machine, do **not** invent output. Write the Case with the command and
  the *documented* behaviour, label it `not executed here`, and keep every claim to documented behaviour.
- CI (9.11): show a real workflow YAML, but do not claim a run result you did not get.
- Package managers (9.5), venvs (9.6): use `npm`, `pip`/`py -3 -m venv` for real in a temp folder.

After WP1: from `C:\PROGRAMMING`, `git add Programación` → commit `kb(programming): tooling and logic theory notes and maps`
→ push. Then log (§6).

### WP2 — exercises, phase `min`, in this order

```
node tools/programming_kb/exercises_status.mjs --next 6
```

| # | Area | Regex for the checker | Special attention |
|---|---|---|---|
| 1 | 10 Programming Logic | `^10\.` | the area's own rules: §5 below |
| 2 | 1 Fundamentals | `^1\.` | language-agnostic: plain English/pseudocode, model solution in Python |
| 3 | 2.1 Python | `^2\.1\.` | run every solution with `py -3` |
| 4 | 4 Backend | `^4\.` | realistic service scenarios; code in Python or TypeScript as the topic states |
| 5 | 6 Databases | `^6\.` | every `query` solution **run** on `node:sqlite`/`sqlite3`; PostgreSQL-only syntax labelled as such |
| 6 | 2.3 TypeScript | `^2\.3\.` | run with `tsx`/`tsc` if present; otherwise `node --experimental-strip-types` |
| 7 | 2.2 JavaScript | `^2\.2\.` | run with `node` (v24) |
| 8 | 5 Frontend | `^5\.` | a React claim must be demonstrable; no invented pixel or ms values |
| 9 | 9 Tooling and Quality | `^9\.` | commands only safe ones (no `rm -rf`, no network installs) |
| 10 | 7 Automation | `^7\.` | external services: use the documented API shape, never a real key or endpoint you did not verify |
| 11 | 3 Desktop Apps / 8 Mobile | `^3\.` / `^8\.` | last; excluded from the user's plan |

Per area: write → `exercises_check.mjs "<regex>"` exits 0 → commit → push → one line in the log → continue.

### WP3 — phase `basic` (same order, `--phase basic`), WP4 — phase `ladder` (same order, `--phase ladder`)

Rule 3 of the content plan §4 applies: the exercises of one cell must differ in scenario **and** angle. Difficulty 2 and 3
must be genuinely harder (table in §4 of the content plan), not the same text with longer sentences.

## 4. Per-file workflow (repeat exactly; no shortcuts)

1. Read the topic note `<topic>.md` first. Use its vocabulary and stay inside its scope (earlier topics allowed, later ones not).
2. Write the file at `<topic folder>\Ejercicios\<skill>\ej_<skill>_d<difficulty>_<batch>_<n>.md`.
3. Run every code block in the *Solution*; paste the **real** output.
4. After each topic: `node tools/programming_kb/exercises_check.mjs "^<topic number> "` must exit 0.
5. Never rewrite or delete an existing exercise unless the checker fails it. Another agent may be editing the app source at the
   same time: stay in the vault (`C:\PROGRAMMING\Programación`) and `frontend\tools\programming_kb`.

## 5. Special rules for `10 Programming Logic` (interview training)

Already specified in `ANTIGRAVITY_PLAN_CONTENT_GENERATION.md` §6; the points that matter most:

- Business stories (invoices, bookings, tickets), **not** abstract puzzles; language-agnostic statement, model solution in Python.
- Every `implement` states: the problem, the pseudocode signature, 2–3 input/output examples, constraints (size, ranges,
  duplicates, empty input) and the expected time/space complexity **in the rubric**. The solution was run on the examples and on
  **two edge cases**.
- Difficulty: 1 = one pattern directly; 2 = pattern + edge case or variation; 3 = two patterns combined, or optimise a working
  brute force and justify the trade-off.
- Cover every pattern in the WP1 topic table across the cells of a topic; never repeat a problem shape.
- `10.12 Interview simulation`: timed mixed sets; `decompose` = vague requirement → clarifying questions + steps.

## 6. Logging and git

- After each area append one line to `C:\PROGRAMMING\PROJECTS\NoteVault\docs\CONTENT_GENERATION_LOG.md` (create it if
  missing): `date | area | phase | files written | checker result`.
- Commit from `C:\PROGRAMMING`: `git add Programación` → `git commit -m "vault: <area> <phase> exercises"` → `git push`.
  `.canvas` files are git-ignored on purpose; never force-add them. Changes under `PROJECTS\NoteVault` are committed separately
  (`git -C C:\PROGRAMMING\PROJECTS\NoteVault ...`).
- If the usage limit stops you, leave the log updated; the status tools tell the next session where to resume.

## 7. Things that look missing but are NOT yours (do not touch, do not report as bugs)

| Item | Why |
|---|---|
| Any `— mapa.canvas`, `00 Mapa — <area>.canvas`, `00 Mapa de Programación.canvas` | Generated: topic maps by `finalize.mjs`, area and space maps by the app. Never drawn or edited by hand. |
| `10 Programming Logic` has no `00 Units — …md`, `….resumen.md` or `00 Mapa — …canvas` | Created by the app (`frontend\src\api\modules\studySpace.ts`) when the area is opened/regenerated. After WP1, **tell the user to open NoteVault**; do not hand-write them. |
| `5 Frontend\5.8 Consuming APIs\… — mapa.nuevo.canvas` | Protection copy: a user-edited canvas is never overwritten. Leave it. |
| `*.teorica.md` of 1.1, 1.21 and 5.2 (100–140 bytes, "no theory note yet") | App placeholders. The real theory is the topic's `.md`. |
| `programming_practice\<area>\katas` and `programming_practice\projects` | Created by the app from AI/templates. |
| `.practica.md` headers, `skills:` lines | Manifests; never edit. Do not run `practica.mjs` over area 10 (hand-written skills). |
| `.notevault\`, `frontend\src`, `electron`, `frontend\tools` (except reading) | App state and source; if a tool seems wrong, **report** it, do not edit it. |
| `Matemáticas`, `Inglés`, `PROJECTS\FULLSTACK_*` | Other projects. |

## 8. Done-definition and handoff to the user

You are done with the route when all of these are true, and you paste the outputs in the final report:

1. `node tools/programming_kb/status.mjs` → `TOTAL notes 254/254 · maps 254/254`.
2. `node tools/programming_kb/links.mjs "^"` → 0 unresolved.
3. `node tools/programming_kb/exercises_status.mjs` → `min`, `basic` and `ladder` complete for every route area.
4. `node tools/programming_kb/exercises_check.mjs "^"` → exit 0.
5. The log has one line per area and phase, and everything is committed and pushed.

Then tell the user: *"Open NoteVault, go to Mentor → Ejecutar plan → Analizar el plan: the coverage review will recount
practice and theory."* If you stop earlier, say which phase and area you stopped at and paste the status tables.
