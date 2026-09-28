// The date buckets the history list groups conversations into. Pure so the
// wording ("Hoy", "Ayer", "Semana pasada") is testable without a DOM.

export interface DatedItem {
  id: string;
  updated_at: string;
}

export interface DateGroup<T> {
  label: string;
  items: T[];
}

/** A local Date for a "YYYY-MM-DDTHH:MM:SS" stamp (no zone, as the app writes). */
export function parseLocal(stamp: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(stamp ?? "").trim());
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

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Group conversations by when they were last touched: today, yesterday, the
 * week before that, then everything older. Items keep the order they came in
 * (the store already sorts newest first) and an empty group is dropped.
 */
export function groupByDate<T extends DatedItem>(items: T[], now: Date = new Date()): DateGroup<T>[] {
  const today = startOfDay(now);
  const dayMs = 86_400_000;
  const buckets: DateGroup<T>[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Semana pasada", items: [] },
    { label: "Anteriores", items: [] },
  ];
  for (const item of items) {
    const at = parseLocal(item.updated_at);
    const day = at ? startOfDay(at) : 0;
    const diff = Math.round((today - day) / dayMs);
    if (at && diff <= 0) buckets[0]!.items.push(item);
    else if (diff === 1) buckets[1]!.items.push(item);
    else if (diff >= 2 && diff <= 7) buckets[2]!.items.push(item);
    else buckets[3]!.items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0);
}

/** Case- and accent-insensitive substring filter for the history search box. */
export function matchesQuery(title: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(title).includes(q);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A compact "when" for the history rows: the time today, "ayer 21:05", "28/09". */
export function whenLabel(stamp: string, now: Date = new Date()): string {
  const d = parseLocal(stamp);
  if (!d) return "";
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return time;
  if (diff === 1) return `ayer ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function normalize(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
