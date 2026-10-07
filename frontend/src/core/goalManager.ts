/**
 * Metas: goals divided into sub-goals at any depth, grouped by area.
 * Ported from notevault_app/core/goal_manager.py.
 *
 *     .notevault/metas/
 *     ├── <goal-id>/goal.md                  the goal (typed frontmatter + description)
 *     ├── <goal-id>/items/<item-id>.md       one sub-goal per file, `parent` makes the tree
 *     └── registro/AAAA/MM/AAAA-MM-DD.json   checks of repeating sub-goals for that day
 *
 * Registro:
 *     {"items": {"<goal>/<item>": {"done": true, "value": 3.5, "at": "21:40"}},
 *      "habit_marks": {"<habit-id>": ["<goal>/<item>", ...]}}
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { AreaManager } from "./areaManager";
import { addDays, formatDate, parseIsoDate, todayIso } from "./dates";
import { HabitManager, habitActiveOn } from "./habitManager";
import {
  normalizeTopicLinks,
  topicLinkProgress,
  type TopicLinkProgress,
  type TopicLookup,
} from "./practice/topicLinks";
import {
  combineLinkProgress,
  normalizePracticeLinks,
  practiceLinkProgress,
  type PracticeLinkProgress,
  type PracticeLookup,
} from "./practice/practiceLinks";
import { Recurrence } from "./recurrence";
import { Occurrence } from "./scheduleFormat";
import {
  dumpDoc,
  loadJson,
  MtimeCache,
  newId,
  readDoc,
  splitList,
  toTrash,
  writeJson,
  writeText,
} from "./store";
import {
  formatLayout,
  GOAL_FIELDS,
  GOAL_ITEM_FIELDS,
  GOAL_ITEM_STATUSES,
  GOAL_STATUSES,
  isSyncConflict,
  LAYOUT,
} from "./vaultFormat";

export const [STATUS_ACTIVE, STATUS_PAUSED, STATUS_DONE, STATUS_ARCHIVED] =
  GOAL_STATUSES;
export const [ITEM_TODO, ITEM_DOING, ITEM_DONE] = GOAL_ITEM_STATUSES;

export const GOAL_STATUS_COLOURS: Record<string, string> = {
  [STATUS_ACTIVE]: "#2383e2",
  [STATUS_PAUSED]: "#ff9632",
  [STATUS_DONE]: "#4ade80",
  [STATUS_ARCHIVED]: "#8b8b96",
};

export const FILTER_ACTIVE = "activas";
export const FILTER_PAUSED = "pausa";
export const FILTER_DONE = "completadas";
export const FILTER_OVERDUE = "vencidas";
export const FILTER_ARCHIVED = "archivadas";
export const FILTER_ALL = "todas";

export const LOG_BUCKET = "registro";

function _today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function cleanInt(v: unknown, defaultValue = 0): number {
  if (typeof v === "boolean") return defaultValue;
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function cleanFloat(v: unknown): number | null {
  if (typeof v === "boolean" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export class Goal {
  id: string;
  name: string;
  area: string;
  status: string;
  priority: number;
  start: Date | null;
  end: Date | null;
  icon: string;
  colour: string;
  in_overview: boolean;
  order: number | null;
  created: Date | null;
  description: string;
  extra: Record<string, any>;

  constructor(
    values: Record<string, any> = {},
    extra?: Record<string, any> | null,
    description = "",
  ) {
    this.id = String(values.id || "");
    this.name = String(values.name || "Nueva meta");
    this.area = String(values.area || "");
    this.status = String(values.status || STATUS_ACTIVE);
    this.priority = Math.max(1, Math.min(4, cleanInt(values.priority, 2)));
    this.start = values.start ? parseIsoDate(values.start) : null;
    this.end = values.end ? parseIsoDate(values.end) : null;
    this.icon = String(values.icon || "");
    this.colour = String(values.colour || "#3f51b5");
    this.in_overview = Boolean(values.in_overview);
    this.order = values.order !== undefined && values.order !== null ? cleanInt(values.order) : null;
    this.created = values.created ? parseIsoDate(values.created) : null;
    this.description = description;
    this.extra = extra ? { ...extra } : {};
  }

  get color(): string {
    return this.colour;
  }

  values(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k] of GOAL_FIELDS) {
      out[k] = (this as any)[k];
    }
    return out;
  }

  is_overdue(today?: Date | null): boolean {
    const t = today || _today();
    return Boolean(
      this.end &&
        this.end.getTime() < t.getTime() &&
        this.status !== STATUS_DONE &&
        this.status !== STATUS_ARCHIVED,
    );
  }
  isOverdue(today?: Date | null): boolean {
    return this.is_overdue(today);
  }

  days_left(today?: Date | null): number | null {
    if (!this.end) return null;
    const t = today || _today();
    const msPerDay = 86400000;
    return Math.round((this.end.getTime() - t.getTime()) / msPerDay);
  }
  daysLeft(today?: Date | null): number | null {
    return this.days_left(today);
  }
}

export class GoalItem {
  id: string;
  goal: string;
  parent: string;
  name: string;
  status: string;
  priority: number;
  order: number;
  start: Date | null;
  due: Date | null;
  due_time: string;
  duration_min: number | null;
  repeat: string;
  repeat_until: Date | null;
  in_calendar: boolean;
  reminder_min: number | null;
  target: number | null;
  unit: string;
  value: number | null;
  habit_links: string[];
  /** Temas de estudio enlazados (ver core/practice/topicLinks.ts). Con enlaces, la submeta se cumple sola. */
  topic_links: string[];
  /** Enlaces a «Programming practice» (ver core/practice/practiceLinks.ts). Igual que `topic_links`: cumplimiento derivado. */
  practice_links: string[];
  done_at: Date | null;
  created: Date | null;
  notes: string;
  extra: Record<string, any>;
  children: GoalItem[];

  constructor(
    values: Record<string, any> = {},
    extra?: Record<string, any> | null,
    notes = "",
  ) {
    this.id = String(values.id || "");
    this.goal = String(values.goal || "");
    this.parent = String(values.parent || "");
    this.name = String(values.name || "Nueva submeta");
    this.status = String(values.status || ITEM_TODO);
    this.priority = Math.max(1, Math.min(4, cleanInt(values.priority, 2)));
    this.order = values.order !== undefined && values.order !== null ? Number(values.order) : 0;
    this.start = values.start ? parseIsoDate(values.start) : null;
    this.due = values.due ? parseIsoDate(values.due) : null;
    this.due_time = String(values.due_time || "");
    this.duration_min =
      values.duration_min !== undefined && values.duration_min !== null
        ? cleanInt(values.duration_min)
        : null;
    this.repeat = Recurrence.parse(values.repeat).toString();
    this.repeat_until = values.repeat_until ? parseIsoDate(values.repeat_until) : null;
    this.in_calendar = Boolean(values.in_calendar);
    this.reminder_min =
      values.reminder_min !== undefined && values.reminder_min !== null
        ? cleanInt(values.reminder_min)
        : null;
    this.target = cleanFloat(values.target);
    this.unit = String(values.unit || "");
    this.value = cleanFloat(values.value);

    let links: string[] = [];
    if (Array.isArray(values.habit_links)) {
      links = values.habit_links.map(String);
    } else if (typeof values.habit_links === "string" && values.habit_links) {
      links = splitList(values.habit_links);
    }
    this.habit_links = links;
    this.topic_links = normalizeTopicLinks(values.topic_links);
    this.practice_links = normalizePracticeLinks(values.practice_links);

    this.done_at = values.done_at ? parseIsoDate(values.done_at) : null;
    this.created = values.created ? parseIsoDate(values.created) : null;
    this.notes = notes;
    this.extra = extra ? { ...extra } : {};
    this.children = [];
  }

  get category(): string {
    return String(this.extra.category || "").trim();
  }
  set category(val: string) {
    const v = (val || "").trim();
    if (v) {
      this.extra.category = v;
    } else {
      delete this.extra.category;
    }
  }

  get is_priority(): boolean {
    if ("is_priority" in this.extra) {
      return Boolean(this.extra.is_priority);
    }
    return this.priority >= 3 || this.children.length > 0;
  }
  set is_priority(val: boolean) {
    this.extra.is_priority = Boolean(val);
  }
  get isPriority(): boolean {
    return this.is_priority;
  }
  set isPriority(val: boolean) {
    this.is_priority = val;
  }

  values(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k] of GOAL_ITEM_FIELDS) {
      out[k] = (this as any)[k];
    }
    return out;
  }

  get key(): string {
    return `${this.goal}/${this.id}`;
  }

  get rule(): Recurrence {
    return Recurrence.parse(this.repeat);
  }

  get repeating(): boolean {
    return Boolean(this.repeat);
  }

  get measurable(): boolean {
    return typeof this.target === "number" && !isNaN(this.target) && this.target > 0;
  }

  get is_leaf(): boolean {
    return this.children.length === 0;
  }
  get isLeaf(): boolean {
    return this.children.length === 0;
  }

  anchor(goal?: Goal | null): Date | null {
    return this.start || (goal ? goal.start : null) || this.created;
  }

  until(goal?: Goal | null): Date | null {
    const ends: Date[] = [];
    if (this.repeat_until) ends.push(this.repeat_until);
    if (goal && goal.end) ends.push(goal.end);
    if (!ends.length) return null;
    let minD = ends[0]!;
    for (const d of ends) {
      if (d.getTime() < minD.getTime()) minD = d;
    }
    return minD;
  }

  occurs_on(d: Date, goal?: Goal | null): boolean {
    if (!this.repeating) {
      if (!this.due) return false;
      return (
        this.due.getFullYear() === d.getFullYear() &&
        this.due.getMonth() === d.getMonth() &&
        this.due.getDate() === d.getDate()
      );
    }
    return this.rule.occursOn(d, this.anchor(goal), this.until(goal));
  }
  occursOn(d: Date, goal?: Goal | null): boolean {
    return this.occurs_on(d, goal);
  }

  schedule_text(): string {
    const parts: string[] = [];
    if (this.repeating) {
      parts.push(this.rule.describe());
    } else if (this.due) {
      parts.push(formatDate(this.due, "%d/%m/%Y"));
    }
    if (this.due_time) {
      parts.push(this.due_time);
    }
    return parts.join(" · ");
  }
  scheduleText(): string {
    return this.schedule_text();
  }
}

