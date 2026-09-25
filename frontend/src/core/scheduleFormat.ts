/**
 * Schedule file format specification and serialization helpers.
 * Ported from notevault_app/core/schedule_format.py.
 *
 * This module defines the JSON structure and serialization rules for:
 *   - .notevault/agenda/routines.json
 *   - .notevault/agenda/events/YYYY/MM/YYYY-MM-DD.json
 *   - .notevault/agenda/settings.json
 *
 * Writing rules:
 *   - Output format: JSON.stringify(data, null, 2) + '\n'
 *   - Opaque IDs: rt_* for routines, ev_<timestamp>_<4hex> for events.
 *   - Unknown keys loaded from files are preserved on save.
 *   - Times are 24-hour "HH:MM" local time strings without timezone.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { WEEKDAY_KEYS } from "./vaultFormat";

export const DEFAULT_SETTINGS: Record<string, any> = {
  day_start_hour: 6,
  day_end_hour: 23,
  first_weekday: "lunes",
  default_duration_min: 60,
};

export function dumpJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}
export const dump_json = dumpJson;

export function loadJson<T = unknown>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
export const load_json = loadJson;

export function generateRoutineId(title = ""): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  if (slug) {
    return `rt_${slug.slice(0, 20)}_${suffix}`;
  }
  return `rt_${suffix}`;
}
export const generate_routine_id = generateRoutineId;

export function generateEventId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const randHex = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
  return `ev_${ts}_${randHex}`;
}
export const generate_event_id = generateEventId;

export function validateTime(val?: string | null): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{2}:\d{2}$/.test(s)) {
    return s;
  }
  return null;
}
export const validate_time = validateTime;

export function sanitizeRoutine(routine: Record<string, any>): Record<string, any> {
  const out = { ...routine };
  if (!out.id) out.id = generateRoutineId(out.title || "");
  if (!out.title) out.title = "Sin título";
  if (!out.kind) out.kind = "routine";

  let days = out.days;
  if (!Array.isArray(days)) {
    days = Array.from(WEEKDAY_KEYS.slice(0, 5));
  }
  out.days = days.filter((d: any) => (WEEKDAY_KEYS as readonly string[]).includes(d));

  out.start = validateTime(out.start);
  out.duration_min =
    typeof out.duration_min === "number" && !Number.isNaN(out.duration_min)
      ? out.duration_min
      : null;
  if (!out.colour) out.colour = "blue";

  const links = out.links;
  out.links = Array.isArray(links) ? links : [];

  if (out.active_from === undefined) out.active_from = null;
  if (out.active_until === undefined) out.active_until = null;
  if (out.notes === undefined) out.notes = "";
  return out;
}
export const sanitize_routine = sanitizeRoutine;

export function sanitizeEvent(event: Record<string, any>): Record<string, any> {
  const out = { ...event };
  if (!out.id) out.id = generateEventId();
  if (!out.title) out.title = "Sin título";
  if (!out.kind) out.kind = "event";
  out.start = validateTime(out.start);
  out.duration_min =
    typeof out.duration_min === "number" && !Number.isNaN(out.duration_min)
      ? out.duration_min
      : null;
  if (!out.colour) out.colour = "orange";

  const links = out.links;
  out.links = Array.isArray(links) ? links : [];
  if (out.done === undefined) out.done = false;
  if (out.notes === undefined) out.notes = "";
  return out;
}
export const sanitize_event = sanitizeEvent;

export function sanitizeDayFile(
  data: Record<string, any> | null | undefined,
  dateStr: string,
): Record<string, any> {
  const out = data && typeof data === "object" ? { ...data } : {};
  out.date = dateStr;

  const rawEvents = out.events;
  if (Array.isArray(rawEvents)) {
    out.events = rawEvents
      .filter((ev: any) => ev && typeof ev === "object")
      .map((ev: any) => sanitizeEvent(ev));
  } else {
    out.events = [];
  }

  const rawOverrides = out.overrides;
  if (rawOverrides && typeof rawOverrides === "object") {
    out.overrides = rawOverrides;
  } else {
    out.overrides = {};
  }

  return out;
}
export const sanitize_day_file = sanitizeDayFile;

export function sanitizeSettings(
  data: Record<string, any> | null | undefined,
): Record<string, any> {
  const out = { ...DEFAULT_SETTINGS };
  if (data && typeof data === "object") {
    Object.assign(out, data);
  }
  return out;
}
export const sanitize_settings = sanitizeSettings;

export interface OccurrenceOptions {
  id: string;
  title: string;
  kind: string;
  date: Date;
  start?: string | null;
  duration_min?: number | null;
  colour?: string;
  links?: Record<string, any>[];
  done?: boolean;
  source?: string;
  editable?: boolean;
  reminder_min?: number | null;
}

export class Occurrence {
  id: string;
  title: string;
  kind: string; // routine | event | habit | exercise | task | project | goal_item | saving
  date: Date;
  start: string | null; // "HH:MM", null = all day
  duration_min: number | null;
  colour: string;
  links: Record<string, any>[];
  done: boolean;
  source: string;
  editable: boolean;
  reminder_min: number | null;

  constructor(
    idOrOpts: string | OccurrenceOptions,
    title = "",
    kind = "",
    date: Date = new Date(),
    start: string | null = null,
    duration_min: number | null = null,
    colour = "blue",
    links: Record<string, any>[] = [],
    done = false,
    source = "",
    editable = true,
    reminder_min: number | null = null,
  ) {
    if (typeof idOrOpts === "object" && idOrOpts !== null) {
      this.id = idOrOpts.id;
      this.title = idOrOpts.title;
      this.kind = idOrOpts.kind;
      this.date = idOrOpts.date;
      this.start = idOrOpts.start ?? null;
      this.duration_min = idOrOpts.duration_min ?? null;
      this.colour = idOrOpts.colour ?? "blue";
      this.links = idOrOpts.links ?? [];
      this.done = Boolean(idOrOpts.done);
      this.source = idOrOpts.source ?? "";
      this.editable = idOrOpts.editable ?? true;
      this.reminder_min = idOrOpts.reminder_min ?? null;
    } else {
      this.id = idOrOpts;
      this.title = title;
      this.kind = kind;
      this.date = date;
      this.start = start;
      this.duration_min = duration_min;
      this.colour = colour;
      this.links = links;
      this.done = done;
      this.source = source;
      this.editable = editable;
      this.reminder_min = reminder_min;
    }
  }
}

