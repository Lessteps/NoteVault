import { addDays, todayIso } from "../../core/dates.js";
import { ApiError } from "../../core/errors.js";
import {
  FILTER_ACTIVE,
  FILTER_ALL,
  FILTER_ARCHIVED,
  FILTER_DONE,
  FILTER_OVERDUE,
  FILTER_PAUSED,
  Goal,
  GOAL_STATUS_COLOURS,
  GoalItem,
  GoalManager,
  ITEM_DONE,
} from "../../core/goalManager.js";
import { normalizeTopicLinks, topicLinkProgress } from "../../core/practice/topicLinks.js";
import { Recurrence } from "../../core/recurrence.js";
import {
  GOAL_ITEM_STATUSES,
  GOAL_STATUSES,
} from "../../core/vaultFormat.js";
import type { AppState } from "../appState.js";
import { topicLookupFor } from "../topicLookup.js";
import { clampInt, isoDate, oneLine, optDate, optTime } from "../common.js";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const FILTERS = [
  FILTER_ALL,
  FILTER_ACTIVE,
  FILTER_PAUSED,
  FILTER_DONE,
  FILTER_OVERDUE,
  FILTER_ARCHIVED,
] as const;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  let n: number;
  try {
    const s = String(value).replace(/,/g, ".");
    n = parseFloat(s);
  } catch {
    throw new ApiError(`Número inválido: ${value}`);
  }
  if (!Number.isFinite(n) || Number.isNaN(n) || Math.abs(n) > 1e12) {
    throw new ApiError(`Número inválido: ${value}`);
  }
  return Number.isInteger(n) ? n : Math.round(n * 10000) / 10000;
}

function links(extra: Record<string, any> = {}): [string, string[]] {
  let notes = extra.linked_notes || [];
  if (typeof notes === "string") {
    notes = [notes];
  }
  const cleanNotes = (Array.isArray(notes) ? notes : [])
    .filter((n): n is string => typeof n === "string")
    .map(String);
  return [String(extra.linked_folder || ""), cleanNotes];
}

function goalDict(g: Goal, today: Date): Record<string, any> {
  const [folder, notes] = links(g.extra || {});
  return {
    id: g.id,
    name: g.name,
    area: g.area,
    status: g.status,
    status_colour: GOAL_STATUS_COLOURS[g.status] || "#8b8b96",
    priority: g.priority,
    start: isoDate(g.start),
    end: isoDate(g.end),
    icon: g.icon,
    colour: g.colour,
    in_overview: g.in_overview,
    order: g.order,
    created: isoDate(g.created),
    description: g.description,
    overdue: g.isOverdue(today),
    days_left: g.daysLeft(today),
    linked_folder: folder,
    linked_notes: notes,
  };
}

function goalFields(fields: unknown): Record<string, any> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("Datos de meta inválidos.");
  }
  const f = fields as Record<string, any>;
  const out: Record<string, any> = {};

  if ("name" in f) {
    out.name = oneLine(f.name, 160) || "Nueva meta";
  }
  if ("icon" in f) {
    out.icon = oneLine(f.icon, 8);
  }
  if ("area" in f) {
    out.area = String(f.area || "")
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 60);
  }
  if ("status" in f) {
    if (!(GOAL_STATUSES as readonly string[]).includes(f.status)) {
      throw new ApiError("Estado inválido.");
    }
    out.status = f.status;
  }
  if ("priority" in f) {
    out.priority = clampInt(f.priority, 1, 4, 2);
  }
  for (const k of ["start", "end"]) {
    if (k in f) {
      out[k] = optDate(f[k]);
    }
  }
  if ("colour" in f) {
    const c = String(f.colour || "");
    if (!HEX_RE.test(c)) {
      throw new ApiError("Color inválido.");
    }
    out.colour = c;
  }
  if ("in_overview" in f) {
    out.in_overview = Boolean(f.in_overview);
  }
  if ("order" in f) {
    out.order = num(f.order);
  }
  if ("description" in f) {
    out.description = String(f.description || "").slice(0, 200000);
  }
  const extra: Record<string, any> = {};
  if ("linked_folder" in f) {
    extra.linked_folder = oneLine(f.linked_folder, 400);
  }
  if ("linked_notes" in f) {
    const notes = f.linked_notes || [];
    if (!Array.isArray(notes)) {
      throw new ApiError("Notas vinculadas inválidas.");
    }
    extra.linked_notes = notes
      .map((n: unknown) => oneLine(n, 400))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (Object.keys(extra).length) {
    out.extra = extra;
  }
  return out;
}

