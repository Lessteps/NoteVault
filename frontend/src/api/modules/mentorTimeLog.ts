// Mentor — registro de horas de estudio por área (ver `lib/timeLog.ts`).
//
//  - mentor_timelog_get({ id }) -> { entries }: todas las entradas del plan.
//  - mentor_timelog_add({ id, areaKey, date, minutes, kind?, note? }) -> { entries, entry }: guarda un bloque de estudio ya hecho.
//  - mentor_timelog_delete({ id, entryId }) -> { entries }: quita una entrada.
// Escribe SOLO `.notevault/mentor/timelog/<plan>.json`. Nunca notas ni el plan.

import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "../../core/errors.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import * as store from "../../core/store.js";
import { sanitizeEntry, type TimeEntry } from "../../lib/timeLog.js";
import type { AppState } from "../appState.js";

interface TimeLogFile { version: 1; entries: TimeEntry[] }

export function mentorTimeLogApi(app: AppState, now: () => string = () => new Date().toISOString()) {
  const fileOf = (planId: string): string => path.join(app.root, ".notevault", "mentor", "timelog", `${planId}.json`);
  const planIdOf = (opts: unknown): string => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    if (!new PlanStore(app.root).load(id)) throw new ApiError("Ese plan ya no existe.");
    return id;
  };
  const load = (planId: string): TimeEntry[] => {
    const raw = store.loadJson<TimeLogFile | null>(fileOf(planId), null);
    return raw && Array.isArray(raw.entries) ? raw.entries.map(sanitizeEntry).filter((e): e is TimeEntry => !!e) : [];
  };
  const save = (planId: string, entries: TimeEntry[]): void => store.writeJson(fileOf(planId), { version: 1, entries } satisfies TimeLogFile);

  return {
    mentor_timelog_get(opts: unknown) {
      return { entries: load(planIdOf(opts)) };
    },

    mentor_timelog_add(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const id = planIdOf(o);
      const entry = sanitizeEntry({ id: randomUUID().slice(0, 12), areaKey: o.areaKey, date: o.date, minutes: o.minutes, kind: o.kind, note: o.note, at: now() });
      if (!entry) throw new ApiError("El bloque no es válido: indica el área, el día y entre 1 y 720 minutos.");
      const entries = [...load(id), entry];
      save(id, entries);
      return { entries, entry };
    },

    mentor_timelog_delete(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const id = planIdOf(o);
      const entries = load(id).filter((e) => e.id !== String(o.entryId ?? ""));
      save(id, entries);
      return { entries };
    },
  };
}
