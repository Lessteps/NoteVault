// Ported from notevault_app/webapp/modules/common.py
//
// Validation helpers shared by the module APIs. Everything the UI sends is
// untrusted: values are type-checked, clamped and stripped of line breaks
// before they reach a manager, because several managers write them verbatim
// into YAML frontmatter (a newline in a name would inject new keys).

import { formatDate } from "../core/dates.js";
import { parseDate, parseDt } from "../core/taskManager.js";
import { ApiError } from "../core/errors.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function oneLine(value: unknown, maxLen = 300): string {
  let text = value === null || value === undefined ? "" : String(value);
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\r\n\t\x00-\x1f]+/g, " ").trim();
  return text.slice(0, maxLen);
}

export function optDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = parseDate(String(value).slice(0, 10));
  if (d === null) throw new ApiError(`Fecha inválida: ${value}`);
  return d;
}

export function optDatetime(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = parseDt(String(value).slice(0, 16));
  if (d === null) throw new ApiError(`Fecha y hora inválidas: ${value}`);
  return d;
}

export function optTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!TIME_RE.test(text)) throw new ApiError(`Hora inválida: ${value}`);
  return text;
}

export function clampInt(value: unknown, low: number, high: number, def: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(low, Math.min(high, Math.trunc(n)));
}

/** Serialise a date-only value the way Python `date.isoformat()` does. */
export function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatDate(value, "%Y-%m-%d");
  return String(value);
}

/** Serialise a datetime value the way Python `datetime.isoformat(timespec="minutes")` does. */
export function isoDt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatDate(value, "%Y-%m-%dT%H:%M");
  return String(value);
}

export function bodyText(value: unknown, maxBytes = 2 * 1024 * 1024): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
    throw new ApiError("El texto es demasiado largo.");
  }
  // A line that is exactly --- would end the frontmatter early on reload.
  return text
    .split("\n")
    .map((ln) => (ln.trim() === "---" ? "—" : ln))
    .join("\n");
}

// snake_case aliases (parity with the Python module names)
export const one_line = oneLine;
export const opt_date = optDate;
export const opt_datetime = optDatetime;
export const opt_time = optTime;
export const clamp_int = clampInt;
export const body_text = bodyText;
