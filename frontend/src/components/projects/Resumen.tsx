// Resumen: stat tiles, charts and one row per Submeta.

import { Plus } from "lucide-react";
import { shortDate } from "../../lib/tasks";
import type { Issue } from "../../lib/types";
import { descendants, issueById, useProjects } from "../../store/projects";
import { BarList, BlockProgress, Columns, Donut, LineChart } from "../common/charts";
import { GhostButton, PRIORITY_COLOURS, PRIORITY_NAMES } from "../common/forms";
import { Panel, StatTile } from "../common/StatTile";
import { cn } from "../ui";

const STATUS_COLOURS = ["#8b8b96", "#2383e2", "#a78bfa", "#ff9632", "#38bdf8", "#facc15"];

export function Resumen() {
  const detail = useProjects((s) => s.detail)!;
  const setCreating = useProjects((s) => s.setCreating);
  const openIssue = useProjects((s) => s.openIssue);
  const setTab = useProjects((s) => s.setTab);
  const setGoal = useProjects((s) => s.setGoalFilter);
  const { project: p, stats } = detail;
  const s = stats.summary;

  const statusParts = stats.by_status.map(([c, n], i) => ({
    name: `${c}: ${n}`, value: n, colour: c === p.done_column ? "#4ade80" : STATUS_COLOURS[i % STATUS_COLOURS.length]!,
  }));

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-3">
      <div className="grid grid-cols-6 gap-3">
        <StatTile value={`${Math.round(s.progress * 100)} %`} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={s.open} label="Abiertas" colour="var(--nv-info)" />
        <StatTile value={s.overdue} label="Vencidas" colour={s.overdue ? "var(--nv-danger)" : undefined} />
        <StatTile value={s.done_this_week ?? 0} label="Hechas esta semana" colour="var(--nv-mint)" />
        <StatTile value={s.days_left ?? "—"} label="Días a la entrega" colour={p.overdue ? "var(--nv-danger)" : undefined} />
        <StatTile value={stats.cycle_days ?? "—"} label="Ciclo medio (días)" />
      </div>

      <Panel title="◆  Metas y Submetas del Proyecto"
        action={<GhostButton onClick={() => setCreating({ type: "Submeta" })}><Plus size={13} /> Nueva Submeta</GhostButton>}>
        {!stats.submetas.length && <p className="text-[12.5px] text-faint">Sin submetas. Una submeta agrupa las tareas que llevan a un objetivo.</p>}
        <div className="space-y-3">
          {stats.submetas.map((g) => {
            const goal = issueById(detail, g.id);
            if (!goal) return null;
            const kids = [...descendants(detail, g.id)].map((id) => issueById(detail, id)).filter((x): x is Issue => Boolean(x) && x!.parent === g.id);
            return (
              <div key={g.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <span style={{ color: goal.type_colour }}>{goal.icon}</span>
                  <button type="button" onClick={() => openIssue(goal.id)} className="min-w-0 truncate text-[13.5px] font-medium text-text hover:underline">
                    <span className="mr-1.5 font-mono text-[11px] text-faint">{goal.key}</span>{goal.title}
                  </button>
                  {goal.due && <span className="text-[11.5px] text-faint">⏰ {shortDate(goal.due)}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    <BlockProgress value={g.progress} colour={p.colour} />
                    <span className="font-mono text-[11px] text-dim">{g.done}/{g.total}</span>
                    <GhostButton onClick={() => setCreating({ parent: g.id, type: "Tarea" })} className="py-0.5">+ Tarea</GhostButton>
                    <GhostButton onClick={() => { setGoal(g.id); setTab("tablero"); }} className="py-0.5">Ver en tablero</GhostButton>
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 pl-6">
                  {kids.map((k) => (
                    <li key={k.id}>
                      <button type="button" onClick={() => openIssue(k.id)} className={cn("flex w-full items-center gap-2 text-left text-[12.5px]", k.done ? "text-faint line-through" : "text-dim hover:text-text")}>
                        <span>{k.done ? "✓" : "○"}</span><span className="font-mono text-[11px] text-faint">{k.key}</span><span className="truncate">{k.title}</span>
                        <span className="ml-auto text-[11px] text-faint">{k.status}</span>
                      </button>
                    </li>
                  ))}
                  {!kids.length && <li className="text-[11.5px] text-faint">↳ Sin tareas asignadas aún. Usa «+ Tarea» para desglosarla.</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Por estado">
          <div className="flex items-center gap-6">
            <Donut parts={statusParts} size={150} label={`${s.done}/${s.total}`} />
            <ul className="space-y-1 text-[12px]">
              {statusParts.map((x) => (
                <li key={x.name} className="flex items-center gap-2 text-dim"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.colour }} />{x.name}</li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel title="Abiertas por prioridad">
          <BarList rows={[...stats.by_priority].reverse().map(([pr, n]) => ({ label: PRIORITY_NAMES[pr]!, value: n, colour: PRIORITY_COLOURS[pr] }))} />
          <div className="mt-4 border-t border-line pt-3">
            <BarList rows={stats.by_type.map(([t, n]) => ({ label: t, value: n }))} />
          </div>
        </Panel>
        <Panel title="Burndown · pendientes por día">
          <LineChart labels={stats.burndown.days.map((d) => shortDate(d))}
            series={[
              { name: "Pendientes", values: stats.burndown.remaining, colour: p.colour },
              ...(stats.burndown.ideal.length ? [{ name: "Ideal", values: stats.burndown.ideal, colour: "var(--nv-faint)", dashed: true }] : []),
            ]} />
        </Panel>
        <Panel title="Rendimiento · hechas por semana">
          <Columns values={stats.throughput.map(([, n]) => n)} labels={stats.throughput.map(([d]) => shortDate(d))} colour="var(--nv-mint)" />
        </Panel>
      </div>
    </div>
  );
}
