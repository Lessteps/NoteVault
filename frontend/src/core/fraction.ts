/**
 * Exact rational number representation (Fraction) and safe mathematical expression
 * evaluator for drills and practice engine without using eval().
 */

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export class Fraction {
  readonly num: bigint;
  readonly den: bigint;

  constructor(
    numerator: number | string | bigint | Fraction,
    denominator: number | string | bigint = 1n,
  ) {
    if (numerator instanceof Fraction) {
      if (denominator !== 1n && denominator !== 1) {
        const d = Fraction.from(denominator);
        const res = numerator.div(d);
        this.num = res.num;
        this.den = res.den;
        return;
      }
      this.num = numerator.num;
      this.den = numerator.den;
      return;
    }

    if (typeof numerator === "string" && denominator === 1n) {
      const s = numerator.trim();
      if (s.includes("/")) {
        const parts = s.split("/");
        if (parts.length !== 2) throw new Error(`Invalid fraction string: ${s}`);
        const n = BigInt(parts[0]!.trim());
        const d = BigInt(parts[1]!.trim());
        if (d === 0n) throw new Error("Zero division");
        const g = gcd(n, d);
        const sign = d < 0n ? -1n : 1n;
        this.num = (n / g) * sign;
        this.den = (d / g) * sign;
        return;
      } else if (s.includes(".")) {
        const [intPart, decPart] = s.split(".");
        const sign = intPart!.startsWith("-") ? -1n : 1n;
        const absInt = intPart!.replace("-", "");
        const factor = 10n ** BigInt(decPart!.length);
        const rawNum = BigInt(absInt + decPart!) * sign;
        const g = gcd(rawNum, factor);
        this.num = rawNum / g;
        this.den = factor / g;
        return;
      } else {
        const n = BigInt(s);
        this.num = n;
        this.den = 1n;
        return;
      }
    }

    let n = typeof numerator === "bigint" ? numerator : BigInt(Math.trunc(Number(numerator)));
    let d = typeof denominator === "bigint" ? denominator : BigInt(Math.trunc(Number(denominator)));

    if (d === 0n) {
      throw new Error("Zero division in Fraction");
    }

    if (d < 0n) {
      n = -n;
      d = -d;
    }

    const g = gcd(n, d);
    this.num = n / g;
    this.den = d / g;
  }

  static from(value: number | string | bigint | Fraction): Fraction {
    if (value instanceof Fraction) return value;
    return new Fraction(value);
  }

  get numerator(): number {
    return Number(this.num);
  }

  get denominator(): number {
    return Number(this.den);
  }

  add(other: Fraction | number | bigint | string): Fraction {
    const o = Fraction.from(other);
    const n = this.num * o.den + o.num * this.den;
    const d = this.den * o.den;
    return new Fraction(n, d);
  }

  sub(other: Fraction | number | bigint | string): Fraction {
    const o = Fraction.from(other);
    const n = this.num * o.den - o.num * this.den;
    const d = this.den * o.den;
    return new Fraction(n, d);
  }

  mul(other: Fraction | number | bigint | string): Fraction {
    const o = Fraction.from(other);
    const n = this.num * o.num;
    const d = this.den * o.den;
    return new Fraction(n, d);
  }

  div(other: Fraction | number | bigint | string): Fraction {
    const o = Fraction.from(other);
    if (o.num === 0n) throw new Error("Zero division in Fraction");
    const n = this.num * o.den;
    const d = this.den * o.num;
    return new Fraction(n, d);
  }

  pow(exponent: number): Fraction {
    if (!Number.isInteger(exponent)) {
      throw new Error("Fraction exponent must be an integer");
    }
    if (exponent === 0) return new Fraction(1n, 1n);
    if (exponent > 0) {
      const e = BigInt(exponent);
      return new Fraction(this.num ** e, this.den ** e);
    }
    if (this.num === 0n) throw new Error("Zero division in negative exponent");
    const e = BigInt(-exponent);
    return new Fraction(this.den ** e, this.num ** e);
  }

  neg(): Fraction {
    return new Fraction(-this.num, this.den);
  }

  abs(): Fraction {
    return this.num < 0n ? this.neg() : this;
  }

  equals(other: Fraction | number | bigint | string): boolean {
    try {
      const o = Fraction.from(other);
      return this.num === o.num && this.den === o.den;
    } catch {
      return false;
    }
  }

  compare(other: Fraction | number | bigint | string): number {
    const o = Fraction.from(other);
    const diff = this.num * o.den - o.num * this.den;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }

  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  toString(): string {
    if (this.den === 1n) return String(this.num);
    return `${this.num}/${this.den}`;
  }
}

// ── Safe Expression Evaluator ───────────────────────────────────────────────

type TokenType = "NUM" | "VAR" | "PLUS" | "MINUS" | "MUL" | "DIV" | "POW" | "LPAREN" | "RPAREN" | "EOF";

