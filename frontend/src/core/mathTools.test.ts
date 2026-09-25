import { describe, expect, it } from "vitest";
import {
  differentiatePolynomial,
  evaluateFunction,
  formatPolynomial,
  matrixDet2x2,
  matrixMultiply,
  solveQuadratic,
} from "./mathTools.js";

describe("mathTools", () => {
  it("evaluates functions safely", () => {
    const val = evaluateFunction("x**2 + 2*x + 1", 3.0);
    expect(val).toBe(16.0);

    const sinVal = evaluateFunction("sin(pi/2)", 0.0);
    expect(sinVal).toBeCloseTo(1.0, 5);
  });

  it("solves quadratic equations", () => {
    // x^2 - 5x + 6 = 0 -> roots 3, 2
    const [r1, r2] = solveQuadratic(1, -5, 6);
    expect([r1, r2].sort()).toEqual([2.0, 3.0]);

    // No real roots
    const [r3, r4] = solveQuadratic(1, 0, 1);
    expect(r3).toBeNull();
    expect(r4).toBeNull();
  });

  it("differentiates and formats polynomials", () => {
    // f(x) = 3x^3 + 2x^2 + 5x + 7
    const terms: [number, number][] = [
      [3.0, 3.0],
      [2.0, 2.0],
      [5.0, 1.0],
      [7.0, 0.0],
    ];
    const derived = differentiatePolynomial(terms);
    // f'(x) = 9x^2 + 4x + 5
    const formatted = formatPolynomial(derived);
    expect(formatted).toBe("9x^2 + 4x + 5");
  });

  it("calculates matrix operations", () => {
    // 2x2 determinant
    const m = [
      [3.0, 8.0],
      [4.0, 6.0],
    ];
    // 3*6 - 8*4 = 18 - 32 = -14
    expect(matrixDet2x2(m)).toBe(-14.0);

    // 2x2 multiplication
    const a = [
      [1.0, 2.0],
      [3.0, 4.0],
    ];
    const b = [
      [2.0, 0.0],
      [1.0, 2.0],
    ];
    // a x b = [[4, 4], [10, 8]]
    const prod = matrixMultiply(a, b);
    expect(prod).toEqual([
      [4.0, 4.0],
      [10.0, 8.0],
    ]);
  });
});
