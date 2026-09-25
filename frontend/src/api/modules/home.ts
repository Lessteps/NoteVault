// Ported from notevault_app/webapp/modules/home.py
// Vista General: today across every module, in one call.

import { totals } from "../../core/financeManager.js";
import { FILTER_ACTIVE } from "../../core/goalManager.js";
import type { AppState } from "../appState.js";
import { isoDate } from "../common.js";

export const DAY_KEYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export function homeApi(app: AppState) {
  const m = () => app.mgrs();

  return {
    home_overview(): Record<string, unknown> {
      const mgrs = m();
      const today = new Date();
      // Reset time to start of day for exact date comparisons
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayIsoStr = isoDate(todayStart)!;
      // Monday = 0 .. Sunday = 6
      const dayIdx = (todayStart.getDay() + 6) % 7;
      const dayKey = DAY_KEYS[dayIdx]!;

      // 1. Habits
      const habits = mgrs.habits.habits_for_day(todayStart);
      const hday = mgrs.habits.get_day(todayStart);
      const habitRows = habits.map((h) => {
        const subs = (h as Record<string, any>).subtasks || [];
        const [d, t] = subs.length ? hday.subtask_progress(h) : [0, 0];
        return {
          id: h.id,
          name: h.name,
          icon: (h as Record<string, any>).icon || "",
          done: Boolean(hday.completed[h.id]),
          subs: [d, t],
        };
      });

      // 2. Exercise
      const exs = mgrs.exercise.exercises_for_day(dayKey);
      const log = mgrs.exercise.get_log(todayStart);
      const exRows = exs.map((e) => ({
        id: e.id,
        name: e.name || "",
        series_reps: e.series_reps || "",
        how_to: e.how_to || "",
        entry: log.entries[e.id] || {},
      }));

      // 3. Tasks
      const tasks = mgrs.tasks.tasks();
      const taskRow = (t: (typeof tasks)[number]) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        subject: t.subject,
        priority: t.priority,
        due: isoDate(t.due),
        done: t.is_done,
      });

      const dueToday = tasks
        .filter((t) => isoDate(t.due) === todayIsoStr && !t.is_done)
        .map(taskRow);
      const overdue = tasks.filter((t) => t.is_overdue).map(taskRow);

      // 4. Projects
      const pairs = mgrs.projects.due_on(todayStart);
      const issueRows = pairs.map(([p, i]) => ({
        project: {
          id: p.id,
          name: p.name,
          colour: p.colour,
          done_column: p.done_column,
          first_column: p.columns[0],
        },
        id: i.id,
        key: i.key,
        title: i.title,
        due: isoDate(i.due),
        done: i.is_done,
      }));
      const active = mgrs.projects
        .active_projects()
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
          colour: p.colour,
          progress: mgrs.projects.progress(p),
        }));

      // 5. Finance
      const fm = mgrs.finances;
      fm.ensure_defaults();
      const dayTotals = totals(fm.day(todayStart));
      const [thisMonth, prevMonth] = fm.compare_month(
        todayStart.getFullYear(),
        todayStart.getMonth() + 1,
      );
      const checks = fm.due_checks(todayStart).map(([g, checked]) => ({
        goal: {
          id: g.id,
          name: g.name,
          icon: g.icon,
          colour: g.colour,
          suggested_cents: g.suggested_cents,
        },
        checked,
      }));

      // 6. Goals
      const goals = mgrs.goals
        .goals(FILTER_ACTIVE)
        .filter((g) => (g as Record<string, any>).in_overview);
      const goalPairs = mgrs.goals.items_due_on(todayStart, goals);

      return {
        today: todayIsoStr,
        habits: habitRows,
        exercise: { day: dayKey, rows: exRows },
        tasks: { today: dueToday, overdue },
        projects: { issues: issueRows, active },
        finance: {
          day: dayTotals,
          month: thisMonth,
          prev: prevMonth,
          checks,
        },
        goals: {
          list: goals.slice(0, 6).map((g) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            colour: g.colour,
            progress: mgrs.goals.progress(g, todayStart),
          })),
          items: goalPairs.map(([g, i]) => ({
            goal: { id: g.id, name: g.name, icon: g.icon, colour: g.colour },
            item: {
              id: i.id,
              name: i.name,
              priority: i.priority,
              due_time: i.due_time,
              measurable: i.measurable,
              target: i.target,
              unit: i.unit,
            },
            done: mgrs.goals.is_done_on(i, todayStart),
          })),
          any: Boolean(goals.length),
        },
      };
    },
  };
}
