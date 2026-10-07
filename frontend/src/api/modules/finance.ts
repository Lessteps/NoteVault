import { todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import {
  FinanceManager,
  GASTO,
  INGRESO,
  TYPE_COLOURS,
  TYPE_LABELS,
} from "../../core/financeManager.js";
import { Recurrence } from "../../core/recurrence.js";
import { newId } from "../../core/store.js";
import {
  DEFAULT_CURRENCY,
  FINANCE_GOAL_STATUSES,
  MOVEMENT_TYPES,
} from "../../core/vaultFormat.js";
import type { AppState } from "../appState.js";
import { clampInt, oneLine, optDate, optTime } from "../common.js";
import { checkRef } from "./files.js";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const MAX_CENTS = 10 ** 15;
export const MAX_RANGE_DAYS = 400;

function cents(value: unknown, allowZero = false): number {
  if (
    typeof value === "boolean" ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    throw new ApiError("Importe inválido.");
  }
  let v: number;
  try {
    const s = String(value).trim();
    if (!/^-?\d+$/.test(s)) {
      throw new ApiError("Importe inválido.");
    }
    v = parseInt(s, 10);
  } catch {
    throw new ApiError("Importe inválido.");
  }
  if (!Number.isFinite(v) || v < 0 || v > MAX_CENTS || (v === 0 && !allowZero)) {
    throw new ApiError("Importe inválido.");
  }
  return v;
}

function pairs(
  items: Array<[Date, Record<string, any>]>
): Array<Record<string, unknown>> {
  return items.map(([d, m]) => ({ ...m, date: todayIso(d) }));
}

export function financeApi(app: AppState) {
  const getFm = (): FinanceManager => {
    const fm = app.mgrs().finances;
    fm.ensureDefaults();
    return fm;
  };

  function finDate(value: unknown): Date {
    const d = optDate(value);
    if (!d) {
      throw new ApiError("Fecha inválida.");
    }
    return d;
  }

  function finMovementFields(fields: unknown): Record<string, any> {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new ApiError("Datos del movimiento inválidos.");
    }
    const f = fields as Record<string, any>;
    const fm = getFm();
    const kind = f.type ?? GASTO;
    if (!(MOVEMENT_TYPES as readonly string[]).includes(kind)) {
      throw new ApiError("Tipo inválido.");
    }
    const out: Record<string, any> = {
      type: kind,
      amount_cents: cents(f.amount_cents),
      what: oneLine(f.what, 200),
      reason: oneLine(f.reason, 400),
      time: optTime(f.time) || "",
      category: "",
      goal: "",
    };
    if (kind === GASTO || kind === INGRESO) {
      const cat = String(f.category || "");
      if (cat && !(cat in fm.categoryMap())) {
        throw new ApiError("Esa categoría no existe.");
      }
      out.category = cat;
    } else {
      const goal = String(f.goal || "");
      if (goal && fm.getGoal(goal) === null) {
        throw new ApiError("Esa meta de ahorro no existe.");
      }
      out.goal = goal;
    }
    const refs = f.attachments || [];
    if (!Array.isArray(refs)) {
      throw new ApiError("Adjuntos inválidos.");
    }
    out.attachments = refs.map((r: unknown) => checkRef(String(r))).slice(0, 30);
    return out;
  }

  function finGoalFields(fields: unknown): Record<string, any> {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new ApiError("Datos de la meta inválidos.");
    }
    const f = fields as Record<string, any>;
    const out: Record<string, any> = {};

    if ("name" in f) {
      out.name = oneLine(f.name, 120) || "Meta de ahorro";
    }
    if ("icon" in f) {
      out.icon = oneLine(f.icon, 8) || "💰";
    }
    if ("target_cents" in f) {
      out.target_cents = cents(f.target_cents);
    }
    if ("suggested_cents" in f) {
      out.suggested_cents = cents(f.suggested_cents || 0, true);
    }
    for (const k of ["start", "deadline"]) {
      if (k in f) {
        const d = optDate(f[k]);
        out[k] = d ? todayIso(d) : "";
      }
    }
    if ("colour" in f) {
      const c = String(f.colour || "");
      if (!HEX_RE.test(c)) {
        throw new ApiError("Color inválido.");
      }
      out.colour = c;
    }
    if ("show_in_daily" in f) {
      out.show_in_daily = Boolean(f.show_in_daily);
    }
    if ("cadence" in f) {
      const c =
        f.cadence && typeof f.cadence === "object" && !Array.isArray(f.cadence)
          ? f.cadence
          : {};
      if (c.mode === "period") {
        if (c.period !== "week" && c.period !== "month") {
          throw new ApiError("Periodo inválido.");
        }
        out.cadence = { mode: "period", period: c.period };
      } else {
        const rule = Recurrence.parse(oneLine(c.rule, 60)).toString();
        out.cadence = { mode: "rule", rule: rule || "daily" };
      }
    }
    if ("status" in f) {
      if (!(FINANCE_GOAL_STATUSES as readonly string[]).includes(f.status)) {
        throw new ApiError("Estado inválido.");
      }
      out.status = f.status;
    }
    if ("notes" in f) {
      out.notes = String(f.notes || "").slice(0, 20000);
    }
    return out;
  }

  return {
    fin_meta() {
      const fm = getFm();
      return {
        types: [...MOVEMENT_TYPES],
        type_labels: TYPE_LABELS,
        type_colours: TYPE_COLOURS,
        goal_statuses: [...FINANCE_GOAL_STATUSES],
        currency: DEFAULT_CURRENCY,
        categories: fm.categories(null, true),
        goals: fm.goals(),
      };
    },

    fin_sidebar() {
      const fm = getFm();
      const today = new Date();
      const [thisMonth] = fm.compareMonth(
        today.getFullYear(),
        today.getMonth() + 1
      );
      const goals = fm.goals(true).map((g) => ({
        id: g.id,
        icon: g.icon,
        name: g.name,
        saved: fm.saved(g.id),
      }));
      const general = fm.generalSavings();
      const dueChecks = fm.dueChecks(today);
      const pending = dueChecks.filter(([, checked]) => !checked).length;
      return {
        pending,
        month: thisMonth,
        general,
        goals,
        total_saved: general + goals.reduce((acc, g) => acc + g.saved, 0),
      };
    },

    fin_range(first: string, last: string) {
      const a = finDate(first);
      const b = finDate(last);
      const diffDays = Math.round(
        (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (b < a || diffDays > MAX_RANGE_DAYS) {
        throw new ApiError("Rango de fechas inválido.");
      }
      return pairs(getFm().range(a, b));
    },

    fin_month_extras(year: number, month: number) {
      const today = new Date();
      const y = clampInt(year, 1970, 3000, today.getFullYear());
      const m = clampInt(month, 1, 12, 1);
      const fm = getFm();
      const [thisMonth, prevMonth] = fm.compareMonth(y, m);
      return {
        budgets: fm.budgetUsed(y, m).map(([c, used, budget]) => ({
          category: c,
          used,
          budget,
        })),
        this: thisMonth,
        prev: prevMonth,
      };
    },

    fin_due_checks(day: string) {
      const fm = getFm();
      const d = finDate(day);
      const out: Array<Record<string, unknown>> = [];
      for (const [goal, checked, ids] of fm.dueChecks(d)) {
        let first: Date;
        let last: Date;
        if (goal.cadence?.mode === "period") {
          const p = (fm as any)._period(goal, d) as [Date, Date];
          first = p[0];
          last = p[1];
        } else {
          first = d;
          last = d;
        }
        out.push({
          goal,
          checked,
          ids,
          pace: fm.pace(goal.id),
          first: todayIso(first),
          last: todayIso(last),
        });
      }
      return out;
    },

    fin_add(day: string, fields: unknown) {
      const d = finDate(day);
      const f = finMovementFields(fields);
      const mid = String((fields as any)?.id || "");
      if (mid && !/^mv\d{8}-[0-9a-f]{6}$/.test(mid)) {
        throw new ApiError("Id inválido.");
      }
      const kind = f.type;
      delete f.type;
      const amountCents = f.amount_cents;
      delete f.amount_cents;
      if (mid) {
        f.id = mid;
      }
      return getFm().add(d, kind, amountCents, f);
    },

    fin_new_id() {
      return { id: newId("mv") };
    },

    fin_update(day: string, mid: string, fields: unknown, newDay = "") {
      const d = finDate(day);
      const fm = getFm();
      if (fm.get(d, String(mid)) === null) {
        throw new ApiError("Ese movimiento ya no existe.");
      }
      const f = finMovementFields(fields);
      let mov = fm.update(d, String(mid), f);
      const target = optDate(newDay);
      if (target && todayIso(target) !== todayIso(d)) {
        mov = fm.move(String(mid), d, target);
      }
      return mov || {};
    },

    fin_delete(day: string, mid: string) {
      if (!getFm().delete(finDate(day), String(mid))) {
        throw new ApiError("Ese movimiento ya no existe.");
      }
      return { ok: true };
    },

    fin_delete_many(dayIds: unknown) {
      if (!Array.isArray(dayIds)) {
        throw new ApiError("Datos inválidos.");
      }
      const fm = getFm();
      for (const pair of dayIds.slice(0, 200)) {
        if (Array.isArray(pair) && pair.length === 2) {
          fm.delete(finDate(pair[0]), String(pair[1]));
        }
      }
      return { ok: true };
    },

    fin_category_save(cid: string, fields: unknown) {
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw new ApiError("Datos inválidos.");
      }
      const f = fields as Record<string, any>;
      const fm = getFm();
      const name = oneLine(f.name, 60);
      const icon = oneLine(f.icon, 8);
      const colour = String(f.colour || "#616161");
      if (!HEX_RE.test(colour)) {
        throw new ApiError("Color inválido.");
      }
      const budget = cents(f.budget_month_cents || 0, true);
      if (!cid) {
        const kind = f.kind ?? GASTO;
        if (kind !== GASTO && kind !== INGRESO) {
          throw new ApiError("Tipo inválido.");
        }
        if (!name) {
          throw new ApiError("La categoría necesita un nombre.");
        }
        return fm.createCategory(name, kind, icon, colour, budget);
      }
      if (!(String(cid) in fm.categoryMap())) {
        throw new ApiError("Esa categoría ya no existe.");
      }
      const patch: Record<string, any> = {
        icon,
        colour,
        budget_month_cents: budget,
      };
      if (name) {
        patch.name = name;
      }
      if ("archived" in f) {
        patch.archived = Boolean(f.archived);
      }
      return fm.updateCategory(String(cid), patch);
    },

    fin_goals() {
      const fm = getFm();
      const today = new Date();
      const out = fm.goals().map((g) => {
        const proj = fm.projection(g.id, today);
        return {
          ...g,
          pace: fm.pace(g.id, today),
          projection: proj ? todayIso(proj) : null,
        };
      });
      return {
        goals: out,
        general: fm.generalSavings(),
      };
    },

    fin_goal(gid: string) {
      const fm = getFm();
      const g = fm.getGoal(String(gid));
      if (!g) {
        throw new ApiError("Esa meta de ahorro ya no existe.");
      }
      const today = new Date();
      const proj = fm.projection(g.id, today);
      const hist = fm.history(g.id);
      const movements = fm.goalMovements(g.id);
      return {
        goal: g,
        pace: fm.pace(g.id, today),
        projection: proj ? todayIso(proj) : null,
        days: hist.days.map(([d, net]) => ({ date: todayIso(d), net })),
        months: hist.months,
        movements: pairs(movements),
      };
    },

    fin_goal_save(gid: string, fields: unknown) {
      const fm = getFm();
      const f = finGoalFields(fields);
      if (!gid) {
        if (!("target_cents" in f)) {
          throw new ApiError("La meta necesita un objetivo.");
        }
        const name = (f.name as string) || "Meta de ahorro";
        delete f.name;
        const target = f.target_cents as number;
        delete f.target_cents;
        return fm.createGoal(name, target, f);
      }
      if (!fm.getGoal(String(gid))) {
        throw new ApiError("Esa meta de ahorro ya no existe.");
      }
      const g = fm.updateGoal(String(gid), f);
      fm.refreshGoalStatus(String(gid));
      return fm.getGoal(String(gid)) || g;
    },

    fin_goal_delete(gid: string) {
      const fm = getFm();
      if (!fm.getGoal(String(gid))) {
        throw new ApiError("Esa meta de ahorro ya no existe.");
      }
      fm.deleteGoal(String(gid));
      return { ok: true };
    },

    /**
     * Mueve todo el ahorro general (ahorros y retiros sin meta) a una meta.
     * Después el general queda en cero; deshacer es editar cada movimiento.
     */
    fin_assign_general(gid: string) {
      const fm = getFm();
      if (!fm.getGoal(String(gid))) {
        throw new ApiError("Esa meta de ahorro ya no existe.");
      }
      let moved = 0;
      for (const d of fm.allDays()) {
        for (const m of fm.day(d)) {
          if (!m.goal && (m.type === "ahorro" || m.type === "retiro")) {
            fm.update(d, m.id, { goal: String(gid) });
            moved++;
          }
        }
      }
      return { moved };
    },

    fin_recurring_list() {
      return getFm().recurrents();
    },

    fin_recurring_save(id: string, fields: unknown) {
      const fm = getFm();
      const rid = String(id || "");
      if (rid && !fm.recurrents().some((r) => r.id === rid)) {
        throw new ApiError("Ese recurrente ya no existe.");
      }
      const f = fields && typeof fields === "object" ? (fields as Record<string, unknown>) : {};
      const type = String(f.type ?? GASTO);
      if (!(MOVEMENT_TYPES as readonly string[]).includes(type)) {
        throw new ApiError("Tipo inválido.");
      }
      const amount_cents = cents(f.amount_cents);
      if (!amount_cents) throw new ApiError("Escribe un importe mayor que cero.");
      const rule = Recurrence.parse(oneLine(f.rule, 60)).toString();
      if (!rule) throw new ApiError("Regla de repetición inválida.");
      const startD = optDate(f.start);
      const endD = optDate(f.end);
      const saved = fm.saveRecurrent({
        id: rid,
        type,
        amount_cents,
        what: oneLine(f.what, 120),
        category: String(f.category || ""),
        goal: String(f.goal || ""),
        rule,
        start: startD ? todayIso(startD) : todayIso(),
        end: endD ? todayIso(endD) : "",
        archived: Boolean(f.archived),
      });
      if (!saved) throw new ApiError("Ese recurrente ya no existe.");
      return saved;
    },

    fin_recurring_delete(rid: string) {
      getFm().deleteRecurrent(String(rid));
      return { ok: true };
    },

    fin_recurring_run(today: string) {
      const day = optDate(today);
      return { created: getFm().runRecurrents(day ? todayIso(day) : todayIso()) };
    },

    fin_budget_get() {
      return { month_budget_cents: getFm().budgetMonth() };
    },

    fin_budget_set(amount: unknown) {
      return { month_budget_cents: getFm().setBudgetMonth(cents(amount, true)) };
    },

    /**
     * Búsqueda en todo el historial (el buscador de Periodo solo ve el rango
     * cargado). Página de 100 + total para corte explícito.
     */
    fin_search(query: string, kind = "", category = "", offset = 0) {
      const fm = getFm();
      const q = String(query ?? "").trim();
      const k = String(kind || "");
      if (k && !(MOVEMENT_TYPES as readonly string[]).includes(k)) {
        throw new ApiError("Tipo inválido.");
      }
      if (!q && !k && !category) return { total: 0, movements: [] as Array<Record<string, unknown>> };
      const all: Array<[Date, Record<string, any>]> = [];
      for (const d of fm.allDays()) {
        for (const m of fm.day(d)) all.push([d, m]);
      }
      const found = fm.search(all, q, k, String(category || ""));
      const start = Math.max(0, Math.floor(Number(offset) || 0));
      return { total: found.length, movements: pairs(found.slice(start, start + 100)) };
    },
  };
}
