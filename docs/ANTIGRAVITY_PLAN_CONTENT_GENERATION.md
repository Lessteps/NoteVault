# Plan for Gemini / Antigravity — generate ALL the missing study content (exercise notes, theory notes, topic maps)

To start or resume in any session, paste only this:

> Read `C:\PROGRAMMING\PROJECTS\NoteVault\docs\ANTIGRAVITY_PLAN_CONTENT_GENERATION.md` and execute it. Start with
> `node tools/programming_kb/exercises_status.mjs` (from `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`) and continue with the
> first work package that is not complete. Commit and push when you finish each area.

---

You are producing the **study content** of my Programming vault space (`C:\PROGRAMMING\Programación`). The NoteVault app
could not do it: its in-app generator is slow and burns my AI quota, so the volume work is yours. Everything you write is in
**English** (topic names, notes, exercises, code, comments). Quality beats speed: **every code block must be correct, and
correctness is verified by running it, never by reasoning.** Work autonomously; stop only where this plan says STOP.

## 0. Read first (mandatory, in this order)

1. `C:\PROGRAMMING\Programación\_skills\practica_skill.md` — how a topic is practised; the skills and what each one asks.
2. `C:\PROGRAMMING\Programación\_skills\resumen_teorico_skill.md`, `mapa_skill.md`, `temario_skill.md` — theory-note contract
   (only needed for work package 1).
3. `C:\PROGRAMMING\Programación\00 Temario.md` — exact topic names. **A topic's name is its folder name; `[[links]]` must
   use it exactly.** Area `10 Programming Logic` was added at the end.
4. `C:\PROGRAMMING\PROJECTS\NoteVault\docs\ANTIGRAVITY_PROMPT_PROGRAMMING_KB.md` — the procedure for theory notes and maps
   (WP1 follows its §4 to the letter).
5. **Three finished exercises as the quality bar** (match their structure, depth and tone):
   - `Programación\1 Fundamentals\1.1 What programming is\Ejercicios\pg_true_false\ej_pg_true_false_d1_1791764112944_1.md`
   - `Programación\1 Fundamentals\1.1 What programming is\Ejercicios\find_error\ej_find_error_d1_1791764249944_1.md`
   - `Programación\1 Fundamentals\1.4 From source code to execution\Ejercicios\pg_classify\ej_pg_classify_d1_1791763191418_1.md`

## 1. Current state (do not redo)

Live numbers: run the status tool (§3). At the time of writing:

| What | State |
|---|---|
| Topics (folders with a `.practica.md`) | 254 = 242 original + 12 new in `10 Programming Logic` |
| Theory note + map | 228 / 254. **Missing: `9 Tooling and Quality` 9.2–9.15 (14) and `10 Programming Logic` 10.1–10.12 (12)** |
| Exercise notes | 108 files in only 6 topics: 1.1, 1.4, 1.5, 2.2.1, 6.1 and 9.1 (some skills only). The app wrote them and they pass the checker. **Everything else has none.** |
| Area practice katas (`programming_practice/<area>/katas`) | Done by the app (28 Backend katas from AI, the rest from templates on demand). **Not your job.** |
| `.practica.md` of every topic | Done (type and `skills:` set). **Never edit the `skills:` line.** |

Do **not** touch: `frontend/src`, `.notevault/`, `programming_practice/`, any `— mapa.canvas` by hand (maps are generated),
`.practica.md` headers. Another AI (Claude) may be editing the app source at the same time; stay inside the vault
(`C:\PROGRAMMING\Programación`) and `frontend/tools/programming_kb`.

## 2. The goal in numbers (explicit extension)

A **cell** is (topic, skill, difficulty). The skills of a topic are the ones in the `skills: [...]` line of its `.practica.md`.

| Phase | Target per cell | Files to write (today) | Why it matters |
|---|---|---|---|
| **min** | difficulty 1 → **1** exercise | **1461** | The app's coverage check turns green («práctica básica»). Do this first, everywhere. |
| **basic** | difficulty 1 → **3** exercises (top up) | ~2920 more | A real practice session (the app asks for 3–5). |
| **ladder** | difficulty 2 → **2** and difficulty 3 → **2** | ~5800 more | The difficulty ladder (recommended, last). |

Plus the **26 missing theory notes with their maps** (WP1). Report counts after each area; do not stop between areas.

## 3. Tools (run from `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`; plain Node 24, no install)

