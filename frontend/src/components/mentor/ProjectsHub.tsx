// Mentor — el HUB de proyectos: lo que ya hay en la carpeta de la ruta (`<Materia>/Mentor/Ruta …`), por área y por tipo (diarios · semanales · mensuales),
// con el avance de cada proyecto (casillas de sus .md), sus archivos para abrirlos en NoteVault y «Ver carpeta» (dentro de NoteVault o en Windows).

import { FileText, FolderPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import type { ProjectKind, ProjectListItem, ProjectsListing } from "../../lib/projectTemplates";
import { useApp } from "../../store/app";
import { cn } from "../ui";
import { Chip, GhostButton } from "../common/forms";
import { focusColour } from "./agendaKit";
import { FolderOpenMenu } from "./FolderOpenMenu";
import { ProgressBar } from "./parts";

const KINDS: Array<{ kind: ProjectKind; label: string }> = [
  { kind: "daily", label: "Diarios" },
  { kind: "weekly", label: "Semanales" },
  { kind: "monthly", label: "Mensuales" },
];
const STATUS: Record<ProjectListItem["status"], { label: string; colour: string }> = {
  new: { label: "Sin empezar", colour: "var(--nv-faint)" },
  doing: { label: "En curso", colour: "var(--nv-accent)" },
  done: { label: "Hecho", colour: "var(--nv-mint)" },
};

export function ProjectsHub({ planId }: { planId: string }) {
  const [data, setData] = useState<ProjectsListing | null>(null);
  const [area, setArea] = useState<string>("all");
  const [kind, setKind] = useState<ProjectKind>("daily");
  const [busy, setBusy] = useState(false);
  const toast = useApp.getState().toast;
  // se recarga al crear/mover carpetas (el botón «Crear carpeta del proyecto» y el árbol de notas avisan con `treeVersion`)
  const version = useApp((st) => st.treeVersion);

  const load = useCallback(async () => {
    try {
      const r = await api.mentorProjectsList(planId);
      setData({ ...r, areas: r.areas ?? [] });
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [planId, toast]);
  useEffect(() => void load(), [load, version]);

  const prepare = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.mentorProjectsScaffold({ id: planId, areaKeys: [] });
      toast("info", "Estructura de la ruta lista en Mentor.");
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="text-[14px] text-dim" data-testid="projects-hub-loading">Cargando proyectos…</p>;

  const rows = data.areas
    .filter((a) => area === "all" || a.areaKey === area)
    .flatMap((a) => (a.kinds.find((k) => k.kind === kind)?.projects ?? []).map((p) => ({ a, p })));
  const countOf = (k: ProjectKind): number => data.areas.filter((a) => area === "all" || a.areaKey === area).reduce((n, a) => n + (a.kinds.find((x) => x.kind === k)?.projects.length ?? 0), 0);

  return (
    <section aria-labelledby="projects-hub-h" className="space-y-3" data-testid="projects-hub">
      <header className="flex flex-wrap items-center gap-2">
        <h3 id="projects-hub-h" className="text-[16px] font-semibold">Mis proyectos en la carpeta</h3>
        {data.exists && <FolderOpenMenu dir={data.route} label="Ver la ruta" testid="hub-route-folder" />}
        <GhostButton onClick={() => void prepare()} disabled={busy} data-testid="hub-prepare">
          <FolderPlus size={15} aria-hidden /> {data.exists ? "Reponer estructura" : "Crear la estructura de la ruta"}
        </GhostButton>
      </header>

      {!data.exists ? (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] text-dim" data-testid="hub-empty">
          Aún no hay carpeta de proyectos para esta ruta. Créala aquí, o usa «Crear carpeta del proyecto» en el proyecto de hoy: cada proyecto tendrá su carpeta con README, especificación, plan, bitácora y entrega.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por área" data-testid="hub-areas">
            {[{ areaKey: "all", area: "Todas" }, ...data.areas].map((a) => (
              <button
                key={a.areaKey}
                type="button"
                aria-pressed={area === a.areaKey}
                onClick={() => setArea(a.areaKey)}
                data-testid={`hub-area-${a.areaKey}`}
                className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[13.5px]", area === a.areaKey ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover")}
              >
                {a.areaKey !== "all" && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: focusColour(a.areaKey) }} />}
                {a.area}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border-b border-line" role="group" aria-label="Tipo de proyecto" data-testid="hub-kinds">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                aria-pressed={kind === k.kind}
                onClick={() => setKind(k.kind)}
                data-testid={`hub-kind-${k.kind}`}
                className={cn("-mb-px min-h-9 border-b-2 px-3 text-[14px] font-medium", kind === k.kind ? "border-accent text-accent-text" : "border-transparent text-dim hover:text-text")}
              >
                {k.label} <span className="text-[12px] text-faint">{countOf(k.kind)}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="text-[14px] text-dim" data-testid="hub-none">Todavía no hay proyectos {KINDS.find((k) => k.kind === kind)!.label.toLowerCase()} aquí. Se crean con «Crear carpeta del proyecto».</p>
          ) : (
            <ul className="grid gap-3 @3xl:grid-cols-2" data-testid="hub-list">
              {rows.map(({ a, p }) => (
                <li key={p.dir} className="space-y-2 rounded-xl border border-line bg-card p-3.5" data-testid="hub-project" data-status={p.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-accent/15 px-2 py-0.5 text-[11.5px] font-semibold text-accent-text">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: focusColour(a.areaKey) }} /> {a.area}
                    </span>
                    <Chip colour={STATUS[p.status].colour}>{STATUS[p.status].label}</Chip>
                  </div>
                  <h4 className="text-[15.5px] font-semibold leading-snug">{p.name}</h4>
                  {p.total > 0 && (
                    <div className="space-y-1">
                      <ProgressBar pct={(p.done / p.total) * 100} label={`Avance de ${p.name}`} />
                      <p className="text-[12.5px] text-dim">{p.done} de {p.total} casillas</p>
                    </div>
                  )}
                  <ul className="flex flex-wrap gap-1.5" aria-label="Archivos del proyecto">
                    {p.files.map((f) => (
                      <li key={f}>
                        <button
                          type="button"
                          onClick={() => void useApp.getState().openNote(`${p.dir}/${f}`)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-2 text-[12.5px] text-dim hover:bg-hover hover:text-text"
                          data-testid="hub-file"
                        >
                          <FileText size={13} aria-hidden /> {f.replace(/\.md$/, "")}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <FolderOpenMenu dir={p.dir} testid="hub-folder" />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
