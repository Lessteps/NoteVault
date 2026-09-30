// Repaso: the upcoming spaced-repetition schedule of the open area.
//
// The snapshot already carries every consolidated skill with its next due date
// (`ledgers[].skills[].due`), so this view only folds those dates into a calendar
// — no new scan, no new engine.

import { CalendarClock } from "lucide-react";
import type { StudySnapshot } from "../../lib/types";
import { cn } from "../ui";

interface ReviewRow {
  due: string;
  title: string;
  skill: string;
  /** true when the review is already due today or earlier */
  isDue: boolean;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function dueLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

export function SrsCalendarView({ snap }: { snap: StudySnapshot }) {
  const today = todayIso();
  const rows: ReviewRow[] = [];
  for (const ledger of snap.ledgers) {
    for (const skill of ledger.skills) {
      if (skill.status !== "consolidated" || !skill.due) continue;
      rows.push({
        due: skill.due,
        title: ledger.title,
        skill: skill.label || skill.code,
        isDue: skill.is_due || skill.due <= today,
      });
    }
  }

  if (rows.length === 0) {
    return <div className="p-4 text-[12px] text-faint">No hay repasos programados todavía.</div>;
  }

  const byDate = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.due) ?? [];
    list.push(row);
    byDate.set(row.due, list);
  }
  const dates = [...byDate.keys()].sort();
  const overdue = rows.filter((r) => r.isDue).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <CalendarClock size={13} className={cn(overdue ? "text-warn" : "text-mint")} />
        {rows.length} repaso{rows.length === 1 ? "" : "s"} programado{rows.length === 1 ? "" : "s"}
        {overdue > 0 && <span className="text-warn">· {overdue} pendiente{overdue === 1 ? "" : "s"}</span>}
      </div>

      {dates.map((date) => {
        const items = byDate.get(date)!;
        const isDue = date <= today;
        return (
          <div key={date}>
            <div
              className={cn(
                "mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider",
                isDue ? "text-warn" : "text-dim",
              )}
            >
              {dueLabel(date)}
              {isDue && <span className="rounded bg-warn-soft px-1.5 py-px text-[9.5px]">pendiente</span>}
            </div>
            <div className="flex flex-col gap-1">
              {items.map((row, i) => (
                <div key={`${row.title}:${row.skill}:${i}`} className="rounded-md border border-line bg-card px-3 py-2">
                  <div className="truncate text-[12.5px] font-semibold text-text" title={row.title}>
                    {row.title}
                  </div>
                  <div className="text-[10.5px] text-dim">{row.skill}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
