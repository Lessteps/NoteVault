"""Proof ladder: practice levels for theorem (proof) notes.

L1 strategy recall · L2 order the shuffled steps (checked locally) · L3 fill the hidden
steps · L4 justify every step · L5 blank proof · L6 prove a variant. Every level is its
own SRS item (`entity_type="proof_L<n>"`); passing a level unlocks the next one and
failing drops one level. The note is only read: `parse_proof` is the one place that
knows its format.
"""

import random
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ..frontmatter_utils import parse_frontmatter
from ..study_error_manager import ERROR_CATEGORIES
from .exercise_note import ExerciseNote
from .grading import JSON_CONTRACT, GradeError, GradeResult

PASS_SCORE = 75
MAX_RECENT_ERRORS = 15
PROOF_TYPES = {"theorem", "teorema", "proof", "demostracion", "lemma", "lema",
               "proposition", "proposicion", "corollary", "corolario"}
MIN_STEPS = 2


@dataclass
class ProofStep:
    text: str
    why: str = ""


@dataclass
class ProofNote:
    path: Path | None
    note_id: str
    title: str
    frontmatter: dict
    subject: str
    difficulty: int
    technique: str = ""
    statement: str = ""
    hypotheses: list[str] = field(default_factory=list)
    conclusion: str = ""
    strategy: str = ""
    key_idea: str = ""
    steps: list[ProofStep] = field(default_factory=list)
    variants: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Level:
    number: int
    label: str
    task: str
    act: str
    timer: str


LEVELS: dict[int, Level] = {lv.number: lv for lv in (
    Level(1, "Estrategia",
          "Sin mirar la demostración, escribe la estrategia (qué técnica usas y sobre qué) "
          "y la idea clave que hace funcionar la prueba.",
          "Strategy recall: the learner states the proof technique, what it is applied to "
          "and the key idea, without writing the proof.", "5m"),
    Level(2, "Ordenar pasos",
          "Los pasos de la demostración están desordenados. Arrástralos hasta dejarlos en "
          "el orden en que se deducen.",
          "Order the shuffled steps of the proof.", "stopwatch"),
    Level(3, "Completar pasos",
          "Algunos pasos están ocultos. Escribe cada paso que falta, con su justificación.",
          "Fill the hidden steps: the learner sees the other steps and writes each missing "
          "step with its justification.", "10m"),
    Level(4, "Justificar",
          "Tienes todos los pasos. Escribe para cada uno por qué es válido: qué hipótesis, "
          "definición o resultado lo permite.",
          "Justify each step: every step is shown and the learner writes why it is valid "
          "(which hypothesis, definition, previous step or result allows it).", "15m"),
    Level(5, "En blanco",
          "Escribe la demostración completa desde cero, paso a paso y justificando cada paso.",
          "Blank proof: the learner writes the complete proof from scratch.", "pomodoro"),
    Level(6, "Variante",
          "Demuestra la variante elegida. Puedes reutilizar la técnica de la demostración "
          "original, pero la prueba tiene que valer para el nuevo enunciado.",
          "Prove a variant of the theorem. The original proof is only a reference for the "
          "technique; the judge must check the learner's proof of the variant on its own "
          "merits (if the variant asks to find where a proof breaks or to decide whether a "
          "claim is true, judge that answer instead).", "pomodoro"),
)}


# ── Parsing ───────────────────────────────────────────────────────────────

