// Submetas tab: the project's goals and sub-goals with an interface of their own.
// Same look as the goals module (table or cards, like the task table); each submeta
// keeps its own statistics page. Opening one from the list shows its properties in
// the issue peek.

import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDate } from "../../lib/tasks";
import type { Issue } from "../../lib/types";
import { descendants, issueById, useProjects } from "../../store/projects";
import { BarList, BlockProgress, Donut } from "../common/charts";
import { Chip, GhostButton, PrimaryButton, PRIORITY_COLOURS, PRIORITY_NAMES } from "../common/forms";
import { Panel, StatTile } from "../common/StatTile";
import {
  filterRows, SubmetaCardGrid, SubmetaFilters, SubmetaTable, ViewToggle, type SubmetaRow, type SubmetaView,
} from "../common/SubmetaTable";
import { cn } from "../ui";

const STATUS_COLOURS = ["#8b8b96", "#2383e2", "#a78bfa", "#ff9632", "#38bdf8", "#facc15"];

/** Stats of one submeta, worked out from its own tasks. */
export function submetaNumbers(issues: Issue[], now = Date.now()) {
  const done = issues.filter((i) => i.done).length;
  const week = issues.filter((i) => i.done_at && now - new Date(i.done_at).getTime() <= 7 * 864e5).length;
  return {
    total: issues.length,
    done,
    open: issues.length - done,
    overdue: issues.filter((i) => i.overdue && !i.done).length,
    progress: issues.length ? done / issues.length : 0,
    doneThisWeek: week,
    estimate: issues.reduce((n, i) => n + (i.estimate_min ?? 0), 0),
    estimateDone: issues.filter((i) => i.done).reduce((n, i) => n + (i.estimate_min ?? 0), 0),
  };
}

function tasksOf(detail: NonNullable<ReturnType<typeof useProjects.getState>["detail"]>, id: string): Issue[] {
  return [...descendants(detail, id)].map((x) => issueById(detail, x)).filter((x): x is Issue => Boolean(x));
}

