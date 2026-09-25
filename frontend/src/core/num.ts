// Numeric helpers that bridge Python/JS differences. Use these ONLY where a test
// shows the difference matters; otherwise plain Math.* is fine.

/** Python's round() is round-half-to-even; Math.round is round-half-up. */
export function roundHalfEven(value: number, digits = 0): number {
  const f = 10 ** digits;
  const x = value * f;
  const r = Math.round(x);
  // Exactly .5 → round to even.
  if (Math.abs(x - Math.trunc(x)) === 0.5) {
    const down = Math.floor(x);
    return (down % 2 === 0 ? down : down + 1) / f;
  }
  return r / f;
}

/** Python integer division a // b (floor division). */
export function intDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Python modulo: result has the sign of b (JS % has the sign of a). */
export function pyMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Python int(x): truncate toward zero; NaN-safe fallback. */
export function toInt(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : parseInt(String(x), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** "$ 12.500" for COP (no decimals, dot thousands); "$ 12,50" otherwise. */
export function formatMoney(
  cents: number | null | undefined,
  currency = "COP",
  sign = false,
): string {
  let c = Math.trunc(cents ?? 0);
  const neg = c < 0;
  c = Math.abs(c);
  const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text =
    currency === "COP"
      ? group(Math.floor((c + 50) / 100))
      : `${group(Math.floor(c / 100))},${String(c % 100).padStart(2, "0")}`;
  const prefix = neg ? "-" : sign && c ? "+" : "";
  return `${prefix}$ ${text}`;
}
export const format_money = formatMoney;
