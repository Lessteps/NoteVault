// Money in integer cents: parse what people type, format like the classic app.

/** "12.500", "12500", "12,5k", "$ 1.200.000", "3,5M", "12500,50" -> cents (null if unreadable). */
export function parseMoney(text: string): number | null {
  let t = (text ?? "").trim().toLowerCase().replace(/\$/g, "").replace(/cop/g, "").replace(/\s/g, "");
  if (!t) return null;
  let mult = 1;
  if (t.endsWith("k")) {
    mult = 1_000;
    t = t.slice(0, -1);
  } else if (t.endsWith("m")) {
    mult = 1_000_000;
    t = t.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;
  if (mult > 1) {
    if ((t.match(/[.,]/g) ?? []).length > 1) return null;
    const v = Number(t.replace(",", "."));
    return Number.isFinite(v) ? Math.round(v * mult * 100) : null;
  }
  // Thousands use "." in Spanish; a trailing ",dd" is cents.
  let m = /^([\d.]+)(?:,(\d{1,2}))?$/.exec(t);
  if (m && (!m[1]!.includes(".") || /^\d{1,3}(\.\d{3})+$/.test(m[1]!))) {
    return Number(m[1]!.replace(/\./g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  }
  m = /^(\d+)\.(\d{1,2})$/.exec(t); // 12.5 typed English-style
  if (m) return Number(m[1]) * 100 + Number(m[2]!.padEnd(2, "0"));
  if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, "")) * 100;
  return null;
}

/** "$ 12.500" for COP (no decimals, dot thousands); "$ 12,50" otherwise. */
export function formatMoney(cents: number | null | undefined, currency = "COP", sign = false): string {
  let c = Math.trunc(cents ?? 0);
  const neg = c < 0;
  c = Math.abs(c);
  const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text = currency === "COP" ? group(Math.floor((c + 50) / 100)) : `${group(Math.floor(c / 100))},${String(c % 100).padStart(2, "0")}`;
  const prefix = neg ? "-" : sign && c ? "+" : "";
  return `${prefix}$ ${text}`;
}
