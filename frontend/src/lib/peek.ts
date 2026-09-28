// Value shapes for the Center Peek pickers. Purely presentational: every helper
// returns the very string a native control returned ("HH:MM"), or null when the
// text is not a valid time.

/** "9" -> "09", "" or "75" -> null. */
export function normalizeMinutes(text: string): string | null {
  const t = text.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n <= 59 ? String(n).padStart(2, "0") : null;
}

/** "9:5", "0905" and "9" -> "09:05" / "09:00"; anything else -> null. */
export function normalizeClock(text: string): string | null {
  const t = text.trim().replace(/[.:,\s]+/g, ":");
  let h: string;
  let m: string;
  if (/^\d{1,2}:\d{1,2}$/.test(t)) {
    const parts = t.split(":");
    h = parts[0] ?? "";
    m = parts[1] ?? "";
  } else if (/^\d{3,4}$/.test(t)) {
    h = t.slice(0, -2);
    m = t.slice(-2);
  } else if (/^\d{1,2}$/.test(t)) {
    h = t;
    m = "0";
  } else {
    return null;
  }
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isInteger(hh) || hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