interface Token {
  type: TokenType;
  value?: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/\d/.test(ch) || (ch === "." && i + 1 < s.length && /\d/.test(s[i + 1]!))) {
      let numStr = "";
      while (i < s.length && (/[\d.]/.test(s[i]!))) {
        numStr += s[i]!;
        i++;
      }
      tokens.push({ type: "NUM", value: numStr });
      continue;
    }

    if (ch === "x" || ch === "X") {
      tokens.push({ type: "VAR", value: "x" });
      i++;
      continue;
    }

    if (ch === "+") {
      tokens.push({ type: "PLUS" });
      i++;
      continue;
    }
    if (ch === "-") {
      tokens.push({ type: "MINUS" });
      i++;
      continue;
    }
    if (ch === "*" || ch === "×" || ch === "·") {
      if (ch === "*" && i + 1 < s.length && s[i + 1] === "*") {
        tokens.push({ type: "POW" });
        i += 2;
        continue;
      }
      tokens.push({ type: "MUL" });
      i++;
      continue;
    }
    if (ch === "/" || ch === "÷") {
      tokens.push({ type: "DIV" });
      i++;
      continue;
    }
    if (ch === "^") {
      tokens.push({ type: "POW" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character in expression: ${ch}`);
  }

  // Insert implicit multiplication tokens (e.g. 6x -> 6 * x, x(x) -> x * (x), (x)(x) -> (x) * (x))
  const expanded: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const curr = tokens[k]!;
    expanded.push(curr);
    if (k + 1 < tokens.length) {
      const next = tokens[k + 1]!;
      const canEndLeft = curr.type === "NUM" || curr.type === "VAR" || curr.type === "RPAREN";
      const canStartRight = next.type === "VAR" || next.type === "LPAREN";
      if (canEndLeft && canStartRight) {
        expanded.push({ type: "MUL" });
      }
    }
  }

  expanded.push({ type: "EOF" });
  return expanded;
}

class ExprParser {
  private tokens: Token[];
  private pos = 0;
  private xVal: Fraction;

  constructor(tokens: Token[], xVal: Fraction) {
    this.tokens = tokens;
    this.xVal = xVal;
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: "EOF" };
  }

  private next(): Token {
    const t = this.peek();
    this.pos++;
    return t;
  }

  parse(): Fraction {
    const res = this.parseAddSub();
    if (this.peek().type !== "EOF") {
      throw new Error(`Unexpected token at end: ${this.peek().type}`);
    }
    return res;
  }

  // Precedence level 1: + -
  private parseAddSub(): Fraction {
    let left = this.parseMulDiv();
    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const op = this.next().type;
      const right = this.parseMulDiv();
      left = op === "PLUS" ? left.add(right) : left.sub(right);
    }
    return left;
  }

  // Precedence level 2: * /
  private parseMulDiv(): Fraction {
    let left = this.parseUnary();
    while (this.peek().type === "MUL" || this.peek().type === "DIV") {
      const op = this.next().type;
      const right = this.parseUnary();
      left = op === "MUL" ? left.mul(right) : left.div(right);
    }
    return left;
  }

  // Precedence level 3: unary + -
  private parseUnary(): Fraction {
    if (this.peek().type === "PLUS") {
      this.next();
      return this.parseUnary();
    }
    if (this.peek().type === "MINUS") {
      this.next();
      return this.parseUnary().neg();
    }
    return this.parsePow();
  }

  // Precedence level 4: ^ (right-associative)
  private parsePow(): Fraction {
    const base = this.parsePrimary();
    if (this.peek().type === "POW") {
      this.next();
      const expFrac = this.parseUnary();
      if (expFrac.den !== 1n) {
        throw new Error("Fractional exponents not supported");
      }
      const exp = expFrac.numerator;
      if (exp < 0 || exp > 12) {
        throw new Error(`Exponent out of bounds: ${exp}`);
      }
      return base.pow(exp);
    }
    return base;
  }

  // Precedence level 5: primary (numbers, variables, parens)
  private parsePrimary(): Fraction {
    const t = this.next();
    if (t.type === "NUM") {
      return Fraction.from(t.value!);
    }
    if (t.type === "VAR") {
      return this.xVal;
    }
    if (t.type === "LPAREN") {
      const val = this.parseAddSub();
      const closing = this.next();
      if (closing.type !== "RPAREN") {
        throw new Error("Missing closing parenthesis");
      }
      return val;
    }
    throw new Error(`Unexpected token in primary: ${t.type}`);
  }
}

export function evaluatePolynomial(expr: string, x: Fraction | number | string): Fraction {
  const xFrac = Fraction.from(x);
  const normalized = expr
    .trim()
    .replace(/−/g, "-")
    .replace(/×/g, "*")
    .replace(/·/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".");
  const tokens = tokenize(normalized);
  const parser = new ExprParser(tokens, xFrac);
  return parser.parse();
}
