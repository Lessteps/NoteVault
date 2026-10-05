// Hoy: what the project asks of you on a day — what is overdue, what is due,
// what is already under way — the daily view Metas has, kept inside each project.

import { useState } from "react";
import { addDays } from "../../lib/habits";
import { shortDate, todayIso } from "../../lib/tasks";
import type { Issue } from "../../lib/types";
import { useProjects } from "../../store/projects";
import { Chip } from "../common/forms";
import { StatusSelect } from "../tasks/controls";
import { cn } from "../ui";
import { PriorityMark } from "./IssueBits";

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** The issues of a project split into what matters on `day` (pure, so it can be tested). */
export function planForDay(issues: Issue[], day: string, today: string, firstColumn: string) {
  // A submeta with children only groups work: its tasks are what gets done.
  const work = issues.filter((i) => !(i.type === "Submeta" && i.children.length));
  const open = work.filter((i) => !i.done);
  const overdue = day === today ? open.filter((i) => i.due && i.due < today) : [];
  const taken = new Set(overdue.map((i) => i.id));
  const due = open.filter((i) => !taken.has(i.id) && (i.due === day || (i.start && i.start <= day && (i.due ?? day) >= day)));
  due.forEach((i) => taken.add(i.id));
  const underway = day === today ? open.filter((i) => !taken.has(i.id) && i.status !== firstColumn && !i.due) : [];
  const doneOnDay = work.filter((i) => i.done && (i.done_at ?? "").startsWith(day));
  return { overdue, due, underway, doneOnDay };
}

export function ProjectToday() {
  const detail = useProjects((s) => s.detail)!;
  const openIssue = useProjects((s) => s.openIssue);
  const moveIssue = useProjects((s) => s.moveIssue);
  const setCreating = useProjects((s) => s.setCreating);
  const [day, setDay] = useState(todayIso());
  const p = detail.project;
  const today = todayIso();
  const plan = planForDay(detail.issues, day, today, p.columns[0]!);
  const pending = plan.overdue.length + plan.due.length + plan.underway.length;
  const total = pending + plan.doneOnDay.length;
  const d = new Date(`${day}T12:00:00`);

  const row = (i: Issue) => (
    <div key={i.id} className="flex items-center gap-3 px-3 py-2">
      <input type="checkbox" aria-label={`Hecha: ${i.title}`} checked={i.done} style={{ accentColor: p.colour }}
        onChange={(e) => void moveIssue(i.id, e.target.checked ? p.done_column : p.columns[0]!, 10 ** 6)} />
      <PriorityMark p={i.priority} />
      <span className="font-mono text-[11px] text-faint">{i.key}</span>
      <button type="button" onClick={() => openIssue(i.id)}
        className={cn("min-w-0 flex-1 truncate text-left text-[13px]", i.done ? "text-faint line-through" : "text-text")}>{i.title}</button>
      {i.overdue && i.due && <Chip colour="var(--nv-danger)">⚠ {shortDate(i.due)}</Chip>}
      {i.due_time && <span className="font-mono text-[11px] text-dim">{i.due_time}</span>}
      <StatusSelect value={i.status} statuses={p.columns} onChange={(v) => void moveIssue(i.id, v, 10 ** 6)} />
    </div>
  );
  const section = (title: string, list: Issue[], tone?: string) => list.length > 0 && (
    <section key={title}>
      <h2 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold" style={{ color: tone ?? "var(--nv-dim)" }}>
        {title}<span className="text-[12px] font-normal text-faint">{list.length}</span>
      </h2>
      <div className="divide-y divide-line rounded-xl border border-line bg-card">{list.map(row)}</div>
    </section>
  );

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-3">
      <div className="flex items-center gap-2">
        <h1 className="text-[18px] font-semibold text-text">☀ Hoy en este proyecto</h1>
        <span className="text-[13px] text-dim">{WEEKDAY[d.getDay()]} {shortDate(day)} · {plan.doneOnDay.length}/{total} hechas</span>
        <span className="flex-1" />
        <button type="button" aria-label="Día anterior" onClick={() => setDay(addDays(day, -1))} className="h-7 w-7 rounded-full text-dim hover:bg-hover">‹</button>
        <button type="button" onClick={() => setDay(today)} className="rounded-full border border-line px-3 py-0.5 text-[12px] text-dim hover:bg-hover">Hoy</button>
        <button type="button" aria-label="Día siguiente" onClick={() => setDay(addDays(day, 1))} className="h-7 w-7 rounded-full text-dim hover:bg-hover">›</button>
      </div>
      {!total && (
        <p className="text-[13px] text-faint">
          Nada para este día. Ponle fecha a una tarea o{" "}
          <button type="button" className="text-accent-text hover:underline" onClick={() => setCreating({})}>crea un issue</button>.
        </p>
      )}
      {section("Vencidas", plan.overdue, "var(--nv-danger)")}
      {section(day === today ? "Para hoy" : "Para este día", plan.due, "var(--nv-info)")}
      {section("En curso", plan.underway)}
      {section("Hechas este día", plan.doneOnDay, "var(--nv-mint)")}
    </div>
  );
}
