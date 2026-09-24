// Sub-goals due on a day, grouped by area: tick them or type the value.

import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { addDays } from "../../lib/habits";
import { shortDate, todayIso } from "../../lib/tasks";
import type { GoalsTodayRow } from "../../lib/types";
import { useApp } from "../../store/app";
import { useGoals } from "../../store/goals";
import { Chip, inputBase, PRIORITY_COLOURS, PRIORITY_GLYPHS } from "../common/forms";
import { cn } from "../ui";

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function TodayList({ goalId = "", title = true }: { goalId?: string; title?: boolean }) {
  const areas = useGoals((s) => s.areas);
  const version = useGoals((s) => s.version);
  const refresh = useGoals((s) => s.refreshAfterWrite);
  const open = useGoals((s) => s.open);
  const toast = useApp((s) => s.toast);
  const [day, setDay] = useState(todayIso());
  const [rows, setRows] = useState<GoalsTodayRow[]>([]);

  useEffect(() => {
    api.goalsToday(day, goalId).then((r) => setRows(r.rows)).catch((e) => toast("error", (e as Error).message));
  }, [day, goalId, version, toast]);

  const write = async (r: GoalsTodayRow, done: boolean, value: string | null = null) => {
    setRows((xs) => xs.map((x) => (x === r ? { ...x, done } : x)));
    try {
      await api.goalSetDone(r.goal.id, r.item.id, day, done, value);
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const groups = new Map<string, GoalsTodayRow[]>();
  for (const r of rows) {
    const key = areas.some((a) => a.id === r.goal.area) ? r.goal.area : "";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = [...areas.map((a) => a.id).filter((id) => groups.has(id)), ...(groups.has("") ? [""] : [])];
  const d = new Date(`${day}T12:00:00`);
  const doneCount = rows.filter((r) => r.done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {title && <h1 className="text-[21px] font-semibold text-text">☀ Hoy en tus metas</h1>}
        <span className="text-[13px] text-dim">{WEEKDAY[d.getDay()]} {shortDate(day)} · {doneCount}/{rows.length} hechas</span>
        <span className="flex-1" />
        <button type="button" aria-label="Día anterior" onClick={() => setDay(addDays(day, -1))} className="h-7 w-7 rounded-full text-dim hover:bg-hover">‹</button>
        <button type="button" onClick={() => setDay(todayIso())} className="rounded-full border border-line px-3 py-0.5 text-[12px] text-dim hover:bg-hover">Hoy</button>
        <button type="button" aria-label="Día siguiente" onClick={() => setDay(addDays(day, 1))} className="h-7 w-7 rounded-full text-dim hover:bg-hover">›</button>
      </div>
      {!rows.length && <p className="text-[13px] text-faint">Nada programado para este día.</p>}
      {order.map((key) => {
        const area = areas.find((a) => a.id === key);
        const list = groups.get(key)!;
        return (
          <section key={key || "none"}>
            <h2 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold" style={{ color: area?.colour ?? "var(--nv-dim)" }}>
              {area ? `${area.icon} ${area.name}` : "Sin área"}
              <span className="text-[12px] font-normal text-faint">{list.filter((r) => r.done).length}/{list.length}</span>
            </h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-card">
              {list.map((r) => (
                <div key={`${r.goal.id}/${r.item.id}`} className="flex items-center gap-3 px-3 py-2">
                  <input type="checkbox" aria-label={`Hecha: ${r.item.name}`} checked={r.done} style={{ accentColor: r.goal.colour }}
                    onChange={(e) => void write(r, e.target.checked)} />
                  <span className="font-mono text-[12px]" style={{ color: PRIORITY_COLOURS[r.item.priority] }}>{PRIORITY_GLYPHS[r.item.priority]}</span>
                  <span title={`${r.goal.name} → ${r.item.name}`} className={cn("min-w-0 flex-1 truncate text-[13px]", r.done ? "text-faint line-through" : "text-text")}>{r.item.name}</span>
                  {r.late && r.item.due && <Chip colour="var(--nv-danger)">⚠ {shortDate(r.item.due)}</Chip>}
                  {r.item.due_time && <span className="font-mono text-[11px] text-dim">{r.item.due_time}</span>}
                  {r.item.measurable && (
                    <span className="flex items-center gap-1">
                      <input aria-label={`Valor: ${r.item.name}`} className={cn(inputBase, "w-16 py-0.5 text-right text-[12px]")} defaultValue={r.value ?? ""} key={`${day}-${r.value}`} placeholder="0"
                        onBlur={(e) => {
                          const t = e.target.value.trim();
                          if (String(r.value ?? "") === t) return;
                          void write(r, false, t || null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                      <span className="text-[11px] text-faint">/ {r.item.target} {r.item.unit}</span>
                    </span>
                  )}
                  {r.streak >= 2 && <Chip colour="#ff9632">🔥 {r.streak}</Chip>}
                  {!goalId && (
                    <button type="button" onClick={() => void open(r.goal.id)}>
                      <Chip colour={r.goal.colour}>{r.goal.icon} {r.goal.name}</Chip>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
