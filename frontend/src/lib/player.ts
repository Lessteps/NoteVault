// Subtitle timing for the English player (same rules as core/english/subtitles.py).

export interface Pair { start: number; end: number; en: string; es: string }

export const SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];

/** Index of the last pair that started at or before `ms`, or -1. */
export function cueBefore(pairs: Pair[], ms: number): number {
  let lo = 0;
  let hi = pairs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid]!.start <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Index of the pair on screen at `ms`, or -1 between pairs. */
export function cueAt(pairs: Pair[], ms: number): number {
  const i = cueBefore(pairs, ms);
  return i >= 0 && ms < pairs[i]!.end ? i : -1;
}

/** «Previous sentence»: restart the current one, or go back one when it just began. */
export function previousTarget(pairs: Pair[], ms: number): number {
  const i = cueBefore(pairs, ms);
  if (i < 0) return 0;
  return ms - pairs[i]!.start < 1500 ? Math.max(0, i - 1) : i;
}

export function nextTarget(pairs: Pair[], ms: number): number {
  return Math.min(pairs.length - 1, cueBefore(pairs, ms) + 1);
}

/** The duration of a media element in ms, whatever the browser reports (0 while unknown, never NaN or Infinity). */
export function durationMs(el: { duration: number; seekable?: { length: number; end(i: number): number } }): number {
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration * 1000;
  const s = el.seekable;
  if (s && s.length > 0 && Number.isFinite(s.end(s.length - 1))) return s.end(s.length - 1) * 1000;
  return 0;
}

export function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}

/** `nv://media?file=…&t=…` → [file, seconds], or null. */
export function parseMediaUrl(url: string): [string, number] | null {
  const m = /^nv:\/\/media\/?\?(.*)$/i.exec(url.trim());
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const file = (q.get("file") ?? "").trim();
  if (!file) return null;
  const raw = (q.get("t") ?? "0").trim().toLowerCase().replace(/s$/, "");
  let secs = Number(raw);
  if (!Number.isFinite(secs)) secs = raw.split(":").reduce((a, p) => a * 60 + (Number(p) || 0), 0);
  return [file, Math.max(0, secs)];
}
