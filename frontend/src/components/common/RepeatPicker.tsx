// A repetition rule editor ("daily", "weekly:0,2", "every:3", "monthly:1,15").

import { formatRepeat, parseRepeat, WEEKDAYS, type RepeatKind } from "../../lib/tasks";
import { cn } from "../ui";
import { input, inputBase } from "./forms";

export function RepeatPicker({ value, onChange }: { value: string; onChange: (rule: string) => void }) {
  const r = parseRepeat(value);
  const kind: RepeatKind = r.kind === "workdays" ? "weekly" : r.kind;
  return (
    <div className="space-y-1.5">
      <select aria-label="Repetición" className={input} value={kind}
        onChange={(e) => {
          const k = e.target.value as RepeatKind;
          onChange(k === "none" ? "" : k === "daily" ? "daily" : k === "weekly" ? "weekly:0"
            : k === "every" ? "every:2" : "monthly:1");
        }}>
        <option value="none">No se repite</option>
        <option value="daily">Cada día</option>
        <option value="weekly">Días de la semana</option>
        <option value="every">Cada N días</option>
        <option value="monthly">Días del mes</option>
      </select>
      {kind === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAYS.map((w, i) => {
            const on = r.weekdays.includes(i);
            return (
              <button key={w} type="button" aria-pressed={on}
                onClick={() => {
                  const next = on ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i];
                  if (next.length) onChange(formatRepeat({ ...r, kind: "weekly", weekdays: next }));
                }}
                className={cn("h-7 w-7 rounded-full text-[11.5px]", on ? "bg-accent text-white" : "border border-line text-dim")}>{w}</button>
            );
          })}
        </div>
      )}
      {kind === "every" && (
        <label className="flex items-center gap-2 text-[12.5px] text-dim">
          Cada
          <input type="number" min={2} max={365} className={cn(inputBase, "w-20")} value={r.every}
            onChange={(e) => onChange(`every:${Math.max(2, Math.min(365, Number(e.target.value) || 2))}`)} />
          días
        </label>
      )}
      {kind === "monthly" && (
        <input className={input} defaultValue={r.monthDays.join(", ")} key={value} placeholder="1, 15"
          onBlur={(e) => {
            const rule = formatRepeat({ ...parseRepeat(`monthly:${e.target.value.replace(/\s/g, "")}`), kind: "monthly" });
            if (rule) onChange(rule);
          }} />
      )}
    </div>
  );
}