function itemFields(
  fields: unknown,
  knownHabits: Set<string>
): Record<string, any> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new ApiError("Datos de submeta inválidos.");
  }
  const f = fields as Record<string, any>;
  const out: Record<string, any> = {};

  if ("name" in f) {
    out.name = oneLine(f.name, 200) || "Nueva submeta";
  }
  if ("status" in f) {
    if (!(GOAL_ITEM_STATUSES as readonly string[]).includes(f.status)) {
      throw new ApiError("Estado inválido.");
    }
    out.status = f.status;
  }
  if ("priority" in f) {
    out.priority = clampInt(f.priority, 1, 4, 2);
  }
  if ("category" in f) {
    out.category = oneLine(f.category, 60);
  }
  if ("is_priority" in f) {
    out.is_priority = Boolean(f.is_priority);
  }
  if ("repeat" in f) {
    out.repeat = Recurrence.parse(oneLine(f.repeat, 60)).toString();
  }
  for (const k of ["start", "due", "repeat_until"]) {
    if (k in f) {
      out[k] = optDate(f[k]);
    }
  }
  if ("due_time" in f) {
    out.due_time = optTime(f.due_time) || "";
  }
  for (const k of ["duration_min", "reminder_min"]) {
    if (k in f) {
      const v = f[k];
      out[k] =
        v === null || v === undefined || v === ""
          ? null
          : clampInt(v, 0, 7 * 24 * 60, 0);
    }
  }
  if ("in_calendar" in f) {
    out.in_calendar = Boolean(f.in_calendar);
  }
  if ("target" in f) {
    const t = num(f.target);
    out.target = t !== null && t > 0 ? t : null;
  }
  if ("unit" in f) {
    out.unit = oneLine(f.unit, 30);
  }
  if ("value" in f) {
    out.value = num(f.value);
  }
  if ("habit_links" in f) {
    const linksList = f.habit_links || [];
    if (!Array.isArray(linksList)) {
      throw new ApiError("Hábitos inválidos.");
    }
    out.habit_links = linksList
      .map(String)
      .filter((h) => knownHabits.has(h))
      .slice(0, 20);
  }
  if ("topic_links" in f) {
    const linksList = f.topic_links || [];
    if (!Array.isArray(linksList)) {
      throw new ApiError("Temas de estudio inválidos.");
    }
    // No se exige que el tema exista: un enlace roto se muestra y se puede reparar.
    out.topic_links = normalizeTopicLinks(linksList.map((l) => oneLine(l, 400))).slice(0, 20);
  }
  if ("notes" in f) {
    out.notes = String(f.notes || "").slice(0, 200000);
  }
  const extra: Record<string, any> = {};
  if ("linked_folder" in f) {
    extra.linked_folder = oneLine(f.linked_folder, 400);
  }
  if ("linked_notes" in f) {
    const notes = f.linked_notes || [];
    if (!Array.isArray(notes)) {
      throw new ApiError("Notas vinculadas inválidas.");
    }
    extra.linked_notes = notes
      .map((n: unknown) => oneLine(n, 400))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (Object.keys(extra).length) {
    out.extra = extra;
  }
  return out;
}

