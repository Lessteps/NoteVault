"""Grading prompt for the AI judge and parsing of its JSON reply."""

import json
import re
from dataclasses import dataclass, field

from ..study_error_manager import ERROR_CATEGORIES
from .discipline_catalog import DISCIPLINES, skill_of
from .exercise_note import ExerciseNote
from .modes import MODES

MAX_RECENT_ERRORS = 15

JSON_CONTRACT = """\
{
  "score": 0,
  "verdict": "correct | partial | incorrect",
  "rubric": [true, false, true, true, false],
  "errors": [
    {"category": "one of: %s",
     "anchor": "exact anchor text from the list, or \\"\\"",
     "description": "English, one sentence",
     "evidence": "short quote from the answer",
     "fix": "English, how to fix it"}
  ],
  "feedback": "Spanish, 2-5 sentences, teacher voice",
  "next_step": "Spanish, one concrete action",
  "example": "short corrected snippet (code, SQL, command, formula or sentence)"
}""" % ", ".join(ERROR_CATEGORIES)

_VERDICTS = {
    "correct": "correct", "correcto": "correct", "correcta": "correct",
    "partial": "partial", "partially correct": "partial", "parcial": "partial",
    "incorrect": "incorrect", "incorrecto": "incorrect", "incorrecta": "incorrect",
    "wrong": "incorrect",
}
_TRUE_WORDS = ("true", "yes", "si", "sí", "1", "x", "ok")
_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*\n(.*?)```", re.S | re.I)


@dataclass
class GradeError:
    category: str
    anchor: str
    description: str
    evidence: str
    fix: str


@dataclass
class GradeResult:
    score: int
    verdict: str
    rubric: list[bool]
    errors: list[GradeError]
    feedback: str
    next_step: str
    example: str
    raw: str = field(default="", repr=False)


class GradeParseError(ValueError):
    pass


def _section(title: str, body: str) -> str:
    return f"## {title}\n{body.strip() or '(none)'}"


def _system_message(ex: ExerciseNote) -> str:
    mode = MODES[ex.mode]
    discipline = DISCIPLINES[ex.discipline]
    skill = skill_of(discipline, ex.skill)
    lines = [
        "You are NoteVault's practice judge: a demanding but kind teacher. You never execute "
        "code, SQL or commands; you read them and reason about their behaviour, as a teacher "
        "would on paper.",
        "",
        f"Subject: {ex.subject}. Discipline: {discipline.id} ({discipline.title}).",
        f"Cognitive act (mode '{mode.id}'): {mode.act}",
        f"What to check for this act: {mode.judge_focus}",
        f"Exercise framing rules: {discipline.framing}",
    ]
    if skill:
        lines.append(f"Target skill {skill.code}: {skill.title}.")
        lines.append("Known failure modes (anchors) for this skill; when an error matches one, "
                     "copy its text exactly into the error's \"anchor\" field:")
        lines += [f"- {a}" for a in skill.anchors]
    if ex.frontmatter.get("chapter"):
        lines.append(f"Current chapter (mandatory focus): {ex.frontmatter['chapter']}")
    if ex.level:
        lines.append(f"Target CEFR level: {ex.level}. Judge accuracy and range against that "
                     "level; do not penalize the absence of structures above it.")
    lines += [
        "",
        "Grading rules:",
        "- Score 0-100. Mark each rubric item true only when the answer clearly satisfies it.",
        "- Classify every real error with one category of: " + ", ".join(ERROR_CATEGORIES) + ".",
        "- Write \"feedback\" and \"next_step\" in Spanish; write \"description\" and \"fix\" "
        "in English.",
        "- Never reveal the full solution unless the verdict is \"correct\". Otherwise name "
        "the concept that blocks the learner and ask one guiding question in \"next_step\".",
        "- Always include a short corrected \"example\" when there is an error.",
        "- If the learner repeats one of their recent errors, say so in the feedback.",
        "",
        "Reply with ONLY one JSON object, no prose before or after it, with this shape:",
        JSON_CONTRACT,
    ]
    return "\n".join(lines)


def _format_error(err: dict) -> str:
    parts = [f"[x{err.get('repeat_count', 1)}] {err.get('category', '')}"]
    if err.get("anchor"):
        parts.append(f"anchor: \"{err['anchor']}\"")
    text = err.get("description_en") or err.get("explanation") or err.get("wrong_answer") or ""
    return "- " + " · ".join(parts) + (f" — {text}" if text else "")


def build_grading_messages(ex: ExerciseNote, answer: str, *, hints_used: int, seconds: int,
                           solution_seen: bool, recent_errors: list[dict]) -> list[dict]:
    code = ""
    if ex.code:
        code = f"```{ex.code_lang}\n{ex.code}\n```"
    rubric = "\n".join(f"{i}. {item}" for i, item in enumerate(ex.rubric, 1))
    typical = "\n".join(f"- {cat or 'general'}: {text}" for cat, text in ex.typical_errors)
    recent = "\n".join(_format_error(e) for e in list(recent_errors or [])[:MAX_RECENT_ERRORS])
    minutes, secs = divmod(max(0, int(seconds)), 60)
    parts = [
        f"# Exercise: {ex.title} ({ex.note_id})",
        _section("Statement", ex.statement),
        _section("Given code", code) if code else "",
        _section(f"Rubric ({len(ex.rubric)} items, return one boolean per item in order)",
                 rubric),
        _section("Model solution (for the judge only, do not reveal unless correct)",
                 ex.solution),
        _section("Typical errors (for the judge only)", typical),
        _section("Mastery signal (for the judge only)", ex.mastery_signal)
        if ex.mastery_signal else "",
        _section("Learner's recent unresolved errors in this subject", recent),
        _section("Learner's answer", answer),
        _section("Context", f"Hints used: {hints_used} of {len(ex.hints)}. "
                            f"Time spent: {minutes} min {secs} s. "
                            f"Model solution seen before answering: "
                            f"{'yes' if solution_seen else 'no'}."),
    ]
    return [
        {"role": "system", "content": _system_message(ex)},
        {"role": "user", "content": "\n\n".join(p for p in parts if p)},
    ]


def _find_json_object(text: str) -> dict | None:
    stripped = text.strip()
    candidates = [stripped] + [m.group(1) for m in _FENCED_JSON_RE.finditer(text)]
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    decoder = json.JSONDecoder()
    for m in re.finditer(r"\{", text):
        try:
            data, _ = decoder.raw_decode(text, m.start())
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    return None


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    return str(value).strip().lower() in _TRUE_WORDS


def _as_score(value) -> int:
    try:
        score = round(float(value))
    except (TypeError, ValueError):
        m = re.search(r"-?\d+(?:\.\d+)?", str(value or ""))
        score = round(float(m.group())) if m else 0
    return max(0, min(100, score))


def _verdict(value, score: int) -> str:
    verdict = _VERDICTS.get(str(value or "").strip().lower())
    if verdict:
        return verdict
    return "correct" if score >= 90 else "partial" if score >= 40 else "incorrect"


def _grade_error(item) -> GradeError | None:
    if isinstance(item, str):
        item = {"description": item}
    if not isinstance(item, dict):
        return None
    category = str(item.get("category") or "").strip().lower()
    return GradeError(
        category=category if category in ERROR_CATEGORIES else "conceptual",
        anchor=str(item.get("anchor") or "").strip(),
        description=str(item.get("description") or "").strip(),
        evidence=str(item.get("evidence") or "").strip(),
        fix=str(item.get("fix") or "").strip(),
    )


def parse_grade_reply(text: str, rubric_len: int) -> GradeResult:
    data = _find_json_object(text or "")
    if data is None:
        raise GradeParseError("No se encontró un objeto JSON con la corrección en la respuesta "
                              "de la IA.")
    score = _as_score(data.get("score"))
    raw_rubric = data.get("rubric")
    rubric = [_as_bool(v) for v in raw_rubric] if isinstance(raw_rubric, list) else []
    rubric = (rubric + [False] * rubric_len)[:max(0, rubric_len)]
    raw_errors = data.get("errors")
    errors = [e for e in map(_grade_error, raw_errors if isinstance(raw_errors, list) else [])
              if e]
    return GradeResult(
        score=score,
        verdict=_verdict(data.get("verdict"), score),
        rubric=rubric,
        errors=errors,
        feedback=str(data.get("feedback") or "").strip(),
        next_step=str(data.get("next_step") or "").strip(),
        example=str(data.get("example") or "").strip(),
        raw=text or "",
    )


def quality_from(result: GradeResult, hints_used: int, solution_seen: bool) -> int:
    score = result.score
    quality = (5 if score >= 90 else 4 if score >= 75 else 3 if score >= 60
               else 2 if score >= 40 else 1 if score >= 20 else 0)
    if hints_used >= 2:
        quality -= 1
    if solution_seen:
        quality = min(quality, 2)
    return max(0, quality)
