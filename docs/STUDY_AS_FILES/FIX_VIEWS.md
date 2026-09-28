# Fix — folder expand, skill descriptions, topic view reform, subject/area dashboard

For DeepSeek. Working dir: `frontend/`. UI text **Spanish**; code/comments/docs
**English**. After every file: `npm run typecheck` clean + `npx vitest run` green.
**Commit AND push to `web-migration`** after each area. Never touch `main`. Do NOT
rebuild the practice engine — reuse it; only change what is listed here.

Reference image for Area C: **`docs/STUDY_AS_FILES/topic_view_ref.webp`** — open it.

---

## Area A — Clicking a folder must expand children AND open its view

Bug: `openFolderView` in `frontend/src/components/notes/FileTree.tsx` opens the
folder's view file and `return`s **without expanding the folder**, so the internal
files never show. Fix: when a folder has a view, **do both** — expand the folder
(`toggle(entry.path)` / ensure it is expanded, not collapsed if already open) **and**
open its view file. A plain folder (no view) keeps the plain toggle.
- Concretely: call the expand so children render, then `openNote(view.path)`. Don't
  early-return before expanding.
Acceptance: clicking any folder shows its internal files AND opens its view (topic →
practica view; area → resumen). typecheck + vitest green.
Commit: `fix(notes): folder click both expands children and opens its view`.

## Area B — Math skills must always carry a description

In mathematics, every practice **skill** must show a short description (as in the
reference image: "Problema — Resolución de problemas contextualizados y aplicados",
"Encontrar el error — Detección analítica de falacias y pasos fallidos", "Explicar
(Feynman) — Claridad conceptual…", "Demostración", "Procedimiento guiado",
"Contraejemplo", "Verdadero o falso", "Cálculo rápido").
- Ensure each math skill in `frontend/src/core/practice/modes.ts` (or the skills
  catalogue) has a Spanish `description`. Add any missing ones.
- Render the description wherever a skill is listed (the competency matrix rows, the
  configurator's skill picker). It is **obligatory** — a skill row without a
  description is a bug.
Acceptance: every math skill shows its description in the matrix and the
configurator; typecheck + vitest green.
Commit: `feat(practice): required Spanish descriptions for every math skill`.

## Area C — Topic view visual reform (match the reference image)

The topic view (`type: practica`, `frontend/src/components/study/TopicFileView.tsx`
and/or the "Resumen" it shows) is currently ugly. Reform it visually to match
`docs/STUDY_AS_FILES/topic_view_ref.webp`. Replicate element by element (verify by
rendering):
- Top: a "PRÁCTICA DEL TEMA" chip + an "SRS al día" chip; the topic number+title
  ("1.12 Porcentajes"); on the right the **Resumen / Practicar tema** toggle, a
  refresh and the avatar.
- Hero card "ESTADO GLOBAL": a big **Dominio del Tema** completion ring (%), the
  "Meta por Skill" card (target difficulty, min exercises), the "Examen Final"
  card (locked/unlocked), a warning strip ("N competencias sin iniciar…"), and the
  **Iniciar Práctica Global** / **Tomar examen** buttons.
- **MATRIZ DE COMPETENCIAS (SKILL × DIFICULTAD)**: one row per skill with its name +
  description, three difficulty columns (★ Fácil / ★★ Med / ★★★ Dif) each showing
  `hechos / 6`, and a state + "Practicar" action per row. A "Sin iniciar:" chip row.
- Bottom: **REPASOS PENDIENTES (SRS) DE ESTE TEMA** with count, "Configurar
  intervalos" and the empty state.
- Footer hint: "Atajo de teclado: Espacio para practicar".
Keep the data real (from the progress matrix). Respect `html[data-perf="lite"]`.
Acceptance: the topic view matches the mock; typecheck + vitest green.
Commit: `feat(study): reform the topic view to match the reference design`.

## Area D — Subject/area overview = completion dashboard, NOT a competency matrix

Files: `frontend/src/components/study/ResumenView.tsx`, the aggregation in
`core/practice/`, `components/common/charts.tsx`.

D1. **The Matemáticas root `resumen` must NOT show a competency matrix.** Instead a
**general completion dashboard**: one **completion ring/circle per internal area**
(Aritmética, Álgebra, Geometría…) showing that area's overall mastery %, plus KPIs.
Similar in spirit to the reference's rings and the app's main overview — clean cards
with circles, not the skill×difficulty table.
D2. **The subject root has no `practica`/`teorica`.** Do not create or open those at
`Matemáticas` root — only the `resumen` dashboard. If the migration created them at
root, remove them and stop generating them there.
D3. **Expandable per topic.** In the `resumen` view, each area can **expand** to list
its topics, and each topic shows its **skill-completion graphs / rings** and what is
missing (skills/difficulties not done). The same applies **at the area level**: the
`resumen` of `1 Aritmética elemental y operativa` shows completion rings for **its
own internal topics only** and expands to per-topic skill graphs.
D4. Reuse a ring/donut chart (add one to `charts.tsx` if missing). All numbers real.
Acceptance: opening the Matemáticas root shows area completion rings (no matrix) and
expands to per-topic skill graphs; opening an area shows its topics' rings; no
practica/teorica at root. typecheck + vitest green.
Commit: `feat(study): completion-dashboard overview for subject and areas, expandable per topic`.

## Area E — Verify & document

`npm run typecheck` clean, `npx vitest run` green, `npm run electron:build` launches;
smoke-test. Update `docs/STUDY_AS_FILES/PROGRESS.md` (one line per area). Commit
`docs(study): record the view-fix progress` and **push**.

## What NOT to do

- Do NOT put practice back in the right panel. Do NOT rebuild the engine/exams/SRS.
- Do NOT show a competency matrix in the subject/area `resumen` (that belongs to the
  topic view only). Do NOT create practica/teorica at the subject root.
- Keep UI Spanish; stay on `web-migration`; commit AND push each area.
