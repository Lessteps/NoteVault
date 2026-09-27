# NoteVault — Study-as-files redesign work package

For the executor agent (Antigravity / DeepSeek). Working dir: `frontend/`. UI text
**Spanish**; code/comments/docs/commits **English**. After every file:
`npm run typecheck` clean + `npx vitest run` green (from `frontend/`). **Commit AND
push to `web-migration`** after each area (`git push origin web-migration`). Never
touch `main`; never force-push or reset.

## The core change (read first)

Today the practice/study UI lives in the **right sub-bar** of Notes
(`StudyPanel`, opened from the inspector; `TopicConfiguratorDialog`,
`TopicGeneralView`, `TopicDashboardView`). The user has decided this is wrong: the
right panel is slow and makes no sense. **Move the study interface into
full-screen "view files" that open as tabs, Notion-style, driven by the folder you
are in.** Retire the right-panel study sub-bar as the primary surface.

New model, per folder:

- **Topic folder** (has the topic manifest, e.g. `1.1 Números naturales …`): shown
  by two *visible* files instead of a confusing `_tema.md` sitting next to the
  note:
  - **`<name>.teorica.md`** — the theory (frontmatter `type: teorica`).
  - **`<name>.practica.md`** — the practice interface (frontmatter
    `type: practica`): the skill/difficulty/quantity/assistance configurator **plus**
    the topic progress summary (the `skill × difficulty` matrix, exercises done,
    whether the 3 difficulties and all skills are satisfied). Inside this view the
    user can switch between **Resumen** and **Practicar**.
  - The machine manifest metadata (subject, skills, mastery) moves into the
    `.practica` file's frontmatter (or a hidden `_tema` the explorer never shows) —
    there must NOT be both a visible `1.1 Números naturales` note and a visible
    `_tema` for the same thing.
- **Grouping/area folder** (e.g. `1 Aritmética elemental y operativa`) and the
  **subject root** (`Matemáticas`): shown by an **overview view file** (frontmatter
  `type: resumen`) that aggregates: exercises done per skill/difficulty, common
  errors, progression per topic, with **circular/pie charts**, plus a second
  **"Practicar el área"** view for practising the whole area.
- **Folders behave like Notion**: clicking a folder in the explorer opens its
  representative view file (overview for grouping folders; topic view for topic
  folders). The program recognises these files by naming convention / frontmatter
  and renders their integrated React interface instead of raw markdown.

Reuse the existing React pieces — `TopicConfiguratorDialog`, `TopicGeneralView`,
`TopicDashboardView`, `PracticeView`, the progress-matrix and exam logic in
`core/practice/` — but mount them as **full-view file renderers**, not sub-bar tabs.

---

## Area A — `.practica` / `.teorica` files + open-as-view

1. Define the view-file convention: a note whose frontmatter `type` is `practica`,
   `teorica` or `resumen` opens in a **dedicated full-screen React view** (like how
   `type: exercise` opens `PracticeView`), not the markdown editor. Wire this in the
   note-open path / `EditorArea` view selection (`frontend/src/components/notes/
   EditorArea.tsx`, `store/app.ts`).
2. `type: practica` renders the topic practice view: **Resumen** tab (progress
   matrix skill×difficulty, exercises done, 3-difficulty/all-skills completion) and
   **Practicar** tab (the configurator: skill, difficulty, quantity, assistance →
   session). Build it from `TopicGeneralView` + `TopicConfiguratorDialog` +
   `PracticeView`.