function SubmetaStats({ id }: { id: string }) {
  const detail = useProjects((s) => s.detail)!;
  const openIssue = useProjects((s) => s.openIssue);
  const openSubmeta = useProjects((s) => s.openSubmeta);
  const setCreating = useProjects((s) => s.setCreating);
  const moveIssue = useProjects((s) => s.moveIssue);
  const setGoal = useProjects((s) => s.setGoalFilter);
  const setTab = useProjects((s) => s.setTab);
  const goal = issueById(detail, id);
  const p = detail.project;
  if (!goal) return null;
  const all = tasksOf(detail, id);
  const direct = all.filter((i) => i.parent === id);
  const n = submetaNumbers(all);
  const byStatus = p.columns.map((c, idx) => ({
    name: `${c}: ${all.filter((i) => i.status === c).length}`,
    value: all.filter((i) => i.status === c).length,
    colour: c === p.done_column ? "#4ade80" : STATUS_COLOURS[idx % STATUS_COLOURS.length]!,
  })).filter((x) => x.value > 0);
  const byPriority = [4, 3, 2, 1].map((pr) => ({
    label: PRIORITY_NAMES[pr]!, value: all.filter((i) => i.priority === pr && !i.done).length, colour: PRIORITY_COLOURS[pr],
  }));
  const daysLeft = goal.due ? Math.ceil((new Date(goal.due).getTime() - Date.now()) / 864e5) : null;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-3">
      <div className="flex items-center gap-2">
        <GhostButton onClick={() => openSubmeta(null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> Volver a las submetas</GhostButton>
        <span className="flex-1" />
        <GhostButton onClick={() => openIssue(goal.id)}><Pencil size={13} /> Editar propiedades…</GhostButton>
        <GhostButton onClick={() => { setGoal(goal.id); setTab("tablero"); }}>Ver en tablero</GhostButton>
        <PrimaryButton onClick={() => setCreating({ parent: goal.id, type: "Tarea" })}><Plus size={14} /> Tarea</PrimaryButton>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[26px]" style={{ color: goal.type_colour }}>{goal.icon}</span>
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold text-faint">{goal.key}</div>
          <h2 className="truncate text-[20px] font-bold text-text">{goal.title}</h2>
        </div>
        <div className="ml-2 flex flex-wrap gap-1.5">
          <Chip colour={goal.status === p.done_column ? "var(--nv-mint)" : undefined}>{goal.status}</Chip>
          <Chip colour={PRIORITY_COLOURS[goal.priority]}>{PRIORITY_NAMES[goal.priority]}</Chip>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        <StatTile value={`${Math.round(n.progress * 100)} %`} label="Progreso" colour="var(--nv-mint)" />
        <StatTile value={`${n.done}/${n.total}`} label="Completadas" />
        <StatTile value={n.open} label="Abiertas" colour="var(--nv-info)" />
        <StatTile value={n.overdue} label="Vencidas" colour={n.overdue ? "var(--nv-danger)" : undefined} />
        <StatTile value={n.doneThisWeek} label="Hechas esta semana" colour="var(--nv-mint)" />
        <StatTile value={goal.due ? (daysLeft! < 0 ? `${-daysLeft!} d tarde` : `${daysLeft} d`) : "—"} label={goal.due ? `Entrega ${shortDate(goal.due)}` : "Sin fecha límite"}
          colour={goal.due && daysLeft! < 0 ? "var(--nv-danger)" : undefined} />
      </div>
      <BlockProgress value={n.progress} colour={p.colour} blocks={30} />
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Por estado">
          <div className="flex items-center gap-6">
            <Donut parts={byStatus.length ? byStatus : [{ name: "Sin tareas", value: 1, colour: "var(--nv-elevated)" }]} size={140} label={`${n.done}/${n.total}`} />
            <ul className="space-y-1 text-[12px]">
              {byStatus.map((x) => <li key={x.name} className="flex items-center gap-2 text-dim"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.colour }} />{x.name}</li>)}
            </ul>
          </div>
        </Panel>
        <Panel title="Abiertas por prioridad">
          <BarList rows={byPriority} />
          {n.estimate > 0 && <p className="mt-3 text-[11.5px] text-faint">Estimación: {Math.round(n.estimateDone / 60 * 10) / 10} h de {Math.round(n.estimate / 60 * 10) / 10} h hechas.</p>}
        </Panel>
      </div>
      <Panel title="Tareas de la submeta" action={<GhostButton onClick={() => setCreating({ parent: goal.id, type: "Tarea" })}><Plus size={13} /> Tarea</GhostButton>}>
        {!direct.length && <p className="text-[12.5px] text-faint">Sin tareas todavía. Usa «+ Tarea» para desglosar la submeta.</p>}
        <ul className="space-y-1">
          {direct.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
              <input type="checkbox" aria-label={`Hecha: ${k.title}`} checked={k.done} className="accent-[var(--nv-mint)]"
                onChange={(e) => void moveIssue(k.id, e.target.checked ? p.done_column : p.columns[0]!, 10 ** 6)} />
              <span className="font-mono text-[11px] text-faint">{k.key}</span>
              <button type="button" onClick={() => openIssue(k.id)} className={cn("min-w-0 flex-1 truncate text-left text-[13px]", k.done ? "text-faint line-through" : "text-text")}>{k.title}</button>
              {k.due && <span className={cn("text-[11px]", k.overdue ? "text-danger" : "text-faint")}>{shortDate(k.due)}</span>}
              <span className="w-24 truncate text-right text-[11.5px] text-dim">{k.status}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function SubmetasPanel() {
  const detail = useProjects((s) => s.detail)!;
  const submetaId = useProjects((s) => s.submetaId);
  const issueId = useProjects((s) => s.issueId);
  const openIssue = useProjects((s) => s.openIssue);
  const openSubmeta = useProjects((s) => s.openSubmeta);
  const setCreating = useProjects((s) => s.setCreating);
  const moveIssue = useProjects((s) => s.moveIssue);
  const updateIssue = useProjects((s) => s.updateIssue);
  const [view, setView] = useState<SubmetaView>("lista");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const p = detail.project;

  const all = useMemo<SubmetaRow[]>(() => detail.issues.filter((i) => i.type === "Submeta").sort((a, b) => a.order - b.order || a.number - b.number).map((i) => {
    const n = submetaNumbers(tasksOf(detail, i.id));
    return {
      id: i.id, icon: i.icon, code: i.key, name: i.title, status: i.status,
      statusColour: i.status === p.done_column ? "var(--nv-mint)" : undefined,
      priority: i.priority, progress: n.total ? n.progress : i.done ? 1 : 0, done: n.done, total: n.total,
      start: i.start, due: i.due, overdue: i.overdue, finished: i.done, colour: i.type_colour || p.colour,
    };
  }), [detail, p.colour, p.done_column]);
  const rows = filterRows(all, query, status, hideDone);

  if (submetaId) return <SubmetaStats id={submetaId} />;

  const empty = all.length ? "No hay submetas que coincidan con los filtros." : "Sin submetas. Una submeta agrupa las tareas que llevan a un objetivo.";
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-3">
      <SubmetaFilters query={query} onQuery={setQuery} status={status} onStatus={setStatus} statuses={p.columns}
        hideDone={hideDone} onHideDone={setHideDone}>
        <span className="flex-1" />
        <ViewToggle value={view} onChange={setView} />
        <PrimaryButton onClick={() => setCreating({ type: "Submeta" })}><Plus size={14} /> Nueva submeta</PrimaryButton>
      </SubmetaFilters>
      {view === "lista" ? (
        <div className="overflow-x-auto">
          <SubmetaTable rows={rows} selectedId={issueId} onOpen={openIssue} onDetail={openSubmeta} empty={empty}
            edits={{
              statuses: p.columns,
              onStatus: (id, st) => void moveIssue(id, st, 10 ** 6),
              onPriority: (id, priority) => void updateIssue(id, { priority }),
              onStart: (id, start) => void updateIssue(id, { start }),
              onDue: (id, due) => void updateIssue(id, { due }),
            }}
            onToggle={(id, done) => void moveIssue(id, done ? p.done_column : p.columns[0]!, 10 ** 6)} />
        </div>
      ) : (
        <SubmetaCardGrid rows={rows} onOpen={openIssue} onDetail={openSubmeta} empty={empty} />
      )}
      <div className="font-mono text-[10.5px] text-faint">{rows.length} de {all.length} submetas</div>
    </div>
  );
}
