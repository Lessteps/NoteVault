// Ported from notevault_app/webapp/modules/calendar.py
// Calendario: the bridge over core/scheduleManager (ScheduleManager).

import { ApiError } from "../../core/errors.js";
import { Recurrence } from "../../core/recurrence.js";
import {
  HABIT_PREFIX,
  Occurrence,
  type ScheduleManager,
} from "../../core/scheduleManager.js";
import { STATUS_DONE, STATUS_TODO } from "../../core/taskManager.js";
import { WEEKDAY_KEYS } from "../../core/vaultFormat.js";
import type { AppState } from "../appState.js";
import {
  clampInt,
  isoDate,
  oneLine,
  optDate,
  optTime,
} from "../common.js";
import { tasksApi } from "./tasks.js";

export const MAX_RANGE_DAYS = 62;
const _HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_COLOUR = "#039be5";
const _NAMED: Record<string, string> = {
  blue: "#039be5",
  orange: "#f4511e",
  purple: "#8e24aa",
  teal: "#33b679",
  green: "#33b679",
  red: "#d50000",
  yellow: "#f6bf26",
};
export const MODULE_SOURCES = ["metas", "proyectos", "finanzas"] as const;

export function colourHex(value: string | null | undefined): string {
  if (value && _HEX_RE.test(value)) {
    return value.toLowerCase();
  }
  return _NAMED[value || ""] || DEFAULT_COLOUR;
}

function checkable(o: Occurrence): boolean {
  if (
    o.source === "routine" ||
    o.source === "event" ||
    o.source === "task" ||
    (MODULE_SOURCES as readonly string[]).includes(o.source)
  ) {
    return true;
  }
  return o.id.startsWith(HABIT_PREFIX);
}

export function occDict(o: Occurrence): Record<string, unknown> {
  return {
    id: o.id,
    title: o.title,
    kind: o.kind,
    date: isoDate(o.date),
    start: o.start,
    duration_min: o.duration_min,
    colour: colourHex(o.colour),
    done: Boolean(o.done),
    source: o.source,
    editable: Boolean(o.editable),
    checkable: checkable(o),
    links: o.links,
    reminder_min: o.reminder_min,
  };
}

function minutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":");
  return parseInt(h!, 10) * 60 + parseInt(m!, 10);
}

function intOrNull(v: unknown): number | null {
  return typeof v === "number" && !isNaN(v) ? Math.trunc(v) : null;
}

