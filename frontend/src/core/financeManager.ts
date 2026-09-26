/**
 * Finanzas: daily movements, categories, and savings goals kept apart from Metas.
 * Ported from notevault_app/core/finance_manager.py.
 *
 *     .notevault/finanzas/
 *     ├── categorias/<cat-id>.json          one category per file
 *     ├── metas/<fgoal-id>.json             one savings goal per file
 *     ├── AAAA/MM/AAAA-MM-DD.json           the day's movements
 *     └── adjuntos/AAAA/MM/<mov-id>-<n>.png invoices and references
 *
 * Amounts are integer cents everywhere, on disk and in memory; formatting
 * happens only when showing them. Balance = ingresos - gastos - ahorros + retiros.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { addDays, parseIsoDate, todayIso, weekday } from "./dates";
import { formatMoney, format_money } from "./num";
import { removeModuleAttachment } from "./moduleAttachments";
import { Recurrence } from "./recurrence";
import { Occurrence } from "./scheduleFormat";
import { loadJson, MtimeCache, newId, parseDay, slug, toTrash, writeJson } from "./store";
import {
  CATEGORY_KEYS,
  DEFAULT_CURRENCY,
  FINANCE_GOAL_KEYS,
  FINANCE_GOAL_STATUSES,
  isSyncConflict,
  LAYOUT,
  MOVEMENT_KEYS,
  MOVEMENT_TYPES,
} from "./vaultFormat";

export const [GASTO, INGRESO, AHORRO, RETIRO] = MOVEMENT_TYPES;
export const [G_ACTIVE, G_PAUSED, G_DONE] = FINANCE_GOAL_STATUSES;

export const TYPE_LABELS: Record<string, string> = {
  [GASTO]: "Gasto",
  [INGRESO]: "Ingreso",
  [AHORRO]: "Ahorro",
  [RETIRO]: "Retiro",
};

export const TYPE_COLOURS: Record<string, string> = {
  [GASTO]: "#f2555a",
  [INGRESO]: "#4ade80",
  [AHORRO]: "#eab308",
  [RETIRO]: "#ff9632",
};

export const DEFAULT_CATEGORIES: readonly [string, string, string, string][] = [
  ["Comida", "🍽", "#f4511e", GASTO],
  ["Transporte", "🚌", "#039be5", GASTO],
  ["Vivienda", "🏠", "#8e24aa", GASTO],
  ["Servicios", "💡", "#f6bf26", GASTO],
  ["Salud", "💊", "#33b679", GASTO],
  ["Educación", "📚", "#3f51b5", GASTO],
  ["Ocio", "🎮", "#e67c73", GASTO],
  ["Compras", "🛍", "#7986cb", GASTO],
  ["Otros", "•", "#616161", GASTO],
  ["Salario", "💼", "#0b8043", INGRESO],
  ["Extra", "✨", "#33b679", INGRESO],
  ["Regalo", "🎁", "#e67c73", INGRESO],
];

export { formatMoney, format_money };

export interface FinanceTotals {
  gasto: number;
  ingreso: number;
  ahorro: number;
  retiro: number;
  balance: number;
  [key: string]: number;
}

export function emptyTotals(): FinanceTotals {
  return { [GASTO]: 0, [INGRESO]: 0, [AHORRO]: 0, [RETIRO]: 0, balance: 0 };
}
export const empty_totals = emptyTotals;

export function totals(movements: Iterable<Record<string, any>>): FinanceTotals {
  const out = emptyTotals();
  for (const m of movements) {
    const t = m?.type as string;
    if (t && t in out && t !== "balance") {
      (out as Record<string, number>)[t] = ((out as Record<string, number>)[t] ?? 0) + Math.trunc(Number(m.amount_cents || 0));
    }
  }
  out.balance = out[INGRESO] - out[GASTO] - out[AHORRO] + out[RETIRO];
  return out;
}

function cleanInt(v: unknown, defaultValue = 0): number {
  if (typeof v === "boolean") return defaultValue;
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function sanitizeMovement(raw: Record<string, any>): Record<string, any> {
  const r = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, any> = {
    id: String(r.id || newId("mv")),
    type: (MOVEMENT_TYPES as readonly string[]).includes(r.type) ? r.type : GASTO,
    amount_cents: Math.abs(cleanInt(r.amount_cents)),
    currency: String(r.currency || DEFAULT_CURRENCY),
  };
  for (const key of ["category", "goal", "what", "reason", "time"]) {
    const value = r[key];
    if (value !== null && value !== undefined && value !== "") {
      out[key] = String(value);
    }
  }
  const atts = Array.isArray(r.attachments) ? r.attachments : [];
  out.attachments = atts.filter(Boolean).map(String);
  if (r.created) {
    out.created = String(r.created);
  }
  for (const [key, value] of Object.entries(r)) {
    if (!(key in out) && !(MOVEMENT_KEYS as readonly string[]).includes(key)) {
      out[key] = value;
    }
  }
  return out;
}
export const sanitize_movement = sanitizeMovement;

export function sanitizeCategory(
  raw: Record<string, any>,
  fallbackId = "",
): Record<string, any> {
  const r = raw && typeof raw === "object" ? raw : {};
  const order = r.order;
  return {
    id: String(r.id || fallbackId),
    name: String(r.name || "Categoría"),
    icon: String(r.icon || ""),
    colour: String(r.colour || "#616161"),
    kind: r.kind === INGRESO ? INGRESO : GASTO,
    budget_month_cents: cleanInt(r.budget_month_cents),
    order: typeof order === "number" && !Number.isNaN(order) ? order : 0,
    archived: Boolean(r.archived),
  };
}
export const sanitize_category = sanitizeCategory;

export function sanitizeGoal(raw: Record<string, any>, fallbackId = ""): Record<string, any> {
  const r = raw && typeof raw === "object" ? raw : {};
  let cadence = r.cadence && typeof r.cadence === "object" ? r.cadence : {};
  if (cadence.mode === "period" && (cadence.period === "week" || cadence.period === "month")) {
    cadence = { mode: "period", period: cadence.period };
  } else {
    const rule = Recurrence.parse(cadence.rule).toString() || "daily";
    cadence = { mode: "rule", rule };
  }

  return {
    id: String(r.id || fallbackId),
    name: String(r.name || "Meta de ahorro"),
    icon: String(r.icon || "💰"),
    colour: String(r.colour || "#33b679"),
    target_cents: Math.abs(cleanInt(r.target_cents)),
    currency: String(r.currency || DEFAULT_CURRENCY),
    start: r.start instanceof Date ? todayIso(r.start) : String(r.start || ""),
    deadline: r.deadline instanceof Date ? todayIso(r.deadline) : String(r.deadline || ""),
    show_in_daily: Boolean(r.show_in_daily),
    cadence,
    suggested_cents: Math.abs(cleanInt(r.suggested_cents)),
    status: (FINANCE_GOAL_STATUSES as readonly string[]).includes(r.status)
      ? r.status
      : G_ACTIVE,
    created: String(r.created || ""),
    notes: String(r.notes || ""),
  };
}
export const sanitize_goal = sanitizeGoal;

export class FinanceManager {
  vaultRoot: string;
  dir: string;
  _days = new MtimeCache<Record<string, any>[]>();

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.finance_dir);
  }

  dayPath(d: Date | string): string {
    const dStr = typeof d === "string" ? d : todayIso(d);
    const [year, month] = dStr.split("-");
    return path.join(this.vaultRoot, LAYOUT.finance_dir, year!, month!, `${dStr}.json`);
  }
  day_path(d: Date | string): string {
    return this.dayPath(d);
  }

  categoryPath(cid: string): string {
    return path.join(this.vaultRoot, LAYOUT.finance_category.replace("{id}", cid));
  }
  category_path(cid: string): string {
    return this.categoryPath(cid);
  }

  goalPath(gid: string): string {
    return path.join(this.vaultRoot, LAYOUT.finance_goal.replace("{id}", gid));
  }
  goal_path(gid: string): string {
    return this.goalPath(gid);
  }

  // ── Categories ────────────────────────────────────────────────────────

  categories(kind?: string | null, includeArchived = false): Record<string, any>[] {
    const folder = path.dirname(this.categoryPath("x"));
    const out: Record<string, any>[] = [];
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
      for (const name of files) {
        if (isSyncConflict(name)) continue;
        const p = path.join(folder, name);
        const data = loadJson<Record<string, any>>(p);
        if (data && typeof data === "object") {
          out.push(sanitizeCategory(data, path.parse(name).name));
        }
      }
    }
    const filtered = out.filter(
      (c) => (includeArchived || !c.archived) && (kind == null || c.kind === kind),
    );
    filtered.sort((a, b) => {
      const kindA = a.kind !== GASTO ? 1 : 0;
      const kindB = b.kind !== GASTO ? 1 : 0;
      if (kindA !== kindB) return kindA - kindB;
      if (a.order !== b.order) return a.order - b.order;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return filtered;
  }

  categoryMap(): Record<string, Record<string, any>> {
    const map: Record<string, Record<string, any>> = {};
    for (const c of this.categories(null, true)) {
      map[c.id] = c;
    }
    return map;
  }
  category_map(): Record<string, Record<string, any>> {
    return this.categoryMap();
  }

  ensureDefaults(): boolean {
    if (this.categories(null, true).length > 0) {
      return false;
    }
    let n = 1;
    for (const [name, icon, colour, kind] of DEFAULT_CATEGORIES) {
      this._saveCategory(
        sanitizeCategory({
          id: slug(name),
          name,
          icon,
          colour,
          kind,
          order: n,
        }),
      );
      n += 1;
    }
    return true;
  }
  ensure_defaults(): boolean {
    return this.ensureDefaults();
  }

  _saveCategory(cat: Record<string, any>): void {
    writeJson(this.categoryPath(cat.id), sanitizeCategory(cat));
  }
  _save_category(cat: Record<string, any>): void {
    this._saveCategory(cat);
  }

  createCategory(
    name: string,
    kind = GASTO,
    icon = "",
    colour = "#616161",
    budgetMonthCents = 0,
  ): Record<string, any> {
    const existing = new Set(this.categories(null, true).map((c) => c.id));
    const base = slug(name);
    let cid = base;
    let n = 2;
    while (existing.has(cid)) {
      cid = `${base}-${n}`;
      n += 1;
    }
    const currentCats = this.categories(kind, true);
    const maxOrder = currentCats.length > 0 ? Math.max(...currentCats.map((c) => c.order)) : 0;
    const order = maxOrder + 1;
    const cat = sanitizeCategory({
      id: cid,
      name: name.trim() || "Categoría",
      icon,
      colour,
      kind,
      order,
      budget_month_cents: budgetMonthCents,
    });
    this._saveCategory(cat);
    return cat;
  }
  create_category(
    name: string,
    kind = GASTO,
    icon = "",
    colour = "#616161",
    budgetMonthCents = 0,
  ): Record<string, any> {
    return this.createCategory(name, kind, icon, colour, budgetMonthCents);
  }

  updateCategory(cid: string, fields: Record<string, any>): Record<string, any> | null {
    const cat = this.categoryMap()[cid];
    if (!cat) return null;
    for (const [k, v] of Object.entries(fields)) {
      if ((CATEGORY_KEYS as readonly string[]).includes(k) && k !== "id") {
        cat[k] = v;
      }
    }
    this._saveCategory(cat);
    return cat;
  }
  update_category(cid: string, fields: Record<string, any>): Record<string, any> | null {
    return this.updateCategory(cid, fields);
  }

  archiveCategory(cid: string, archived = true): Record<string, any> | null {
    return this.updateCategory(cid, { archived });
  }
  archive_category(cid: string, archived = true): Record<string, any> | null {
    return this.archiveCategory(cid, archived);
  }

  // ── Movements ─────────────────────────────────────────────────────────

  private _loadDay(p: string | null): Record<string, any>[] {
    if (!p) return [];
    const data = loadJson<Record<string, any>>(p, {});
    const movs = data?.movements;
    if (Array.isArray(movs)) {
      return movs.filter((m) => m && typeof m === "object").map(sanitizeMovement);
    }
    return [];
  }

  day(d: Date | string): Record<string, any>[] {
    const p = this.dayPath(d);
    const list = this._days.get(p, (path) => this._loadDay(path));
    return list.map((m) => ({
      ...m,
      attachments: [...(m.attachments || [])],
    }));
  }

  _saveDay(d: Date | string, movements: Record<string, any>[]): void {
    const p = this.dayPath(d);
    this._days.forget(p);
    if (!movements.length) {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
      }
      return;
    }
    writeJson(p, {
      movements: movements.map(sanitizeMovement),
    });
  }
  _save_day(d: Date | string, movements: Record<string, any>[]): void {
    this._saveDay(d, movements);
  }

  add(
    d: Date | string,
    type: string,
    amountCents: number,
    fields: Record<string, any> = {},
  ): Record<string, any> {
    const nowStr = todayIso();
    const mov = sanitizeMovement({
      ...fields,
      type,
      amount_cents: amountCents,
      created: fields.created || `${nowStr}T${new Date().toTimeString().slice(0, 5)}`,
    });
    const movements = this.day(d);
    movements.push(mov);
    this._saveDay(d, movements);
    if (mov.goal) {
      this.refreshGoalStatus(mov.goal);
    }
    return mov;
  }

  get(d: Date | string, mid: string): Record<string, any> | null {
    return this.day(d).find((m) => m.id === mid) ?? null;
  }

  update(
    d: Date | string,
    mid: string,
    fields: Record<string, any> = {},
  ): Record<string, any> | null {
    const movements = this.day(d);
    for (let i = 0; i < movements.length; i++) {
      const m = movements[i]!;
      if (m.id === mid) {
        const { id: _ignored, ...cleanFields } = fields;
        Object.assign(m, cleanFields);
        for (const key of ["category", "goal", "what", "reason", "time"]) {
          if (m[key] === null || m[key] === undefined || m[key] === "") {
            delete m[key];
          }
        }
        movements[i] = sanitizeMovement(m);
        this._saveDay(d, movements);
        const goalsToRefresh = new Set([fields.goal, m.goal].filter(Boolean));
        for (const gid of goalsToRefresh) {
          this.refreshGoalStatus(gid);
        }
        return movements[i]!;
      }
    }
    return null;
  }

  move(mid: string, oldD: Date | string, newD: Date | string): Record<string, any> | null {
    const oldStr = typeof oldD === "string" ? oldD : todayIso(oldD);
    const newStr = typeof newD === "string" ? newD : todayIso(newD);
    if (oldStr === newStr) {
      return this.get(oldStr, mid);
    }
    const movements = this.day(oldStr);
    const mov = movements.find((m) => m.id === mid);
    if (!mov) return null;

    const target = this.day(newStr);
    target.push(mov);
    this._saveDay(newStr, target);
    this._saveDay(
      oldStr,
      movements.filter((m) => m.id !== mid),
    );
    return mov;
  }

  delete(d: Date | string, mid: string): boolean {
    const movements = this.day(d);
    const mov = movements.find((m) => m.id === mid);
    if (!mov) return false;
    for (const ref of mov.attachments || []) {
      removeModuleAttachment(this.vaultRoot, ref, "finanzas-adjuntos");
    }
    this._saveDay(
      d,
      movements.filter((m) => m.id !== mid),
    );
    if (mov.goal) {
      this.refreshGoalStatus(mov.goal);
    }
    return true;
  }

  // ── Ranges ────────────────────────────────────────────────────────────

  range(first: Date | string, last: Date | string): [Date, Record<string, any>][] {
    const out: [Date, Record<string, any>][] = [];
    const start = typeof first === "string" ? parseIsoDate(first) || new Date() : first;
    const end = typeof last === "string" ? parseIsoDate(last) || new Date() : last;

    let d = start;
    while (d.getTime() <= end.getTime()) {
      const p = this.dayPath(d);
      if (fs.existsSync(p)) {
        for (const m of this.day(d)) {
          out.push([new Date(d), m]);
        }
      }
      d = addDays(d, 1);
    }
    return out;
  }

  allDays(): Date[] {
    if (!fs.existsSync(this.dir) || !fs.statSync(this.dir).isDirectory()) {
      return [];
    }
    const days: Date[] = [];
    try {
      const years = fs.readdirSync(this.dir).filter((y) => /^\d{4}$/.test(y));
      for (const y of years) {
        const yPath = path.join(this.dir, y);
        if (!fs.statSync(yPath).isDirectory()) continue;
        const months = fs.readdirSync(yPath).filter((m) => /^\d{2}$/.test(m));
        for (const m of months) {
          const mPath = path.join(yPath, m);
          if (!fs.statSync(mPath).isDirectory()) continue;
          const files = fs.readdirSync(mPath).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
          for (const f of files) {
            const dateStr = path.parse(f).name;
            const parsed = parseIsoDate(dateStr);
            if (parsed) days.push(parsed);
          }
        }
      }
    } catch {
      return [];
    }
    days.sort((a, b) => a.getTime() - b.getTime());
    return days;
  }
  all_days(): Date[] {
    return this.allDays();
  }

  static weekBounds(d: Date | string): [Date, Date] {
    const dateObj = typeof d === "string" ? parseIsoDate(d) || new Date() : d;
    const monday = addDays(dateObj, -weekday(dateObj));
    return [monday, addDays(monday, 6)];
  }
  static week_bounds(d: Date | string): [Date, Date] {
    return FinanceManager.weekBounds(d);
  }

  static monthBounds(year: number, month: number): [Date, Date] {
    const daysIn = new Date(year, month, 0).getDate();
    return [new Date(year, month - 1, 1), new Date(year, month - 1, daysIn)];
  }
  static month_bounds(year: number, month: number): [Date, Date] {
    return FinanceManager.monthBounds(year, month);
  }

  week(d: Date | string): [Date, Record<string, any>][] {
    const [start, end] = FinanceManager.weekBounds(d);
    return this.range(start, end);
  }

  month(year: number, month: number): [Date, Record<string, any>][] {
    const [start, end] = FinanceManager.monthBounds(year, month);
    return this.range(start, end);
  }

  year(year: number): [Date, Record<string, any>][] {
    return this.range(new Date(year, 0, 1), new Date(year, 11, 31));
  }

  // ── Sums ──────────────────────────────────────────────────────────────

  static byCategory(
    pairs: [Date, Record<string, any>][],
    kind = GASTO,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [, m] of pairs) {
      if (m.type === kind) {
        const key = m.category || "";
        out[key] = (out[key] || 0) + (m.amount_cents || 0);
      }
    }
    return out;
  }

  byCategory(
    pairs: [Date, Record<string, any>][],
    kind = GASTO,
  ): Record<string, number> {
    return FinanceManager.byCategory(pairs, kind);
  }
  by_category(
    pairs: [Date, Record<string, any>][],
    kind = GASTO,
  ): Record<string, number> {
    return FinanceManager.byCategory(pairs, kind);
  }

  static byDay(
    pairs: [Date, Record<string, any>][],
    first: Date,
    last: Date,
  ): [Date, FinanceTotals][] {
    const days = new Map<string, Record<string, any>[]>();
    for (const [d, m] of pairs) {
      const k = todayIso(d);
      if (!days.has(k)) days.set(k, []);
      days.get(k)!.push(m);
    }
    const out: [Date, FinanceTotals][] = [];
    let cur = new Date(first);
    while (cur.getTime() <= last.getTime()) {
      const k = todayIso(cur);
      out.push([new Date(cur), totals(days.get(k) || [])]);
      cur = addDays(cur, 1);
    }
    return out;
  }
  static by_day(
    pairs: [Date, Record<string, any>][],
    first: Date,
    last: Date,
  ): [Date, FinanceTotals][] {
    return FinanceManager.byDay(pairs, first, last);
  }

  byMonth(year: number): [number, FinanceTotals][] {
    const pairs = this.year(year);
    const result: [number, FinanceTotals][] = [];
    for (let m = 1; m <= 12; m++) {
      const movs = pairs.filter(([d]) => d.getMonth() + 1 === m).map(([, mv]) => mv);
      result.push([m, totals(movs)]);
    }
    return result;
  }
  by_month(year: number): [number, FinanceTotals][] {
    return this.byMonth(year);
  }

  budgetUsed(year: number, month: number): [Record<string, any>, number, number][] {
    const spent = FinanceManager.byCategory(this.month(year, month), GASTO);
    const out: [Record<string, any>, number, number][] = [];
    for (const c of this.categories(GASTO, true)) {
      const used = spent[c.id] || 0;
      if (c.budget_month_cents || used) {
        out.push([c, used, c.budget_month_cents || 0]);
      }
    }
    return out;
  }
  budget_used(year: number, month: number): [Record<string, any>, number, number][] {
    return this.budgetUsed(year, month);
  }

  compareMonth(year: number, month: number): [FinanceTotals, FinanceTotals] {
    const prevY = month === 1 ? year - 1 : year;
    const prevM = month === 1 ? 12 : month - 1;
    const thisTot = totals(this.month(year, month).map(([, m]) => m));
    const prevTot = totals(this.month(prevY, prevM).map(([, m]) => m));
    return [thisTot, prevTot];
  }
  compare_month(year: number, month: number): [FinanceTotals, FinanceTotals] {
    return this.compareMonth(year, month);
  }

  // ── Savings goals ─────────────────────────────────────────────────────

  goals(includeDone = true): Record<string, any>[] {
    const folder = path.dirname(this.goalPath("x"));
    const out: Record<string, any>[] = [];
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
      for (const name of files) {
        if (isSyncConflict(name)) continue;
        const p = path.join(folder, name);
        const data = loadJson<Record<string, any>>(p);
        if (data && typeof data === "object") {
          out.push(sanitizeGoal(data, path.parse(name).name));
        }
      }
    }
    const filtered = includeDone ? out : out.filter((g) => g.status !== G_DONE);
    const orderMap: Record<string, number> = { [G_ACTIVE]: 0, [G_PAUSED]: 1, [G_DONE]: 2 };
    filtered.sort((a, b) => {
      const ordA = orderMap[a.status] ?? 0;
      const ordB = orderMap[b.status] ?? 0;
      if (ordA !== ordB) return ordA - ordB;
      const deadA = a.deadline || "9999";
      const deadB = b.deadline || "9999";
      if (deadA !== deadB) return deadA.localeCompare(deadB);
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return filtered;
  }

  getGoal(gid: string): Record<string, any> | null {
    const data = loadJson<Record<string, any>>(this.goalPath(gid));
    return data && typeof data === "object" ? sanitizeGoal(data, gid) : null;
  }
  get_goal(gid: string): Record<string, any> | null {
    return this.getGoal(gid);
  }

  _saveGoal(goal: Record<string, any>): void {
    writeJson(this.goalPath(goal.id), sanitizeGoal(goal));
  }
  _save_goal(goal: Record<string, any>): void {
    this._saveGoal(goal);
  }

  createGoal(name: string, targetCents: number, fields: Record<string, any> = {}): Record<string, any> {
    const today = todayIso();
    const goal = sanitizeGoal({
      start: today,
      created: today,
      show_in_daily: true,
      ...fields,
      id: fields.id || newId("f"),
      name: name.trim() || "Meta de ahorro",
      target_cents: targetCents,
    });
    this._saveGoal(goal);
    return goal;
  }
  create_goal(name: string, targetCents: number, fields: Record<string, any> = {}): Record<string, any> {
    return this.createGoal(name, targetCents, fields);
  }

  updateGoal(gid: string, fields: Record<string, any>): Record<string, any> | null {
    const goal = this.getGoal(gid);
    if (!goal) return null;
    for (const [k, v] of Object.entries(fields)) {
      if ((FINANCE_GOAL_KEYS as readonly string[]).includes(k) && k !== "id") {
        goal[k] = v;
      }
    }
    this._saveGoal(goal);
    return this.getGoal(gid);
  }
  update_goal(gid: string, fields: Record<string, any>): Record<string, any> | null {
    return this.updateGoal(gid, fields);
  }

  deleteGoal(gid: string): void {
    toTrash(this.vaultRoot, this.goalPath(gid), "finanzas-metas");
  }
  delete_goal(gid: string): void {
    this.deleteGoal(gid);
  }

  goalMovements(gid: string): [Date, Record<string, any>][] {
    const out: [Date, Record<string, any>][] = [];
    for (const d of this.allDays()) {
      for (const m of this.day(d)) {
        if (m.goal === gid && (m.type === AHORRO || m.type === RETIRO)) {
          out.push([d, m]);
        }
      }
    }
    return out;
  }
  goal_movements(gid: string): [Date, Record<string, any>][] {
    return this.goalMovements(gid);
  }

  saved(gid: string): number {
    let total = 0;
    for (const [, m] of this.goalMovements(gid)) {
      total += m.type === AHORRO ? m.amount_cents : -m.amount_cents;
    }
    return total;
  }

  refreshGoalStatus(gid: string): void {
    const goal = this.getGoal(gid);
    if (!goal || !goal.target_cents || goal.status === G_PAUSED) return;
    const reached = this.saved(gid) >= goal.target_cents;
    const status = reached ? G_DONE : G_ACTIVE;
    if (status !== goal.status) {
      goal.status = status;
      this._saveGoal(goal);
    }
  }
  refresh_goal_status(gid: string): void {
    this.refreshGoalStatus(gid);
  }

  history(gid: string): {
    days: [Date, number, Record<string, any>[]][];
    months: [string, number][];
  } {
    const daysMap = new Map<string, { date: Date; movs: Record<string, any>[] }>();
    for (const [d, m] of this.goalMovements(gid)) {
      const k = todayIso(d);
      if (!daysMap.has(k)) daysMap.set(k, { date: d, movs: [] });
      daysMap.get(k)!.movs.push(m);
    }
    const sortedKeys = Array.from(daysMap.keys()).sort();
    const rows: [Date, number, Record<string, any>[]][] = [];
    const monthsMap = new Map<string, number>();

    for (const k of sortedKeys) {
      const item = daysMap.get(k)!;
      let net = 0;
      for (const m of item.movs) {
        net += m.type === AHORRO ? m.amount_cents : -m.amount_cents;
      }
      rows.push([item.date, net, item.movs]);
      const monthKey = k.slice(0, 7);
      monthsMap.set(monthKey, (monthsMap.get(monthKey) || 0) + net);
    }

    const months = Array.from(monthsMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { days: rows, months };
  }

  _period(goal: Record<string, any>, d: Date): [Date, Date] {
    if (goal.cadence?.period === "week") {
      return FinanceManager.weekBounds(d);
    }
    return FinanceManager.monthBounds(d.getFullYear(), d.getMonth() + 1);
  }

  dueChecks(d: Date | string): [Record<string, any>, boolean, string[]][] {
    const dateObj = typeof d === "string" ? parseIsoDate(d) || new Date() : d;
    const out: [Record<string, any>, boolean, string[]][] = [];

    for (const goal of this.goals(false)) {
      if (!goal.show_in_daily || goal.status !== G_ACTIVE) continue;
      const startStr = goal.start ? parseDay(goal.start) : null;
      const startDate = startStr ? parseIsoDate(startStr) : null;
      if (startDate && dateObj.getTime() < startDate.getTime()) continue;

      const cadence = goal.cadence;
      let first: Date;
      let last: Date;
      if (cadence?.mode === "period") {
        [first, last] = this._period(goal, dateObj);
      } else {
        if (!Recurrence.parse(cadence?.rule).occursOn(dateObj, startDate)) {
          continue;
        }
        first = last = dateObj;
      }

      const ids = this.range(first, last)
        .filter(([, m]) => m.goal === goal.id && m.type === AHORRO)
        .map(([, m]) => m.id);

      out.push([goal, ids.length > 0, ids]);
    }
    return out;
  }
  due_checks(d: Date | string): [Record<string, any>, boolean, string[]][] {
    return this.dueChecks(d);
  }

  pace(
    gid: string,
    today?: Date | null,
  ): {
    saved: number;
    remaining: number;
    per_day: number | null;
    per_week: number | null;
    per_month: number | null;
    days_left: number | null;
  } {
    const todayObj = today || new Date();
    const todayMidnight = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
    const goal = this.getGoal(gid);
    const saved = this.saved(gid);
    const remaining = goal ? Math.max(0, goal.target_cents - saved) : 0;
    const out: {
      saved: number;
      remaining: number;
      per_day: number | null;
      per_week: number | null;
      per_month: number | null;
      days_left: number | null;
    } = {
      saved,
      remaining,
      per_day: null,
      per_week: null,
      per_month: null,
      days_left: null,
    };

    const deadlineStr = goal?.deadline ? parseDay(goal.deadline) : null;
    const deadline = deadlineStr ? parseIsoDate(deadlineStr) : null;
    if (deadline) {
      const msDiff = deadline.getTime() - todayMidnight.getTime();
      const days = Math.round(msDiff / 86400000) + 1;
      out.days_left = days - 1;
      if (days > 0 && remaining > 0) {
        out.per_day = Math.ceil(remaining / days);
        out.per_week = Math.ceil((remaining * 7) / days);
        out.per_month = Math.ceil((remaining * 30) / days);
      }
    }
    return out;
  }

  projection(gid: string, today?: Date | null): Date | null {
    const todayObj = today || new Date();
    const todayMidnight = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
    const goal = this.getGoal(gid);
    if (!goal) return null;
    const remaining = goal.target_cents - this.saved(gid);
    if (remaining <= 0) return todayMidnight;

    const first = addDays(todayMidnight, -29);
    let recent = 0;
    for (const [d, m] of this.goalMovements(gid)) {
      if (d.getTime() >= first.getTime()) {
        recent += m.type === AHORRO ? m.amount_cents : -m.amount_cents;
      }
    }
    if (recent <= 0) return null;
    const daysAhead = Math.ceil((remaining * 30) / recent);
    return addDays(todayMidnight, daysAhead);
  }

  generalSavings(): number {
    let total = 0;
    for (const d of this.allDays()) {
      for (const m of this.day(d)) {
        if (!m.goal) {
          if (m.type === AHORRO) total += m.amount_cents;
          else if (m.type === RETIRO) total -= m.amount_cents;
        }
      }
    }
    return total;
  }
  general_savings(): number {
    return this.generalSavings();
  }

  search(
    pairs: [Date, Record<string, any>][],
    query = "",
    kind = "",
    category = "",
  ): [Date, Record<string, any>][] {
    const q = (query || "").trim().toLowerCase();
    const out: [Date, Record<string, any>][] = [];
    for (const [d, m] of pairs) {
      if (kind && m.type !== kind) continue;
      if (category && (m.category || "") !== category) continue;
      if (q) {
        const text = `${m.what || ""} ${m.reason || ""}`.toLowerCase();
        if (!text.includes(q)) continue;
      }
      out.push([d, m]);
    }
    return out;
  }
}

export class FinanceCalendarSource {
  prefix = "saving:";
  manager: FinanceManager;

  constructor(manager: FinanceManager) {
    this.manager = manager;
  }

  occurrences(first: Date, last: Date): Record<string, Occurrence[]> {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const out: Record<string, Occurrence[]> = {};

    const minDate = addDays(todayMidnight, -31);
    const maxDate = addDays(todayMidnight, 62);

    let d = first > minDate ? first : minDate;
    const end = last < maxDate ? last : maxDate;

    while (d.getTime() <= end.getTime()) {
      const dIso = todayIso(d);
      for (const [goal, checked] of this.manager.dueChecks(d)) {
        if (goal.cadence?.mode === "period") {
          const firstDayOfPeriod = this.manager._period(goal, d)[0];
          if (dIso !== todayIso(firstDayOfPeriod)) {
            continue;
          }
        }
        if (!out[dIso]) out[dIso] = [];
        out[dIso]!.push(
          new Occurrence(
            `${this.prefix}${goal.id}`,
            `${goal.icon} Ahorro ${goal.name}`,
            "saving",
            new Date(d),
            null,
            null,
            goal.colour,
            [{ type: "finance_goal", id: goal.id }],
            checked,
            "finanzas",
            false,
          ),
        );
      }
      d = addDays(d, 1);
    }
    return out;
  }

  setDone(d: Date, occurrenceId: string, done: boolean): void {
    const gid = occurrenceId.startsWith(this.prefix)
      ? occurrenceId.slice(this.prefix.length)
      : occurrenceId.replace(/^[^:]+:/, "");
    const goal = this.manager.getGoal(gid);
    if (!goal) return;
    if (done) {
      this.manager.add(d, AHORRO, goal.suggested_cents, {
        goal: gid,
        what: `Ahorro ${goal.name}`,
      });
    } else {
      for (const m of this.manager.day(d)) {
        if (m.goal === gid && m.type === AHORRO) {
          this.manager.delete(d, m.id);
        }
      }
    }
  }
  set_done(d: Date, occurrenceId: string, done: boolean): void {
    this.setDone(d, occurrenceId, done);
  }
}
