# Prompt for Gemini / Antigravity — finish the Programming knowledge base (theory notes + topic maps)

Copy everything below the line into Gemini (Antigravity). To resume in a later session, paste only this:

> Read `C:\PROGRAMMING\PROJECTS\NoteVault\docs\ANTIGRAVITY_PROMPT_PROGRAMMING_KB.md` and execute it. Start with
> `node tools/programming_kb/status.mjs` (from `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`) and continue with the first
> area that is not complete.

---

You are finishing the **Programming** space of my vault (`C:\PROGRAMMING\Programación`): for every topic one **theory note**
and its **generated topic map** (canvas). 126 of 242 topics are done. Your job is the other 116, in the order of §3.
Everything is written in **English** (area names, topic names, notes, code, comments). Quality beats speed: every example
must be correct, and **correctness is checked by running the code, not by reasoning**. Work autonomously; stop only where
this prompt says STOP.

## 0. Read first (mandatory, in this order)

1. `C:\PROGRAMMING\Programación\_skills\resumen_teorico_skill.md` — the theory-note contract (headings, fields, rules). It is
   binding: the map generator parses these exact sections. Read the new parts "What changes with the topic type" and
   "Verification".
2. `C:\PROGRAMMING\Programación\_skills\practica_skill.md` — how a topic is practised. **Practice follows the nature of the topic**
   (theoretical / procedural / mixed). You do not write exercises now, but the type decides how you write the note.
3. `C:\PROGRAMMING\Programación\_skills\mapa_skill.md` and `temario_skill.md` — maps and the area list.
4. `C:\PROGRAMMING\Programación\00 Temario.md` — the syllabus: exact topic names and order. **A topic's name is its folder
   name, and `[[links]]` must use that exact name.**
5. `C:\PROGRAMMING\PROJECTS\NoteVault\frontend\tools\programming_kb\topic_types.mjs` — the type (T/P/M) of each topic.
6. **Two finished notes of different types, as the quality bar** (match their structure, length, tone and rigor):
   - theoretical: `Programación\1 Fundamentals\1.1 What programming is\1.1 What programming is.md`
   - applied: `Programación\2.2 JavaScript\2.2.12 Asynchronous programming\2.2.12 Asynchronous programming.md`
   and the topic folder next to them to see the `.practica.md` and the `— mapa.canvas` you must NOT hand-edit.

## 1. Current state (do not redo)

Complete (note + map + practice header): `1 Fundamentals` (75), `2.2 JavaScript` (17), `2.3 TypeScript` (16),
`3 Desktop Apps (Electron)` (18). Every one of the 242 topics already has its `.practica.md` (type and skills set).
Run `node tools/programming_kb/status.mjs` for the live table; it is the source of truth for what is missing.

## 2. Tools (run from `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`; plain Node 24, no install)

| Command | What it does |
|---|---|
| `node tools/programming_kb/status.mjs [area]` | notes/maps per area and the topics still missing, with their type `[T]`/`[P]`/`[M]` |
| `node tools/programming_kb/check_examples.mjs "^5\.3 "` | **runs every Python/JS/TS Case** of the matching notes and prints the REAL output next to your "Expected result" |
| `node tools/programming_kb/finalize.mjs "^5\.3 "` | adds the frontmatter to a note written as a bare body and **generates the topic map** |
| `node tools/programming_kb/links.mjs "^5\."` | lists `[[links]]` that are not an exact topic folder name |
| `node tools/programming_kb/practica.mjs "^5\.3 "` | rewrites a topic's `.practica.md` header and stamps `topic_type` (only if you change `topic_types.mjs`) |

The regex is matched against the topic folder name (`5.3 Interface design`). Add `TSC=1` to `check_examples` for TypeScript
topics, and `CHKBASE=<folder inside frontend>` when an example imports a package that lives in the project (e.g. `electron`).
**Maps are never drawn by hand.** `finalize` builds them from your note; if a map looks wrong, fix the note.

## 3. Work list (in this order; one area = one block)

| # | Area | Topics | Type of most topics |
|---|---|---|---|
| 1 | `2.1 Python` | 2.1.1 – 2.1.22 | P/M (language mechanics) |
| 2 | `4 Backend` | 4.1 – 4.18 | M, with T for 4.1, 4.2, 4.14 |
| 3 | `5 Frontend` | 5.1 – 5.17 | M, with T for 5.3, 5.17 |
| 4 | `6 Databases` | 6.1 – 6.17 | P for 6.4–6.6, T for 6.1, 6.17, rest M |
| 5 | `9 Tooling and Quality` | 9.1 – 9.15 | M, P for 9.1–9.2, T for 9.14 |
| 6 | `7 Automation` | 7.1 – 7.14 | M, T for 7.1, P for 7.2–7.3 |
| 7 | `8 Mobile` | 8.1 – 8.13 | M, T for 8.1, 8.3 |

Inside an area, go in numeric order (later topics link to earlier ones). Report after each area (§7) and continue without
waiting unless I say otherwise.

## 4. Procedure for EACH topic (repeat exactly)

1. **Read** the topic's row in `00 Temario.md` and the `topic_type` in `topic_types.mjs`. Read the finished notes it
   requires, to reuse their vocabulary and link to them; never contradict them.
