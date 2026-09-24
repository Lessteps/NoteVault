"""Fast-calculation drills: generated and checked locally, never by the AI.

Answers are compared as numbers; derivative answers are compared by evaluating
both polynomials at a few points with a restricted AST evaluator (numbers, x,
+ - * / ^ ** and parentheses only). Nothing is ever passed to eval().
"""

import ast
import random
import re
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from .grading import GradeError, GradeResult


@dataclass(frozen=True)
class DrillItem:
    prompt: str
    answer: str
    kind: str


DRILL_KINDS: dict[str, str] = {
    "arithmetic": "Aritmética",
    "fractions": "Fracciones",
    "powers": "Potencias y raíces",
    "percent": "Porcentajes",
    "derivatives": "Derivadas",
}

_CHECK_POINTS = (Fraction(-3, 2), Fraction(-1), Fraction(1, 3), Fraction(2), Fraction(7, 2))
_MAX_EXPONENT = 12
_IMPLICIT_MUL_RE = re.compile(r"(?<=[\dx)])\s*(?=[x(])")


# ── Generation ─────────────────────────────────────────────────────────────

def _fmt_fraction(value: Fraction) -> str:
    if value.denominator == 1:
        return str(value.numerator)
    return f"{value.numerator}/{value.denominator}"


def _fmt_decimal(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _arithmetic(rng: random.Random, d: int) -> DrillItem:
    limit = (10, 20, 50, 100, 500)[d - 1]
    factor = (10, 12, 15, 25, 40)[d - 1]
    op = rng.choice("+-×÷")
    if op in "+-":
        low = -limit if d >= 4 else 1
        a, b = rng.randint(low, limit), rng.randint(low, limit)
        if op == "-" and d <= 2 and b > a:
            a, b = b, a
        result = a + b if op == "+" else a - b
    elif op == "×":
        a, b = rng.randint(2, factor), rng.randint(2, factor)
        result = a * b
    else:
        b, result = rng.randint(2, factor), rng.randint(2, factor)
        a = b * result
    right = f"({b})" if b < 0 else str(b)
    return DrillItem(f"{a} {op} {right}", str(result), "arithmetic")


def _fractions(rng: random.Random, d: int) -> DrillItem:
    max_den = (6, 10, 12, 15, 20)[d - 1]

    def pick() -> tuple[int, int]:
        den = rng.randint(2, max_den)
        return rng.randint(1, den - 1 if d <= 2 else 2 * den), den

    (an, ad), (bn, bd) = pick(), pick()
    a, b = Fraction(an, ad), Fraction(bn, bd)
    op = rng.choice("+-" if d == 1 else "+-×÷")
    result = {"+": a + b, "-": a - b, "×": a * b, "÷": a / b}[op]
    return DrillItem(f"{an}/{ad} {op} {bn}/{bd}", _fmt_fraction(result), "fractions")


def _powers(rng: random.Random, d: int) -> DrillItem:
    if rng.random() < 1 / 3:
        if d >= 3 and rng.random() < 0.5:
            root = rng.randint(2, 10)
            return DrillItem(f"∛{root ** 3}", str(root), "powers")
        root = rng.randint(2, (12, 15, 20, 25, 30)[d - 1])
        return DrillItem(f"√{root ** 2}", str(root), "powers")
    exponent = rng.randint(2, (2, 3, 3, 4, 5)[d - 1])
    max_base = {2: (10, 15, 20, 25, 30)[d - 1], 3: 10, 4: 6, 5: 4}[exponent]
    base = rng.randint(2, max_base)
    if d >= 4 and rng.random() < 0.3:
        base = -base
    shown = f"({base})" if base < 0 else str(base)
    return DrillItem(f"{shown}^{exponent}", str(base ** exponent), "powers")


_PERCENTS = (
    ("10", "20", "25", "50"),
    ("5", "15", "30", "40", "75"),
    ("12.5", "35", "60", "80", "90"),
    ("2.5", "7.5", "17.5", "120", "150"),
    ("0.5", "1.5", "33", "45", "250"),
)


def _percent(rng: random.Random, d: int) -> DrillItem:
    pct = Decimal(rng.choice([p for level in _PERCENTS[:d] for p in level]))
    step = (10, 10, 5, 4, 1)[d - 1]
    base = rng.randrange(step, (200, 500, 1000, 2000, 5000)[d - 1] + 1, step)
    return DrillItem(f"{_fmt_decimal(pct)} % de {base}", _fmt_decimal(pct * base / 100),
                     "percent")


def _fmt_poly(terms: dict[int, int]) -> str:
    out = ""
    for exp in sorted(terms, reverse=True):
        coef = terms[exp]
        if coef == 0:
            continue
        mag = abs(coef)
        body = str(mag) if exp == 0 or mag != 1 else ""
        body += "" if exp == 0 else "x" if exp == 1 else f"x^{exp}"
        if out:
            out += f" {'-' if coef < 0 else '+'} {body}"
        else:
            out = ("-" if coef < 0 else "") + body
    return out or "0"


def _derivatives(rng: random.Random, d: int) -> DrillItem:
    degree = (2, 3, 4, 5, 6)[d - 1]
    max_coef = (5, 9, 12, 15, 20)[d - 1]
    exps = set(rng.sample(range(0, degree + 1), rng.randint(2, min(4, degree + 1))))
    exps.add(degree)
    terms = {}
    for exp in exps:
        coef = rng.randint(1, max_coef)
        terms[exp] = -coef if rng.random() < 0.35 else coef
    derivative = {e - 1: c * e for e, c in terms.items() if e > 0}
    return DrillItem(f"d/dx ({_fmt_poly(terms)})", _fmt_poly(derivative), "derivatives")


_GENERATORS = {
    "arithmetic": _arithmetic,
    "fractions": _fractions,
    "powers": _powers,
    "percent": _percent,
    "derivatives": _derivatives,
}


def generate(kind: str, count: int, difficulty: int = 2,
             seed: int | None = None) -> list[DrillItem]:
    if kind not in _GENERATORS:
        raise ValueError(f"unknown drill kind: {kind}")
    rng = random.Random(seed)
    d = max(1, min(5, int(difficulty)))
    return [_GENERATORS[kind](rng, d) for _ in range(max(0, int(count)))]


# ── Checking ───────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    text = str(text or "").strip().lower()
    for src, dst in (("−", "-"), ("×", "*"), ("·", "*"), ("÷", "/")):
        text = text.replace(src, dst)
    if text.count(",") == 1 and "." not in text:
        text = text.replace(",", ".")
    return text


def _number(text: str) -> Fraction | None:
    try:
        return Fraction(text)
    except (ValueError, ZeroDivisionError):
        return None


def _evaluate(node, x: Fraction) -> Fraction:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body, x)
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return Fraction(str(node.value))
    if isinstance(node, ast.Name) and node.id == "x":
        return x
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _evaluate(node.operand, x)
        return -value if isinstance(node.op, ast.USub) else value
    if isinstance(node, ast.BinOp):
        left, right = _evaluate(node.left, x), _evaluate(node.right, x)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.Pow):
            if right.denominator != 1 or not 0 <= right <= _MAX_EXPONENT:
                raise ValueError("unsupported exponent")
            return left ** int(right)
    raise ValueError("unsupported expression")