def _fold(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return " ".join(re.sub(r"[^\w\s]", " ", plain.lower()).split())


_SECTIONS = {
    "enunciado": "statement", "statement": "statement", "teorema": "statement",
    "hipotesis": "hypotheses", "hypotheses": "hypotheses",
    "conclusion": "conclusion",
    "estrategia": "strategy", "strategy": "strategy",
    "idea clave": "key_idea", "key idea": "key_idea",
    "demostracion": "proof", "prueba": "proof", "proof": "proof",
    "variantes para practicar": "variants", "variantes": "variants", "variants": "variants",
}
_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_NUM_ITEM_RE = re.compile(r"^\s{0,3}\d+[.)]\s+(.*)$")
_BULLET_RE = re.compile(r"^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$")
_LABEL = (r"(?:(?:\*\*|__|\*|_)\s*\b{w}\s*:?\s*(?:\*\*|__|\*|_)\s*:?"
          r"|\b{w}\s*:)")
_STEP_RE = re.compile(r"\s*" + _LABEL.format(w=r"(?:paso|step)(?:\s*\d+)?"), re.I)
_WHY_RE = re.compile(
    _LABEL.format(w=r"(?:por\s*qu[eé]|porque|justificaci[oó]n|raz[oó]n|why)"), re.I)


def _split_h2(body: str) -> tuple[list[str], dict[str, str]]:
    head: list[str] = []
    sections: dict[str, list[str]] = {}
    current = None
    in_fence = False
    for line in body.splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
        elif not in_fence and line.startswith("## "):
            key = _SECTIONS.get(_fold(line[3:]))
            current = None if key in sections else key
            if current:
                sections[current] = []
            continue
        if current:
            sections[current].append(line)
        elif not sections:
            head.append(line)
    return head, {k: "\n".join(v).strip() for k, v in sections.items()}


def _bullets(text: str) -> list[str]:
    items: list[str] = []
    for line in text.splitlines():
        m = _BULLET_RE.match(line)
        if m:
            items.append(m.group(1).strip())
        elif line.strip() and items:
            items[-1] += " " + line.strip()
    return [i for i in items if i]


def _split_step(text: str) -> ProofStep:
    text = text.strip()
    step_m = _STEP_RE.match(text)
    start = step_m.end() if step_m else 0
    why_m = _WHY_RE.search(text, start)
    body, why = (text[start:why_m.start()], text[why_m.end():]) if why_m else (text[start:], "")
    return ProofStep(" ".join(body.split()), " ".join(why.split()))


def _proof_steps(text: str) -> list[ProofStep]:
    chunks: list[list[str]] = []
    in_fence = False
    for line in text.splitlines():
        if _FENCE_RE.match(line):
            in_fence = not in_fence
        m = None if in_fence else _NUM_ITEM_RE.match(line)
        if m:
            chunks.append([m.group(1)])
        elif chunks:
            chunks[-1].append(line.strip())
    if not chunks:
        parts: list[list[str]] = []
        for line in text.splitlines():
            if line.startswith("### "):
                parts.append([])
            elif parts:
                parts[-1].append(line.strip())
        chunks = parts
    steps = [_split_step("\n".join(c)) for c in chunks]
    return [s for s in steps if s.text]


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def is_proof_frontmatter(fm: dict) -> bool:
    return isinstance(fm, dict) and _fold(str(fm.get("type") or "")) in PROOF_TYPES


def parse_proof(text: str, path: Path | None = None) -> "ProofNote":
    """Read a theorem note into a ProofNote. Never raises on odd content: a note whose
    proof has no recognisable steps comes back with `steps == []`."""
    fm, body = parse_frontmatter(text or "")
    head, sec = _split_h2(body)
    h1 = next((line[2:].strip() for line in head if line.startswith("# ")), "")
    stem = Path(path).stem if path else ""
    return ProofNote(
        path=Path(path) if path else None,
        note_id=str(fm.get("id") or "").strip() or stem,
        title=str(fm.get("title") or "").strip() or h1 or stem,
        frontmatter=fm,
        subject=str(fm.get("subject") or "mathematics").strip().lower(),
        difficulty=max(1, min(5, _int(fm.get("difficulty"), 2))),
        technique=str(fm.get("technique") or "").strip(),
        statement=sec.get("statement", ""),
        hypotheses=_bullets(sec.get("hypotheses", "")),
        conclusion=sec.get("conclusion", ""),
        strategy=sec.get("strategy", ""),
        key_idea=sec.get("key_idea", ""),
        steps=_proof_steps(sec.get("proof", "")),
        variants=_bullets(sec.get("variants", "")),
    )


def ladder_note(text: str, path: Path | None = None) -> "ProofNote | None":
    """The ProofNote when the text is a theorem note the ladder can practise, else None."""
    try:
        fm, _ = parse_frontmatter(text or "")
        if not is_proof_frontmatter(fm):
            return None
        proof = parse_proof(text, path)
    except Exception:  # noqa: BLE001 - an unreadable note simply opens in the editor
        return None
    return proof if len(proof.steps) >= MIN_STEPS else None


# ── Levels and progress ───────────────────────────────────────────────────

def available_levels(proof: ProofNote) -> list[int]:
    return [1, 2, 3, 4, 5] + ([6] if proof.variants else [])


def mode_id(level: int) -> str:
    return f"proof_L{int(level)}"


def level_of(mode: str) -> int:
    m = re.fullmatch(r"proof_L(\d)", str(mode or ""))
    return int(m.group(1)) if m else 0


def passed(score, solution_seen: bool = False) -> bool:
    """A level counts as passed with a good score earned without looking at the proof."""
    return _int(score, 0) >= PASS_SCORE and not solution_seen


def next_level(current: int, level: int, ok: bool, top: int) -> int:
    """The learner's current level after an attempt at `level`: passing the current
    level unlocks the next one; failing any level drops one level below it."""
    if ok:
        return min(top, max(current, level + 1))
    return max(1, min(current, level - 1))


@dataclass
class LadderState:
    current: int = 1
    top: int = 5
    passed: set = field(default_factory=set)
    best: dict = field(default_factory=dict)
    count: dict = field(default_factory=dict)

    def unlocked(self, level: int) -> bool:
        return 1 <= level <= self.current


def ladder_state(attempts: list[dict], top: int) -> LadderState:
    state = LadderState(top=top)
    for att in attempts:
        level = level_of(att.get("mode"))
        if not 1 <= level <= top:
            continue
        score = _int(att.get("score"), 0)
        ok = passed(score, bool(att.get("solution_seen")))
        state.count[level] = state.count.get(level, 0) + 1
        state.best[level] = max(state.best.get(level, 0), score)
        if ok:
            state.passed.add(level)
        state.current = next_level(state.current, level, ok, top)
    return state


# ── Level content ─────────────────────────────────────────────────────────

def shuffled_order(n: int, seed) -> list[int]:
    """A permutation of range(n) that is never the identity (for n ≥ 2)."""
    order = list(range(n))
    if n < 2:
        return order
    rng = random.Random(str(seed))
    while order == sorted(order):
        rng.shuffle(order)
    return order


def check_order(order: list[int]) -> list[bool]:
    """Per position: is the step there the one the proof has there?"""
    return [step == pos for pos, step in enumerate(order)]


def hidden_steps(n: int, seed) -> list[int]:
    """Indices of the steps blanked at L3: about half of them, at least one."""
    k = max(1, n // 2)
    return sorted(random.Random(str(seed)).sample(range(n), k))


def rubric_for(proof: ProofNote, level: int, hidden: list[int] | None = None) -> list[str]:
    n = len(proof.steps)
    if level == 1:
        return ["Nombra la técnica de demostración adecuada",
                "Dice sobre qué se aplica (variable, objeto, caso de partida)",
                "Formula la idea clave que hace funcionar la prueba"]
    if level == 2:
        return [f"Paso {i + 1} en su lugar" for i in range(n)]
    if level == 3:
        return [f"Paso {i + 1} correcto y justificado" for i in (hidden or [])]
    if level == 4:
        return [f"Justificación del paso {i + 1}" for i in range(n)]
    return ["Plantea una estrategia que sirve para el enunciado",
            "No falta ningún paso necesario",
            "Cada paso está justificado",
            "Usa las hipótesis donde hacen falta",
            "Llega exactamente a la conclusión, sin circularidad"]


def proof_markdown(proof: ProofNote, with_why: bool = True) -> str:
    lines = []
    for i, step in enumerate(proof.steps, 1):
        lines.append(f"{i}. **Paso:** {step.text}")
        if with_why and step.why:
            lines.append(f"   **Por qué:** {step.why}")
    return "\n".join(lines)


def statement_markdown(proof: ProofNote) -> str:
    parts = [proof.statement.strip() or f"_{proof.title}_"]
    if proof.hypotheses:
        parts.append("**Hipótesis**\n\n" + "\n".join(f"- {h}" for h in proof.hypotheses))
    if proof.conclusion.strip():
        parts.append(f"**Conclusión:** {proof.conclusion.strip()}")
    return "\n\n".join(parts)


def level_exercise(proof: ProofNote, level: int, rubric: list[str]) -> ExerciseNote:
    """The ExerciseNote the attempt/error/SRS pipeline stores for one ladder attempt."""
    return ExerciseNote(
        path=proof.path, note_id=proof.note_id, title=f"{proof.title} · L{level}",
        frontmatter=proof.frontmatter, subject=proof.subject or "mathematics",
        discipline="math_general", skill="01", mode=mode_id(level),
        difficulty=proof.difficulty, minutes=0, timer=LEVELS[level].timer,
        assistance="helper", level="", statement=statement_markdown(proof),
        solution=proof_markdown(proof), rubric=list(rubric))


def local_order_result(order: list[int]) -> GradeResult:
    hits = check_order(order)
    n = len(hits)
    wrong = [i + 1 for i, ok in enumerate(hits) if not ok]
    score = round(100 * (n - len(wrong)) / n) if n else 0
    if not wrong:
        return GradeResult(score=100, verdict="correct", rubric=hits, errors=[],
                           feedback="Orden correcto: cada paso se apoya solo en los anteriores.",
                           next_step="Sube al nivel 3: completa los pasos ocultos.",
                           example="", raw="")
    positions = ", ".join(map(str, wrong))
    return GradeResult(
        score=score, verdict="partial" if score >= 40 else "incorrect", rubric=hits,
        errors=[GradeError(
            category="logical", anchor="",
            description=f"Proof steps placed out of order at positions {positions}.",
            evidence="", fix="Place each step after every step it relies on.")],
        feedback=f"Hay {len(wrong)} paso(s) fuera de su lugar (posiciones {positions}). "
                 "Pregúntate de qué pasos anteriores depende cada uno.",
        next_step="Lee de nuevo la estrategia y repite el orden sin mirar la nota.",
        example="", raw="")


# ── Grading messages ──────────────────────────────────────────────────────

def _format_error(err: dict) -> str:
    parts = [f"[x{err.get('repeat_count', 1)}] {err.get('category', '')}"]
    if err.get("anchor"):
        parts.append(f"anchor: \"{err['anchor']}\"")
    text = err.get("description_en") or err.get("explanation") or err.get("wrong_answer") or ""
    return "- " + " · ".join(parts) + (f" — {text}" if text else "")


def _section(title: str, body: str) -> str:
    return f"## {title}\n{body.strip() or '(none)'}"


def build_ladder_messages(proof: ProofNote, level: int, answer: str, *, rubric: list[str],
                          shown: str, seconds: int, solution_seen: bool,
                          recent_errors: list[dict], variant: str = "") -> list[dict]:
    """Messages for the AI judge: the proof note is the model solution."""
    lv = LEVELS[level]
    system = "\n".join([
        "You are NoteVault's practice judge: a demanding but kind mathematics teacher "
        "grading one level of a proof-practice ladder.",
        "",
        f"Subject: {proof.subject}. Level L{level} ({lv.label}): {lv.act}",
        "What to check: every claim is correct and justified, hypotheses are used where "
        "needed, there is no circular reasoning, and the answer reaches exactly what the "
        "task asks. Accept any valid equivalent argument or wording, not only the model.",
        "",
        "Grading rules:",
        "- Score 0-100. Mark each rubric item true only when the answer clearly satisfies it.",
        "- Classify every real error with one category of: " + ", ".join(ERROR_CATEGORIES) + ".",
        "- Write \"feedback\" and \"next_step\" in Spanish; write \"description\" and \"fix\" "
        "in English. Use LaTeX between $...$ for formulas.",
        "- Never reveal the full proof unless the verdict is \"correct\". Otherwise name the "
        "concept that blocks the learner and ask one guiding question in \"next_step\".",
        "- Always include a short corrected \"example\" when there is an error.",
        "- If the learner repeats one of their recent errors, say so in the feedback.",
        "",
        "Reply with ONLY one JSON object, no prose before or after it, with this shape:",
        JSON_CONTRACT,
    ])
    model = []
    if proof.strategy:
        model.append(f"Strategy: {proof.strategy}")
    if proof.key_idea:
        model.append(f"Key idea: {proof.key_idea}")
    model.append(proof_markdown(proof))
    rubric_txt = "\n".join(f"{i}. {item}" for i, item in enumerate(rubric, 1))
    recent = "\n".join(_format_error(e) for e in list(recent_errors or [])[:MAX_RECENT_ERRORS])
    minutes, secs = divmod(max(0, int(seconds)), 60)
    parts = [
        f"# Proof: {proof.title} ({proof.note_id}) — level L{level}",
        _section("Theorem", statement_markdown(proof)),
        _section("Variant the learner must prove", variant) if variant else "",
        _section("Task given to the learner", lv.task),
        _section("What the learner was shown", shown) if shown else "",
        _section(f"Rubric ({len(rubric)} items, return one boolean per item in order)",
                 rubric_txt),
        _section("Model proof of the original theorem (for the judge only, do not reveal "
                 "unless correct)", "\n\n".join(model)),
        _section("Learner's recent unresolved errors in this subject", recent),
        _section("Learner's answer", answer),
        _section("Context", f"Time spent: {minutes} min {secs} s. Model proof seen before "
                            f"answering: {'yes' if solution_seen else 'no'}."),
    ]
    return [{"role": "system", "content": system},
            {"role": "user", "content": "\n\n".join(p for p in parts if p)}]
