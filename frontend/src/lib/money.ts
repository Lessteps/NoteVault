// Money in integer cents: parse what people type, format like the classic app.

/** "12.50", "1,250.50", "1250", "12,5k", "$ 1,200.00", "3.5M", "12500,50" -> cents (null if unreadable). */
export function parseMoney(text: string): number | null {
  let t = (text ?? "").trim().toLowerCase().replace(/\$/g, "").replace(/usd/g, "").replace(/cop/g, "").replace(/\s/g, "");
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

  // Standard US: thousands commas, decimal dot ("1,250.50", "1,250")
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) {
    const [whole, centsPart] = t.split(".");
    const dollars = Number(whole!.replace(/,/g, ""));
    const cents = Number((centsPart ?? "0").padEnd(2, "0"));
    return dollars * 100 + cents;
  }

  // Pure number with decimal dot: "12.50", "12.5", "0.99"
  if (/^\d+\.\d{1,2}$/.test(t)) {
    const [whole, centsPart] = t.split(".");
    return Number(whole) * 100 + Number(centsPart!.padEnd(2, "0"));
  }

  // Comma as decimal separator: "12,50", "12,5", "1250,50"
  if (/^\d+,\d{1,2}$/.test(t)) {
    const [whole, centsPart] = t.split(",");
    return Number(whole) * 100 + Number(centsPart!.padEnd(2, "0"));
  }

  // European/Spanish dot thousands with comma decimal: "1.250,50", "1.250"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
    const [whole, centsPart] = t.split(",");
    const dollars = Number(whole!.replace(/\./g, ""));
    const cents = Number((centsPart ?? "0").padEnd(2, "0"));
    return dollars * 100 + cents;
  }

  // Plain integer dollars: "12", "1250"
  if (/^\d+$/.test(t)) {
    return Number(t) * 100;
  }

  return null;
}

/** "$ 1,250.00" / "$ 12.50" for USD; "$ 12.500" for COP (no decimals, dot thousands). */
export function formatMoney(
  cents: number | null | undefined,
  currencyOrSign?: string | boolean,
  sign = false,
): string {
  const curr = typeof currencyOrSign === "string" ? currencyOrSign : "USD";
  const withSign = typeof currencyOrSign === "boolean" ? currencyOrSign : sign;
  let c = Math.trunc(cents ?? 0);
  const neg = c < 0;
  c = Math.abs(c);
  const prefix = neg ? "-" : withSign && c ? "+" : "";
  if (curr === "COP") {
    const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${prefix}$ ${group(Math.floor((c + 50) / 100))}`;
  }
  const dollars = Math.floor(c / 100);
  const centsPart = c % 100;
  const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${prefix}$ ${group(dollars)}.${String(centsPart).padStart(2, "0")}`;
}
