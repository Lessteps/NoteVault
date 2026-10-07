// Mentor — Proyectos: los proyectos activos como en su módulo, DESPLEGABLES (issues abiertos) y de
// SOLO LECTURA. Se trabajan en el módulo Proyectos (botón "Abrir en Proyectos").

import { ChevronsUpDown, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDate, todayIso } from "../../lib/tasks";
import type { MentorIssueSlim, MentorProjectCard } from "../../lib/types";
import { useApp } from "../../store/app";
import { useProjects } from "../../store/projects";
import { BlockProgress, Sparkline } from "../common/charts";
import { Chip, GhostButton } from "../common/forms";
import { PriorityMark } from "../projects/IssueBits";
import { cn } from "../ui";
import { AreaRow, CARD_CLASS, Disclosure, LoadState, PanelPage, useMentorPanels } from "./parts";

async function openProject(id: string): Promise<void> {
  await useProjects.getState().open(id);
  useApp.getState().setModule("proyectos");
}

export function MentorProjects() {
  const { panels, warming, error, reload } = useMentorPanels();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    if (!panels) return [];
    const out: Array<{ key: string; title: string; colour: string; items: typeof panels.projects }> = [];
    for (const a of panels.areas) {
      const items = panels.projects.filter((p) => p.area === a.id);
      if (items.length) out.push({ key: a.id, title: `${a.icon} ${a.name}`, colour: a.colour, items });
    }
    const rest = panels.projects.filter((p) => !panels.areas.some((a) => a.id === p.area));
    if (rest.length) out.push({ key: "_", title: "Sin área", colour: "var(--nv-dim)", items: rest });
    return out;
  }, [panels]);
  const ids = panels?.projects.map((p) => p.id) ?? [];
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <PanelPage title="Mentor — Proyectos" subtitle="Resumen de tus proyectos activos. Se trabajan en el módulo Proyectos." wide>
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />
      {panels && panels.projects.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint">No hay proyectos en curso ni planeados.</p>
      )}
      {panels && panels.projects.length > 0 && (
        <div className="flex items-center gap-2 text-[11.5px] text-faint">
          <span>{panels.projects.length} proyecto{panels.projects.length !== 1 ? "s" : ""} en curso o planeados</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(ids))}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-dim hover:bg-hover hover:text-text"
          >
            <ChevronsUpDown size={12} /> {allOpen ? "Contraer todos" : "Expandir todos"}
          </button>
        </div>
      )}
      {panels && (
        <div className="space-y-5">
          {groups.map((g) => (
            <AreaRow key={g.key} title={g.title} colour={g.colour} count={g.items.length} noun={["proyecto", "proyectos"]} avg={g.items.reduce((a, p) => a + p.summary.progress, 0) / g.items.length}>
              {g.items.map((p) => (
                <ProjectAccordion key={p.id} project={p} area={panels.areas.find((a) => a.id === p.area)} open={open.has(p.id)} onToggle={() => toggle(p.id)} />
              ))}
            </AreaRow>
          ))}
        </div>
      )}
    </PanelPage>
  );
}

export function ProjectAccordion({
  project: p,
  area,
  open,
  onToggle,
}: {
  project: MentorProjectCard;
  area?: { name: string; icon: string; colour: string };
  open: boolean;
  onToggle: () => void;
}) {
  const s = p.summary;
  return (
    <section
      className={CARD_CLASS}
      style={{ borderTop: `3px solid ${p.colour}` }}
      data-testid="project-card"
      aria-label={`Proyecto ${p.name}`}
    >
      <Disclosure open={open} onToggle={onToggle} label={`${open ? "Contraer" : "Expandir"} ${p.name}`}>
        <div className="flex items-start gap-2.5">
          <span className="text-[20px] leading-none">{p.icon || "◫"}</span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-semibold text-faint">{p.key}</div>
            <div className="text-[14px] font-semibold leading-snug text-text">{p.name}</div>
          </div>
          <Chip colour={p.status_colour}>{p.status}</Chip>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <BlockProgress value={s.progress} colour={p.colour} />
          <span className="text-[11.5px] font-medium text-text">{Math.round(s.progress * 100)} %</span>
          <span className="text-[11px] text-dim">{s.done}/{s.total} issues</span>
          <span className="text-[11px] text-dim">· {s.open} {s.open === 1 ? "abierta" : "abiertas"}</span>
          {s.overdue > 0 && <span className="text-[11px] text-danger">· {s.overdue} vencidas</span>}
          <span className="ml-auto flex-none">
            <Sparkline values={p.throughput} colour={p.colour} width={64} />
          </span>
        </div>
        {p.next_due && (
          <div className={cn("mt-1.5 truncate text-[11px]", p.next_due.due < todayIso() ? "text-danger" : "text-dim")}>
            Próximo: {p.next_due.key} {p.next_due.title} · {shortDate(p.next_due.due)}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.days_left !== null &&
            (p.overdue ? (
              <Chip colour="var(--nv-danger)">⏰ entrega vencida hace {-p.days_left} d</Chip>
            ) : (
              <Chip colour={p.days_left <= 7 ? "var(--nv-warn)" : undefined}>⏰ {p.days_left} días a la entrega</Chip>
            ))}
          {p.days_left === null && <Chip>Sin plazo</Chip>}
          {area && <Chip colour={area.colour}>{area.icon} {area.name}</Chip>}
        </div>
      </Disclosure>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <IssueOutline issues={p.issues} total={s.open} />
          <GhostButton onClick={() => void openProject(p.id)}>
            <ExternalLink size={13} /> Abrir en Proyectos
          </GhostButton>
        </div>
      )}
    </section>
  );
}

/** Los issues abiertos como en la lista del proyecto (hijos bajo su padre), sin controles. */
function IssueOutline({ issues, total }: { issues: MentorIssueSlim[]; total: number }) {
  if (!issues.length) return <p className="text-[12.5px] text-faint">Sin issues abiertos.</p>;
  const ids = new Set(issues.map((i) => i.id));
  const byParent = new Map<string, MentorIssueSlim[]>();
  for (const i of issues) {
    const parent = ids.has(i.parent) ? i.parent : "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), i]);
  }
  const rows: Array<[MentorIssueSlim, number]> = [];
  const walk = (parent: string, depth: number) => {
    for (const i of byParent.get(parent) ?? []) {
      rows.push([i, depth]);
      walk(i.id, depth + 1);
    }
  };
  walk("", 0);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <ul className="divide-y divide-line" aria-label="Issues abiertos">
        {rows.map(([i, depth]) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5" data-testid="project-issue" style={{ paddingLeft: 12 + depth * 12 }}>
            <span className="text-[12px]" style={{ color: i.type_colour }} title={i.type}>{i.icon}</span>
            <span className="w-14 flex-none font-mono text-[11px] text-faint">{i.key}</span>
            <span className="min-w-0 flex-1 basis-40 text-[12.5px] text-text">{i.title}</span>
            {i.due && <Chip colour={i.overdue ? "var(--nv-danger)" : "var(--nv-dim)"}>⏰ {shortDate(i.due)}</Chip>}
            <PriorityMark p={i.priority} />
            <span className="text-[11.5px] text-dim">{i.status}</span>
          </li>
        ))}
      </ul>
      {total > issues.length && <p className="border-t border-line px-3 py-1.5 text-[11.5px] text-faint">y {total - issues.length} más en el proyecto…</p>}
    </div>
  );
}