export function goalsApi(app: AppState) {
  // El cumplimiento de las submetas con `topic_links` sale del progreso de estudio.
  const gm = (): GoalManager => {
    const m = app.mgrs().goals;
    if (!m.topicLookup) m.topicLookup = topicLookupFor(app);
    return m;
  };

  function needGoal(gid: unknown): Goal {
    const g = gm().getGoal(String(gid));
    if (g === null) {
      throw new ApiError("Esa meta ya no existe.");
    }
    return g;
  }

  function needItem(gid: string, iid: unknown): GoalItem {
    const i = gm().getItem(gid, String(iid));
    if (i === null) {
      throw new ApiError("Esa submeta ya no existe.");
    }
    return i;
  }

  function itemDict(
    goal: Goal,
    i: GoalItem,
    today: Date
  ): Record<string, unknown> {
    const m = gm();
    const [folder, notes] = links(i.extra || {});
    const [done, total] = m.itemCounts(i, goal, today);
    return {
      id: i.id,
      goal: i.goal,
      parent: i.parent,
      name: i.name,
      status: i.status,
      priority: i.priority,
      order: i.order,
      start: isoDate(i.start),
      due: isoDate(i.due),
      due_time: i.due_time,
      duration_min: i.duration_min,
      repeat: i.repeat,
      repeat_until: isoDate(i.repeat_until),
      in_calendar: i.in_calendar,
      reminder_min: i.reminder_min,
      target: i.target,
      unit: i.unit,
      value: i.value,
      habit_links: [...i.habit_links],
      topic_links: [...i.topic_links],
      topic_progress: m.topicProgress(i),
      done_at: isoDate(i.done_at),
      created: isoDate(i.created),
      notes: i.notes,
      category: i.category,
      is_priority: i.is_priority,
      children: i.children.map((c) => c.id),
      is_leaf: i.is_leaf,
      measurable: i.measurable,
      schedule: i.schedule_text(),
      progress: m.itemProgress(i, goal, today),
      counts: [done, total],
      adherence7: m.itemAdherence(i, goal, 7, today),
      adherence30: m.itemAdherence(i, goal, 30, today),
      streak: i.repeating ? m.streak(i, goal, today) : 0,
      done_today: i.is_leaf
        ? m.is_done_on(i, today)
        : m.branch_done(i, today),
      value_today: m.value_on(i, today),
      late: Boolean(
        !i.repeating &&
          i.due &&
          i.due.getTime() < today.getTime() &&
          i.status !== ITEM_DONE
      ),
      linked_folder: folder,
      linked_notes: notes,
    };
  }

  return {
    goals_meta() {
      return {
        statuses: [...GOAL_STATUSES],
        status_colours: GOAL_STATUS_COLOURS,
        item_statuses: [...GOAL_ITEM_STATUSES],
        filters: [...FILTERS],
      };
    },

    goals_sidebar() {
      const m = gm();
      const areas = app.mgrs().areas.areas();
      const goals = m.goals(FILTER_ALL);
      const known = new Set(areas.map((a) => a.id));
      const today = new Date();
      return {
        today: m.itemsDueOn(today).length,
        areas: Object.fromEntries(
          areas.map((a) => [a.id, goals.filter((g) => g.area === a.id).length])
        ),
        no_area: goals.filter((g) => !known.has(g.area)).length,
        all: goals.length,
        filters: Object.fromEntries(
          FILTERS.map((f) => [f, m.goals(f).length])
        ),
      };
    },

    goals_list(filterKey = FILTER_ALL, area = "*") {
      if (!FILTERS.includes(filterKey as any)) {
        throw new ApiError("Filtro inválido.");
      }
      const m = gm();
      const hm = app.mgrs().habits;
      const today = new Date();
      const areas = new Set(app.mgrs().areas.areas().map((a) => a.id));
      let goals = m.goals(filterKey);
      if (area === "") {
        goals = goals.filter((g) => !areas.has(g.area));
      } else if (area !== "*" && area !== null && area !== undefined) {
        goals = goals.filter((g) => g.area === area);
      }
      const out: Array<Record<string, unknown>> = [];
      for (const g of goals) {
        const [done, total] = m.counts(g, today);
        const nxt = m.nextItem(g, today);
        const linksList: string[] = [];
        for (const item of m.leaves(g.id)) {
          for (const hid of item.habit_links) {
            if (!linksList.includes(hid)) {
              linksList.push(hid);
            }
          }
        }
        const habits: Array<{ id: string; name: string; icon: string }> = [];
        for (const hid of linksList.slice(0, 4)) {
          const h = hm.getHabit(hid);
          if (h) {
            habits.push({ id: hid, name: h.name, icon: h.icon || "" });
          }
        }
        const d = goalDict(g, today);
        d.progress = m.progress(g, today);
        d.counts = [done, total];
        d.adherence7 = m.adherence(g, 7, today);
        d.daily = m.dailyCounts(g, 14, today);
        d.next = nxt
          ? { name: nxt[0].name, date: todayIso(nxt[1]) }
          : null;
        d.overdue_items = m.overdue(g, today).length;
        d.habits = habits;
        out.push(d);
      }
      return out;
    },

    goals_get(gid: string) {
      const m = gm();
      const g = needGoal(gid);
      const today = new Date();
      const items = m.items(g.id);
      const leaves = items.filter((i) => i.is_leaf);
      const repeating = leaves.filter((i) => i.repeating);
      const [done, total] = m.counts(g, today);
      const sortedItems = [...items].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      const maxStreak = repeating.length
        ? Math.max(...repeating.map((i) => m.streak(i, g, today)))
        : 0;

      const historyDays: string[] = [];
      for (let k = 0; k < 30; k++) {
        historyDays.push(todayIso(addDays(today, -(29 - k))));
      }

      const completedLeaves = leaves
        .filter((i) => !i.repeating && i.done_at)
        .sort((a, b) => b.done_at!.getTime() - a.done_at!.getTime())
        .map((i) => ({ id: i.id, name: i.name, done_at: isoDate(i.done_at) }));

      return {
        goal: goalDict(g, today),
        items: sortedItems.map((i) => itemDict(g, i, today)),
        categories: m.categories(g.id),
        stats: {
          progress: m.progress(g, today),
          counts: [done, total],
          adherence7: m.adherence(g, 7, today),
          adherence30: m.adherence(g, 30, today),
          best_streak: maxStreak,
          days_left: g.daysLeft(today),
        },
        history: {
          days: historyDays,
          daily: m.dailyCounts(g, 30, today),
          repeating: repeating.map((i) => ({
            id: i.id,
            name: i.name,
            cells: m.history(g, i, 30, today).map(([, v]) => v),
            streak: m.streak(i, g, today),
            progress: m.itemProgress(i, g, today),
          })),
          completed: completedLeaves,
        },
      };
    },

    goals_today(day = "", gid = "") {
      const m = gm();
      const d = optDate(day) || new Date();
      const goals = gid ? [needGoal(gid)] : null;
      const pairs = m.itemsDueOn(d, goals);
      const rows = pairs.map(([goal, item]) => ({
        goal: {
          id: goal.id,
          name: goal.name,
          icon: goal.icon,
          colour: goal.colour,
          area: goal.area,
        },
        item: {
          id: item.id,
          name: item.name,
          priority: item.priority,
          due: isoDate(item.due),
          due_time: item.due_time,
          repeating: item.repeating,
          measurable: item.measurable,
          target: item.target,
          unit: item.unit,
        },
        done: m.is_done_on(item, d),
        value: m.value_on(item, d),
        late: Boolean(
          !item.repeating && item.due && item.due.getTime() < d.getTime()
        ),
        streak: item.repeating ? m.streak(item, goal, d) : 0,
      }));
      return { date: todayIso(d), rows };
    },

    goals_create(fields: unknown, submetas?: unknown[]) {
      const f = goalFields(fields);
      delete f.extra;
      const name = (f.name as string) || "Nueva meta";
      delete f.name;
      const m = gm();
      const g = m.createGoal(name, f);
      for (const line of (submetas || []).slice(0, 200)) {
        const text = oneLine(line, 200);
        if (text) {
          m.createItem(g.id, text);
        }
      }
      return goalDict(g, new Date());
    },

    goals_update(gid: string, fields: unknown) {
      const g = needGoal(gid);
      const f = goalFields(fields);
      if ("extra" in f) {
        f.extra = { ...(g.extra || {}), ...f.extra };
      }
      const m = gm();
      m.updateGoal(g.id, f);
      return goalDict(needGoal(g.id), new Date());
    },

    goals_delete(gid: string) {
      const g = needGoal(gid);
      gm().deleteGoal(g.id);
      return { ok: true };
    },

    goals_item_create(
      gid: string,
      name: string,
      parent = "",
      fields?: unknown,
      subtasks?: unknown[]
    ) {
      const g = needGoal(gid);
      if (parent) {
        needItem(g.id, parent);
      }
      const knownHabits = new Set(
        app.mgrs().habits.habits().map((h) => h.id)
      );
      const f = itemFields(fields || {}, knownHabits);
      delete f.name;
      delete f.extra;
      const cleanName = oneLine(name, 200) || "Nueva submeta";
      const m = gm();
      const item = m.createItem(g.id, cleanName, parent || "", f);
      for (const line of (subtasks || []).slice(0, 200)) {
        const text = oneLine(line, 200);
        if (text) {
          m.createItem(g.id, text, item.id);
        }
      }
      return itemDict(g, needItem(g.id, item.id), new Date());
    },

    goals_item_update(gid: string, iid: string, fields: unknown) {
      const g = needGoal(gid);
      const item = needItem(g.id, iid);
      const knownHabits = new Set(
        app.mgrs().habits.habits().map((h) => h.id)
      );
      const f = itemFields(fields, knownHabits);
      if ("extra" in f) {
        f.extra = { ...(item.extra || {}), ...f.extra };
      }
      const m = gm();
      m.updateItem(g.id, item.id, f);
      return itemDict(g, needItem(g.id, item.id), new Date());
    },

    /** Avance de una selección de enlaces a temas (aún sin guardar), para los chips del editor. */
    goals_topic_links_progress(links: unknown) {
      if (!Array.isArray(links)) {
        throw new ApiError("Temas de estudio inválidos.");
      }
      return topicLinkProgress(normalizeTopicLinks(links), topicLookupFor(app));
    },

    goals_item_delete(gid: string, iid: string) {
      const g = needGoal(gid);
      needItem(g.id, iid);
      gm().deleteItem(g.id, String(iid));
      return { ok: true };
    },

    goals_item_move(gid: string, iid: string, parent: string, index: number) {
      const g = needGoal(gid);
      needItem(g.id, iid);
      if (parent) {
        needItem(g.id, parent);
      }
      gm().moveItem(
        g.id,
        String(iid),
        parent || "",
        clampInt(index, 0, 10 ** 6, 0)
      );
      return { ok: true };
    },

    goals_item_indent(gid: string, iid: string, direction: number) {
      const g = needGoal(gid);
      needItem(g.id, iid);
      gm().indent(g.id, String(iid), direction > 0 ? 1 : -1);
      return { ok: true };
    },

    goals_set_done(
      gid: string,
      iid: string,
      day: string,
      done: boolean,
      value: unknown = null
    ) {
      const g = needGoal(gid);
      needItem(g.id, iid);
      const d = optDate(day) || new Date();
      gm().setDone(g.id, String(iid), d, Boolean(done), num(value));
      return { ok: true };
    },
  };
}