export class GoalManager {
  vaultRoot: string;
  dir: string;
  habitMgr: HabitManager | null;
  areaMgr: AreaManager | null;
  /**
   * Resuelve el progreso de un tema de estudio por su carpeta. Lo pone la capa API
   * (el progreso sale del escaneo de la vault, que este módulo no conoce). Sin él,
   * `topic_links` no afecta al cumplimiento.
   */
  topicLookup: TopicLookup | null = null;
  /** Datos de «Programming practice» para `practice_links`; mismo patrón que `topicLookup` (inyectado por la capa API). */
  practiceLookup: PracticeLookup | null = null;

  private _goalsCache: Goal[] | null = null;
  private _goalsStamp: string | null = null;
  private _itemsCache = new Map<string, [string, GoalItem[]]>();
  private _logs = new MtimeCache<any>();

  constructor(
    vaultRoot: string,
    habitMgr: HabitManager | null = null,
    areaMgr: AreaManager | null = null,
  ) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.goals_dir);
    this.habitMgr = habitMgr;
    this.areaMgr = areaMgr;
  }

  // ── Paths ─────────────────────────────────────────────────────────────

  goal_path(gid: string): string {
    return path.join(this.vaultRoot, LAYOUT.goal.replace("{id}", gid));
  }
  goalPath(gid: string): string {
    return this.goal_path(gid);
  }

  items_dir(gid: string): string {
    return path.join(this.vaultRoot, LAYOUT.goal_items_dir.replace("{id}", gid));
  }
  itemsDir(gid: string): string {
    return this.items_dir(gid);
  }

  item_path(gid: string, iid: string): string {
    return path.join(
      this.vaultRoot,
      LAYOUT.goal_item.replace("{goal}", gid).replace("{id}", iid),
    );
  }
  itemPath(gid: string, iid: string): string {
    return this.item_path(gid, iid);
  }

  log_path(d: Date): string {
    const iso = todayIso(d);
    return path.join(
      this.vaultRoot,
      formatLayout(LAYOUT.goal_log_day, {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        date: iso,
      }),
    );
  }
  logPath(d: Date): string {
    return this.log_path(d);
  }

  // ── Goals ─────────────────────────────────────────────────────────────

  private _stampGoals(): string {
    if (!fs.existsSync(this.dir)) return "";
    try {
      const parts: string[] = [];
      const subdirs = fs.readdirSync(this.dir).sort();
      for (const sub of subdirs) {
        if (isSyncConflict(sub)) continue;
        const goalFile = path.join(this.dir, sub, "goal.md");
        if (fs.existsSync(goalFile)) {
          const stat = fs.statSync(goalFile);
          parts.push(`${sub}:${stat.mtimeMs}`);
        }
      }
      return parts.join("|");
    } catch {
      return "";
    }
  }

  goals(
    filterKey: string = FILTER_ALL,
    area?: string | null,
    today?: Date | null,
  ): Goal[] {
    const stamp = this._stampGoals();
    if (this._goalsCache === null || stamp !== this._goalsStamp) {
      const out: Goal[] = [];
      if (fs.existsSync(this.dir)) {
        for (const sub of fs.readdirSync(this.dir).sort()) {
          if (isSyncConflict(sub)) continue;
          const p = path.join(this.dir, sub, "goal.md");
          if (!fs.existsSync(p)) continue;
          const parsed = readDoc(p, GOAL_FIELDS);
          if (!parsed) continue;
          const [values, extra, body] = parsed;
          values.id = values.id || sub;
          out.push(new Goal(values as Record<string, any>, extra, body));
        }
      }
      this._goalsCache = out;
      this._goalsStamp = stamp;
    }

    const t = today || _today();
    let res = [...(this._goalsCache || [])];
    if (area !== undefined && area !== null && area !== "*") {
      res = res.filter((g) => g.area === area);
    }

    if (filterKey === FILTER_ACTIVE) {
      res = res.filter((g) => g.status === STATUS_ACTIVE);
    } else if (filterKey === FILTER_PAUSED) {
      res = res.filter((g) => g.status === STATUS_PAUSED);
    } else if (filterKey === FILTER_DONE) {
      res = res.filter((g) => g.status === STATUS_DONE);
    } else if (filterKey === FILTER_OVERDUE) {
      res = res.filter((g) => g.is_overdue(t));
    } else if (filterKey === FILTER_ARCHIVED) {
      res = res.filter((g) => g.status === STATUS_ARCHIVED);
    } else if (filterKey === FILTER_ALL) {
      res = res.filter((g) => g.status !== STATUS_ARCHIVED);
    }

    res.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // higher priority first
      }
      const endA = a.end ? a.end.getTime() : Infinity;
      const endB = b.end ? b.end.getTime() : Infinity;
      if (endA !== endB) {
        return endA - endB;
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return res;
  }

  get_goal(gid: string): Goal | null {
    return this._all_goals().find((g) => g.id === gid) || null;
  }
  getGoal(gid: string): Goal | null {
    return this.get_goal(gid);
  }

  private _all_goals(): Goal[] {
    this.goals(FILTER_ALL);
    return [...(this._goalsCache || [])];
  }

  save_goal(goal: Goal): void {
    const doc = dumpDoc(
      GOAL_FIELDS,
      goal.values(),
      goal.extra,
      goal.description,
    );
    writeText(this.goal_path(goal.id), doc);
    this._goalsCache = null;
  }
  saveGoal(goal: Goal): void {
    this.save_goal(goal);
  }

  create_goal(name: string, fields: Record<string, any> = {}): Goal {
    const today = _today();
    const goal = new Goal({
      id: newId("g"),
      name: name.trim() || "Nueva meta",
      status: STATUS_ACTIVE,
      priority: 2,
      start: today,
      created: today,
      in_overview: true,
    });
    this._apply(goal, fields, GOAL_FIELDS, "description");
    this.save_goal(goal);
    return goal;
  }
  createGoal(name: string, fields: Record<string, any> = {}): Goal {
    return this.create_goal(name, fields);
  }

  update_goal(gid: string, fields: Record<string, any> = {}): Goal | null {
    const goal = this.get_goal(gid);
    if (!goal) return null;
    this._apply(goal, fields, GOAL_FIELDS, "description");
    this.save_goal(goal);
    return goal;
  }
  updateGoal(gid: string, fields: Record<string, any> = {}): Goal | null {
    return this.update_goal(gid, fields);
  }

  delete_goal(gid: string): void {
    const folder = path.dirname(this.goal_path(gid));
    toTrash(this.vaultRoot, folder, "metas");
    this._goalsCache = null;
    this._itemsCache.delete(gid);
  }
  deleteGoal(gid: string): void {
    this.delete_goal(gid);
  }

  private _apply(
    obj: any,
    fields: Record<string, any>,
    contract: readonly (readonly [string, any])[],
    textKey: string,
  ): void {
    const keys = new Set(contract.map(([k]) => k).filter((k) => k !== "id"));
    for (const [k, v] of Object.entries(fields)) {
      if (keys.has(k)) {
        let val = v;
        if (k === "priority" && val !== null && val !== undefined) {
          val = Math.max(1, Math.min(4, cleanInt(val, 2)));
        } else if (k === "repeat") {
          val = Recurrence.parse(val).toString();
        } else if (k === "habit_links") {
          val = Array.isArray(val) ? val.map(String) : splitList(val);
        } else if (k === "topic_links") {
          val = normalizeTopicLinks(val);
        } else if (k === "practice_links") {
          val = normalizePracticeLinks(val);
        } else if (k === "start" || k === "end" || k === "due" || k === "repeat_until" || k === "done_at" || k === "created") {
          val = val ? parseIsoDate(val) : null;
        }
        obj[k] = val;
      } else if (k === textKey) {
        if (textKey === "description") {
          obj.description = v || "";
        } else {
          obj.notes = v || "";
        }
      } else if (k === "category") {
        obj.category = v;
      } else if (k === "is_priority") {
        obj.is_priority = v;
      } else if (k === "extra") {
        obj.extra = { ...obj.extra, ...(v || {}) };
      }
    }
  }

  // ── Items ─────────────────────────────────────────────────────────────

  private _stampItems(folder: string): string {
    if (!fs.existsSync(folder)) return "";
    try {
      const parts: string[] = [];
      const files = fs.readdirSync(folder).sort();
      for (const f of files) {
        if (!f.endsWith(".md") || isSyncConflict(f)) continue;
        const p = path.join(folder, f);
        const stat = fs.statSync(p);
        parts.push(`${f}:${stat.mtimeMs}`);
      }
      return parts.join("|");
    } catch {
      return "";
    }
  }

  items(gid: string): GoalItem[] {
    const folder = this.items_dir(gid);
    const stamp = this._stampItems(folder);
    const hit = this._itemsCache.get(gid);
    if (!hit || hit[0] !== stamp) {
      const itemsList: GoalItem[] = [];
      if (fs.existsSync(folder)) {
        for (const file of fs.readdirSync(folder).sort()) {
          if (!file.endsWith(".md") || isSyncConflict(file)) continue;
          const p = path.join(folder, file);
          const parsed = readDoc(p, GOAL_ITEM_FIELDS);
          if (!parsed) continue;
          const [values, extra, body] = parsed;
          values.id = values.id || path.parse(file).name;
          values.goal = gid;
          itemsList.push(new GoalItem(values as Record<string, any>, extra, body));
        }
      }
      this._link(itemsList);
      this._itemsCache.set(gid, [stamp, itemsList]);
      return [...itemsList];
    }
    return [...hit[1]];
  }

  private _link(items: GoalItem[]): void {
    const byId = new Map<string, GoalItem>();
    for (const i of items) {
      byId.set(i.id, i);
      i.children = [];
    }
    for (const i of items) {
      const parent = byId.get(i.parent);
      if (parent && parent !== i && !GoalManager._isAncestor(i, parent, byId)) {
        parent.children.push(i);
      } else if (i.parent) {
        i.parent = ""; // orphan or cycle: shown at the top level
      }
    }
    for (const i of items) {
      i.children.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    }
  }

  private static _isAncestor(
    item: GoalItem,
    candidate: GoalItem | null,
    byId: Map<string, GoalItem>,
  ): boolean {
    const seen = new Set<string>();
    let cur = candidate;
    while (cur && !seen.has(cur.id)) {
      if (cur.id === item.id) return true;
      seen.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) || null : null;
    }
    return false;
  }

  tree(gid: string): GoalItem[] {
    return this.items(gid)
      .filter((i) => !i.parent)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
  }

  get_item(gid: string, iid: string): GoalItem | null {
    return this.items(gid).find((i) => i.id === iid) || null;
  }
  getItem(gid: string, iid: string): GoalItem | null {
    return this.get_item(gid, iid);
  }

  save_item(item: GoalItem): void {
    const doc = dumpDoc(
      GOAL_ITEM_FIELDS,
      item.values(),
      item.extra,
      item.notes,
    );
    writeText(this.item_path(item.goal, item.id), doc);
    this._itemsCache.delete(item.goal);
  }
  saveItem(item: GoalItem): void {
    this.save_item(item);
  }

  create_item(
    gid: string,
    name: string,
    parent: string = "",
    fields: Record<string, any> = {},
  ): GoalItem {
    const siblings = this.items(gid).filter((i) => i.parent === (parent || ""));
    const maxOrder = siblings.length
      ? Math.max(...siblings.map((s) => s.order))
      : 0;
    const order = maxOrder + 1;
    const item = new GoalItem({
      id: newId("i"),
      goal: gid,
      parent: parent || "",
      name: name.trim() || "Nueva submeta",
      status: ITEM_TODO,
      priority: 2,
      order,
      created: _today(),
    });
    this._apply(item, fields, GOAL_ITEM_FIELDS, "notes");
    this.save_item(item);
    return item;
  }
  createItem(
    gid: string,
    name: string,
    parent: string = "",
    fields: Record<string, any> = {},
  ): GoalItem {
    return this.create_item(gid, name, parent, fields);
  }

  update_item(
    gid: string,
    iid: string,
    fields: Record<string, any> = {},
  ): GoalItem | null {
    const item = this.get_item(gid, iid);
    if (!item) return null;
    this._apply(item, fields, GOAL_ITEM_FIELDS, "notes");
    if (item.status === ITEM_DONE && !item.done_at && !item.repeating) {
      item.done_at = _today();
    }
    if (item.status !== ITEM_DONE) {
      item.done_at = null;
    }
    this.save_item(item);
    return item;
  }
  updateItem(
    gid: string,
    iid: string,
    fields: Record<string, any> = {},
  ): GoalItem | null {
    return this.update_item(gid, iid, fields);
  }

  move_item(
    gid: string,
    iid: string,
    newParent: string | null,
    index: number,
  ): void {
    const items = this.items(gid);
    const byId = new Map(items.map((i) => [i.id, i]));
    const item = byId.get(iid);
    if (!item) return;

    const targetParent = newParent || "";
    if (
      targetParent &&
      (targetParent === iid ||
        GoalManager._isAncestor(item, byId.get(targetParent) || null, byId))
    ) {
      return; // cannot move a node inside its own subtree
    }

    const siblings = items
      .filter((i) => i.parent === targetParent && i.id !== iid)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

    const safeIndex = Math.max(0, Math.min(index, siblings.length));
    const before = safeIndex > 0 ? siblings[safeIndex - 1]!.order : null;
    const after =
      safeIndex < siblings.length ? siblings[safeIndex]!.order : null;

    let order: number;
    if (before === null && after === null) {
      order = 1;
    } else if (before === null) {
      order = after! - 1;
    } else if (after === null) {
      order = before + 1;
    } else {
      order = (before + after) / 2;
    }

    if (before !== null && after !== null && !(before < order && order < after)) {
      const reordered = [
        ...siblings.slice(0, safeIndex),
        item,
        ...siblings.slice(safeIndex),
      ];
      for (let n = 0; n < reordered.length; n++) {
        const s = reordered[n]!;
        if (s !== item && s.order !== n + 1) {
          s.order = n + 1;
          this.save_item(s);
        }
      }
      order = safeIndex + 1;
    }

    item.parent = targetParent;
    item.order = Number.isInteger(order) ? order : Math.round(order * 1000000) / 1000000;
    this.save_item(item);
  }
  moveItem(gid: string, iid: string, newParent: string | null, index: number): void {
    this.move_item(gid, iid, newParent, index);
  }

  indent(gid: string, iid: string, direction: number): void {
    const items = this.items(gid);
    const byId = new Map(items.map((i) => [i.id, i]));
    const item = byId.get(iid);
    if (!item) return;

    const siblings = items
      .filter((i) => i.parent === item.parent)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    const pos = siblings.findIndex((s) => s.id === item.id);
    if (pos < 0) return;

    if (direction > 0) {
      if (pos === 0) return;
      const newParent = siblings[pos - 1]!;
      this.move_item(gid, iid, newParent.id, newParent.children.length);
    } else {
      if (!item.parent) return;
      const parent = byId.get(item.parent);
      if (!parent) return;
      const grand = items
        .filter((i) => i.parent === parent.parent)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
      const grandPos = grand.findIndex((g) => g.id === parent.id);
      this.move_item(gid, iid, parent.parent, grandPos + 1);
    }
  }

  descendants(item: GoalItem): GoalItem[] {
    const current =
      item && item.goal ? this.get_item(item.goal, item.id) || item : item;
    const out: GoalItem[] = [];
    const stack = [...(current.children || [])];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      stack.push(...cur.children);
    }
    return out;
  }

  delete_item(gid: string, iid: string): void {
    const item = this.get_item(gid, iid);
    if (!item) return;
    for (const node of [item, ...this.descendants(item)]) {
      toTrash(this.vaultRoot, this.item_path(gid, node.id), `metas/${gid}`);
    }
    this._itemsCache.delete(gid);
  }
  deleteItem(gid: string, iid: string): void {
    this.delete_item(gid, iid);
  }

  // ── Promover / convertir / mover entre metas ───────────────────────────

  /**
   * Copia `items` (un subárbol) a la meta `dstGid` conservando ids (salvo choque), orden y todos sus campos, y
   * borra los originales. Los que no tienen su padre dentro del conjunto cuelgan de `rootParent`. Las marcas del
   * registro (`goal/item`) y las procedencias de hábito se renombran para no perder rachas.
   */
  private _transfer(srcGid: string, items: GoalItem[], dstGid: string, rootParent: string): GoalItem[] {
    const inSet = new Set(items.map((i) => i.id));
    const taken = new Set(this.items(dstGid).map((i) => i.id));
    const idMap = new Map<string, string>();
    for (const i of items) {
      let nid = i.id;
      while (taken.has(nid)) nid = newId("i");
      taken.add(nid);
      idMap.set(i.id, nid);
    }
    const siblings = this.items(dstGid).filter((i) => i.parent === rootParent);
    let next = siblings.length ? Math.max(...siblings.map((s) => s.order)) : 0;
    const roots = items.filter((i) => !inSet.has(i.parent)).sort((a, b) => a.order - b.order);
    const rootOrder = new Map(roots.map((r) => [r.id, ++next]));
    const moved: GoalItem[] = [];
    for (const i of items) {
      const copy = new GoalItem(
        {
          ...i.values(),
          id: idMap.get(i.id),
          goal: dstGid,
          parent: inSet.has(i.parent) ? idMap.get(i.parent) : rootParent,
          order: rootOrder.get(i.id) ?? i.order,
        },
        i.extra,
        i.notes,
      );
      this.save_item(copy);
      moved.push(copy);
    }
    for (const i of items) {
      fs.rmSync(this.item_path(srcGid, i.id), { force: true });
    }
    this._itemsCache.delete(srcGid);
    this._itemsCache.delete(dstGid);
    this._renameLogKeys(new Map(items.map((i) => [`${srcGid}/${i.id}`, `${dstGid}/${idMap.get(i.id)}`])));
    return moved;
  }

  private _renameLogKeys(map: Map<string, string>): void {
    const root = path.join(this.dir, LOG_BUCKET);
    if (!map.size || !fs.existsSync(root)) return;
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
          continue;
        }
        if (!e.name.endsWith(".json") || isSyncConflict(e.name)) continue;
        const data = loadJson<Record<string, any>>(full);
        if (!data || typeof data !== "object") continue;
        let changed = false;
        if (data.items && typeof data.items === "object") {
          for (const [k, v] of Object.entries<any>(data.items)) {
            const to = map.get(k);
            if (to) {
              data.items[to] = v;
              delete data.items[k];
              changed = true;
            }
          }
        }
        if (data.habit_marks && typeof data.habit_marks === "object") {
          for (const [h, list] of Object.entries<any>(data.habit_marks)) {
            if (!Array.isArray(list)) continue;
            const mapped = list.map((k) => map.get(String(k)) ?? k);
            if (mapped.some((k, n) => k !== list[n])) {
              data.habit_marks[h] = mapped;
              changed = true;
            }
          }
        }
        if (changed) {
          writeJson(full, data);
          this._logs.forget(full);
        }
      }
    };
    walk(root);
  }

  /**
   * «Promover a meta»: la submeta pasa a ser una meta principal (hereda área, icono y color de la meta que la
   * contenía; prioridad, fechas, notas y carpeta/notas vinculadas son suyas). Sus submetas hijas pasan a ser las de
   * primer nivel de la meta nueva, con el mismo árbol. Si la submeta tenía datos propios que una meta no tiene
   * (enlaces a temas/hábitos/práctica, repetición o medida), se conserva como única submeta raíz para no
   * perderlos ni cambiar el avance.
   */
  promote_item(gid: string, iid: string): Goal | null {
    const goal = this.get_goal(gid);
    const item = this.get_item(gid, iid);
    if (!goal || !item) return null;
    const subtree = [item, ...this.descendants(item)];
    const keepsItself =
      item.topic_links.length > 0 || item.habit_links.length > 0 || item.practice_links.length > 0 || item.repeating || item.measurable;
    const linked: Record<string, any> = {};
    for (const k of ["linked_folder", "linked_notes"]) if (item.extra[k] !== undefined) linked[k] = item.extra[k];
    const fresh = this.create_goal(item.name, {
      area: goal.area,
      icon: goal.icon,
      colour: goal.colour,
      priority: item.priority,
      in_overview: goal.in_overview,
      status: item.is_leaf && item.status === ITEM_DONE ? STATUS_DONE : STATUS_ACTIVE,
      description: item.notes,
      ...(item.start ? { start: item.start } : {}),
      ...(item.due ? { end: item.due } : {}),
      ...(Object.keys(linked).length ? { extra: linked } : {}),
    });
    const moving = keepsItself ? subtree : subtree.slice(1);
    if (moving.length) this._transfer(gid, moving, fresh.id, "");
    if (!keepsItself) {
      toTrash(this.vaultRoot, this.item_path(gid, item.id), `metas/${gid}`);
      this._itemsCache.delete(gid);
    }
    return fresh;
  }
  promoteItem(gid: string, iid: string): Goal | null {
    return this.promote_item(gid, iid);
  }

  /**
   * «Convertir en submeta de…»: la meta principal pasa a ser una submeta de otra meta (bajo `parentIid` o en la
   * raíz). Sus submetas cuelgan de la nueva con el mismo árbol. Área, icono y color de la meta se pierden (la
   * submeta hereda los de su meta); la meta se envía a la papelera.
   */
  demote_goal(srcGid: string, dstGid: string, parentIid = ""): GoalItem | null {
    const src = this.get_goal(srcGid);
    const dst = this.get_goal(dstGid);
    if (!src || !dst || src.id === dst.id) return null;
    if (parentIid && !this.get_item(dstGid, parentIid)) return null;
    const own = this.items(srcGid);
    const linked: Record<string, any> = {};
    for (const k of ["linked_folder", "linked_notes"]) if (src.extra[k] !== undefined) linked[k] = src.extra[k];
    const item = this.create_item(dstGid, src.name, parentIid, {
      priority: src.priority,
      status: src.status === STATUS_DONE ? ITEM_DONE : ITEM_TODO,
      notes: src.description,
      ...(src.start ? { start: src.start } : {}),
      ...(src.end ? { due: src.end } : {}),
      ...(Object.keys(linked).length ? { extra: linked } : {}),
    });
    if (own.length) this._transfer(srcGid, own, dstGid, item.id);
    this.delete_goal(srcGid);
    return this.get_item(dstGid, item.id);
  }
  demoteGoal(srcGid: string, dstGid: string, parentIid = ""): GoalItem | null {
    return this.demote_goal(srcGid, dstGid, parentIid);
  }

  /** Mueve una submeta (con su subárbol) a otra meta, bajo `parentIid` o en la raíz. Devuelve la submeta movida. */
  move_item_to_goal(srcGid: string, iid: string, dstGid: string, parentIid = ""): GoalItem | null {
    const item = this.get_item(srcGid, iid);
    if (!item || !this.get_goal(dstGid)) return null;
    if (srcGid === dstGid) {
      this.move_item(srcGid, iid, parentIid, 1e6);
      return this.get_item(srcGid, iid);
    }
    if (parentIid && !this.get_item(dstGid, parentIid)) return null;
    const moved = this._transfer(srcGid, [item, ...this.descendants(item)], dstGid, parentIid);
    return moved[0] ?? null;
  }
  moveItemToGoal(srcGid: string, iid: string, dstGid: string, parentIid = ""): GoalItem | null {
    return this.move_item_to_goal(srcGid, iid, dstGid, parentIid);
  }

  // ── Registro ──────────────────────────────────────────────────────────

  log(d: Date): { items: Record<string, any>; habit_marks: Record<string, string[]> } {
    const load = (filePath: string | null) => {
      const data = (filePath ? loadJson<Record<string, any>>(filePath) : null) || {};
      const itemsRaw = data && typeof data.items === "object" ? data.items : {};
      const marksRaw =
        data && typeof data.habit_marks === "object" ? data.habit_marks : {};
      const marks: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(marksRaw)) {
        if (Array.isArray(v)) {
          marks[k] = v.map(String);
        }
      }
      return { items: itemsRaw, habit_marks: marks };
    };

    const filePath = this.log_path(d);
    const cached = this._logs.get(filePath, load);
    const itemsCopy: Record<string, any> = {};
    for (const [k, v] of Object.entries(cached.items)) {
      if (v && typeof v === "object") {
        itemsCopy[k] = { ...v };
      }
    }
    const marksCopy: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(cached.habit_marks)) {
      marksCopy[k] = [...(v as string[])];
    }
    return { items: itemsCopy, habit_marks: marksCopy };
  }

  private _saveLog(
    d: Date,
    data: { items: Record<string, any>; habit_marks: Record<string, string[]> },
  ): void {
    const filePath = this.log_path(d);
    const items: Record<string, any> = {};
    for (const k of Object.keys(data.items).sort()) {
      const e = data.items[k];
      const entry: Record<string, any> = {};
      for (const key of ["done", "value", "at"]) {
        if (key in e) {
          entry[key] = e[key];
        }
      }
      for (const [key, v] of Object.entries(e)) {
        if (!(key in entry)) {
          entry[key] = v;
        }
      }
      items[k] = entry;
    }

    const marks: Record<string, string[]> = {};
    for (const k of Object.keys(data.habit_marks).sort()) {
      const v = data.habit_marks[k];
      if (v && v.length) {
        marks[k] = [...v].sort();
      }
    }

    if (Object.keys(items).length === 0 && Object.keys(marks).length === 0) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this._logs.forget(filePath);
      return;
    }

    writeJson(filePath, { items, habit_marks: marks });
    this._logs.forget(filePath);
  }

  entry(item: GoalItem, d: Date): Record<string, any> {
    return this.log(d).items[item.key] || {};
  }

  /** Cumplimiento calculado de una submeta con `topic_links`; null si no aplica. */
  topic_progress(item: GoalItem): TopicLinkProgress | null {
    if (!this.topicLookup || !item.topic_links.length) return null;
    return topicLinkProgress(item.topic_links, this.topicLookup);
  }
  topicProgress(item: GoalItem): TopicLinkProgress | null {
    return this.topic_progress(item);
  }

  /** Cumplimiento calculado de una submeta con `practice_links`; null si no aplica. */
  practice_progress(item: GoalItem, today?: Date | null): PracticeLinkProgress | null {
    if (!this.practiceLookup || !item.practice_links.length) return null;
    const p = practiceLinkProgress(item.practice_links, this.practiceLookup, today || _today());
    return p.links.length ? p : null;
  }
  practiceProgress(item: GoalItem, today?: Date | null): PracticeLinkProgress | null {
    return this.practice_progress(item, today);
  }

  /**
   * Avance derivado de TODOS los enlaces de la submeta (temas + práctica); null si no tiene enlaces
   * evaluables. Regla: cada enlace pesa lo mismo (ver `combineLinkProgress`).
   */
  linked_progress(item: GoalItem, today?: Date | null): { pct: number; done: boolean } | null {
    return combineLinkProgress(this.topic_progress(item), this.practice_progress(item, today));
  }
  linkedProgress(item: GoalItem, today?: Date | null): { pct: number; done: boolean } | null {
    return this.linked_progress(item, today);
  }

  is_done_on(item: GoalItem, d: Date): boolean {
    // Una submeta enlazada a temas o a práctica se cumple sola: no se marca a mano (ni repite).
    // Una RAMA con enlaces propios sigue el criterio de `branch_done` (hijas + enlaces).
    if (item.is_leaf) {
      const lp = this.linked_progress(item);
      if (lp) return lp.done;
    }
    if (item.repeating) {
      const e = this.entry(item, d);
      if (item.measurable && typeof e.value === "number") {
        return e.value >= (item.target || 0);
      }
      return Boolean(e.done);
    }
    if (item.measurable && typeof item.value === "number") {
      return item.value >= (item.target || 0) || item.status === ITEM_DONE;
    }
    return item.status === ITEM_DONE;
  }
  isDoneOn(item: GoalItem, d: Date): boolean {
    return this.is_done_on(item, d);
  }

  value_on(item: GoalItem, d: Date): number | null {
    if (item.repeating) {
      const val = this.entry(item, d).value;
      return typeof val === "number" ? val : null;
    }
    return item.value;
  }
  valueOn(item: GoalItem, d: Date): number | null {
    return this.value_on(item, d);
  }

  branch_done(item: GoalItem, d?: Date | null): boolean {
    if (item.is_leaf) {
      return this.is_done_on(item, d || _today());
    }
    const own = this.linked_progress(item);
    return item.children.every((c) => this.branch_done(c, d)) && (own ? own.done : true);
  }
  branchDone(item: GoalItem, d?: Date | null): boolean {
    return this.branch_done(item, d);
  }

  set_done(
    gidOrItem: string | GoalItem,
    iidOrD?: any,
    dOrDone?: any,
    doneOrVal?: any,
    valOrAt?: any,
    atArg?: any,
  ): GoalItem | null {
    let gid: string;
    let iid: string;
    let d: Date;
    let done: boolean | null;
    let value: number | null;
    let at: string | null;

    if (gidOrItem instanceof GoalItem) {
      const itemObj = gidOrItem;
      gid = itemObj.goal;
      iid = itemObj.id;
      d = iidOrD instanceof Date ? iidOrD : _today();
      done = typeof dOrDone === "boolean" ? dOrDone : null;
      value = typeof doneOrVal === "number" ? doneOrVal : null;
      at = typeof valOrAt === "string" ? valOrAt : null;
    } else {
      gid = gidOrItem;
      iid = String(iidOrD);
      d = dOrDone instanceof Date ? dOrDone : _today();
      done = typeof doneOrVal === "boolean" ? doneOrVal : null;
      value = typeof valOrAt === "number" ? valOrAt : null;
      at = typeof atArg === "string" ? atArg : null;
    }

    const item = this.get_item(gid, iid);
    if (!item) return null;

    if (!item.is_leaf) {
      for (const desc of this.descendants(item)) {
        if (desc.is_leaf) {
          this.set_done(gid, desc.id, d, done, value, at);
        }
      }
      item.status = done ? ITEM_DONE : ITEM_TODO;
      item.done_at = done ? d : null;
      this.save_item(item);
      return item;
    }

    if (item.measurable && value !== null && value !== undefined) {
      done = value >= (item.target || 0);
    }

    if (item.repeating) {
      const data = this.log(d);
      if (done || (value !== null && value !== undefined)) {
        const entry = data.items[item.key] || {};
        entry.done = Boolean(done);
        if (value !== null && value !== undefined) {
          entry.value = value;
        }
        entry.at = at || formatDate(new Date(), "%H:%M");
        data.items[item.key] = entry;
      } else {
        delete data.items[item.key];
      }
      this._saveLog(d, data);
    } else {
      if (value !== null && value !== undefined) {
        item.value = value;
      }
      item.status = done ? ITEM_DONE : value ? ITEM_DOING : ITEM_TODO;
      item.done_at = done ? d : null;
      this.save_item(item);
    }

    this._syncHabits(item, d, Boolean(done));
    return item;
  }
  setDone(
    gidOrItem: string | GoalItem,
    iidOrD?: any,
    dOrDone?: any,
    doneOrVal?: any,
    valOrAt?: any,
    atArg?: any,
  ): GoalItem | null {
    return this.set_done(gidOrItem, iidOrD, dOrDone, doneOrVal, valOrAt, atArg);
  }

  private _syncHabits(item: GoalItem, d: Date, done: boolean): void {
    if (!this.habitMgr || !item.habit_links || !item.habit_links.length) {
      return;
    }
    const data = this.log(d);
    const marks = data.habit_marks;
    const day = this.habitMgr.getDay(d);
    let changedDay = false;

    for (const hid of item.habit_links) {
      const habit = this.habitMgr.getHabit(hid);
      if (!habit || !habitActiveOn(habit, d)) {
        continue;
      }
      let sources = marks[hid] || [];
      const ticked = Boolean(day.completed[hid]);

      if (done) {
        if (!ticked) {
          day.completed[hid] = true;
          changedDay = true;
          sources = [item.key];
        } else if (sources.length && !sources.includes(item.key)) {
          sources.push(item.key);
        }
      } else {
        if (sources.includes(item.key)) {
          sources = sources.filter((s) => s !== item.key);
          if (sources.length === 0 && ticked) {
            day.completed[hid] = false;
            changedDay = true;
          }
        }
      }
      marks[hid] = sources;
    }

    if (changedDay) {
      this.habitMgr.saveDay(day);
    }
    this._saveLog(d, data);
  }

  // ── Queries ───────────────────────────────────────────────────────────

  leaves(gid: string): GoalItem[] {
    return this.items(gid).filter((i) => i.is_leaf);
  }

  items_due_on(d: Date, goals?: Goal[] | null): Array<[Goal, GoalItem]> {
    const today = _today();
    const out: Array<[Goal, GoalItem]> = [];
    const targetGoals = goals !== undefined && goals !== null ? goals : this.goals(FILTER_ACTIVE);

    for (const goal of targetGoals) {
      for (const item of this.leaves(goal.id)) {
        if (item.repeating) {
          if (item.occurs_on(d, goal)) {
            out.push([goal, item]);
          }
        } else if (
          (item.due &&
            item.due.getFullYear() === d.getFullYear() &&
            item.due.getMonth() === d.getMonth() &&
            item.due.getDate() === d.getDate()) ||
          (d.getTime() === today.getTime() &&
            item.due &&
            item.due.getTime() < today.getTime() &&
            item.status !== ITEM_DONE)
        ) {
          out.push([goal, item]);
        }
      }
    }

    out.sort((a, b) => {
      const timeA = a[1].due_time || "99";
      const timeB = b[1].due_time || "99";
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      if (a[1].priority !== b[1].priority) return b[1].priority - a[1].priority;
      return a[1].name.toLowerCase().localeCompare(b[1].name.toLowerCase());
    });
    return out;
  }
  itemsDueOn(d: Date, goals?: Goal[] | null): Array<[Goal, GoalItem]> {
    return this.items_due_on(d, goals);
  }

  scheduled_days(item: GoalItem, goal: Goal, last: Date): Date[] {
    const anchor = item.anchor(goal);
    if (!anchor) return [];
    const until = item.until(goal);
    const stop = until && until.getTime() < last.getTime() ? until : last;

    const out: Date[] = [];
    let d = new Date(anchor);
    const rule = item.rule;
    while (d.getTime() <= stop.getTime()) {
      if (rule.occursOn(d, anchor, until)) {
        out.push(new Date(d));
      }
      d = addDays(d, 1);
    }
    return out;
  }
  scheduledDays(item: GoalItem, goal: Goal, last: Date): Date[] {
    return this.scheduled_days(item, goal, last);
  }

  item_progress(
    item: GoalItem,
    goal: Goal,
    today?: Date | null,
  ): number {
    const t = today || _today();
    const current =
      item && item.goal ? this.get_item(item.goal, item.id) || item : item;

    if (!current.is_leaf) {
      if (!current.children.length) return 0.0;
      // Los enlaces propios de una rama (temas/práctica) cuentan como un miembro más de la media.
      const own = this.linked_progress(current, t);
      const sum = current.children.reduce(
        (acc, c) => acc + this.item_progress(c, goal, t),
        own ? own.pct / 100 : 0,
      );
      return sum / (current.children.length + (own ? 1 : 0));
    }

    const lp = this.linked_progress(current, t);
    if (lp) return lp.pct / 100;

    if (current.repeating) {
      const days = this.scheduled_days(current, goal, t);
      if (!days.length) return 0.0;
      const doneCount = days.filter((d) => this.is_done_on(current, d)).length;
      return doneCount / days.length;
    }

    if (this.is_done_on(current, t)) {
      return 1.0;
    }
    if (current.measurable && typeof current.value === "number") {
      return Math.max(0.0, Math.min(1.0, current.value / (current.target || 1)));
    }
    return 0.0;
  }
  itemProgress(item: GoalItem, goal: Goal, today?: Date | null): number {
    return this.item_progress(item, goal, today);
  }

  progress(goal: Goal, today?: Date | null): number {
    const roots = this.tree(goal.id);
    if (!roots.length) {
      return goal.status === STATUS_DONE ? 1.0 : 0.0;
    }
    const sum = roots.reduce((acc, r) => acc + this.item_progress(r, goal, today), 0);
    return sum / roots.length;
  }

  counts(goal: Goal, today?: Date | null): [number, number] {
    const t = today || _today();
    const leafItems = this.leaves(goal.id);
    let done = 0;
    for (const item of leafItems) {
      if (item.repeating) {
        if (
          (item.occurs_on(t, goal) && this.is_done_on(item, t)) ||
          this.item_progress(item, goal, t) >= 1.0
        ) {
          done += 1;
        }
      } else if (this.is_done_on(item, t)) {
        done += 1;
      }
    }
    return [done, leafItems.length];
  }

  item_leaves(item: GoalItem): GoalItem[] {
    const current =
      item && item.goal ? this.get_item(item.goal, item.id) || item : item;
    if (current.is_leaf) return [current];
    return this.descendants(current).filter((i) => i.is_leaf);
  }
  itemLeaves(item: GoalItem): GoalItem[] {
    return this.item_leaves(item);
  }

  item_counts(
    item: GoalItem,
    goal: Goal,
    today?: Date | null,
  ): [number, number] {
    const t = today || _today();
    const current =
      item && item.goal ? this.get_item(item.goal, item.id) || item : item;
    let leafItems = this.descendants(current).filter((i) => i.is_leaf);
    if (!leafItems.length) {
      leafItems = [current];
    }
    let done = 0;
    for (const leaf of leafItems) {
      if (leaf.repeating) {
        if (
          (leaf.occurs_on(t, goal) && this.is_done_on(leaf, t)) ||
          this.item_progress(leaf, goal, t) >= 1.0
        ) {
          done += 1;
        }
      } else if (this.is_done_on(leaf, t)) {
        done += 1;
      }
    }
    return [done, leafItems.length];
  }
  itemCounts(item: GoalItem, goal: Goal, today?: Date | null): [number, number] {
    return this.item_counts(item, goal, today);
  }

  item_adherence(
    item: GoalItem,
    goal: Goal,
    days = 7,
    today?: Date | null,
  ): number | null {
    const t = today || _today();
    const first = addDays(t, -(days - 1));
    let scheduled = 0;
    let done = 0;
    let leafItems = this.descendants(item).filter((i) => i.is_leaf);
    if (!leafItems.length) {
      leafItems = [item];
    }
    for (const leaf of leafItems) {
      if (!leaf.repeating) continue;
      for (const d of this.scheduled_days(leaf, goal, t)) {
        if (d.getTime() >= first.getTime()) {
          scheduled += 1;
          if (this.is_done_on(leaf, d)) {
            done += 1;
          }
        }
      }
    }
    return scheduled ? done / scheduled : null;
  }
  itemAdherence(item: GoalItem, goal: Goal, days = 7, today?: Date | null): number | null {
    return this.item_adherence(item, goal, days, today);
  }

  categories(gid: string): string[] {
    const cats = new Set<string>();
    for (const item of this.items(gid)) {
      if (item.category) {
        cats.add(item.category);
      }
    }
    return Array.from(cats).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  streak(item: GoalItem, goal: Goal, today?: Date | null): number {
    const t = today || _today();
    let daysList = this.scheduled_days(item, goal, t);
    if (!daysList.length) return 0;
    if (
      daysList[daysList.length - 1]!.getTime() === t.getTime() &&
      !this.is_done_on(item, t)
    ) {
      daysList = daysList.slice(0, -1);
    }
    let n = 0;
    for (let i = daysList.length - 1; i >= 0; i--) {
      if (!this.is_done_on(item, daysList[i]!)) break;
      n += 1;
    }
    return n;
  }

  adherence(
    goal: Goal,
    days = 7,
    today?: Date | null,
  ): number | null {
    const t = today || _today();
    const first = addDays(t, -(days - 1));
    let scheduled = 0;
    let done = 0;
    for (const item of this.leaves(goal.id)) {
      if (!item.repeating) continue;
      for (const d of this.scheduled_days(item, goal, t)) {
        if (d.getTime() >= first.getTime()) {
          scheduled += 1;
          if (this.is_done_on(item, d)) {
            done += 1;
          }
        }
      }
    }
    return scheduled ? done / scheduled : null;
  }

  completed_on(goal: Goal, d: Date): number {
    let n = 0;
    for (const item of this.leaves(goal.id)) {
      if (item.repeating) {
        if (item.occurs_on(d, goal) && this.is_done_on(item, d)) {
          n += 1;
        }
      } else if (
        item.done_at &&
        item.done_at.getFullYear() === d.getFullYear() &&
        item.done_at.getMonth() === d.getMonth() &&
        item.done_at.getDate() === d.getDate()
      ) {
        n += 1;
      }
    }
    return n;
  }
  completedOn(goal: Goal, d: Date): number {
    return this.completed_on(goal, d);
  }

  daily_counts(
    goal: Goal,
    days = 14,
    today?: Date | null,
  ): number[] {
    const t = today || _today();
    const out: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(t, -(days - 1 - i));
      out.push(this.completed_on(goal, d));
    }
    return out;
  }
  dailyCounts(goal: Goal, days = 14, today?: Date | null): number[] {
    return this.daily_counts(goal, days, today);
  }

  completed_between(goal: Goal, first: Date, last: Date): number {
    let n = 0;
    let d = new Date(first);
    while (d.getTime() <= last.getTime()) {
      n += this.completed_on(goal, d);
      d = addDays(d, 1);
    }
    return n;
  }
  completedBetween(goal: Goal, first: Date, last: Date): number {
    return this.completed_between(goal, first, last);
  }

  overdue(goal: Goal, today?: Date | null): GoalItem[] {
    const t = today || _today();
    return this.leaves(goal.id).filter(
      (i) =>
        !i.repeating &&
        i.due &&
        i.due.getTime() < t.getTime() &&
        i.status !== ITEM_DONE,
    );
  }

  next_item(
    goal: Goal,
    today?: Date | null,
  ): [GoalItem, Date] | null {
    const t = today || _today();
    let best: [GoalItem, Date] | null = null;

    for (const item of this.leaves(goal.id)) {
      let d: Date | null = null;
      if (item.repeating) {
        if (item.occurs_on(t, goal) && !this.is_done_on(item, t)) {
          d = t;
        } else {
          d = item.rule.nextAfter(t, item.anchor(goal), item.until(goal));
        }
      } else if (item.status !== ITEM_DONE) {
        d = item.due;
      }

      if (d !== null && (best === null || d.getTime() < best[1].getTime())) {
        best = [item, d];
      }
    }
    return best;
  }
  nextItem(goal: Goal, today?: Date | null): [GoalItem, Date] | null {
    return this.next_item(goal, today);
  }

  history(
    goal: Goal,
    item: GoalItem,
    days = 30,
    today?: Date | null,
  ): Array<[string, number | null]> {
    const t = today || _today();
    const out: Array<[string, number | null]> = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(t, -(days - 1 - i));
      const label = formatDate(d, "%d/%m");
      if (!item.occurs_on(d, goal)) {
        out.push([label, null]);
      } else {
        out.push([label, this.is_done_on(item, d) ? 1 : 0]);
      }
    }
    return out;
  }

  area_goals(filterKey = FILTER_ALL): Array<[Record<string, any> | null, Goal[]]> {
    const goalsList = this.goals(filterKey);
    const areas = this.areaMgr ? this.areaMgr.areas() : [];
    const known = new Set(areas.map((a) => a.id));
    const out: Array<[Record<string, any> | null, Goal[]]> = [];

    for (const a of areas) {
      const group = goalsList.filter((g) => g.area === a.id);
      if (group.length) {
        out.push([a, group]);
      }
    }
    const rest = goalsList.filter((g) => !known.has(g.area));
    if (rest.length) {
      out.push([null, rest]);
    }
    return out;
  }
  areaGoals(filterKey = FILTER_ALL): Array<[Record<string, any> | null, Goal[]]> {
    return this.area_goals(filterKey);
  }
}

