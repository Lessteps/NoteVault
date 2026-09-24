import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { isoDate, monthGrid, MONTHS, todayIso, WEEKDAYS } from "../../lib/tasks";
import { useTasks } from "../../store/tasks";
import { cn } from "../ui";
import { statusTone } from "./controls";

export function TaskCalendar() {
  const tasks = useTasks((s) => s.tasks);
  const version = useTasks((s) => s.version);
  const open = useTasks((s) => s.open);
  const create = useTasks((s) => s.create);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [hits, setHits] = useState<Array<{ date: string; id: string }>>([]);
  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);

  useEffect(() => {
    api.tasksInRange(isoDate(days[0]!), isoDate(days[41]!))
      .then(setHits)
      .catch(() => setHits([]));
  }, [days, version]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of hits) m.set(h.date, [...(m.get(h.date) ?? []), h.id]);
    return m;
  }, [hits]);
  const today = todayIso();
  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
        <button type="button" onClick={() => {
          const d = new Date();
          setCursor({ y: d.getFullYear(), m: d.getMonth() });
        }} className="rounded-lg border border-line px-3 py-1 text-[12.5px] text-text hover:bg-hover">
          Hoy
        </button>
        <button type="button" onClick={() => shift(-1)} className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => shift(1)} className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
          <ChevronRight size={16} />
        </button>
        <h2 className="text-[16px] font-semibold text-text">
          {MONTHS[cursor.m]} {cursor.y}
        </h2>
      </div>
      <div className="grid flex-none grid-cols-7 border-b border-line bg-panel">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">{d}</div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const iso = isoDate(d);
          const inMonth = d.getMonth() === cursor.m;
          const ids = byDay.get(iso) ?? [];
          return (
            <div
              key={iso}
              className={cn(
                "group flex min-h-0 flex-col gap-1 overflow-hidden border-b border-r border-line p-1.5",
                !inMonth && "bg-panel/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-[11px]",
                    iso === today ? "bg-accent font-semibold text-white" : inMonth ? "text-dim" : "text-faint",
                  )}
                >
                  {d.getDate()}
                </span>
                <button
                  type="button"
                  title="Nueva tarea este día"
                  onClick={() => void create({ due: iso })}
                  className="grid h-5 w-5 place-items-center rounded text-faint opacity-0 hover:bg-hover hover:text-text group-hover:opacity-100"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {ids.map((id) => {
                  const t = byId.get(id);
                  if (!t) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => open(id)}
                      className={cn(
                        "flex items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11.5px]",
                        statusTone(t.status),
                        t.done && "line-through opacity-70",
                      )}
                    >
                      {t.due_time && <span className="font-mono text-[10px] opacity-80">{t.due_time}</span>}
                      <span className="truncate">{t.name}</span>
                      {t.repeat && <Repeat size={10} className="flex-none opacity-70" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
