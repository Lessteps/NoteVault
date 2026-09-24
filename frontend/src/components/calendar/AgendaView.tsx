// Agenda: four weeks from the day in focus, as a list.

import { fmtDuration, fmtHm, MONTHS_ES, toMin, visible, WEEKDAYS_ES } from "../../lib/calendar";
import { parseIso } from "../../lib/habits";
import { todayIso } from "../../lib/tasks";
import { useCalendar } from "../../store/calendar";
import { cn } from "../ui";
import { activate } from "./actions";

export function AgendaView() {
  const data = useCalendar((s) => s.days);
  const filters = useCalendar((s) => s.filters);
  const setDone = useCalendar((s) => s.setDone);
  const today = todayIso();
  const days = Object.keys(data).sort().filter((d) => visible(data[d] ?? [], filters).length);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mx-auto max-w-[860px] space-y-4">
        {days.map((d) => {
          const date = parseIso(d);
          return (
            <section key={d} className="flex gap-5">
              <div className="w-24 flex-none pt-1.5 text-right">
                <div className={cn("text-[22px] font-semibold leading-none", d === today ? "text-accent-text" : "text-text")}>{date.getDate()}</div>
                <div className="mt-1 font-mono text-[10.5px] uppercase text-faint">
                  {WEEKDAYS_ES[(date.getDay() + 6) % 7]!.slice(0, 3)} · {MONTHS_ES[date.getMonth()]!.slice(0, 3)}
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1">
                {visible(data[d] ?? [], filters).map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 hover:border-line-strong">
                    <input
                      type="checkbox"
                      aria-label={`Hecho: ${o.title}`}
                      className="accent-[var(--nv-accent)]"
                      checked={o.done}
                      disabled={!o.checkable}
                      onChange={(e) => void setDone(o, e.target.checked)}
                    />
                    <span className="h-5 w-1 flex-none rounded-full" style={{ background: o.colour }} />
                    <span className="w-28 flex-none font-mono text-[11.5px] text-dim">
                      {o.start ? `${fmtHm(toMin(o.start)!)}${o.duration_min ? ` · ${fmtDuration(o.duration_min)}` : ""}` : "Todo el día"}
                    </span>
                    <button type="button" onClick={(e) => activate(o, e)}
                      className={cn("min-w-0 flex-1 truncate text-left text-[13px]", o.done ? "text-faint line-through" : "text-text")}>
                      {o.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!days.length && <p className="py-10 text-center text-[13px] text-faint">Nada en las próximas cuatro semanas.</p>}
      </div>
    </div>
  );
}
