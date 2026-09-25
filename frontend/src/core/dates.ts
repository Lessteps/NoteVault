// Date/time helpers. All LOCAL time, ISO strings — never new Date().toISOString()
// for dates (that is UTC and drifts a day). Mirrors the Python date/datetime use.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** date.today().isoformat() → "YYYY-MM-DD" (local). */
export function todayIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** datetime.now().isoformat(timespec="seconds") → "YYYY-MM-DDTHH:MM:SS" (local). */
export function nowLocalIso(d: Date = new Date()): string {
  return `${todayIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** date.fromisoformat("YYYY-MM-DD") → local Date at midnight, or null. Accepts Date or string. */
export function parseIsoDate(s: unknown): Date | null {
  if (s instanceof Date) {
    return Number.isNaN(s.getTime())
      ? null
      : new Date(s.getFullYear(), s.getMonth(), s.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** datetime.fromisoformat("YYYY-MM-DDTHH:MM") → local Date, or null. Accepts Date or string. */
export function parseIsoDatetime(s: unknown): Date | null {
  if (s instanceof Date) {
    return Number.isNaN(s.getTime()) ? null : new Date(s.getTime());
  }
  const str = String(s ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] ? Number(m[4]) : 0,
    m[5] ? Number(m[5]) : 0,
    m[6] ? Number(m[6]) : 0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Python date.weekday(): Monday=0 … Sunday=6 (JS getDay is Sunday=0). */
export function weekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Minimal strftime for the tokens the Python core uses. */
export function formatDate(d: Date, fmt: string): string {
  const map: Record<string, string> = {
    "%Y": String(d.getFullYear()),
    "%m": pad(d.getMonth() + 1),
    "%d": pad(d.getDate()),
    "%H": pad(d.getHours()),
    "%M": pad(d.getMinutes()),
    "%S": pad(d.getSeconds()),
  };
  return fmt.replace(/%[YmdHMS]/g, (t) => map[t] ?? t);
}
