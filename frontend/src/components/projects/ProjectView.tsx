// An opened project: header, the five tabs and the issue panel.

import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { api } from "../../lib/bridge";
import { shortDate } from "../../lib/tasks";
import { useApp } from "../../store/app";
import { useProjects, type ProjectTab } from "../../store/projects";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { IssueDetail } from "./IssueDetail";
import { IssueList } from "./IssueList";
import { Kanban } from "./Kanban";
import { ProjectCalendar } from "./ProjectCalendar";
import { ProjectNotes } from "./ProjectNotes";
import { Resumen } from "./Resumen";

const TABS: Array<[ProjectTab, string]> = [
  ["resumen", "Resumen"], ["tablero", "Tablero"], ["lista", "Lista"], ["calendario", "Calendario"], ["notas", "Notas"],
];

export function ProjectView() {
  const detail = useProjects((s) => s.detail);
  const tab = useProjects((s) => s.tab);
  const setTab = useProjects((s) => s.setTab);
  const open = useProjects((s) => s.open);
  const setEditing = useProjects((s) => s.setEditing);
  const setCreating = useProjects((s) => s.setCreating);
  const areas = useProjects((s) => s.areas);
  const toast = useApp((s) => s.toast);

  // C creates an issue, as in Jira.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      setCreating({});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCreating]);

  if (!detail) return <div className="grid flex-1 place-items-center text-[13px] text-faint">Cargando proyecto…</div>;
  const p = detail.project;
  const area = areas.find((a) => a.id === p.area);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-none px-5 pt-3">
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => void open(null)} className="border-transparent px-1.5"><ChevronLeft size={14} /> Proyectos</GhostButton>
            <span className="flex-1" />
            <GhostButton onClick={() => setEditing(p.id)}><Pencil size={13} /> Editar proyecto…</GhostButton>
            <GhostButton danger onClick={async () => {
              if (!(await confirmAction("Eliminar proyecto",
                `¿Eliminar «${p.name}» y sus ${detail.issues.length} issues? Se mueve a la papelera de la vault. Si solo quieres cerrarlo, cámbialo a «Terminado».`,
                "Eliminar", true))) return;
              try {
                await api.projectsDelete(p.id);
                await open(null);
              } catch (e) {
                toast("error", (e as Error).message);
              }
            }}><Trash2 size={13} /> Eliminar</GhostButton>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[28px] leading-none">{p.icon || "◫"}</span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold text-faint">{p.key}</div>
              <h1 className="truncate text-[21px] font-semibold text-text" title={p.name}>{p.name}</h1>
            </div>
            <div className="ml-2 flex flex-wrap items-center gap-1.5">
              <Chip colour={p.status_colour}>{p.status}</Chip>
              {area && <Chip colour={area.colour}>{area.icon} {area.name}</Chip>}
              {p.deadline && <Chip colour={p.overdue ? "var(--nv-danger)" : (p.days_left ?? 99) <= 7 ? "var(--nv-warn)" : undefined}>⏰ {shortDate(p.deadline)}</Chip>}
              {p.in_calendar && <Chip>📅 En el calendario</Chip>}
            </div>
            <span className="flex-1" />
            <BlockProgress value={detail.progress} colour={p.colour} blocks={20} className="max-xl:hidden" />
            <GhostButton onClick={() => setCreating({ type: "Submeta" })} className="text-[#a78bfa]"><Plus size={13} /> Submeta</GhostButton>
            <PrimaryButton onClick={() => setCreating({})}><Plus size={14} /> Crear issue</PrimaryButton>
          </div>
          <nav className="mt-3 flex gap-1 border-b border-line" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("-mb-px border-b-2 px-3.5 py-2 text-[13px]", tab === k ? "border-accent font-semibold text-text" : "border-transparent text-dim hover:text-text")}>
                {l}
              </button>
            ))}
          </nav>
        </div>
        {tab === "resumen" ? <Resumen /> : tab === "tablero" ? <Kanban /> : tab === "lista" ? <IssueList />
          : tab === "calendario" ? <ProjectCalendar /> : <ProjectNotes />}
      </div>
      <IssueDetail />
    </div>
  );
}