3. `type: teorica` renders the theory (today's concept content / its canvas link).
4. Add a `tools/` migration (Node TS, idempotent) that, for every topic folder that
   has a `_tema.md`, creates `<name>.practica.md` and `<name>.teorica.md`, moves the
   manifest metadata into the `.practica` frontmatter, and removes the stray visible
   `_tema.md` duplication (keep a hidden marker only if detection needs it). Print a
   report. Run it against the real vault tree `C:\PROGRAMMING\Matemáticas`.
5. **Remove the study right sub-bar** as the practice surface (keep the code but
   stop mounting `StudyPanel` in the inspector). The inspector goes back to just
   Nota metadata.

Acceptance: opening a topic's `.practica` file shows the configurator + progress as
a full tab; `.teorica` shows theory; no `_tema.md` shows as a duplicate; the right
panel no longer hosts practice. typecheck + vitest green.
Commit: `feat(study): topic practice/theory view files, retire the right study sub-bar`.

## Area B — Overview view files for the subject root and every grouping area

1. `type: resumen` renders an **aggregated dashboard** for its folder scope: total
   and per-topic exercise counts, per-skill and per-difficulty progress, common
   errors, and **pie/circular charts** (reuse `components/common/charts.tsx`; add a
   pie/donut if missing) + per-topic progression bars. Build from
   `TopicDashboardView` + the aggregation in `core/practice/`.
2. It also offers a **"Practicar el área"** action: a session drawing from all the
   area's topics at a chosen skill/difficulty.
3. The `tools/` migration also creates one `resumen` view file at the **subject
   root** (`Matemáticas`) and one in **each grouping area** (e.g. `1 Aritmética
   elemental y operativa`), aggregating their descendant topics. Idempotent; run on
   the real vault. Every grouping area (arithmetic included) must offer the general
   progression view.

Acceptance: opening the Matemáticas root overview and an area overview shows real
aggregated counts, difficulty pie charts and per-topic progression, plus an
area-practice entry. typecheck + vitest green.
Commit: `feat(study): subject and area overview view files with charts and area practice`.

## Area C — Notion-style folder click opens its view file

1. In the explorer (`FileTree.tsx` / `Explorer.tsx`), clicking a **folder** opens
   its representative view file: the grouping folder's `resumen` file, or the topic
   folder's `practica` file (default) — while still allowing expand/collapse of the
   folder's children (e.g. click name = open view, click chevron = expand).
2. Detection walks the folder to find its view file by convention (`<folder>.resumen`
   / `<folder>.practica`). If missing, offer a one-click "Crear vista" that runs the
   generator for that folder.
3. Keep the explorer showing only notes + code (per the standing rule); the view
   files are notes and may show, but the folder click is the primary entry.

Acceptance: clicking an area folder opens its overview; clicking a topic folder
opens its practice view; children still expand. typecheck + vitest green.
Commit: `feat(notes): folder click opens its Notion-style view file`.

## Area D — Canvas explanations: structural reform (scope, then implement)

The user wants a **structural reform of the canvas explanations' internal
structure** (not the canvas engine's behaviour). This continues the template work in
`docs/INTERFACES_V2/PLAN.md` Area C (categories: Definición with visual examples ·
Ejemplos · Contraejemplos+errores comunes; no Intuición; no Práctica box; boxes must
show full text). **Before coding, re-read the repo history / the canvas builder
(`core/canvas/canvasBuilder.ts`, the methodology templates) and confirm the exact
new explanation structure with the user if anything is ambiguous.** Then apply it so
every concept explanation follows the reformed structure.

Acceptance: concept explanations follow the reformed internal structure and show
their full text; typecheck + vitest green.
Commit: `feat(canvas): reform the internal structure of concept explanations`.

## Area E — Verify & document

1. `npm run typecheck` clean, `npx vitest run` green, `npm run electron:build`
   launches; smoke-test each area in the built app.
2. Update `docs/VAULT_FORMAT.md` with the view-file conventions (`type: practica`,
   `teorica`, `resumen`) and the mobile-parity note (the Dart app reads the same
   files).
3. `docs/STUDY_AS_FILES/PROGRESS.md` (create it): one line per area — area, commit,
   tests green.
Commit: `docs(study): document the study view-file model`.

## What NOT to do

- Do NOT keep the practice UI in the right panel.
- Do NOT leave a visible `_tema.md` duplicated next to the topic note.
- Do NOT rebuild the practice engine, exams or drawing input — reuse them; only
  change how they are surfaced (view files instead of sub-bar).
- Do NOT change UI language (Spanish) or the `web-migration` branch. Commit AND push.
