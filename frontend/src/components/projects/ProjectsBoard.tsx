// The board of projects: cards grouped by status or area.

import { Plus } from "lucide-react";
import { useState } from "react";
import { shortDate, todayIso } from "../../lib/tasks";
import type { ProjectCard } from "../../lib/types";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { BlockProgress, Sparkline } from "../common/charts";
import { Chip, inputBase, PrimaryButton } from "../common/forms";
import { cn, openMenu } from "../ui";

export function ProjectsBoard() {
  const cards = useProjects((s) => s.cards);
  const meta = useProjects((s) => s.meta);
  const areas = useProjects((s) => s.areas);
  const open = useProjects((s) => s.open);
  const setEditing = useProjects((s) => s.setEditing);
  const loadAll = useProjects((s) => s.loadAll);
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState<"estado" | "area" | "none">("estado");

  const shown = cards.filter((p) => (!status || p.status === status)
    && (!q || `${p.name} ${p.key} ${p.description}`.toLowerCase().includes(q.toLowerCase())));
  const groups: Array<[string, string, ProjectCard[]]> = [];
  if (group === "estado") {
    for (const s of meta?.statuses ?? []) {
      const items = shown.filter((p) => p.status === s);
      if (items.length) groups.push([s, meta!.status_colours[s] ?? "var(--nv-dim)", items]);
    }
  } else if (group === "area") {
    for (const a of areas) {
      const items = shown.filter((p) => p.area === a.id);
      if (items.length) groups.push([`${a.icon} ${a.name}`, a.colour, items]);
    }
    const rest = shown.filter((p) => !areas.some((a) => a.id === p.area));
    if (rest.length) groups.push(["Sin área", "var(--nv-dim)", rest]);
  } else groups.push(["", "", shown]);

  const active = cards.filter((p) => p.status === "En curso").length;
  const done = cards.filter((p) => p.status === "Terminado").length;
  const sel = cn(inputBase, "py-1 text-[12px]");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-3 text-[21px] font-semibold text-text">◫ Proyectos</h1>
        <input className={cn(sel, "w-52")} placeholder="Buscar proyectos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Estado: todos</option>
          {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
          <option value="estado">Agrupar por estado</option>
          <option value="area">Agrupar por área</option>
          <option value="none">Sin agrupar</option>
        </select>
        <span className="flex-1" />
        <PrimaryButton onClick={() => setEditing("")}><Plus size={14} /> Nuevo proyecto</PrimaryButton>
      </div>
      <p className="mb-4 text-[11.5px] text-faint">{shown.length} de {cards.length} proyectos · {active} en curso · {done} terminados</p>
      {!cards.length && (
        <p className="mx-auto mt-16 max-w-md text-center text-[13px] leading-relaxed text-faint">
          Todavía no hay proyectos. Un proyecto reúne submetas, tareas y errores en un tablero Kanban, con estadísticas y calendario propios.
        </p>
      )}
      <div className="space-y-6">
        {groups.map(([title, colour, items]) => (
          <section key={title || "all"}>
            {title && <h2 className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold" style={{ color: colour }}>{title}<span className="text-[12px] font-normal text-faint">{items.length}</span></h2>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
              {items.map((p) => {
                const s = p.summary;
                const area = areas.find((a) => a.id === p.area);
                return (
                  <button key={p.id} type="button" onClick={() => void open(p.id)}
                    onContextMenu={(e) => openMenu(e, [
                      { label: "Abrir", onSelect: () => void open(p.id) },
                      { label: "Editar…", onSelect: () => setEditing(p.id) },
                      ...(meta?.statuses ?? []).filter((x) => x !== p.status).map((st) => ({
                        label: `Estado: ${st}`,
                        onSelect: () => void api.projectsUpdate(p.id, { status: st }).then(loadAll).catch((err) => toast("error", (err as Error).message)),
                      })),
                    ])}
                    className="rounded-xl border border-line bg-card p-4 text-left hover:border-line-strong"
                    style={{ borderTop: `3px solid ${p.colour}` }}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[20px] leading-none">{p.icon || "◫"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] font-semibold text-faint">{p.key}</div>
                        <div className="text-[14px] font-semibold leading-snug text-text">{p.name}</div>
                      </div>
                      <Chip colour={p.status_colour}>{p.status}</Chip>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <BlockProgress value={s.progress} colour={p.colour} />
                      <span className="ml-auto text-[11px] text-dim">{s.done}/{s.total} issues</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                      <span className="text-dim">{s.open} abiertas</span>
                      {s.overdue > 0 && <span className="text-danger">· {s.overdue} vencidas</span>}
                      <span className="ml-auto"><Sparkline values={p.throughput} colour={p.colour} /></span>
                    </div>
                    {p.next_due && (
                      <div className={cn("mt-1.5 truncate text-[11px]", p.next_due.due < todayIso() ? "text-danger" : "text-dim")}>
                        Próximo: {p.next_due.key} {p.next_due.title} · {shortDate(p.next_due.due)}
                      </div>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {p.days_left !== null && (p.overdue
                        ? <Chip colour="var(--nv-danger)">⏰ entrega vencida hace {-p.days_left} d</Chip>
                        : <Chip colour={p.days_left <= 7 ? "var(--nv-warn)" : undefined}>⏰ {p.days_left} días a la entrega</Chip>)}
                      {area && <Chip colour={area.colour}>{area.icon} {area.name}</Chip>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
