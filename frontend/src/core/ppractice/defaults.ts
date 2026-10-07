/**
 * The `_skills/` notes of the `programming_practice` area, in English like everything in the Programación space.
 * They are the rules each phase follows; the prompts quote them, and since they live in the vault as plain notes the
 * learner can edit them and the next generation obeys the edited version.
 */

const lines = (...rows: string[]): string => rows.join("\n") + "\n";
const head = (skill: string) => ["---", "type: skill_template", `skill: ${skill}`, "domain: programming", "language: en", "---"];

export const PP_FOLDER = "programming_practice";
export const PP_KATA_FOLDER = "kata";
export const PP_PROJECTS_FOLDER = "projects";
export const PP_SPECS_FOLDER = "_specs";

export const PP_DEFAULT_SKILLS: Record<string, string> = {
  pp_build_skill: lines(
    ...head("pp_build"),
    "# Skill: pp_build — the specification of a weekly project",
    "",
    "Phase 1 of 4 (`pp_build` → `pp_construct` → `pp_defend` → `pp_postmortem`). The AI writes a SPECIFICATION file; the learner builds",
    "the project themself. Nothing is planned in advance: a spec (or a plan of several) is generated only when asked.",
    "",
    "## The rule that never bends: every project is full stack",
    "- **Database**, **backend** and a **client** (web, desktop or mobile) are mandatory every week. A client without a backend, or a",
    "  backend without a database, is never a valid project.",
    "- **Automation** is an optional extra: it adds points and never replaces a layer.",
    "- The **focus** of the week (backend, databases, frontend, desktop, mobile, automation) adds criteria and weight; it never removes a layer.",
    "",
    "## The learner's stack",
    "- **Database:** PostgreSQL for every web and mobile project; **SQLite only for desktop apps**. A specification that names anything else is rejected.",
    "- **Backend:** Python (FastAPI) or TypeScript. **Client:** TypeScript, with React for the web.",
    "",
    "## Size: a thin vertical slice (4–16 hours)",
    "1–3 tables, 2–5 endpoints, 1–3 screens. If it does not fit, cut scope, do not stretch the week.",
    "",
    "## What the specification must contain",
    "- **Backend:** a layered architecture (for example routes → services → repository), validation, an error contract, tests.",
    "- **Database:** schema, migration, constraints, and an index where a query needs one.",
    "- **Client:** an architecture (where state lives, how it talks to the backend), at least one named **design pattern** and where it is",
    "  used, and **Atomic Design** (atoms, molecules, organisms; the screens are templates/pages). Applies to web, desktop and mobile clients.",
    "- **Acceptance criteria that can be checked:** a status code, a command, an observable result. Never \"clean code\" or \"looks good\".",
    "- **A rubric** of weighted criteria adding up to 100, the **syllabus topics** it practises (exact topic names), and **defence questions**",
    "  about design decisions.",
    "",
    "## Use the learner's profile",
    "When the profile lists recurring weaknesses, the project must make the learner practise them: pick the focus where they are weakest",
    "and put those weaknesses into the criteria (not as a lecture: as something that has to be done correctly to pass).",
    "",
    "## Quality of the idea",
    "A small, real tool someone would use (not a todo list again). Concrete data and behaviour. No project that repeats a previous one.",
  ),
  pp_construct_skill: lines(
    ...head("pp_construct"),
    "# Skill: pp_construct — start building",
    "",
    "Phase 2 of 4. The learner writes the code; the app only prepares the ground.",
    "",
    "- Creates the project folder with the EXACT name the specification gave, inside `projects/`.",
    "- Copies the specification as `SPEC.md` and writes a `CHECKLIST.md` made of its acceptance criteria and a `README.md` template.",
    "- Does NOT generate application code. The AI reviews what the learner builds; it does not build it.",
    "- Suggested order of work: database first (schema + migration), then the backend against it, then the client against the backend,",
    "  then the focus criteria, then the automation extra if any.",
  ),
  pp_defend_skill: lines(
    ...head("pp_defend"),
    "# Skill: pp_defend — review and defence",
    "",
    "Phase 3 of 4. Two parts: a review of everything the learner built, then an interrogation about their decisions.",
    "",
    "## Review",
    "1. Facts first, without a model: does it build, do the tests pass, is the type check clean.",
    "2. One review per layer (database, backend, client), each against that layer's acceptance criteria and the focus criteria.",
    "3. A final integration verdict: is the project functional end to end, what must be fixed, and what is already good.",
    "- Every problem is **behavioural** and located (file and line when possible) with why it matters and how to fix it. No style nitpicks.",
    "- Never call correct code wrong. If something cannot be judged from the files shown, say so instead of guessing.",
    "- For the client also judge: architecture, the design patterns the spec demanded, and Atomic Design (is there a real atoms →",
    "  molecules → organisms hierarchy or just big components).",
    "",
    "## Defence",
    "6 questions about the learner's own decisions in THIS code (why this structure, what happens on failure, what they would change at",
    "10× the load). Questions point at the code, never generic trivia. Graded on whether the answer shows understanding of the mechanism.",
  ),
  pp_postmortem_skill: lines(
    ...head("pp_postmortem"),
    "# Skill: pp_postmortem — what went right, what went wrong",
    "",
    "Phase 4 of 4. Turns the review and the defence into the learner's PROFILE, which the next `pp_build` reads.",
    "",
    "- **Weaknesses:** recurring, specific, with evidence (file and line). \"Does not validate input on the update endpoint\" is a weakness;",
    "  \"weak at backend\" is not. Reuse the wording of an existing weakness when it is the same mistake.",
    "- **Strengths:** things done well, so the next project can raise the bar instead of repeating them.",
    "- **Style notes:** how the learner writes code (naming, structure, error handling habits), observed from the files.",
    "- **Covered layers:** which layers this project really exercised, so a weakness is only marked as improving when its layer was tested again.",
    "- **Next focus:** where the next project should push.",
  ),
  pp_kata_skill: lines(
    ...head("pp_kata"),
    "# Skill: pp_kata — the daily logic exercise",
    "",
    "A separate track from the projects, with its own postmortem. One short logic problem a day (20–30 minutes), language-agnostic or",
    "Python/TypeScript in turn. Patterns: arrays and strings, hashing, recursion, sorting and searching, two pointers, stacks and queues,",
    "trees and graphs, dynamic programming (in that order of difficulty).",
    "",
    "- A concrete statement with exact inputs and expected outputs, including edge cases (empty, one element, duplicates, negatives).",
    "- The target pattern is what is being tested; no trick questions.",
    "- A failed kata comes back later (spaced repetition); the kata postmortem looks for the pattern behind the failures, not each failure.",
  ),
};