| Command | What it does |
|---|---|
| `node tools/programming_kb/exercises_status.mjs` | table per area: topics, theory, min/basic/ladder completed, files, and files still to write for the phase |
| `node tools/programming_kb/exercises_status.mjs --next 8 "^10\."` | the next 8 topics with missing cells (regex on the topic folder name) and exactly how many to write per cell |
| `node tools/programming_kb/exercises_status.mjs --phase basic` | same, for another phase (`min` default, `basic`, `ladder`) |
| `node tools/programming_kb/exercises_check.mjs "^10\."` | **validator**: frontmatter, file name, sections, lengths, rubric items, balanced code fences. Exit 1 on any failure |
| `node tools/programming_kb/exercises_check.mjs --recent 60` | only files written in the last 60 minutes |
| `node tools/programming_kb/status.mjs` | theory notes and maps per area (the missing ones with their type T/P/M) |
| `node tools/programming_kb/check_examples.mjs "^9\.2 "` | runs every Python/JS/TS Case of a theory note and prints the REAL output |
| `node tools/programming_kb/finalize.mjs "^9\.2 "` | adds the frontmatter to a note written as a bare body and **generates the map** |
| `node tools/programming_kb/links.mjs "^9\."` | lists `[[links]]` that are not an exact topic folder name |

**Never run `practica.mjs` over area 10**: its manifests were written by hand with the skills listed in §6.

## 4. The exercise-note contract (the validator enforces it)

Path: `<topic folder>\Ejercicios\<skill>\ej_<skill>_d<difficulty>_<batch>_<n>.md`

- `<skill>` = a skill of the topic (also the sub-folder name). `<difficulty>` = 1, 2 or 3.
- `<batch>` = any integer of 6+ digits, **the same for the files you write in one go for a cell** (use `Date.now()` or a counter);
  `<n>` = 1, 2, 3… within the batch. Example: `ej_trace_d1_1791800000001_2.md`.

```markdown
---
type: exercise
subject: programming
title: "A concrete, specific title (not «Exercise 3»)"
mode: trace
discipline: programming_logic
difficulty: 1
assistance: nohelp
topic: "10.3 Arrays and strings"
---

# A concrete, specific title (same as the frontmatter title)

## Statement
(Context in one or two sentences, then the task. Code in fenced blocks with a language. State EXACTLY what to deliver.)

## Hints
- (One to three hints, or exactly: `- (No hints for this exercise.)`)

## Solution
(The model answer. For code: a fenced block that you RAN, and the output it produced. Explain the reasoning in 2–6 sentences.)

## Rubric
- [ ] (3 to 6 checkable criteria; each one a fact a reviewer can verify in the learner's answer)
```

