"""Practice modes: one per cognitive act, shared across subjects."""

from dataclasses import dataclass

MATH, PROG, EN, GEN = "mathematics", "programming", "english", "general"


@dataclass(frozen=True)
class PracticeMode:
    id: str
    label: str
    act: str
    answer_kind: str
    timer: str
    judge_focus: str
    subjects: tuple


_CATALOGUE = (
    PracticeMode(
        "prove", "Demostración",
        "Write a complete proof of the statement.",
        "text", "pomodoro",
        "Every step is justified; every hypothesis is used where needed; the base case and "
        "the inductive/general step are both present when required; no circular reasoning "
        "(the conclusion is never assumed); the proof closes by naming the principle used.",
        (MATH,)),
    PracticeMode(
        "solve", "Problema",
        "Solve the problem and justify the procedure.",
        "text", "pomodoro",
        "The final result is correct and the procedure that reaches it is justified step by "
        "step; units, domains and special cases are respected.",
        (MATH, GEN)),
    PracticeMode(
        "counterexample", "Contraejemplo",
        "Refute a general claim with a concrete counterexample.",
        "text", "15m",
        "The proposed object satisfies every hypothesis of the claim and violates its "
        "conclusion, and both facts are explicitly verified.",
        (MATH,)),
    PracticeMode(
        "true_false", "Verdadero o falso",
        "Decide whether the statement is true or false and justify the verdict.",
        "text", "10m",
        "The verdict is correct and backed by a proof (if true) or a verified "
        "counterexample (if false); a verdict without justification earns little credit.",
        (MATH, EN)),
    PracticeMode(
        "find_error", "Encontrar el error",
        "Locate the error in the given work, explain it and correct it.",
        "text", "15m",
        "The learner points to the exact location of the error, explains why it is wrong "
        "(not just that it is wrong) and gives a correction that works.",
        (MATH, EN, PROG)),
    PracticeMode(
        "explain", "Explicar (Feynman)",
        "Explain the concept in plain words, as if teaching a beginner.",
        "text", "10m",
        "Accuracy, completeness of the key ideas, the learner's own words (not a copied "
        "definition) and at least one concrete example.",
        (MATH, PROG, EN, GEN)),
    PracticeMode(
        "drill", "Cálculo rápido",
        "Answer a timed series of short calculations.",
        "drill", "5m",
        "Deterministic: every answer is compared numerically with the expected result.",
        (MATH,)),
    PracticeMode(
        "implement", "Implementar",
        "Write code that solves the stated task.",
        "code", "pomodoro",
        "Reason about the code's behaviour without running it: it must produce the mastery "
        "signal exactly, handle the edge cases the task implies, and follow good practices "
        "for the discipline.",
        (PROG,)),
    PracticeMode(
        "debug", "Depurar",
        "Find and fix the bugs in the given code.",
        "code", "pomodoro",
        "For each bug: the exact line, why it misbehaves and a fix that addresses the root "
        "cause. The learner must follow the deliberate-debugging protocol: an initial "
        "hypothesis, the evidence used, and an explicit 'the symptom was X, the root cause "
        "is Y'. Fixing a symptom instead of the cause is an error. No redesign.",
        (PROG,)),
    PracticeMode(
        "refactor", "Refactorizar",
        "Improve the given working code without changing its behaviour.",
        "code", "pomodoro",
        "Behaviour is preserved exactly, the stated refactoring criteria are met and the "
        "result is clearly more readable and maintainable; no new features.",
        (PROG,)),
    PracticeMode(
        "design", "Diseño (esquema/arquitectura)",
        "Design a schema or architecture that satisfies the stated requirements.",
        "code", "pomodoro",
        "Every requirement and constraint is covered; normalization and data types are "
        "appropriate; trade-offs are named and justified.",
        (PROG,)),
    PracticeMode(
        "commands", "Secuencia de comandos",
        "Write the sequence of commands that reaches the requested state.",
        "code", "15m",
        "Replay the commands mentally from the given starting state: they must reach the "
        "requested final state without losing work, and the safe choice must be made where "
        "it matters (revert vs reset, no force-push to shared branches).",
        (PROG,)),
    PracticeMode(
        "translate", "Traducir",
        "Translate the text between Spanish and English.",
        "text", "10m",
        "Meaning is preserved, grammar is correct and the register sounds natural for the "
        "target CEFR level; literal calques from Spanish are errors.",
        (EN,)),
    PracticeMode(
        "rewrite", "Reescribir / corregir",
        "Rewrite the given text correcting its errors or using a target structure.",
        "text", "10m",
        "Every error in the original is fixed, the target structure is used correctly, no "
        "new errors are introduced and the language fits the target CEFR level.",
        (EN,)),
    PracticeMode(
        "writing", "Redacción libre",
        "Write an original text for the given task.",
        "text", "pomodoro",
        "CEFR writing criteria for the target level: task achievement, coherence and "
        "cohesion, lexical and grammatical range, and accuracy.",
        (EN,)),
    PracticeMode(
        "cloze", "Completar huecos",
        "Fill in each blank of the text.",
        "short", "5m",
        "Each blank is correct in its context (form, meaning and collocation).",
        (EN, PROG)),
)

MODES: dict[str, PracticeMode] = {m.id: m for m in _CATALOGUE}

PRACTICE_ALIASES: dict[str, str] = {
    "demostracion": "prove",
    "calculo": "solve",
    "problema": "solve",
    "contraejemplo": "counterexample",
    "verdadero_falso": "true_false",
    "encontrar_error": "find_error",
    "explicar": "explain",
}


def mode_for(frontmatter: dict) -> PracticeMode:
    fm = frontmatter if isinstance(frontmatter, dict) else {}
    mode = str(fm.get("mode") or "").strip().lower()
    if mode in MODES:
        return MODES[mode]
    alias = PRACTICE_ALIASES.get(str(fm.get("practice") or "").strip().lower())
    return MODES[alias or "solve"]
