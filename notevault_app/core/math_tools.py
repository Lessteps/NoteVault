"""
NoteVault Math Tools
Symbolic calculation, equation solver, derivatives, integrals, and matrix operations.
Uses pure Python standard library to keep NoteVault.exe lightweight and fast.
"""

import math
import re
from typing import Any, Callable, Optional


def evaluate_function(expr_str: str, x: float) -> Optional[float]:
    """
    Safely evaluate a 1D mathematical expression f(x).
    Supports: sin, cos, tan, exp, log, sqrt, abs, ^ or **.
    """
    # Clean expression
    cleaned = expr_str.replace("^", "**")
    # Replace math names
    safe_dict = {
        "x": x,
        "pi": math.pi,
        "e": math.e,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "exp": math.exp,
        "log": math.log,
        "sqrt": math.sqrt,
        "abs": abs,
    }
    try:
        val = eval(cleaned, {"__builtins__": {}}, safe_dict)
        return float(val) if not isinstance(val, complex) else None
    except Exception:
        return None


def solve_quadratic(a: float, b: float, c: float) -> tuple[Optional[float], Optional[float]]:
    """Solve ax^2 + bx + c = 0."""
    if a == 0:
        return (-c / b if b != 0 else None), None
    disc = b**2 - 4 * a * c
    if disc < 0:
        return None, None
    root_disc = math.sqrt(disc)
    x1 = (-b + root_disc) / (2 * a)
    x2 = (-b - root_disc) / (2 * a)
    return round(x1, 4), round(x2, 4)


def differentiate_polynomial(poly_terms: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Given a list of (coefficient, exponent) terms representing f(x),
    returns the derived terms f'(x) using the power rule: d/dx [c * x^n] = (c * n) * x^(n - 1).
    """
    derived = []
    for coeff, exp in poly_terms:
        if exp != 0:
            derived.append((round(coeff * exp, 4), exp - 1))
    return derived or [(0.0, 0.0)]


def format_polynomial(poly_terms: list[tuple[float, float]]) -> str:
    """Format polynomial terms into a readable string."""
    if not poly_terms:
        return "0"
    parts = []
    for coeff, exp in poly_terms:
        if coeff == 0:
            continue
        c_str = f"{coeff:g}"
        if exp == 0:
            parts.append(c_str)
        elif exp == 1:
            parts.append(f"{c_str}x" if c_str != "1" else "x")
        else:
            parts.append(f"{c_str}x^{exp:g}" if c_str != "1" else f"x^{exp:g}")
    return " + ".join(parts).replace("+ -", "- ") if parts else "0"


def matrix_det2x2(matrix: list[list[float]]) -> float:
    """Calculate determinant of a 2x2 matrix."""
    return round(matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0], 4)


def matrix_add(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    """Element-wise addition of two matrices."""
    return [[round(a[i][j] + b[i][j], 4) for j in range(len(a[0]))] for i in range(len(a))]


def matrix_multiply(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    """Matrix multiplication A x B."""
    rows_a, cols_a = len(a), len(a[0])
    rows_b, cols_b = len(b), len(b[0])
    if cols_a != rows_b:
        raise ValueError("Dimension mismatch for matrix multiplication")
    result = [[0.0 for _ in range(cols_b)] for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            s = sum(a[i][k] * b[k][j] for k in range(cols_a))
            result[i][j] = round(s, 4)
    return result


def to_latex_fraction(num: str, den: str) -> str:
    """Return LaTeX fraction markup."""
    return f"\\frac{{{num}}}{{{den}}}"
