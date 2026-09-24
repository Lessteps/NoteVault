// Anual: each habit's completion per month, over the days it was due.

import { useEffect, useMemo, useState } from "react";
import { daysBetween } from "../../lib/habits";
import { MONTHS, todayIso } from "../../lib/tasks";
import { useHabits } from "../../store/habits";
import { Header, NavButtons, habitColour } from "./parts";

export function HabitYear() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const habits = useHabits((s) => s.habits);
  const rows = useHabits((s) => s.rows);
  const loadRange = useHabits((s) => s.loadRange);
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const today = todayIso();

  useEffect(() => {
    void loadRange(first, last);
  }, [first, last, loadRange, habits.length]);

  const table = useMemo(() => {
    const days = daysBetween(first, last).filter((d) => d <= today);
    const out: Record<string, Array<number | null>> = {};
    for (const h of habits) {
      const act = Array<number>(12).fill(0);
      const dn = Array<number>(12).fill(0);
      for (const d of days) {
        const r = rows[d];
        if (!r?.active.includes(h.id)) continue;
        const m = Number(d.slice(5, 7)) - 1;
        act[m]!++;
        if (r.done.includes(h.id)) dn[m]!++;
      }
      out[h.id] = act.map((a, m) => (a ? dn[m]! / a : null));
    }
    return out;
  }, [habits, rows, first, last, today]);

  return (
    <>
      <Header title="Anual">
        <NavButtons
          label={String(year)}
          onPrev={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
          onToday={() => setYear(new Date().getFullYear())}
        />
      </Header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line font-mono text-[10.5px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2 text-left font-normal">Hábito</th>
                {MONTHS.map((m) => <th key={m} className="px-1 py-2 font-normal">{m.slice(0, 3)}</th>)}
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-b-0">
                  <td className="max-w-[220px] truncate px-4 py-2 text-text"><span className="mr-2">{h.icon}</span>{h.name}</td>
                  {(table[h.id] ?? []).map((v, m) => (
                    <td key={m} className="px-1 py-1.5">
                      <div
                        title={v === null ? "—" : `${Math.round(v * 100)}%`}
                        className="mx-auto grid h-7 w-11 place-items-center rounded-md font-mono text-[10.5px]"
                        style={{
                          background: v === null ? "transparent"
                            : `color-mix(in srgb, ${habitColour(h)} ${Math.round(12 + v * 70)}%, transparent)`,
                          color: v === null ? "var(--nv-faint)" : "var(--nv-text)",
                        }}
                      >
                        {v === null ? "·" : Math.round(v * 100)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
