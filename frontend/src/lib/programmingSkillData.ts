// Programming competencies beyond the first eight (implement, debug, refactor, design, commands, explain, cloze,
// find_error). Pure data (no imports) so the core (modes, skills) and the UI share it.
//
// The set comes from what a working developer actually does with code: predict what it will do, take a plausible
// piece (often written by an AI) and catch what is quietly wrong, prove it works with tests, judge its cost,
// plan before writing, move it between languages, and ask a database the right question.

export interface ProgrammingSkillSpec {
  id: string;
  label: string;
  /** what the student does (Spanish, shown in lists) */
  description: string;
  /** the instruction the exercise generator follows (English) */
  act: string;
  /** what the grader looks for (English) */
  judge: string;
  answerKind: "code" | "text";
  timer: string;
  /** no beginner level: it needs some code-reading base */
  noBeginner?: boolean;
}

export const PROGRAMMING_EXTRA_SKILLS: readonly ProgrammingSkillSpec[] = [
  {
    id: "trace",
    label: "Seguir la ejecución",
    description: "Predecir la salida y el estado del programa paso a paso, sin ejecutarlo.",
    act: "Give a short piece of code and concrete inputs; the learner writes the exact output and the value of the key variables after each step (a trace table), without running it.",
    judge: "The final output is exact and every intermediate state is right: loop iterations counted correctly, evaluation order respected, references vs copies and scope handled as the language really behaves.",
    answerKind: "text",
    timer: "10m",
  },
  {
    id: "review",
    label: "Revisar código (incluido el de IA)",
    description: "Auditar código que parece correcto y encontrar sus fallos silenciosos y riesgos.",
    act: "Give a plausible, working-looking piece of code (typical of what an AI assistant would write) with real, non-cosmetic problems planted in it; the learner reviews it like a pull request: lists each problem with evidence, severity and a fix.",
    judge: "The real behavioural problems are all found (wrong on some input, unsafe, not idempotent, leaks, hidden assumptions), ranked by severity with evidence; style nitpicks do not count and no correct code is called wrong.",
    answerKind: "text",
    timer: "pomodoro",
    noBeginner: true,
  },
  {
    id: "test",
    label: "Escribir pruebas",
    description: "Escribir pruebas que fijan el comportamiento: casos normales, límites y errores.",
    act: "Give a function or a specification (and optionally a buggy variant); the learner writes automated tests for it with the framework of the language.",
    judge: "The tests cover the normal case, the boundaries and the error paths; each asserts one clear thing, is deterministic and independent, and would fail on the buggy variant; names say what is being checked.",
    answerKind: "code",
    timer: "pomodoro",
  },
  {
    id: "analyze",
    label: "Analizar complejidad y rendimiento",
    description: "Estimar el coste en tiempo y memoria, encontrar el cuello de botella y mejorarlo.",
    act: "Give code that works but does not scale; the learner states its time and space complexity, names the bottleneck with evidence and proposes a better structure or algorithm.",
    judge: "The complexity is right for the code as written, the bottleneck is the real one, and the improvement is correct, justified with the new complexity and keeps the behaviour.",
    answerKind: "text",
    timer: "15m",
    noBeginner: true,
  },
  {
    id: "decompose",
    label: "Descomponer y planificar",
    description: "Antes de programar: entradas, salidas, casos límite y los pasos en orden.",
    act: "Give a real requirement; the learner writes the plan before any code: inputs and outputs, edge cases, the steps in order (pseudocode) or the breakdown into functions/modules with what each receives and returns.",
    judge: "The specification is complete and unambiguous, the edge cases are real, the steps are in a valid order with no missing dependency, and each part has one responsibility. No implementation is expected.",
    answerKind: "text",
    timer: "15m",
  },
  {
    id: "port",
    label: "Portar entre lenguajes",
    description: "Traducir código de un lenguaje a otro conservando el comportamiento y sonando idiomático.",
    act: "Give working code in one language (for example Python) and ask for the equivalent in another (for example TypeScript), keeping the behaviour and using the target language's idioms.",
    judge: "The behaviour is identical including the language differences that bite (truthiness, integer division, mutability, equality, null handling, async), and the result is idiomatic for the target rather than a line-by-line calque.",
    answerKind: "code",
    timer: "pomodoro",
    noBeginner: true,
  },
  {
    id: "query",
    label: "Consulta SQL",
    description: "Traducir una pregunta sobre los datos a una consulta correcta y eficiente.",
    act: "Give a schema with sample rows and a question about the data; the learner writes the SQL query that answers it.",
    judge: "The query returns exactly the right rows and columns on the sample and on edge cases (NULLs, duplicates, empty groups, ties); joins and filters are correct and the query does not do needless work.",
    answerKind: "code",
    timer: "15m",
  },
];

export const PROGRAMMING_EXTRA_IDS: readonly string[] = PROGRAMMING_EXTRA_SKILLS.map((s) => s.id);
