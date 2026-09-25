/**
 * Practice modes: one per cognitive act, shared across subjects.
 * Ported from notevault_app/core/practice/modes.py.
 */

export const MATH = "mathematics";
export const PROG = "programming";
export const EN = "english";
export const GEN = "general";

export interface PracticeMode {
  readonly id: string;
  readonly label: string;
  readonly act: string;
  readonly answer_kind: string;
  readonly timer: string;
  readonly judge_focus: string;
  readonly subjects: readonly string[];
}

const _CATALOGUE: readonly PracticeMode[] = [
  {
    id: "prove",
    label: "Demostración",
    act: "Write a complete proof of the statement.",
    answer_kind: "text",
    timer: "pomodoro",
    judge_focus:
      "Every step is justified; every hypothesis is used where needed; the base case and " +
      "the inductive/general step are both present when required; no circular reasoning " +
      "(the conclusion is never assumed); the proof closes by naming the principle used.",
    subjects: [MATH],
  },
  {
    id: "solve",
    label: "Problema",
    act: "Solve the problem and justify the procedure.",
    answer_kind: "text",
    timer: "pomodoro",
    judge_focus:
      "The final result is correct and the procedure that reaches it is justified step by " +
      "step; units, domains and special cases are respected.",
    subjects: [MATH, GEN],
  },
  {
    id: "counterexample",
    label: "Contraejemplo",
    act: "Refute a general claim with a concrete counterexample.",
    answer_kind: "text",
    timer: "15m",
    judge_focus:
      "The proposed object satisfies every hypothesis of the claim and violates its " +
      "conclusion, and both facts are explicitly verified.",
    subjects: [MATH],
  },
  {
    id: "true_false",
    label: "Verdadero o falso",
    act: "Decide whether the statement is true or false and justify the verdict.",
    answer_kind: "text",
    timer: "10m",
    judge_focus:
      "The verdict is correct and backed by a proof (if true) or a verified " +
      "counterexample (if false); a verdict without justification earns little credit.",
    subjects: [MATH, EN],
  },
  {
    id: "find_error",
    label: "Encontrar el error",
    act: "Locate the error in the given work, explain it and correct it.",
    answer_kind: "text",
    timer: "15m",
    judge_focus:
      "The learner points to the exact location of the error, explains why it is wrong " +
      "(not just that it is wrong) and gives a correction that works.",
    subjects: [MATH, EN, PROG],
  },
  {
    id: "explain",
    label: "Explicar (Feynman)",
    act: "Explain the concept in plain words, as if teaching a beginner.",
    answer_kind: "text",
    timer: "10m",
    judge_focus:
      "Accuracy, completeness of the key ideas, the learner's own words (not a copied " +
      "definition) and at least one concrete example.",
    subjects: [MATH, PROG, EN, GEN],
  },
  {
    id: "drill",
    label: "Cálculo rápido",
    act: "Answer a timed series of short calculations.",
    answer_kind: "drill",
    timer: "5m",
    judge_focus: "Deterministic: every answer is compared numerically with the expected result.",
    subjects: [MATH],
  },
  {
    id: "implement",
    label: "Implementar",
    act: "Write code that solves the stated task.",
    answer_kind: "code",
    timer: "pomodoro",
    judge_focus:
      "Reason about the code's behaviour without running it: it must produce the mastery " +
      "signal exactly, handle the edge cases the task implies, and follow good practices " +
      "for the discipline.",
    subjects: [PROG],
  },
  {
    id: "debug",
    label: "Depurar",
    act: "Find and fix the bugs in the given code.",
    answer_kind: "code",
    timer: "pomodoro",
    judge_focus:
      "For each bug: the exact line, why it misbehaves and a fix that addresses the root " +
      "cause. The learner must follow the deliberate-debugging protocol: an initial " +
      "hypothesis, the evidence used, and an explicit 'the symptom was X, the root cause " +
      "is Y'. Fixing a symptom instead of the cause is an error. No redesign.",
    subjects: [PROG],
  },
  {
    id: "refactor",
    label: "Refactorizar",
    act: "Improve the given working code without changing its behaviour.",
    answer_kind: "code",
    timer: "pomodoro",
    judge_focus:
      "Behaviour is preserved exactly, the stated refactoring criteria are met and the " +
      "result is clearly more readable and maintainable; no new features.",
    subjects: [PROG],
  },
  {
    id: "design",
    label: "Diseño (esquema/arquitectura)",
    act: "Design a schema or architecture that satisfies the stated requirements.",
    answer_kind: "code",
    timer: "pomodoro",
    judge_focus:
      "Every requirement and constraint is covered; normalization and data types are " +
      "appropriate; trade-offs are named and justified.",
    subjects: [PROG],
  },
  {
    id: "commands",
    label: "Secuencia de comandos",
    act: "Write the sequence of commands that reaches the requested state.",
    answer_kind: "code",
    timer: "15m",
    judge_focus:
      "Replay the commands mentally from the given starting state: they must reach the " +
      "requested final state without losing work, and the safe choice must be made where " +
      "it matters (revert vs reset, no force-push to shared branches).",
    subjects: [PROG],
  },
  {
    id: "translate",
    label: "Traducir",
    act: "Translate the text between Spanish and English.",
    answer_kind: "text",
    timer: "10m",
    judge_focus:
      "Meaning is preserved, grammar is correct and the register sounds natural for the " +
      "target CEFR level; literal calques from Spanish are errors.",
    subjects: [EN],
  },
  {
    id: "rewrite",
    label: "Reescribir / corregir",
    act: "Rewrite the given text correcting its errors or using a target structure.",
    answer_kind: "text",
    timer: "10m",
    judge_focus:
      "Every error in the original is fixed, the target structure is used correctly, no " +
      "new errors are introduced and the language fits the target CEFR level.",
    subjects: [EN],
  },
  {
    id: "writing",
    label: "Redacción libre",
    act: "Write an original text for the given task.",
    answer_kind: "text",
    timer: "pomodoro",
    judge_focus:
      "CEFR writing criteria for the target level: task achievement, coherence and " +
      "cohesion, lexical and grammatical range, and accuracy.",
    subjects: [EN],
  },
  {
    id: "cloze",
    label: "Completar huecos",
    act: "Fill in each blank of the text.",
    answer_kind: "short",
    timer: "5m",
    judge_focus: "Each blank is correct in its context (form, meaning and collocation).",
    subjects: [EN, PROG],
  },
];

export const MODES: Record<string, PracticeMode> = Object.fromEntries(
  _CATALOGUE.map((m) => [m.id, m]),
);

export const PRACTICE_ALIASES: Record<string, string> = {
  demostracion: "prove",
  calculo: "solve",
  problema: "solve",
  contraejemplo: "counterexample",
  verdadero_falso: "true_false",
  encontrar_error: "find_error",
  explicar: "explain",
};

export function modeFor(frontmatter: Record<string, any>): PracticeMode {
  const fm = frontmatter && typeof frontmatter === "object" ? frontmatter : {};
  const mode = String(fm.mode || "").trim().toLowerCase();
  if (mode in MODES) {
    return MODES[mode]!;
  }
  const alias = PRACTICE_ALIASES[String(fm.practice || "").trim().toLowerCase()];
  return MODES[alias || "solve"]!;
}
export const mode_for = modeFor;