export function calendarApi(app: AppState) {
  function sched(): ScheduleManager {
    return app.mgrs().schedule;
  }

  function needDate(value: unknown): Date {
    const d = optDate(value);
    if (!d) {
      throw new ApiError("Fecha inválida.");
    }
    return d;
  }

  function findEvent(d: Date, eventId: string): Record<string, any> | null {
    const dayFile = sched().getDayFile(d);
    const events: Record<string, any>[] = dayFile.events || [];
    for (const ev of events) {
      if (ev.id === eventId) {
        return { ...ev };
      }
    }
    return null;
  }

  function payloadFields(p: unknown): Record<string, any> {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      throw new ApiError("Datos inválidos.");
    }
    const raw = p as Record<string, any>;
    const kind = raw.kind;
    if (kind !== "event" && kind !== "task") {
      throw new ApiError("Tipo inválido.");
    }
    const orig = raw.orig || {};
    if (!orig || typeof orig !== "object" || Array.isArray(orig)) {
      throw new ApiError("Datos inválidos.");
    }
    const start = optTime(raw.start);
    let duration = raw.duration;
    duration =
      duration === null || duration === undefined || duration === "" || start === null
        ? null
        : clampInt(duration, 5, 24 * 60, 60);

    let reminder = raw.reminder_min;
    reminder =
      reminder === null || reminder === undefined || reminder === "" || start === null
        ? null
        : clampInt(reminder, 0, 7 * 24 * 60, 0);

    const colour = raw.colour || DEFAULT_COLOUR;
    if (!_HEX_RE.test(String(colour))) {
      throw new ApiError("Color inválido.");
    }
    const rule = Recurrence.parse(oneLine(raw.repeat, 60));

    return {
      mode: raw.mode === "edit" ? "edit" : "create",
      kind,
      orig: {
        kind: orig.kind,
        id: oneLine(orig.id, 120),
        date: optDate(orig.date),
      },
      title: oneLine(raw.title, 200) || "(Sin título)",
      date: needDate(raw.date),
      start,
      duration,
      repeat: rule.toString(),
      until: rule.repeats ? optDate(raw.until) : null,
      days: rule.weekdaysMask().map((i) => WEEKDAY_KEYS[i]),
      location: oneLine(raw.location, 300),
      description: String(raw.description || "").slice(0, 20000),
      subject: oneLine(raw.subject, 120),
      reminder_min: reminder,
      colour: String(colour).toLowerCase(),
    };
  }

  function saveTask(p: Record<string, any>): void {
    const tm = sched().taskMgr;
    let reminder: Date | null = null;
    const startMins = minutes(p.start);
    if (startMins !== null && p.reminder_min !== null && p.reminder_min !== undefined) {
      const base = new Date(
        p.date.getFullYear(),
        p.date.getMonth(),
        p.date.getDate(),
        Math.floor(startMins / 60),
        startMins % 60,
      );
      reminder = new Date(base.getTime() - p.reminder_min * 60000);
    }
    const body = String(p.description || "")
      .split("\n")
      .map((ln) => (ln.trim() === "---" ? "—" : ln))
      .join("\n");

    const fields: Record<string, any> = {
      due: p.date,
      due_time: p.start,
      body,
      subject: p.subject,
      reminder,
      reminder_done: false,
      repeat: p.repeat,
      repeat_until: p.repeat ? p.until : null,
    };

    if (p.mode === "edit") {
      const task = tm.get(p.orig.id);
      if (!task) {
        throw new ApiError("Esa tarea ya no existe.");
      }
      const sameStartDue =
        task.start && task.due && isoDate(task.start) === isoDate(task.due);
      if (sameStartDue || (!task.start && !task.due)) {
        fields.start = p.date;
      }
      tm.update(task.id, { name: p.title, ...fields });
    } else {
      tm.create(p.title, { start: p.date, ...fields });
    }
  }

  return {
    cal_range(first: string, last: string) {
      const a = needDate(first);
      const b = needDate(last);
      const diffDays = Math.round((b.getTime() - a.getTime()) / 86400000);
      if (b.getTime() < a.getTime() || diffDays > MAX_RANGE_DAYS) {
        throw new ApiError("Rango de fechas inválido.");
      }
      const found = sched().range(a, b);
      const out: Record<string, unknown[]> = {};
      for (const [dateStr, occs] of Object.entries(found)) {
        out[dateStr] = occs.map(occDict);
      }
      return out;
    },

    cal_settings() {
      return sched().settings();
    },

    cal_item(day: string, occurrence_id: string, kind: string) {
      const d = needDate(day);
      const sm = sched();
      const oid = String(occurrence_id);

      if (kind === "event") {
        const ev = findEvent(d, oid);
        if (!ev) {
          throw new ApiError("Ese evento ya no existe.");
        }
        return {
          kind: "event",
          id: oid,
          date: isoDate(d),
          title: ev.title || "",
          start: ev.start || null,
          duration: ev.duration_min || null,
          location: ev.location || "",
          description: ev.notes || "",
          reminder_min: intOrNull(ev.reminder_min),
          colour: colourHex(ev.colour),
          repeat: "",
          until: null,
          subject: "",
        };
      }

      if (kind === "routine") {
        const rt = sm.routines().find((r) => r.id === oid);
        if (!rt) {
          throw new ApiError("Esa rutina ya no existe.");
        }
        let rule = Recurrence.parse(rt.repeat);
        if (!rule.repeats) {
          const days = (Array.isArray(rt.days) ? rt.days : [])
            .map((k: string) => WEEKDAY_KEYS.indexOf(k as any))
            .filter((idx: number) => idx >= 0);
          rule = Recurrence.fromWeekdays(days);
        }
        const until = optDate(rt.active_until);
        return {
          kind: "routine",
          id: oid,
          date: isoDate(d),
          title: rt.title || "",
          start: rt.start || null,
          duration: rt.duration_min || null,
          location: rt.location || "",
          description: rt.notes || "",
          reminder_min: intOrNull(rt.reminder_min),
          colour: colourHex(rt.colour),
          repeat: rule.toString(),
          until: until ? isoDate(until) : null,
          subject: "",
        };
      }

      if (kind === "task") {
        const tid = oid.startsWith("task_") ? oid.slice("task_".length) : oid;
        const task = sm.taskMgr.get(tid);
        if (!task) {
          throw new ApiError("Esa tarea ya no existe.");
        }
        const clock =
          task.due && isoDate(task.due) === isoDate(d) ? task.due_time : task.start_time;
        let reminder: number | null = null;
        const startMins = minutes(clock);
        if (task.reminder && startMins !== null && !task.reminder_done) {
          const begins = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            Math.floor(startMins / 60),
            startMins % 60,
          );
          reminder = Math.max(0, Math.floor((begins.getTime() - task.reminder.getTime()) / 60000));
        }
        return {
          kind: "task",
          id: tid,
          date: isoDate(task.due || d),
          title: task.name,
          start: clock,
          duration: null,
          location: "",
          description: task.body,
          reminder_min: reminder,
          colour: null,
          repeat: task.repeat,
          until: task.repeat_until ? isoDate(task.repeat_until) : null,
          subject: task.subject,
        };
      }

      throw new ApiError("Este bloque se edita desde su propio módulo.");
    },

    cal_save(payload: Record<string, unknown>) {
      const p = payloadFields(payload);
      const sm = sched();
      const orig = p.orig;
      const origKind = orig.kind;

      if (p.mode === "edit" && !orig.date) {
        throw new ApiError("Falta la fecha original.");
      }

      if (p.kind === "task") {
        saveTask(p);
        return { ok: true, message: "Tarea guardada" };
      }

      const fields: Record<string, any> = {
        title: p.title,
        start: p.start,
        duration_min: p.duration,
        colour: p.colour,
        notes: p.description,
        location: p.location,
        reminder_min: p.reminder_min,
      };

      if (!p.repeat) {
        if (origKind === "routine") {
          sm.removeRoutine(orig.id);
          sm.addEvent(p.date, fields);
        } else if (origKind === "event") {
          if (isoDate(p.date) !== isoDate(orig.date)) {
            const event = findEvent(orig.date, orig.id) || {};
            sm.removeEvent(orig.date, orig.id);
            Object.assign(event, fields);
            sm.addEvent(p.date, event);
          } else {
            sm.updateEvent(orig.date, orig.id, fields);
          }
        } else {
          sm.addEvent(p.date, fields);
        }
        return { ok: true, message: "Evento guardado" };
      }

      const routine: Record<string, any> = {
        ...fields,
        days: p.days,
        repeat: p.repeat,
        active_until: p.until ? isoDate(p.until) : null,
      };

      if (origKind === "routine") {
        sm.updateRoutine(orig.id, routine);
      } else {
        if (origKind === "event") {
          sm.removeEvent(orig.date, orig.id);
        }
        sm.addRoutine({ active_from: isoDate(p.date), ...routine });
      }
      return { ok: true, message: "Evento periódico guardado en tus rutinas" };
    },

    cal_delete(orig: Record<string, unknown>, scope = "all") {
      if (!orig || typeof orig !== "object" || Array.isArray(orig)) {
        throw new ApiError("Datos inválidos.");
      }
      const kind = orig.kind;
      const oid = oneLine(orig.id, 120);
      const sm = sched();

      if (kind === "event") {
        sm.removeEvent(needDate(orig.date), oid);
      } else if (kind === "routine") {
        if (scope === "one") {
          sm.skip(needDate(orig.date), oid);
        } else {
          sm.removeRoutine(oid);
        }
      } else if (kind === "task") {
        tasksApi(app).tasks_delete(oid);
      } else {
        throw new ApiError("Este bloque se borra desde su propio módulo.");
      }
      return { ok: true };
    },

    cal_move(occ: Record<string, unknown>, day: string, start: string, duration: number) {
      if (!occ || typeof occ !== "object" || Array.isArray(occ)) {
        throw new ApiError("Datos inválidos.");
      }
      const sm = sched();
      const kind = occ.kind;
      const oid = oneLine(occ.id, 160);
      const old = needDate(occ.date);
      const nextDate = needDate(day);
      const startT = optTime(start);
      if (!startT) {
        throw new ApiError("Hora inválida.");
      }
      const dur = clampInt(duration, 5, 24 * 60, 60);

      if (kind === "event") {
        if (isoDate(nextDate) !== isoDate(old)) {
          const event = findEvent(old, oid);
          if (!event) {
            throw new ApiError("Ese evento ya no existe.");
          }
          sm.removeEvent(old, oid);
          event.start = startT;
          event.duration_min = dur;
          sm.addEvent(nextDate, event);
        } else {
          sm.updateEvent(old, oid, { start: startT, duration_min: dur });
        }
      } else if (kind === "routine") {
        sm.move(old, oid, startT, dur);
      } else if (kind === "task") {
        const tid = oid.startsWith("task_") ? oid.slice("task_".length) : oid;
        const task = sm.taskMgr.get(tid);
        if (!task) {
          throw new ApiError("Esa tarea ya no existe.");
        }
        const fields: Record<string, any> = {};
        if (task.due && isoDate(task.due) === isoDate(old)) {
          fields.due = nextDate;
          fields.due_time = startT;
          if (task.start && isoDate(task.start) === isoDate(task.due)) {
            fields.start = nextDate;
          }
        } else {
          fields.start = nextDate;
          fields.start_time = startT;
        }
        sm.taskMgr.update(tid, fields);
      } else {
        throw new ApiError("Este bloque no se puede mover desde el calendario.");
      }
      return { ok: true };
    },

    cal_set_done(day: string, occurrence_id: string, done: boolean) {
      const d = needDate(day);
      const oid = oneLine(occurrence_id, 160);
      const sm = sched();
      if (oid.startsWith("task_")) {
        sm.taskMgr.update(oid.slice("task_".length), {
          status: done ? STATUS_DONE : STATUS_TODO,
        });
      } else {
        sm.setDone(d, oid, Boolean(done));
      }
      return { ok: true };
    },

    cal_routines() {
      const out: Array<Record<string, unknown>> = [];
      for (const r of sched().routines()) {
        let rule = Recurrence.parse(r.repeat);
        if (!rule.repeats) {
          const days = (Array.isArray(r.days) ? r.days : [])
            .map((k: string) => WEEKDAY_KEYS.indexOf(k as any))
            .filter((idx: number) => idx >= 0);
          rule = Recurrence.fromWeekdays(days);
        }
        out.push({
          id: r.id,
          title: r.title || "",
          start: r.start || null,
          duration_min: r.duration_min || null,
          colour: colourHex(r.colour),
          repeat: rule.toString(),
          describe: rule.describe(),
          active_from: r.active_from || null,
          active_until: r.active_until || null,
          notes: r.notes || "",
          reminder_min: intOrNull(r.reminder_min),
          links: r.links || [],
        });
      }
      return out;
    },

    cal_routine_save(routine_id: string | null | undefined, fields: Record<string, unknown>) {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new ApiError("Datos inválidos.");
      }
      const rule = Recurrence.parse(oneLine(fields.repeat, 60));
      if (!rule.repeats) {
        throw new ApiError("Una rutina tiene que repetirse.");
      }
      const colour = String(fields.colour || DEFAULT_COLOUR);
      if (!_HEX_RE.test(colour)) {
        throw new ApiError("Color inválido.");
      }
      const start = optTime(fields.start);
      const dur = fields.duration_min;
      const a = optDate(fields.active_from);
      const b = optDate(fields.active_until);
      const rem = fields.reminder_min;
      const clean: Record<string, any> = {
        title: oneLine(fields.title, 200) || "Rutina",
        repeat: rule.toString(),
        days: rule.weekdaysMask().map((i) => WEEKDAY_KEYS[i]),
        start,
        duration_min:
          dur === null || dur === undefined || dur === ""
            ? null
            : clampInt(dur, 5, 24 * 60, 60),
        colour: colour.toLowerCase(),
        active_from: a ? isoDate(a) : null,
        active_until: b ? isoDate(b) : null,
        notes: String(fields.notes || "").slice(0, 5000),
        reminder_min:
          rem === null || rem === undefined || rem === "" || start === null
            ? null
            : clampInt(rem, 0, 7 * 24 * 60, 0),
      };

      const sm = sched();
      if (routine_id) {
        if (sm.updateRoutine(String(routine_id), clean) === null) {
          throw new ApiError("Esa rutina ya no existe.");
        }
      } else {
        sm.addRoutine(clean);
      }
      return { ok: true };
    },

    cal_routine_remove(routine_id: string) {
      if (!sched().removeRoutine(String(routine_id))) {
        throw new ApiError("Esa rutina ya no existe.");
      }
      return { ok: true };
    },
  };
}
