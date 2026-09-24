// A GitHub-like grid of a year's days (Monday-first columns of weeks).

import { addDays, weekStart } from "../../lib/habits";
import { MONTHS_ES } from "../../lib/calendar";
import { todayIso } from "../../lib/tasks";

const LEVELS = [0, 0.34, 0.67, 1];

export function YearGrid({ year, values, colour = "var(--nv-accent)" }: {
  year: number; values: Record<string, number>; colour?: string;
}) {
  const first = weekStart(`${year}-01-01`);
  const today = todayIso();
  const weeks: string[][] = [];
  for (let w = 0; w < 54; w++) {
    const col = Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d));
    if (col[0]! > `${year}-12-31`) break;
    weeks.push(col);
  }
  const bg = (v: number | undefined) => {
    if (!v) return "var(--nv-elevated)";
    const lv = LEVELS.findIndex((l) => v <= l);
    const pct = [0, 35, 60, 85, 100][lv < 0 ? 4 : lv + 1]!;
    return `color-mix(in srgb, ${colour} ${pct}%, transparent)`;
  };
  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((w) => (
          <div key={w[0]} className="flex flex-col gap-[3px]">
            {w.map((d) => {
              const out = !d.startsWith(String(year)) || d > today;
              return <span key={d} data-date={d} title={out ? d : `${d} · ${Math.round((values[d] ?? 0) * 100)} %`}
                className="block h-[11px] w-[11px] rounded-[3px]" style={{ background: out ? "transparent" : bg(values[d]) }} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex text-[10px] text-faint">
        {MONTHS_ES.map((m) => <span key={m} className="flex-1">{m.slice(0, 3)}</span>)}
      </div>
    </div>
  );
}