2. **Plan** (scratch, not in the vault): the one idea of the topic; 3 examples and what each shows; 4–5 real mistakes;
   6–9 cards.
3. **Write** `Programación\<area>\<topic>\<topic>.md` following `resumen_teorico_skill.md` exactly, adapted to the type:
   - `theoretical`: examples are situations to reason about (a request/response, a log excerpt, a short snippet to read); the
     8–9 cards carry the most weight because they are the spaced repetition. No "write a program" content.
   - `procedural`: complete runnable programs or commands with exact output.
   - `mixed`: one concept-focused example, two applied ones.
4. **Verify**, in this order, and fix the note until each is clean:
   1. `check_examples` → every real output equals your "Expected result" (for non-deterministic output such as timings,
      assert only what is stable, e.g. `elapsed >= 90` as `true`).
   2. `finalize` → `BLOCKED 0`. Warnings about a prerequisite that has no note yet are normal until that note exists.
   3. `links` → 0 unresolved for that topic.
5. Do **not** create exercises, canvases by hand, or any file other than the note (and the map/`.practica.md` the tools write).

## 5. Rules and traps (each one cost a real correction already)

- **Never invent an API, flag, option or version.** If you are not certain it exists, do not use it. Versions in use:
  Python 3.13 (`py -3`), Node 24, TypeScript 5.9, React 19, Vite 8, Vitest 5, Electron 44, PostgreSQL/SQLite as installed.
- **Run it, then write the expected result.** Errors found in earlier notes only because the code was executed: a row
  printed from `node:sqlite` shows `[Object: null prototype]`; `Object.keys` lists integer-like keys first and in numeric
  order; `Intl` Spanish dates include "a las"; `AbortSignal.timeout` rejects with an `AbortError` whose `cause` is a
  `TimeoutError`; a hand-computed total was `89999995`, not what mental arithmetic gave; counts of swaps/iterations in
  sorting and loop examples were off by one. Do every calculation and every count with the tool.
- **Links**: `[[…]]` is the exact folder name. Folder names are cut at a colon (`2.3.3 Object types`, `4.7 Backend with
  TypeScript`, `5.14 Accessibility`), so copy them from the folder list, never from memory.
- **Facts about the NoteVault app** (processes, IPC channel `nv`, `electron/main.ts`, 25 API modules…) belong only to area 3
  and are verified there. Do not import them into other areas unless you checked the file in `frontend/`.
- **Frontend**: a React/hook claim must be demonstrable (render it with Vitest + jsdom or `renderToString`). Do not state
  pixel or millisecond values you did not measure; describe the rule instead (a box model rule needs no number).
- **Databases**: run SQL on a real engine (`node:sqlite` is available in Node 24; for PostgreSQL-only syntax, say it is
  PostgreSQL-specific and keep the claim to documented behaviour).
- **Tooling/Automation/Mobile**: commands and tool behaviour are version-sensitive; prefer behaviour you ran (Git in a temp
  repo, a real `docker --version`-level command only if Docker exists on this machine) and state the tool version.
- One topic = one idea. What belongs to another topic is **linked**, not repeated. The note's title and number match the
  folder name exactly. No toy names (`foo`, `data1`).
- Common mistakes are **behavioural** (compiles and runs but does the wrong thing), including the ones an AI assistant makes.
- Do not touch: other areas' finished notes (unless a verified error is found: then report it, then fix it), `Matemáticas`,
  `Inglés`, `FULLSTACK_DEVELOPMENT`, `FULLSTACK_PRACTICE`, `.notevault`, the app source in `frontend/src` or `electron`, or
  the validator/generator in `frontend/tools` (if you think a tool is wrong, report it; do not edit it).
- If another agent edited a file you are about to change, re-read it first and keep its changes.

## 6. Git

After each finished area: from `C:\PROGRAMMING` (the `knowledge-base` repo, branch `master`):
`git add -- "Programación"` then `git commit -m "kb(programming): <area> theory notes and maps"` and `git push origin master`.
`.canvas` files are git-ignored in this vault on purpose; they are rebuilt from the notes, so do not force-add them.
Never commit other folders in the same commit.

## 7. Report after each area

Say: topics written (count), anything `BLOCKED`, every example whose real output differed from your first expectation (and
what you fixed), unresolved links, and the output of `node tools/programming_kb/status.mjs`. Keep it short.

## 8. When the 242 topics are done (STOP and report; do not start by yourself)

Final report with `status.mjs` showing `242/242 notes · 242/242 maps`, and `links.mjs` with 0 unresolved over everything.
Then **STOP**. The next phase is **not** yours to begin without my approval, and it needs app support first:

> **Phase 2 — Practice areas (proposal, not started).** The 242 topics cover what a solid junior knows; being able to *defend* it
> needs building things. Proposed areas: `10 Logic Training` (problem-solving drills), `11 Backend Projects`,
> `12 Frontend Projects` (atomic design inside), `13 Full-Stack Projects`. Each project = a brief, acceptance criteria, a
> rubric and a reviewed result, not theory. These areas are practice, not study areas, so they will need a project skill.
> Wait for my instructions.