def evaluate_polynomial(expr: str, x: Fraction) -> Fraction:
    """Evaluate `expr` (e.g. "6x^2 - 4x + 1") at x with the restricted evaluator."""
    prepared = _IMPLICIT_MUL_RE.sub("*", _normalize(expr).replace("^", "**"))
    return _evaluate(ast.parse(prepared, mode="eval"), Fraction(x))


def _same_polynomial(expected: str, given: str) -> bool:
    try:
        return all(evaluate_polynomial(expected, x) == evaluate_polynomial(given, x)
                   for x in _CHECK_POINTS)
    except (SyntaxError, ValueError, ZeroDivisionError, TypeError, RecursionError):
        return False


def check(item: DrillItem, given: str) -> bool:
    text = _normalize(given)
    if not text:
        return False
    if item.kind == "derivatives":
        return _same_polynomial(item.answer, text)
    value = _number(text)
    return value is not None and value == _number(_normalize(item.answer))


# ── Summary ────────────────────────────────────────────────────────────────

def summarize(results: list[tuple[DrillItem, str, bool, float]]) -> GradeResult:
    total = len(results)
    right = sum(1 for _, _, ok, _ in results if ok)
    seconds = sum(max(0.0, float(t)) for _, _, _, t in results)
    score = round(100 * right / total) if total else 0
    wrong = [(item, given) for item, given, ok, _ in results if not ok]
    errors = [
        GradeError(category="calculation", anchor="",
                   description=(f"{item.kind}: expected {item.answer}, "
                                f"got {given.strip() or '(blank)'}"),
                   evidence=f"{item.prompt} = {given.strip()}",
                   fix=f"{item.prompt} = {item.answer}")
        for item, given in wrong
    ]
    per_item = seconds / total if total else 0.0
    feedback = (f"{right}/{total} correctas en {seconds:.0f} s "
                f"({per_item:.1f} s por ejercicio).")
    if total and not wrong:
        feedback += " Sin fallos: el siguiente paso es ganar velocidad."
    elif wrong:
        feedback += f" Fallaste {len(wrong)}; revisa cada una antes de repetir el sprint."
    next_step = ("Sube la dificultad o baja el tiempo del sprint." if total and not wrong
                 else "Repite el sprint con los mismos tipos de operación hasta no fallar.")
    return GradeResult(
        score=score,
        verdict="correct" if score >= 90 else "partial" if score >= 40 else "incorrect",
        rubric=[ok for _, _, ok, _ in results],
        errors=errors,
        feedback=feedback,
        next_step=next_step,
        example="\n".join(f"{item.prompt} = {item.answer}" for item, _ in wrong[:5]),
        raw="",
    )