Rules enforced by `exercises_check.mjs`: frontmatter `type: exercise`, `subject: programming`, `mode` = a skill of the topic and
= the sub-folder, `topic` = the exact folder name, `difficulty` matches the file name, `assistance` is `nohelp` (default) or
`helper`; the four `##` sections in that order; statement ≥ 160 / 240 / 320 characters for difficulty 1 / 2 / 3; solution ≥ 80
characters; ≥ 3 rubric items; balanced ``` fences; no `TODO:` / `TBD`.

### What each difficulty means (apply to every area)

| d | Meaning | Typical size |
|---|---|---|
| 1 | One idea, one concept; a learner who just read the note can do it. Short code (≤ 15 lines) or 3–5 claims. | 5–10 min |
| 2 | Two ideas combined, an edge case that matters, or a small design decision. | 10–20 min |
| 3 | Several steps, a trade-off or an optimisation; needs justification, not only an answer. | 20–30 min |

### What each skill asks (the statement must match its skill)

| skill | The learner… | Statement must contain |
|---|---|---|
| `pg_true_false` | judges 5 claims and justifies | 5 numbered claims, 2–3 false, each false one subtly false (not absurd) |
| `pg_classify` | puts cases into named categories | the categories (defined) and 5–6 cases |
| `pg_compare` | compares two options on explicit criteria | two options and 3+ criteria; the answer weighs, it does not pick blindly |
| `explain` | explains in own words | 3 numbered asks, one of them «give your own example» |
| `find_error` | finds the ONE wrong claim/line | exactly one error, plausible; asks why and for the fix |
| `trace` | executes code by hand | code + concrete input; asks for the final state **and** a step table |
| `implement` | writes code | a precise spec: signature, input/output examples, constraints, edge cases to handle |
| `decompose` | splits a problem into steps | a vague-ish real request; asks for steps, inputs/outputs per step and the risky step |
| `debug` | fixes a failing program | code that fails + the symptom (error text or wrong output); asks for cause and fix |
| `review` | reviews code like a reviewer | code with 2–3 real issues (behaviour, not style); asks for findings ranked by severity |
| `test` | designs test cases | a function spec; asks for cases (normal, edge, failure) and what each proves |
| `analyze` | reasons about cost/design | a solution or design; asks for complexity or trade-offs with the sizes that matter |
| `design` | proposes a structure | requirements + constraints; asks for the design and the decision it rests on |
| `query` | writes SQL | a schema in the statement + the question; solution query was RUN (sqlite3 is fine) |
| `commands` | gives shell commands | a concrete situation; solution commands are safe (no `rm -rf`, no network installs) |
| `refactor` | improves code without changing behaviour | working code with a smell; asks for the refactor and what is preserved |
| `port` | translates between environments/languages | source snippet + target; asks for equivalent code and the differences |

### Quality rules (non-negotiable)

1. **Realistic context**: small businesses, teams and systems (invoices, tickets, bookings…). No `foo/bar`, no trick questions.
2. **Run the code**: every Python/JS/TS block in a *Solution* is executed (`python`, `node`, `tsx` if available); paste the output
   you really got. A wrong example is worse than a missing one.
3. **The 1–3 exercises of one cell must differ**: different scenario *and* different angle on the skill; no near-duplicates, and
   do not reuse a scenario already used for the same skill in the same topic.
4. **Match the topic's note**: read `<topic>.md` first; use its terms and stay inside its scope (an exercise may need earlier
   topics, never later ones).
5. **Language-agnostic where the topic is**: for `10 Programming Logic` and for `1 Fundamentals`, state problems in plain
   English / pseudocode and give the model solution in **Python** plus pseudocode when helpful.
6. No answer in the statement; hints may nudge but never give the solution.

## 5. Work packages (in this order)

### Pilot gate (do this first, then STOP and show me the result)

Write, for **`10.1 Problem solving method` and `10.3 Arrays and strings`**: the theory note + map (WP1 rules) and the
**`min` + `basic` phases** (1 + 2 more per cell = 3 exercises per cell at difficulty 1). Run:

```
node tools/programming_kb/exercises_check.mjs "^10\.(1|3) "
node tools/programming_kb/status.mjs
```

Report the counts and paste one exercise per skill for my review. Continue only when I say so (or after the check is clean and
you re-read the quality rules once more).

### WP1 — Theory notes + maps (26 topics)

Follow `ANTIGRAVITY_PROMPT_PROGRAMMING_KB.md` §4 exactly (contract, verification by `check_examples`, `finalize`, `links`).
Order: `10 Programming Logic` (10.1 → 10.12), then `9 Tooling and Quality` (9.2 → 9.15).
Topic types: `status.mjs` prints them. What each topic of area 10 must cover (the note may add more, never less):

| Topic | Must cover |
|---|---|
| 10.1 Problem solving method | clarify inputs/outputs/constraints; examples and edge cases first; brute force → improve; verify with tests; explain trade-offs; the interview routine |
| 10.2 Complexity and Big-O reasoning | cost of loops, nested loops, halving, recursion; space; amortised cost; reading constraints (n ≤ 10⁵ ⇒ O(n log n)); comparing two solutions |
| 10.3 Arrays and strings | single pass, in-place, prefix sums, Kadane, normalising text, grouping anagrams, matrix traversal |
| 10.4 Hashing and counting | frequency maps, sets, two-sum family, grouping, prefix-sum + hash (subarray sum k), seen-before patterns |
| 10.5 Two pointers and sliding window | sorted pairs, partitioning, longest substring without repeats, minimum window, fast/slow pointers |
| 10.6 Sorting and binary search | comparators, stability, merge intervals, binary search variants, search on the answer, top-k |
| 10.7 Recursion and backtracking | base/recursive case, subsets, permutations, combination sum, pruning, flood fill, divide and conquer |
| 10.8 Stacks and queues | balanced brackets, monotonic stack, min stack, queue from stacks, BFS queue, deque sliding maximum |
| 10.9 Trees and graphs | traversals (DFS/BFS), BST operations, lowest common ancestor, topological order, components, shortest path, union-find |
| 10.10 Dynamic programming | state/recurrence/base cases, 1-D and 2-D tables, coins, knapsack, LIS, LCS, edit distance, memoisation vs tabulation |
| 10.11 Greedy choices and intervals | activity selection, merge/insert intervals, meeting rooms, jump game, scheduling, when greedy fails (counterexamples) |
| 10.12 Interview simulation | timed mixed sets (easy+medium, medium+hard), thinking aloud, testing, what to do when stuck, review of a failed attempt |

Add the area to `00 Temario.md` only if it is missing (it is already there).

### WP2 — Exercises, phase **min** (1461 files)

```
node tools/programming_kb/exercises_status.mjs --next 6        # the next topics with their missing cells
```

For each listed topic: read its note, write the missing cells, run the checker on that topic, fix, move on.
Order: `10 Programming Logic`, `1 Fundamentals`, `2.1 Python`, `4 Backend`, `5 Frontend`, `6 Databases`, `9 Tooling and Quality`,
`2.2 JavaScript`, `2.3 TypeScript`, `7 Automation`, `3 Desktop Apps (Electron)`, `8 Mobile`.
Finish an area, run `exercises_check.mjs` for it, commit, push (§7), report, continue.

### WP3 — Exercises, phase **basic** (top up to 3 per cell)

`exercises_status.mjs --phase basic --next 6`, same loop, same order. The two extra exercises of a cell follow rule 3 of §4.

### WP4 — Exercises, phase **ladder** (difficulty 2 and 3)

`exercises_status.mjs --phase ladder --next 6`. Difficulty 2 and 3 exercises must be genuinely harder (see the table in §4), not
the d1 text with longer sentences. This phase is the last and may be done in several sessions.

## 6. Special rules for `10 Programming Logic` (the interview-training area)

It does **not** teach a language and it does **not** just share knowledge: it trains the problem-solving skills that job
interviews measure, in the spirit of LeetCode / HackerRank but **realistic** (a business case, not a puzzle for its own sake),
**language-agnostic** and **by difficulty level**. Its practice is daily in the app (katas by level), and these exercises are
its problem bank.

- Skills per topic (already in the manifests): 10.1 and 10.2 → `pg_true_false, explain, trace, decompose, review, pg_compare`;
  10.3–10.12 → `explain, trace, implement, decompose, debug, test`.
- Every `implement` exercise states: the problem, the **function signature in pseudocode**, 2–3 input/output examples, the
  constraints (sizes, ranges, duplicates, empty input) and the expected complexity in the rubric. The model solution is Python,
  was **run on the examples and on two edge cases**, and states its time and space cost.
- Difficulty follows the usual easy / medium / hard of interview platforms, but with a business story:
  1 = one pattern applied directly; 2 = pattern plus an edge case or a variation; 3 = combine two patterns or optimise a
  working brute force and justify the trade-off.
- `test` exercises ask for the cases a good candidate lists *before* coding (normal, empty, one element, duplicates, limits).
- `decompose` exercises give a vague requirement and ask for the clarifying questions and the steps.
- Cover **every pattern named in the topic table of WP1** across the cells of a topic; do not repeat the same problem shape.

## 7. Progress, logging and git

1. After each area, append one line to `C:\PROGRAMMING\PROJECTS\NoteVault\docs\CONTENT_GENERATION_LOG.md`
   (create it if missing): date, area, phase, files written, checker result.
2. Commit and push the vault: from `C:\PROGRAMMING` run
   `git add Programación && git commit -m "vault: <area> <phase> exercises" && git push`.
   If the tools or docs under `PROJECTS\NoteVault` changed, commit those separately (`git -C C:\PROGRAMMING\PROJECTS\NoteVault ...`).
3. **Never** rewrite or delete an existing exercise unless the checker fails it. Never batch-edit files with a script that you
   have not run on a copy first.
4. If the usage limit stops you, leave the log updated; the status tool is the source of truth for where to resume.

## 8. When you are done (or at any stopping point)

Tell me to open NoteVault: it re-reads the vault when it starts, so the Mentor plan's «Cobertura» and «Ejecutar plan → Analizar
el plan» will show what is still missing. Final report: per area, notes/maps, and exercise cells by phase
(`exercises_status.mjs` output pasted in full).
