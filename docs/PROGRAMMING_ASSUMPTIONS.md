# Programación: decisions and assumptions (2026-09-30)

**Everything in the Programación space is in English**: area names, topic names, syllabus, unit notes, routes, theory
notes, the `_skills` notes, the AI prompts that write theory and exercises, and the exercises themselves. (The app's own
interface, and the structural file names it depends on — `.resumen.md`, `.practica.md`, `00 Temario.md`, `00 Mapa …` —
stay as they are.)

## Structure
1. **Eleven area folders**: `1 Fundamentals`, `2.1 Python`, `2.2 JavaScript`, `2.3 TypeScript`, `3 Desktop Apps (Electron)`,
   `4 Backend`, `5 Frontend`, `6 Databases`, `7 Automation`, `8 Mobile`, `9 Tooling and Quality`. The app only has two levels
   (area → topic), so the languages are areas of their own with topics numbered `2.1.N`.
2. **Fundamentals** has 75 topics in 13 units (computer → algorithmic thinking → data → control flow → functions → structures →
   errors and debugging → files → recursion and algorithms → functional → objects and design → quality and concurrency →
   programming with AI). The other areas have 13–23 topics. Total: 242.
3. Language topics come from the blocks of the `FULLSTACK_PRACTICE` syllabi (Python, JavaScript, TypeScript); Backend, Frontend,
   Databases and Git come from their syllabi and the area plan.
4. Topic names are at most 72 characters and have no colon (the name appears twice in the Windows path).
5. **Maps**: every area has its map with labelled arrows (unit head → unit topics, head → next unit head, and concrete
   dependencies); labels are English. The space map chains the areas; the real cross-area dependencies are described in
   `mapa_skill` but not drawn yet.
6. `00 Routes by role.md` keeps three routes (Windows + automation, backend + automation, mobile renewal). `FULLSTACK_PRACTICE`
   and `FULLSTACK_DEVELOPMENT` were not touched (the second is a shared repository).
7. The space folder is still called `Programación` because it also holds the two `FULLSTACK_*` repositories; renaming it is
   a separate step.

## Competencies (skills)
8. Seven competencies were added to the original eight: `trace`, `review` (includes AI code), `test`, `analyze`, `decompose`,
   `port`, `query`. `review`, `analyze` and `port` have no beginner level.
9. Seven new disciplines by area (typescript, backend, frontend, desktop, automation, mobile, devtools) besides the five that
   existed. An exercise's discipline is taken from its area folder (`programmingDisciplineOfPath`).
10. Programming exercises no longer use the mathematics prompt: they have their own, with the language by area, code in the
    statement, exact expected outputs and behavioural failures, and they are written in English (headings too: Statement,
    Hints, Solution, Rubric). The grader's feedback to the student is still Spanish.
11. A programming space's `_skills/` are its own (English, no LaTeX) and are inherited only from a space of the SAME domain.
12. The default competencies of each topic are a per-area/per-unit selection (6–7); the real matrix is decided topic by topic.

## Other changes
13. The topic-map generator understands English notes: `## Requires`, `## Explanation` (`### What it is`, `### Mental model`),
    `## Examples` (Context, Case, Expected result, Why it works), `## Common mistakes` (Mistake, Symptom, Cause, Fix); the
    panels and arrows are drawn in English. The headings decide the language; a note with none follows its subject.
14. A `#` inside a fenced code block is code, not a heading, and code keeps its line breaks in the map cards.
15. `00 Temario.md` is written with `type: index`; the syllabus generator allows up to 120 topics per area and only lists as
    areas the folders that start with a number (so `FULLSTACK_*` is not part of the syllabus).
16. The LaTeX drawing tool only appears in mathematics (and in notes outside a study space).
