// Vista General: the four headline rates, the year streak grid and a table
// with each habit's rates.

import { Flame } from "lucide-react";
import { useEffect, useMemo } from "react";
import { addDays, level, pct, weekStart } from "../../lib/habits";
import { MONTHS, todayIso } from "../../lib/tasks";
import { useHabits } from "../../store/habits";
import { Bar, Header, habitColour } from "./parts";

const LEVEL_BG = [
  "var(--nv-elevated)",
  "color-mix(in srgb, var(--nv-accent) 30%, transparent)",
  "color-mix(in srgb, var(--nv-accent) 55%, transparent)",
  "color-mix(in srgb, var(--nv-accent) 80%, transparent)",
  "var(--nv-accent)",
];

export function StatCards() {
  const stats = useHabits((s) => s.stats);
  const cards: Array<[string, number]> = [
    ["Hoy", stats?.day ?? 0],
    ["Esta semana", stats?.week ?? 0],
    ["Este mes", stats?.month ?? 0],
    ["Este año", stats?.year ?? 0],
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(([label, v]) => (
        <div key={label} className="rounded-xl border border-line bg-card p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
          <div className="mt-1 mb-2 text-[26px] font-semibold text-text">{pct(v)}</div>
          <Bar value={v} />
        </div>
      ))}
    </div>
  );
}

function StreakGrid() {
  const rows = useHabits((s) => s.rows);
  const loadRange = useHabits((s) => s.loadRange);
  const streak = useHabits((s) => s.stats?.streak ?? 0);
  const today = todayIso();
  const first = addDays(weekStart(today), -52 * 7);

  useEffect(() => {
    void loadRange(first, today);
  }, [first, today, loadRange]);

  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (let w = 0; w < 53; w++) {
      out.push(Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
    }
    return out;
  }, [first]);

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center">
        <span className="text-[13px] font-semibold text-text">Habit Streak</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-dim">
          <Flame size={14} className="text-warn" /> Racha: <b className="text-text">{streak}</b> {streak === 1 ? "día" : "días"}
        </span>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week) => (
          <div key={week[0]} className="flex flex-col gap-[3px]">
            {week.map((d) => {
              const r = rows[d];
              const future = d > today;
              const lv = r ? level(r.pct, r.active.length > 0) : 0;
              return (
                <span
                  key={d}
                  data-date={d}
                  title={future ? d : `${d} · ${r ? `${r.done.length}/${r.active.length}` : "—"}`}
                  className="block h-[11px] w-[11px] rounded-[3px]"
                  style={{ background: future ? "transparent" : LEVEL_BG[lv] }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10.5px] text-faint">
        <span>{MONTHS[Number(first.slice(5, 7)) - 1]} {first.slice(0, 4)}</span>
        <span className="ml-auto">Menos</span>
        {LEVEL_BG.map((bg) => <span key={bg} className="h-[10px] w-[10px] rounded-[3px]" style={{ background: bg }} />)}
        <span>Más</span>
      </div>
    </div>
  );
}

function HabitTable() {
  const habits = useHabits((s) => s.habits);
  const stats = useHabits((s) => s.stats);
  const cols = ["day", "week", "month", "year"] as const;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-[minmax(180px,1fr)_repeat(4,110px)] border-b border-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">
        <span>Hábito</span><span>Hoy</span><span>Semana</span><span>Mes</span><span>Año</span>
      </div>
      {habits.map((h) => {
        const r = stats?.habits[h.id];
        return (
          <div key={h.id} className="grid grid-cols-[minmax(180px,1fr)_repeat(4,110px)] items-center border-b border-line px-4 py-2 last:border-b-0">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-text">
              <span className="w-5 text-center">{h.icon}</span>
              <span className="truncate">{h.name}</span>
            </span>
            {cols.map((c) => (
              <span key={c} className="flex flex-col gap-1 pr-4">
                <span className="font-mono text-[11px] text-dim">{pct(r?.[c])}</span>
                <Bar value={r?.[c] ?? null} colour={habitColour(h)} />
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function HabitOverview() {
  return (
    <>
      <Header title="Vista general" />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <StatCards />
        <StreakGrid />
        <HabitTable />
      </div>
    </>
  );
}
