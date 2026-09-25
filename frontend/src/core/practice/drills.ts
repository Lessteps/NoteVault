/**
 * Fast-calculation drills: generated and checked locally, never by the AI.
 *
 * Answers are compared as numbers; derivative answers are compared by evaluating
 * both polynomials at a few points with a restricted AST evaluator (numbers, x,
 * + - * / ^ ** and parentheses only). Nothing is ever passed to eval().
 */

import { Fraction, evaluatePolynomial } from "../fraction.js";
import { GradeError, GradeResult } from "./grading.js";

export class DrillItem {
  prompt: string;
  answer: string;
  kind: string;

  constructor(prompt: string, answer: string, kind: string) {
    this.prompt = prompt;
    this.answer = answer;
    this.kind = kind;
  }
}

export const DRILL_KINDS: Record<string, string> = {
  arithmetic: "Aritm\u00e9tica",
  fractions: "Fracciones",
  powers: "Potencias y ra\u00edces",
  percent: "Porcentajes",
  derivatives: "Derivadas",
};

const _CHECK_POINTS: Fraction[] = [
  new Fraction(-3, 2),
  new Fraction(-1, 1),
  new Fraction(1, 3),
  new Fraction(2, 1),
  new Fraction(7, 2),
];

const _PERCENTS: string[][] = [
  ["10", "20", "25", "50"],
  ["5", "15", "30", "40", "75"],
  ["12.5", "35", "60", "80", "90"],
  ["2.5", "7.5", "17.5", "120", "150"],
  ["0.5", "1.5", "33", "45", "250"],
];

class Rng {
  private h: number;

  constructor(seed?: any) {
    if (seed === undefined || seed === null) {
      this.h = (Date.now() ^ (process.hrtime.bigint() as any)) | 0;
    } else {
      let h = 0;
      const s = String(seed);
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
      }
      this.h = h;
    }
  }

  random(): number {
    this.h = Math.imul(this.h ^ (this.h >>> 15), 1 | this.h);
    this.h ^= this.h + Math.imul(this.h ^ (this.h >>> 7), 61 | this.h) ^ this.h;
    return ((this.h ^ (this.h >>> 14)) >>> 0) / 4294967296;
  }

  randint(low: number, high: number): number {
    return Math.floor(this.random() * (high - low + 1)) + low;
  }

  choice<T>(items: T[] | string): T {
    const idx = Math.floor(this.random() * items.length);
    return (items as any)[idx];
  }

  sample<T>(items: T[], k: number): T[] {
    const pool = [...items];
    const n = pool.length;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    return pool.slice(0, k);
  }
}

function _fmtFraction(value: Fraction): string {
  if (value.denominator === 1) {
    return String(value.numerator);
  }
  return `${value.numerator}/${value.denominator}`;
}

function _fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "");
}

function _arithmetic(rng: Rng, d: number): DrillItem {
  const limit = [10, 20, 50, 100, 500][d - 1]!;
  const factor = [10, 12, 15, 25, 40][d - 1]!;
  const op = rng.choice(["+", "-", "\u00d7", "\u00f7"]);
  let a: number;
  let b: number;
  let result: number;

  if (op === "+" || op === "-") {
    const low = d >= 4 ? -limit : 1;
    a = rng.randint(low, limit);
    b = rng.randint(low, limit);
    if (op === "-" && d <= 2 && b > a) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    result = op === "+" ? a + b : a - b;
  } else if (op === "\u00d7") {
    a = rng.randint(2, factor);
    b = rng.randint(2, factor);
    result = a * b;
  } else {
    b = rng.randint(2, factor);
    result = rng.randint(2, factor);
    a = b * result;
  }

  const right = b < 0 ? `(${b})` : String(b);
  return {
    prompt: `${a} ${op} ${right}`,
    answer: String(result),
    kind: "arithmetic",
  };
}