export class GoalCalendarSource {
  prefix = "goal:";
  manager: GoalManager;

  constructor(manager: GoalManager) {
    this.manager = manager;
  }

  occurrences(first: Date, last: Date): Record<string, Occurrence[]> {
    const out: Record<string, Occurrence[]> = {};

    for (const goal of this.manager.goals(FILTER_ALL)) {
      if (goal.status === STATUS_ARCHIVED) continue;

      if (
        goal.end &&
        first.getTime() <= goal.end.getTime() &&
        goal.end.getTime() <= last.getTime()
      ) {
        const key = todayIso(goal.end);
        out[key] = out[key] || [];
        out[key].push(
          new Occurrence({
            id: `${this.prefix}${goal.id}`,
            title: `${goal.icon} 🏁 ${goal.name}`.trim(),
            kind: "goal_item",
            date: goal.end,
            start: null,
            duration_min: null,
            colour: goal.colour || "#3f51b5",
            links: [{ type: "goal", id: goal.id }],
            done: goal.status === STATUS_DONE,
            source: "metas",
            editable: false,
          }),
        );
      }

      for (const item of this.manager.items(goal.id)) {
        if (!(item.in_calendar || (item.due && item.due_time))) {
          continue;
        }
        let d = new Date(first);
        while (d.getTime() <= last.getTime()) {
          if (item.occurs_on(d, goal)) {
            const start = item.due_time || null;
            const key = todayIso(d);
            out[key] = out[key] || [];
            out[key].push(
              new Occurrence({
                id: `${this.prefix}${goal.id}/${item.id}`,
                title: `${goal.icon} ${item.name}`.trim(),
                kind: "goal_item",
                date: new Date(d),
                start,
                duration_min: start ? item.duration_min || 60 : null,
                colour: goal.colour || "#3f51b5",
                links: [{ type: "goal", id: goal.id, item: item.id }],
                done: this.manager.is_done_on(item, d),
                source: "metas",
                editable: false,
                reminder_min: start ? item.reminder_min : null,
              }),
            );
          }
          d = addDays(d, 1);
        }
      }
    }
    return out;
  }

  setDone(d: Date, occurrenceId: string, done: boolean): void {
    const rawId = occurrenceId.slice(this.prefix.length);
    const slashIdx = rawId.indexOf("/");
    const gid = slashIdx >= 0 ? rawId.slice(0, slashIdx) : rawId;
    const iid = slashIdx >= 0 ? rawId.slice(slashIdx + 1) : "";

    if (!iid) {
      const goal = this.manager.get_goal(gid);
      if (goal) {
        this.manager.update_goal(gid, {
          status: done ? STATUS_DONE : STATUS_ACTIVE,
        });
      }
      return;
    }
    this.manager.set_done(gid, iid, d, done);
  }
  set_done(d: Date, occurrenceId: string, done: boolean): void {
    this.setDone(d, occurrenceId, done);
  }
}
