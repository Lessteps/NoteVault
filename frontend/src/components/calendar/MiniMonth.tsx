import { useEffect, useState } from "react";
import { MONTHS_ES } from "../../lib/calendar";
import { parseIso } from "../../lib/habits";
import { isoDate, monthGrid, todayIso, WEEKDAYS } from "../../lib/tasks";
import { cn } from "../ui";

export function MiniMonth({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const [ym, setYm] = useState(() => {
    const d = parseIso(value);
    return [d.getFullYear(), d.getMonth()] as [number, number];
  });
  useEffect(() => {
    const d = parseIso(value);
    setYm([d.getFullYear(), d.getMonth()]);
  }, [value]);
  const today = todayIso();
  const shift = (n: number) => {
    const d = new Date(ym[0], ym[1] + n, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  };
  return (
    <div className="select-none px-3">
      <div className="mb-1 flex items-center">
        <span className="flex-1 pl-1 text-[12.5px] font-medium capitalize text-text">{MONTHS_ES[ym[1]]} {ym[0]}</span>
        <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="h-6 w-6 rounded-full text-dim hover:bg-hover">‹</button>
        <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="h-6 w-6 rounded-full text-dim hover:bg-hover">›</button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => <span key={w} className="py-0.5 font-mono text-[9.5px] text-faint">{w}</span>)}
        {monthGrid(ym[0], ym[1]).map((d) => {
          const iso = isoDate(d);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              className={cn(
                "mx-auto grid h-6 w-6 place-items-center rounded-full text-[11px]",
                iso === today ? "bg-accent text-white" : iso === value ? "bg-accent-soft text-accent-text" : "",
                iso !== today && iso !== value && (d.getMonth() === ym[1] ? "text-dim hover:bg-hover" : "text-faint/60 hover:bg-hover"),
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