function _fractions(rng: Rng, d: number): DrillItem {
  const maxDen = [6, 10, 12, 15, 20][d - 1]!;
  const pick = (): [number, number] => {
    const den = rng.randint(2, maxDen);
    const num = rng.randint(1, d <= 2 ? den - 1 : 2 * den);
    return [num, den];
  };

  const [an, ad] = pick();
  const [bn, bd] = pick();
  const a = new Fraction(an, ad);
  const b = new Fraction(bn, bd);
  const op = rng.choice(d === 1 ? ["+", "-"] : ["+", "-", "\u00d7", "\u00f7"]);

  let result: Fraction;
  if (op === "+") result = a.add(b);
  else if (op === "-") result = a.sub(b);
  else if (op === "\u00d7") result = a.mul(b);
  else result = a.div(b);

  return {
    prompt: `${an}/${ad} ${op} ${bn}/${bd}`,
    answer: _fmtFraction(result),
    kind: "fractions",
  };
}

function _powers(rng: Rng, d: number): DrillItem {
  if (rng.random() < 1 / 3) {
    if (d >= 3 && rng.random() < 0.5) {
      const root = rng.randint(2, 10);
      return {
        prompt: `\u221b${root ** 3}`,
        answer: String(root),
        kind: "powers",
      };
    }
    const maxRoot = [12, 15, 20, 25, 30][d - 1]!;
    const root = rng.randint(2, maxRoot);
    return {
      prompt: `\u221a${root ** 2}`,
      answer: String(root),
      kind: "powers",
    };
  }

  const maxExponents = [2, 3, 3, 4, 5];
  const exponent = rng.randint(2, maxExponents[d - 1]!);
  const maxBaseTable: Record<number, number> = {
    2: [10, 15, 20, 25, 30][d - 1]!,
    3: 10,
    4: 6,
    5: 4,
  };
  const maxBase = maxBaseTable[exponent] || 4;
  let base = rng.randint(2, maxBase);
  if (d >= 4 && rng.random() < 0.3) {
    base = -base;
  }
  const shown = base < 0 ? `(${base})` : String(base);
  return {
    prompt: `${shown}^${exponent}`,
    answer: String(base ** exponent),
    kind: "powers",
  };
}

function _percent(rng: Rng, d: number): DrillItem {
  const pool: string[] = [];
  for (let i = 0; i < d; i++) {
    pool.push(..._PERCENTS[i]!);
  }
  const pctStr = rng.choice(pool);
  const pctVal = parseFloat(pctStr);
  const step = [10, 10, 5, 4, 1][d - 1]!;
  const maxBase = [200, 500, 1000, 2000, 5000][d - 1]!;
  const maxSteps = Math.floor(maxBase / step);
  const base = rng.randint(1, maxSteps) * step;
  const result = (pctVal * base) / 100;

  return {
    prompt: `${pctStr} % de ${base}`,
    answer: _fmtNumber(result),
    kind: "percent",
  };
}

function _fmtPoly(terms: Record<number, number>): string {
  let out = "";
  const exps = Object.keys(terms)
    .map((k) => parseInt(k, 10))
    .sort((a, b) => b - a);

  for (const exp of exps) {
    const coef = terms[exp]!;
    if (coef === 0) continue;
    const mag = Math.abs(coef);
    let body = exp === 0 || mag !== 1 ? String(mag) : "";
    body += exp === 0 ? "" : exp === 1 ? "x" : `x^${exp}`;
    if (out) {
      out += ` ${coef < 0 ? "-" : "+"} ${body}`;
    } else {
      out = (coef < 0 ? "-" : "") + body;
    }
  }
  return out || "0";
}

function _derivatives(rng: Rng, d: number): DrillItem {
  const degree = [2, 3, 4, 5, 6][d - 1]!;
  const maxCoef = [5, 9, 12, 15, 20][d - 1]!;
  const allExps = Array.from({ length: degree + 1 }, (_, i) => i);
  const count = rng.randint(2, Math.min(4, degree + 1));
  const chosen = new Set(rng.sample(allExps, count));
  chosen.add(degree);

  const terms: Record<number, number> = {};
  for (const exp of chosen) {
    const coef = rng.randint(1, maxCoef);
    terms[exp] = rng.random() < 0.35 ? -coef : coef;
  }

  const derivative: Record<number, number> = {};
  for (const [expStr, coef] of Object.entries(terms)) {
    const exp = parseInt(expStr, 10);
    if (exp > 0) {
      derivative[exp - 1] = coef * exp;
    }
  }

  return {
    prompt: `d/dx (${_fmtPoly(terms)})`,
    answer: _fmtPoly(derivative),
    kind: "derivatives",
  };
}

