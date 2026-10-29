# Plan for Antigravity — create ALL the atomic topics (one note per HTML element, CSS property, JavaScript method…)

**Open a NEW conversation** in Antigravity for this (an old one with other work in progress may answer that instead). To start or resume, paste only this:

> Read `C:\PROGRAMMING\PROJECTS\NoteVault\docs\ANTIGRAVITY_PLAN_ATOMIC_TOPICS.md` and execute it. List
> `C:\PROGRAMMING\Programación\_handoff\crear\` and continue with the first task file that is not finished.

---

> **Two ways to create the topics.** In the app, «Temas por crear» has a switch: **Automático** (the app writes the topics itself with its
> configured AI, one after another — no Antigravity needed) and **Manual (Antigravity)**, which is this document. Use this plan when the
> app's AI is not available or when you prefer an external agent. The «Elegir los temas a mano» panel (advanced) offers both buttons
> for a hand-picked selection: «Generar con la IA de la app» and «Crear con Antigravity».

## 0. What this is and why

The vault learns HTML, CSS and the functions of a language **piece by piece**: one note per element, per property, per method — like
studying every bone separately instead of the whole skeleton on one sheet. The app now knows this (catalog `atomic: true`, numbering
`N.M.K`), and **writes the task files for you**. Your job is only the **content**: create the folders and notes those task files list.

You do **not** design anything: the folder names, numbers, frontmatter, practice manifests and the list of items per note are in each
task file. Follow it exactly. Everything you write is in **English**.

## 1. Division of work (do not cross it)

| Antigravity (you) | Claude (the app source) |
|---|---|
| Create the topic folders, theory notes, `.practica.md`, syllabus lines and maps listed by each task file | Everything in `frontend/src`: catalog, coverage, validation, UI, prompts, tests |
| Run the example checker and the finalizer | Verify, fix and test the app; the final integration run |

**Never touch:** `frontend/src`, `.notevault/`, `programming_practice/`, any existing topic folder, any `.practica.md` that is not yours,
the `skills:` lines. Do not run git commands except where §6 says. Another AI may be editing the source at the same time.

## 2. Where the tasks come from

The person opens the app → **Áreas → «Ver temas por crear»** (or the plan's **«Verificar metodología»**) and presses **«Solo lo esencial»**
(later **«Todo lo que falta»**). The app writes the **queue** of that area and gives them ONE sentence to paste:

```
C:\PROGRAMMING\Programación\_handoff\crear\TODAS_<area>.md       ← the master: lists every task, in order
C:\PROGRAMMING\Programación\_handoff\crear\<date>_<area>.md       ← task 1  (…_2.md, …_3.md for the following ones)
```

**Start from the master**: read `TODAS_<area>.md`, then do the tasks it lists one after another, in that order. Each task file is
self-contained (goal, rules, exact folders, frontmatter, manifests, skills text, syllabus lines, verification commands) and overrides
anything here. **If there is no master file, STOP and say so**: the person has not pressed the button yet.

### Expected volume (today's vault, essentials only → «Todo lo que falta»)

| Area (`areaId`) | Folder | Essentials | In batches | Everything missing |
|---|---|---|---|---|
| HTML (`html`) | `5 Frontend\HTML` | 140 | 7 | 248 (12 batches) |
| CSS (`css`) | `5 Frontend\CSS` | 264 | 13 | 492 (23 batches) |
| JavaScript Reference (`js-reference`) | `13 JavaScript Reference` | 356 | 17 | 561 (25 batches) |
| Atomic Design (`atomic-design`) | `5 Frontend\Atomic Design` | 11 | 1 | 17 |
| Java (`java`) | `14 Java` | 43 | 2 | 84 |

## 3. Work packages — in this order, never skipping ahead

1. **WP1 HTML essentials** — the 7 `…_html*.md` tasks.
2. **WP2 CSS essentials** — the 13 `…_css*.md` tasks.
3. **WP3 JavaScript Reference essentials** — the 17 `…_js-reference*.md` tasks.
4. **WP4 Atomic Design**, then **WP5 Java essentials**.
5. **WP6** — only when the person has generated «Todo lo que falta»: the recommended pieces, same order.

Inside a task, create topics **in the order listed**: the group topic (the overview) first, then its pieces. A piece may link to its
group with `[[…]]` (exact folder name).

## 4. Quality bar — what an atomic note is

A piece note is **not** a shortened group note. It goes deep on ONE thing:

- what it does and when you reach for it; every value / form / argument it accepts; the default;
- how it interacts with its neighbours (what wins, what it needs, what it breaks);
- one common mistake with its symptom and its fix; one realistic use;
- the Cards are 6–9 questions about **this** piece only.

Same headings, counts and frontmatter as every note (the task file shows them). Do not invent items: the item list in the task is the
contract; every item must appear in the note. **Every code block must be correct and verified by running it:**

- JavaScript / TypeScript: `node tools/programming_kb/check_examples.mjs "^<number> "` prints the real output next to your «Expected result».
- HTML / CSS: open the snippet in a real browser and describe only what you saw. Never claim output you did not obtain.

## 5. Per task — the loop

1. Read the task file completely (it overrides anything you remember).
2. Create the folders and files it lists. Nothing else.
3. From `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`, for the numbers of the batch (regex on the folder name, dots escaped):
   ```
   node tools/programming_kb/check_examples.mjs "^5\.19\.7 "
   node tools/programming_kb/finalize.mjs "^5\.19\.7 "        # must say BLOCKED 0 — generates the map
   node tools/programming_kb/links.mjs "^5\.19\.7 "           # must list 0 unresolved [[links]]
   ```
   The task file lists the exact commands for its batch. Fix everything they report before moving on.
4. Append the syllabus lines the task gives you to `Programación\00 Temario.md` (only those).
5. Write one line in the task file's end (`## Done`) with the date and counts, and move to the next task.

After every **batch** the person presses **«Ya terminó — validar»** in the app (it checks folder, note, frontmatter with `curriculum_id`,
structure, items, cards and manifest, topic by topic) and then **«Añadir al plan»**. You do not need to wait: continue with the next
task; the app reports anything to fix and you get a fix message to apply **only** to the named topics.

## 6. Commit and report

- After each **work package** (not each batch) run, in the vault: `git add -A && git commit -m "feat(programación): <area> atomic topics (<n>)"`
  if the vault is a git repository; do not push unless the person asks.
- Report after each package: topics created, checker failures fixed, anything skipped and why (never skip silently).

## 7. STOP conditions

Stop and say so if: a task file asks to modify or delete an existing folder; a folder number is already taken (the app should have
avoided it — re-generate the tasks, do not renumber by hand); the checker keeps failing on the same topic after two honest attempts;
the skills text in the task conflicts with this document (the task file wins; tell the person).

## 8. What Claude finishes (not your job)

Validation and the plan integration run, the app UI, prompts and tests, and the final end-to-end check once your packages are done.
