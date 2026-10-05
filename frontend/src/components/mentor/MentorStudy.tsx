// Mentor — Notas y estudio: las áreas de estudio (materias) como tarjetas desplegables igual que Metas y
// Proyectos, de SOLO LECTURA. Cada área resume sus temas (a medias, sin tratar, completos), su
// completitud media y sus alertas; desplegada muestra sus grupos internos y los temas con su estado.
// El detalle con anillos sigue en el Resumen de estudio (botón "Abrir en Estudio").

import { ChevronsUpDown, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { MentorAreaTopic, MentorStudyArea } from "../../lib/types";
import { BlockProgress } from "../common/charts";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { openTopic } from "./openTopic";
import { Disclosure, LoadState, PanelPage, useMentorPanels } from "./parts";

type StatusFilter = "all" | "in_progress" | "untreated" | "exam" | "complete";

const FILTERS: Array<[StatusFilter, string]> = [
  ["all", "Todos"],
  ["in_progress", "A medias"],
  ["untreated", "Sin tratar"],
  ["exam", "Examen pendiente"],
  ["complete", "Completos"],
];

const STATUS_LABEL = { complete: "Completo", in_progress: "A medias", untreated: "Sin tratar" } as const;
const STATUS_COLOUR = { complete: "var(--nv-mint)", in_progress: "var(--nv-accent)", untreated: "var(--nv-dim)" } as const;
/** Temas que se pintan de golpe por área; el resto sale con "Mostrar más" (305 temas siguen fluidos). */
const PAGE = 60;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const norm = (v: string): string => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const matches = (t: MentorAreaTopic, q: string, f: StatusFilter): boolean => {
  if (f === "exam" ? !t.examPending : f !== "all" && t.status !== f) return false;
  return !q || norm(`${t.title} ${t.group} ${t.weakSkills.join(" ")}`).includes(q);
};

export function MentorStudy() {
  const { panels, warming, error, reload } = useMentorPanels();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const s = panels?.study;
  const q = norm(query.trim());
  const filtering = q !== "" || status !== "all";

  const visible = useMemo(() => {
    if (!s) return [];
    return s.areas
      .map((a) => {
        const groups = a.groups
          .map((g) => ({ ...g, topics: g.topics.filter((t) => matches(t, q, status)) }))
          .filter((g) => g.topics.length > 0);
        return { area: a, groups, shown: groups.reduce((n, g) => n + g.topics.length, 0) };
      })
      .filter((v) => !filtering || v.shown > 0);
  }, [s, q, status, filtering]);

  const ids = visible.map((v) => v.area.id);
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id));
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <PanelPage title="Mentor — Notas y estudio" subtitle="Tus áreas de estudio y dónde estás en cada tema. El detalle con anillos está en el Resumen de estudio." wide>
      <LoadState warming={warming} error={error} empty={!panels} onRetry={() => void reload()} />
      {s && s.areas.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center" data-testid="study-empty">
          <p className="mx-auto max-w-md text-[13px] leading-relaxed text-faint">
            Todavía no hay temas de estudio. Crea un tema con su manifiesto en tus notas y aparecerá aquí con su progreso.
          </p>
        </div>
      )}
      {s && s.areas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="study-summary">
            <Chip>{plural(s.topics.total, "tema", "temas")}</Chip>
            <Chip colour="var(--nv-accent)">{s.topics.inProgress} a medias</Chip>
            <Chip>{s.topics.untreated} sin tratar</Chip>
            <Chip colour="var(--nv-mint)">{s.topics.complete} completos</Chip>
            {s.srs.dueTotal > 0 && <Chip colour="var(--nv-warn)">⟳ {plural(s.srs.dueTotal, "repaso vencido", "repasos vencidos")}</Chip>}
            {s.errors.unresolved > 0 && <Chip colour="var(--nv-danger)">{plural(s.errors.unresolved, "error sin resolver", "errores sin resolver")}</Chip>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-48">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar tema…"
                aria-label="Buscar tema"
                className="w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-2.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={status === id}
                  onClick={() => setStatus(id)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11.5px]",
                    status === id ? "bg-accent-soft font-medium text-accent-text" : "text-dim hover:bg-hover hover:text-text",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-faint">
            <span>
              {filtering ? `${plural(visible.reduce((n, v) => n + v.shown, 0), "tema", "temas")} en ${plural(visible.length, "área", "áreas")}` : plural(s.areas.length, "área de estudio", "áreas de estudio")}
            </span>
            <span className="flex-1" />
            {visible.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(allOpen ? new Set() : new Set(ids))}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-dim hover:bg-hover hover:text-text"
              >
                <ChevronsUpDown size={12} /> {allOpen ? "Contraer todas" : "Expandir todas"}
              </button>
            )}
          </div>

          {visible.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint" data-testid="study-no-match">
              Ningún tema coincide con el filtro.
            </p>
          )}
          <div className="space-y-3">
            {visible.map((v) => (
              <AreaAccordion key={v.area.id} area={v.area} groups={v.groups} filtering={filtering} open={open.has(v.area.id)} onToggle={() => toggle(v.area.id)} />
            ))}
          </div>
        </>
      )}
    </PanelPage>
  );
}