const _GENERATORS: Record<string, (rng: Rng, d: number) => DrillItem> = {
  arithmetic: _arithmetic,
  fractions: _fractions,
  powers: _powers,
  percent: _percent,
  derivatives: _derivatives,
};

export function generate(
  kind: string,
  count: number,
  difficulty: number = 2,
  seed?: any
): DrillItem[] {
  const gen = _GENERATORS[kind];
  if (!gen) {
    throw new Error(`unknown drill kind: ${kind}`);
  }
  const rng = new Rng(seed);
  const d = Math.max(1, Math.min(5, Math.floor(difficulty)));
  const total = Math.max(0, Math.floor(count));
  const res: DrillItem[] = [];
  for (let i = 0; i < total; i++) {
    res.push(gen(rng, d));
  }
  return res;
}

// ── Checking ───────────────────────────────────────────────────────────────

function _normalize(text: any): string {
  let s = String(text ?? "").trim().toLowerCase();
  s = s.replace(/−/g, "-").replace(/×/g, "*").replace(/·/g, "*").replace(/÷/g, "/");
  if (s.split(",").length - 1 === 1 && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  return s;
}

function _number(text: string): Fraction | null {
  try {
    return new Fraction(text);
  } catch {
    return null;
  }
}

function _samePolynomial(expected: string, given: string): boolean {
  try {
    return _CHECK_POINTS.every((x) => {
      const eVal = evaluatePolynomial(expected, x);
      const gVal = evaluatePolynomial(given, x);
      return eVal.equals(gVal);
    });
  } catch {
    return false;
  }
}

export function check(item: DrillItem, given: string): boolean {
  const text = _normalize(given);
  if (!text) return false;
  if (item.kind === "derivatives") {
    return _samePolynomial(item.answer, text);
  }
  const value = _number(text);
  const expected = _number(_normalize(item.answer));
  return value !== null && expected !== null && value.equals(expected);
}

// ── Summary ────────────────────────────────────────────────────────────────

export function summarize(
  results: Array<[DrillItem, string, boolean, number]>
): GradeResult {
  const total = results.length;
  const right = results.filter((r) => r[2]).length;
  const seconds = results.reduce((acc, r) => acc + Math.max(0, Number(r[3]) || 0), 0);
  const score = total > 0 ? Math.round((100 * right) / total) : 0;
  const wrong = results.filter((r) => !r[2]);

  const errors: GradeError[] = wrong.map(([item, given]) => ({
    category: "calculation",
    anchor: "",
    description: `${item.kind}: expected ${item.answer}, got ${given.trim() || "(blank)"}`,
    evidence: `${item.prompt} = ${given.trim()}`,
    fix: `${item.prompt} = ${item.answer}`,
  }));

  const perItem = total > 0 ? seconds / total : 0.0;
  let feedback = `${right}/${total} correctas en ${seconds.toFixed(0)} s (${perItem.toFixed(1)} s por ejercicio).`;
  if (total > 0 && wrong.length === 0) {
    feedback += " Sin fallos: el siguiente paso es ganar velocidad.";
  } else if (wrong.length > 0) {
    feedback += ` Fallaste ${wrong.length}; revisa cada una antes de repetir el sprint.`;
  }

  const nextStep =
    total > 0 && wrong.length === 0
      ? "Sube la dificultad o baja el tiempo del sprint."
      : "Repite el sprint con los mismos tipos de operaci\u00f3n hasta no fallar.";

  const exampleLines = wrong.slice(0, 5).map(([item]) => `${item.prompt} = ${item.answer}`);

  return {
    score,
    verdict: score >= 90 ? "correct" : score >= 40 ? "partial" : "incorrect",
    rubric: results.map((r) => r[2]),
    errors,
    feedback,
    next_step: nextStep,
    example: exampleLines.join("\n"),
    raw: "",
  };
}
