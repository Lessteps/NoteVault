// Semanal and Mensual: habits down, days across, a check in every cell.

import { useEffect, useMemo, useState } from "react";
import { addDays, daysBetween, monthBounds, weekStart } from "../../lib/habits";
import { MONTHS, shortDate, todayIso, WEEKDAYS } from "../../lib/tasks";
import { useHabits } from "../../store/habits";
import { cn } from "../ui";
import { HabitCheck, Header, NavButtons } from "./parts";

function Grid({ days }: { days: string[] }) {
  const habits = useHabits((s) => s.habits);
  const rows = useHabits((s) => s.rows);
  const setDone = useHabits((s) => s.setDone);
  const loadRange = useHabits((s) => s.loadRange);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const today = todayIso();
  const cell = days.length > 7 ? 22 : 64;

  useEffect(() => {
    void loadRange(first, last);
  }, [first, last, loadRange, habits.length]);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-mono text-[10.5px] font-normal uppercase tracking-wider text-faint">
              Hábito
            </th>
            {days.map((d) => {
              const wd = WEEKDAYS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7];
              return (
                <th
                  key={d}
                  style={{ minWidth: cell + 6 }}
                  className={cn("px-0.5 py-2 text-center font-mono text-[10px] font-normal", d === today ? "text-accent-text" : "text-faint")}
                >
                  <div>{wd}</div>
                  <div className="text-[11px]">{Number(d.slice(8))}</div>
                </th>
              );
            })}
            <th className="px-3 font-mono text-[10.5px] font-normal text-faint">%</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => {
            let act = 0;
            let dn = 0;
            return (
              <tr key={h.id} className="border-b border-line last:border-b-0">
                <td className="sticky left-0 z-10 max-w-[220px] truncate bg-card px-4 py-1.5 text-text">
                  <span className="mr-2">{h.icon}</span>{h.name}
                </td>
                {days.map((d) => {
                  const r = rows[d];
                  const active = Boolean(r?.active.includes(h.id));
                  const done = Boolean(r?.done.includes(h.id));
                  if (active && d <= today) {
                    act++;
                    if (done) dn++;
                  }
                  return (
                    <td key={d} className={cn("py-1", d === today && "bg-accent-soft/50")}>
                      <div className="flex justify-center">
                        {r ? (
                          <HabitCheck
                            habit={h}
                            active={active}
                            done={done}
                            disabled={d > today}
                            size={days.length > 7 ? 18 : 24}
                            label={`${h.name} · ${shortDate(d)}`}
                            onToggle={(v) => void setDone(d, h.id, v)}
                          />
                        ) : (
                          <span className="h-[18px]" />
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 text-right font-mono text-[11px] text-dim">
                  {act ? `${Math.round((dn / act) * 100)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HabitWeek() {
  const [start, setStart] = useState(() => weekStart(todayIso()));
  const days = useMemo(() => daysBetween(start, addDays(start, 6)), [start]);
  return (
    <>
      <Header title="Semanal">
        <NavButtons
          label={`${shortDate(days[0]!)} – ${shortDate(days[6]!)}`}
          onPrev={() => setStart(addDays(start, -7))}
          onNext={() => setStart(addDays(start, 7))}
          onToday={() => setStart(weekStart(todayIso()))}
        />
      </Header>
      <div className="flex-1 overflow-y-auto p-6"><Grid days={days} /></div>
    </>
  );
}

export function HabitMonth() {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [first, last] = monthBounds(ym[0], ym[1]);
  const days = useMemo(() => daysBetween(first, last), [first, last]);
  const shift = (n: number) => {
    const d = new Date(ym[0], ym[1] + n, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  };
  return (
    <>
      <Header title="Mensual">
        <NavButtons
          label={`${MONTHS[ym[1]]} ${ym[0]}`}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={() => setYm([now.getFullYear(), now.getMonth()])}
        />
      </Header>
      <div className="flex-1 overflow-y-auto p-6"><Grid days={days} /></div>
    </>
  );
}
