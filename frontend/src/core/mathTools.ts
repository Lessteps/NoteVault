/**
 * NoteVault Math Tools
 * Symbolic calculation, equation solver, derivatives, integrals, and matrix operations.
 */

export interface Token {
  type: "NUM" | "VAR" | "FUNC" | "OP" | "LPAREN" | "RPAREN";
  val: string;
}

const FUNCTIONS = new Set(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"]);
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

function tokenizeMath(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim();

  while (i < s.length) {
    const ch = s[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/\d/.test(ch) || (ch === "." && i + 1 < s.length && /\d/.test(s[i + 1]!))) {
      let numStr = "";
      while (i < s.length && (/[\d.]/.test(s[i]!))) {
        numStr += s[i];
        i++;
      }
      tokens.push({ type: "NUM", val: numStr });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let name = "";
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i]!)) {
        name += s[i];
        i++;
      }
      const lower = name.toLowerCase();
      if (lower === "x") {
        tokens.push({ type: "VAR", val: "x" });
      } else if (lower in CONSTANTS) {
        tokens.push({ type: "NUM", val: String(CONSTANTS[lower]) });
      } else if (FUNCTIONS.has(lower)) {
        tokens.push({ type: "FUNC", val: lower });
      } else {
        throw new Error(`Unknown identifier: ${name}`);
      }
      continue;
    }

    if (ch === "*" && i + 1 < s.length && s[i + 1] === "*") {
      tokens.push({ type: "OP", val: "^" });
      i += 2;
      continue;
    }

    if (ch === "^" || ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "OP", val: ch });
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", val: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "RPAREN", val: ")" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  return tokens;
}

class MathParser {
  private tokens: Token[];
  private pos = 0;
  private x: number;

  constructor(tokens: Token[], x: number) {
    this.tokens = tokens;
    this.x = x;
  }

  parse(): number {
    const res = this.parseAddSub();
    if (this.pos < this.tokens.length) {
      throw new Error(`Extra tokens remaining: ${this.tokens[this.pos]?.val}`);
    }
    return res;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek()?.type === "OP" && (this.peek()?.val === "+" || this.peek()?.val === "-")) {
      const op = this.next().val;
      const right = this.parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parsePower();
    while (this.peek()?.type === "OP" && (this.peek()?.val === "*" || this.peek()?.val === "/")) {
      const op = this.next().val;
      const right = this.parsePower();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private parsePower(): number {
    let left = this.parseUnary();
    if (this.peek()?.type === "OP" && this.peek()?.val === "^") {
      this.next();
      const right = this.parsePower();
      left = Math.pow(left, right);
    }
    return left;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t?.type === "OP" && (t.val === "+" || t.val === "-")) {
      this.next();
      const operand = this.parseUnary();
      return t.val === "-" ? -operand : operand;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.next();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.type === "NUM") {
      return parseFloat(t.val);
    }
    if (t.type === "VAR") {
      return this.x;
    }
    if (t.type === "FUNC") {
      if (this.peek()?.type !== "LPAREN") {
        throw new Error(`Expected ( after function ${t.val}`);
      }
      this.next(); // consume (
      const arg = this.parseAddSub();
      if (this.next()?.type !== "RPAREN") {
        throw new Error(`Missing closing paren for function ${t.val}`);
      }
      switch (t.val) {
        case "sin":
          return Math.sin(arg);
        case "cos":
          return Math.cos(arg);
        case "tan":
          return Math.tan(arg);
        case "exp":
          return Math.exp(arg);
        case "log":
          return Math.log(arg);
        case "sqrt":
          return Math.sqrt(arg);
        case "abs":
          return Math.abs(arg);
        default:
          throw new Error(`Unknown function: ${t.val}`);
      }
    }
    if (t.type === "LPAREN") {
      const val = this.parseAddSub();
      if (this.next()?.type !== "RPAREN") {
        throw new Error("Missing closing parenthesis");
      }
      return val;
    }
    throw new Error(`Unexpected token: ${t.val}`);
  }
}

export function evaluateFunction(exprStr: string, x: number): number | null {
  try {
    const cleaned = exprStr.replace(/\^/g, "**");
    const tokens = tokenizeMath(cleaned);
    const parser = new MathParser(tokens, x);
    const val = parser.parse();
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

export const evaluate_function = evaluateFunction;

export function solveQuadratic(
  a: number,
  b: number,
  c: number
): [number | null, number | null] {
  if (a === 0) {
    return [b !== 0 ? -c / b : null, null];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return [null, null];
  }
  const rootDisc = Math.sqrt(disc);
  const x1 = (-b + rootDisc) / (2 * a);
  const x2 = (-b - rootDisc) / (2 * a);
  return [
    Math.round(x1 * 10000) / 10000,
    Math.round(x2 * 10000) / 10000,
  ];
}

export const solve_quadratic = solveQuadratic;

export function differentiatePolynomial(
  polyTerms: Array<[number, number]>
): Array<[number, number]> {
  const derived: Array<[number, number]> = [];
  for (const [coeff, exp] of polyTerms) {
    if (exp !== 0) {
      derived.push([Math.round(coeff * exp * 10000) / 10000, exp - 1]);
    }
  }
  return derived.length > 0 ? derived : [[0.0, 0.0]];
}

export const differentiate_polynomial = differentiatePolynomial;

function formatG(n: number): string {
  return String(parseFloat(n.toPrecision(6)));
}

export function formatPolynomial(polyTerms: Array<[number, number]>): string {
  if (!polyTerms || polyTerms.length === 0) {
    return "0";
  }
  const parts: string[] = [];
  for (const [coeff, exp] of polyTerms) {
    if (coeff === 0) continue;
    const cStr = formatG(coeff);
    if (exp === 0) {
      parts.push(cStr);
    } else if (exp === 1) {
      parts.push(cStr !== "1" ? `${cStr}x` : "x");
    } else {
      parts.push(cStr !== "1" ? `${cStr}x^${formatG(exp)}` : `x^${formatG(exp)}`);
    }
  }
  return parts.length > 0 ? parts.join(" + ").replace(/\+\s+-/g, "- ") : "0";
}

export const format_polynomial = formatPolynomial;

export function matrixDet2x2(matrix: number[][]): number {
  return Math.round((matrix[0]![0]! * matrix[1]![1]! - matrix[0]![1]! * matrix[1]![0]!) * 10000) / 10000;
}

export const matrix_det2x2 = matrixDet2x2;

export function matrixAdd(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) =>
    row.map((val, j) => Math.round((val + b[i]![j]!) * 10000) / 10000)
  );
}

export const matrix_add = matrixAdd;

export function matrixMultiply(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0]!.length;
  const rowsB = b.length;
  const colsB = b[0]!.length;

  if (colsA !== rowsB) {
    throw new Error("Dimension mismatch for matrix multiplication");
  }

  const result: number[][] = Array.from({ length: rowsA }, () =>
    new Array(colsB).fill(0)
  );

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let s = 0;
      for (let k = 0; k < colsA; k++) {
        s += a[i]![k]! * b[k]![j]!;
      }
      result[i]![j] = Math.round(s * 10000) / 10000;
    }
  }

  return result;
}

export const matrix_multiply = matrixMultiply;

export function toLatexFraction(num: string, den: string): string {
  return `\\frac{${num}}{${den}}`;
}

export const to_latex_fraction = toLatexFraction;
