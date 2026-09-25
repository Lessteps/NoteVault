import { describe, expect, it } from "vitest";
import { evaluatePolynomial, Fraction } from "./fraction";

describe("Fraction", () => {
  it("constructs and reduces fractions", () => {
    const f1 = new Fraction(4, 6);
    expect(f1.numerator).toBe(2);
    expect(f1.denominator).toBe(3);
    expect(f1.toString()).toBe("2/3");

    const f2 = new Fraction("-15/20");
    expect(f2.numerator).toBe(-3);
    expect(f2.denominator).toBe(4);

    const f3 = new Fraction("1.25");
    expect(f3.numerator).toBe(5);
    expect(f3.denominator).toBe(4);

    const f4 = new Fraction(5);
    expect(f4.toString()).toBe("5");
  });

  it("arithmetic operations", () => {
    const a = new Fraction(1, 2);
    const b = new Fraction(1, 3);

    expect(a.add(b).toString()).toBe("5/6");
    expect(a.sub(b).toString()).toBe("1/6");
    expect(a.mul(b).toString()).toBe("1/6");
    expect(a.div(b).toString()).toBe("3/2");
    expect(a.pow(3).toString()).toBe("1/8");
    expect(a.pow(-2).toString()).toBe("4");
    expect(a.equals(new Fraction(2, 4))).toBe(true);
  });

  it("evaluates polynomials safely with x", () => {
    // 6x^2 - 4x + 1 at x = 1/3
    // 6*(1/9) - 4*(1/3) + 1 = 2/3 - 4/3 + 1 = 1/3
    const res = evaluatePolynomial("6x^2 - 4x + 1", new Fraction(1, 3));
    expect(res.toString()).toBe("1/3");

    // Parentheses and negative numbers: (x - 2)(x + 2) at x = 3 -> (1)(5) = 5
    expect(evaluatePolynomial("(x - 2)(x + 2)", 3).toString()).toBe("5");

    // Implicit mul: 2x at x = 5 -> 10
    expect(evaluatePolynomial("2x", 5).toString()).toBe("10");

    // Power operator: x**2 at x = 4 -> 16
    expect(evaluatePolynomial("x**2", 4).toString()).toBe("16");
  });
});