export function AreaAccordion({
  area: a,
  groups,
  filtering,
  open,
  onToggle,
}: {
  area: MentorStudyArea;
  groups: MentorStudyArea["groups"];
  filtering: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const nextText = a.next ? `${a.next.kind === "continue" ? "Continúa" : "Recomendado"}: ${a.next.title}` : "";
  return (
    <section className="rounded-xl border border-line bg-card p-4" style={{ borderTop: `3px solid ${a.colour}` }} data-testid="area-card" aria-label={`Área ${a.name}`}>
      <Disclosure open={open} onToggle={onToggle} label={`${open ? "Contraer" : "Expandir"} ${a.name}`}>
        <div className="flex items-start gap-2.5">
          <span className="text-[20px] leading-none">{a.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug text-text">{a.name}</div>
            <div className="mt-0.5 text-[11.5px] text-faint">{plural(a.total, "tema", "temas")}</div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <BlockProgress value={a.avgPct / 100} colour={a.colour} />
          <span className="text-[11.5px] font-medium text-text">{a.avgPct} %</span>
          <span className="text-[11px] text-dim">completitud media</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip colour="var(--nv-accent)">{a.inProgress} a medias</Chip>
          <Chip>{a.untreated} sin tratar</Chip>
          <Chip colour="var(--nv-mint)">{a.complete} completos</Chip>
          {a.examPending > 0 && <Chip colour="var(--nv-warn)">{plural(a.examPending, "examen pendiente", "exámenes pendientes")}</Chip>}
          {a.srsDue > 0 && <Chip colour="var(--nv-warn)">⟳ {plural(a.srsDue, "repaso vencido", "repasos vencidos")}</Chip>}
          {a.errors > 0 && <Chip colour="var(--nv-danger)">{plural(a.errors, "error", "errores")}</Chip>}
        </div>
        {nextText && <div className="mt-1.5 truncate text-[11px] text-dim" title={nextText}>{nextText}</div>}
      </Disclosure>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <AreaTopics groups={groups} filtering={filtering} colour={a.colour} />
          <GhostButton onClick={() => void openTopic(a.id, "área")}>
            <ExternalLink size={13} /> Abrir en Estudio
          </GhostButton>
        </div>
      )}
    </section>
  );
}

function AreaTopics({ groups, filtering, colour }: { groups: MentorStudyArea["groups"]; filtering: boolean; colour: string }) {
  const [limit, setLimit] = useState(PAGE);
  const total = groups.reduce((n, g) => n + g.topics.length, 0);
  if (total === 0) return <p className="text-[12.5px] text-faint">{filtering ? "Ningún tema coincide con el filtro." : "Esta área aún no tiene temas."}</p>;
  let left = limit;
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const take = g.topics.slice(0, Math.max(0, left));
        left -= take.length;
        if (!take.length) return null;
        const done = g.topics.filter((t) => t.status === "complete").length;
        return (
          <div key={g.key} data-testid="area-group">
            {(groups.length > 1 || g.key !== "") && (
              <h3 className="mb-1 flex flex-wrap items-center gap-x-2 text-[12px] font-semibold text-dim">
                {g.title}
                <span className="font-normal text-faint">{done}/{g.topics.length} completos</span>
              </h3>
            )}
            <div className="overflow-hidden rounded-lg border border-line">
              <ul className="divide-y divide-line">
                {take.map((t) => (
                  <TopicRow key={t.folder} t={t} colour={colour} />
                ))}
              </ul>
            </div>
          </div>
        );
      })}
      {total > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="text-[12px] text-accent-text hover:underline">
          Mostrar {Math.min(PAGE, total - limit)} más ({total - limit} sin mostrar)
        </button>
      )}
    </div>
  );
}

function TopicRow({ t, colour }: { t: MentorAreaTopic; colour: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5" data-testid="topic-row">
      <span className="min-w-0 flex-1 basis-44 truncate text-[12.5px] font-medium text-text" title={t.title}>{t.title}</span>
      <Chip colour={t.examPending ? "var(--nv-warn)" : STATUS_COLOUR[t.status]}>{t.examPending ? "Examen pendiente" : STATUS_LABEL[t.status]}</Chip>
      <span className="inline-flex flex-none items-center gap-1.5">
        <BlockProgress value={t.completenessPct / 100} colour={colour} blocks={6} />
        <span className="w-9 text-right text-[11.5px] text-dim">{t.completenessPct} %</span>
      </span>
      {t.weakSkills.map((sk) => (
        <Chip key={sk} colour="var(--nv-warn)">{sk}</Chip>
      ))}
      {t.lastAttemptDays !== null && (
        <span className="whitespace-nowrap text-[11px] text-faint">último intento {t.lastAttemptDays === 0 ? "hoy" : `hace ${t.lastAttemptDays} d`}</span>
      )}
      <button type="button" onClick={() => void openTopic(t.folder)} className="flex-none text-[12px] text-accent-text hover:underline">
        ver tema
      </button>
    </li>
  );
}
