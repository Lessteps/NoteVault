// Mentor — Proyectos: PREVISUALIZACIÓN de los proyectos activos (estado, plazo, issues abiertos).
// Solo lectura: se trabajan en el módulo Proyectos (botón "Abrir en Proyectos").

import { ExternalLink, FolderKanban } from "lucide-react";
import { useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton } from "../common/forms";
import { dayText, daysLeftText, LoadState, PanelPage, useMentorPanels } from "./parts";

async function openProject(id: string): Promise<void> {
  await useProjects.getState().open(id);
  useApp.getState().setModule("proyectos");
}

export function MentorProjects() {
  const { panels, warming, error, reload } = useMentorPanels();
  return (
    <PanelPage title="Mentor — Proyectos" subtitle="Previsualización de tus proyectos activos. Se trabajan en el módulo Proyectos." wide>
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />
      {panels && panels.projects.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint">No hay proyectos en curso ni planeados.</p>
      )}
      {panels && (
        <div className="grid gap-4 @3xl:grid-cols-2">
          {panels.projects.map((p) => (
            <section key={p.id} className="rounded-xl border border-line bg-card p-4" data-testid="project-card" aria-label={`Proyecto ${p.name}`}>
              <div className="flex flex-wrap items-center gap-2">
                <FolderKanban size={15} className="flex-none text-accent-text" />
                <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.name}</h3>
                <Chip colour={p.status_colour}>{p.status}</Chip>
              </div>
              <p className="mt-1 text-[12px] text-faint">
                {p.deadline ? `Plazo ${dayText(p.deadline)} · ${daysLeftText(p.days_left)}` : "Sin plazo"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <BlockProgress value={p.summary.progress} colour={p.colour || "var(--nv-accent)"} blocks={20} />
                <span className="text-[12px] text-dim">{Math.round(p.summary.progress * 100)} %</span>
              </div>
              <p className="mt-2 text-[12.5px] text-dim">
                {p.summary.open} {p.summary.open === 1 ? "issue abierto" : "issues abiertos"} de {p.summary.total}
                {p.summary.overdue > 0 && <span className="text-danger"> · {p.summary.overdue} vencidos</span>}
              </p>
              {p.next_due && (
                <p className="mt-0.5 text-[12px] text-faint">
                  Próximo: {p.next_due.key} {p.next_due.title} ({dayText(p.next_due.due)})
                </p>
              )}
              <div className="mt-3">
                <GhostButton onClick={() => void openProject(p.id)}>
                  <ExternalLink size={13} /> Abrir en Proyectos
                </GhostButton>
              </div>
            </section>
          ))}
        </div>
      )}
    </PanelPage>
  );
}
