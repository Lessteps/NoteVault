// The project's own month: issues on their due date; drag one to another day.

import { useState } from "react";
import { MONTHS_ES } from "../../lib/calendar";
import { isoDate, monthGrid, todayIso, WEEKDAYS } from "../../lib/tasks";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { cn } from "../ui";

export function ProjectCalendar() {
  const detail = useProjects((s) => s.detail)!;
  const openIssue = useProjects((s) => s.openIssue);
  const updateIssue = useProjects((s) => s.updateIssue);
  const reload = useProjects((s) => s.reload);
  const toast = useApp((s) => s.toast);
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [drag, setDrag] = useState<string | null>(null);
  const p = detail.project;
  const today = todayIso();
  const cells = monthGrid(ym[0], ym[1]);
  const shift = (n: number) => { const d = new Date(ym[0], ym[1] + n, 1); setYm([d.getFullYear(), d.getMonth()]); };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
      <div className="flex flex-none items-center gap-2 py-2.5">
        <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior" className="h-7 w-7 rounded-full text-dim hover:bg-hover">‹</button>
        <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente" className="h-7 w-7 rounded-full text-dim hover:bg-hover">›</button>
        <span className="text-[15px] font-semibold capitalize text-text">{MONTHS_ES[ym[1]]} {ym[0]}</span>
        <label className="ml-4 flex items-center gap-1.5 text-[12px] text-dim">
          <input type="checkbox" checked={p.in_calendar}
            onChange={async (e) => {
              try {
                await api.projectsUpdate(p.id, { in_calendar: e.target.checked });
                await reload();
              } catch (err) {
                toast("error", (err as Error).message);
              }
            }} />
          Mostrar en el calendario general
        </label>
        <span className="ml-auto text-[11.5px] text-faint">Los issues sin fecha no aparecen aquí. Arrastra un issue a otro día para moverlo.</span>
      </div>
      <div className="grid flex-none grid-cols-7 text-center">
        {WEEKDAYS.map((w) => <span key={w} className="py-1 font-mono text-[10.5px] text-faint">{w}</span>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden rounded-xl border border-line">
        {cells.map((d) => {
          const iso = isoDate(d);
          const items = detail.issues.filter((i) => i.due === iso);
          return (
            <div key={iso} data-day={iso}
              onDragOver={(e) => drag && e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (drag) void updateIssue(drag, { due: iso }); setDrag(null); }}
              className={cn("min-h-0 overflow-hidden border-b border-l border-line p-1", d.getMonth() !== ym[1] && "bg-panel/60")}>
              <div className={cn("mb-0.5 text-right text-[11px]", iso === today ? "font-semibold text-accent-text" : "text-faint")}>{d.getDate()}</div>
              {items.map((i) => (
                <button key={i.id} type="button" draggable onDragStart={() => setDrag(i.id)} onDragEnd={() => setDrag(null)}
                  onClick={() => openIssue(i.id)}
                  className={cn("mb-0.5 block w-full truncate rounded px-1 text-left text-[11px] text-white", i.done && "line-through opacity-50")}
                  style={{ background: i.overdue ? "var(--nv-danger)" : p.colour }}>
                  {i.key} {i.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
