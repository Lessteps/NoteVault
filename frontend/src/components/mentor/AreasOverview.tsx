// Mentor — «Áreas»: un índice de SOLO LECTURA del avance de cada espacio de estudio, área y tema, sin depender de ningún plan. Tres niveles
// (espacios -> áreas -> temas) con migas de pan; el desglose se recuerda en `mentor.areas.path`. Los datos salen de una sola llamada por nivel
// (`mentor_areas_overview`) y las acciones abren las vistas de siempre de Notas: aquí no se edita ni se genera nada.

import { ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import {
  filterTopics, joinPath, parsePath, planMembership, sortAreas, STATE_LABEL, TOPIC_FILTERS,
  type AreaRow, type AreaSort, type PlanMembership, type SpaceRow, type TopicFilter, type TopicRow, type TopicState,
} from "../../lib/mentorAreasOverview";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { usePersistedNav } from "../../store/navState";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { openTopic, openTopicNote } from "./openTopic";

export const AREAS_PATH_KEY = "mentor.areas.path";
const PAGE = 100;

const STATE_COLOUR: Record<TopicState, string> = { sin_tratar: "var(--nv-faint)", en_curso: "var(--nv-accent)", completo: "var(--nv-mint)" };
const ringColour = (pct: number): string => (pct >= 80 ? "var(--nv-mint)" : pct >= 40 ? "var(--nv-accent)" : pct > 0 ? "var(--nv-warn)" : "var(--nv-line-strong)");

export function Ring({ pct, size = 52 }: { pct: number; size?: number }) {
  const t = 5;
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct} % de avance`} className="flex-none" data-testid="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--nv-elevated)" strokeWidth={t} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColour(pct)} strokeWidth={t} strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size > 48 ? 12 : 10} fontWeight={600} fill="var(--nv-text)">{pct}</text>
    </svg>
  );
}

type Level = "spaces" | "areas" | "topics";
interface Loaded<T> {
  rows: T[];
  loading: boolean;
  error: string;
}
/** Una llamada por nivel; se repite mientras el índice de la vault aún se calienta. */
function useLevel<T>(level: Level, space: string, area: string, version: number): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ rows: [], loading: true, error: "" });
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const run = (): void => {
      api
        .mentorAreasOverview({ level, space, area })
        .then((r) => {
          if (!live) return;
          if (r.loading && tries++ < 40) {
            timer = setTimeout(run, 1500);
            return;
          }
          setState({ rows: r.rows as T[], loading: false, error: "" });
        })
        .catch((e: unknown) => live && setState({ rows: [], loading: false, error: (e as Error).message }));
    };
    setState((s) => ({ ...s, loading: true }));
    run();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [level, space, area, version]);
  return state;
}

/** La ruta del plan en curso (si hay), para la insignia «En tu plan»: una sola lectura del plan ya existente. */
function usePlanBadge(): PlanMembership | null {
  const plans = useMentor((s) => s.plans);
  const active = plans.find((p) => p.status === "activo");
  const [m, setM] = useState<PlanMembership | null>(null);
  useEffect(() => {
    let live = true;
    if (!active) {
      setM(null);
      return;
    }
    api
      .mentorPlanGet(active.id)
      .then((r) => live && setM(r && !r.loading ? planMembership(active.name, r.plan) : null))
      .catch(() => live && setM(null));
    return () => {
      live = false;
    };
  }, [active?.id, active?.name]);
  return m;
}

const fmtDate = (d: string): string => d || "sin actividad";

export function AreasOverview() {
  const [raw, setRaw] = usePersistedNav<string>(AREAS_PATH_KEY, "");
  const { space, area } = parsePath(raw);
  const level: Level = !space ? "spaces" : !area ? "areas" : "topics";
  const version = useMentor((s) => s.planVersion);
  const badge = usePlanBadge();
  const go = useCallback((s: string, a = ""): void => setRaw(joinPath(s, a)), [setRaw]);
  const areaName = area.split("/").pop() ?? area;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="areas-overview">
      <header className="flex-none border-b border-line px-5 py-3">
        <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-1 text-[13px]" data-testid="areas-crumbs">
          <Crumb label="Áreas" on={level === "spaces"} onClick={() => go("")} />
          {space && (
            <>
              <ChevronRight size={13} className="text-faint" aria-hidden />
              <Crumb label={space} on={level === "areas"} onClick={() => go(space)} />
            </>
          )}
          {area && (
            <>
              <ChevronRight size={13} className="text-faint" aria-hidden />
              <Crumb label={areaName} on onClick={() => go(space, area)} />
            </>
          )}
        </nav>
        <p className="mt-1 text-[12px] text-faint">Resumen de solo lectura del avance real en tus notas; no depende de ningún plan.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {level === "spaces" && <SpacesLevel version={version} onOpen={(s) => go(s)} />}
        {level === "areas" && <AreasLevel space={space} version={version} badge={badge} onOpen={(a) => go(space, a)} />}
        {level === "topics" && <TopicsLevel space={space} area={area} version={version} badge={badge} />}
      </div>
    </div>
  );
}

function Crumb({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? "page" : undefined} className={cn("rounded px-1.5 py-0.5", on ? "font-semibold text-text" : "text-accent-text hover:underline")}>
      {label}
    </button>
  );
}

function Status({ s, empty }: { s: Loaded<unknown>; empty: string }) {
  if (s.error) return <p className="text-[13px] text-danger" role="alert">{s.error}</p>;
  if (s.loading && !s.rows.length) return <p className="text-[13px] text-faint" data-testid="areas-loading">Leyendo tus notas…</p>;
  if (!s.rows.length) return <p className="text-[13px] text-faint" data-testid="areas-empty">{empty}</p>;
  return null;
}

function Counts({ r }: { r: { topics: number; completed: number; exercisesDone: number; exercisesTotal: number; reviewsDue: number } }) {
  return (
    <p className="text-[12px] text-dim">
      {r.completed}/{r.topics} temas · {r.exercisesDone}
      {r.exercisesTotal ? `/${r.exercisesTotal}` : ""} ejercicios
      {r.reviewsDue ? <span className="text-warn"> · {r.reviewsDue} {r.reviewsDue === 1 ? "repaso" : "repasos"}</span> : null}
    </p>
  );
}

function SpacesLevel({ version, onOpen }: { version: number; onOpen: (space: string) => void }) {
  const s = useLevel<SpaceRow>("spaces", "", "", version);
  return (
    <>
      <Status s={s} empty="Aún no hay espacios de estudio con temas en tu vault." />
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {s.rows.map((r) => (
          <li key={r.space}>
            <button type="button" onClick={() => onOpen(r.space)} data-testid={`space-${r.space}`} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card p-4 text-left hover:bg-hover">
              <Ring pct={r.pct} size={60} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-text">{r.space}</span>
                <span className="block text-[12px] text-dim">{r.areas} {r.areas === 1 ? "área" : "áreas"} · {r.topics} temas</span>
                <Counts r={r} />
                <span className="block text-[11px] text-faint">Última actividad: {fmtDate(r.lastActivity)}</span>
              </span>
              <ChevronRight size={16} className="flex-none text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AreasLevel({ space, version, badge, onOpen }: { space: string; version: number; badge: PlanMembership | null; onOpen: (area: string) => void }) {
  const s = useLevel<AreaRow>("areas", space, "", version);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<AreaSort>("nombre");
  const rows = useMemo(() => sortAreas(s.rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())), sort), [s.rows, q, sort]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[13px]">
          <Search size={13} className="text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar área" aria-label="Buscar área" className="w-44 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-dim">
          Ordenar por
          <select value={sort} onChange={(e) => setSort(e.target.value as AreaSort)} aria-label="Ordenar áreas" className="rounded-md border border-line bg-card px-1.5 py-1 text-[13px] text-text">
            <option value="nombre">Nombre</option>
            <option value="avance">Avance</option>
          </select>
        </label>
      </div>
      <Status s={s} empty="Este espacio aún no tiene áreas con temas." />
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {rows.map((r) => (
          <li key={r.area}>
            <button type="button" onClick={() => onOpen(r.area)} data-testid={`area-${r.name}`} className="flex w-full items-center gap-3 rounded-xl border border-line bg-card p-4 text-left hover:bg-hover">
              <Ring pct={r.pct} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-text">{r.name}</span>
                <Counts r={r} />
                <span className="mt-1 flex flex-wrap gap-1">
                  <Chip colour={STATE_COLOUR[r.state]}>{STATE_LABEL[r.state]}</Chip>
                  {badge?.areas.has(r.area) && <Chip colour="var(--nv-mint)">En tu plan: {badge.planName}</Chip>}
                </span>
              </span>
              <ChevronRight size={16} className="flex-none text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function TopicsLevel({ space, area, version, badge }: { space: string; area: string; version: number; badge: PlanMembership | null }) {
  const s = useLevel<TopicRow>("topics", space, area, version);
  const [filter, setFilter] = useState<TopicFilter>("todos");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => filterTopics(s.rows, filter, q), [s.rows, filter, q]);
  useEffect(() => setShown(PAGE), [filter, q, area]);
  const count = (f: TopicFilter): number => filterTopics(s.rows, f).length;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar temas" className="flex flex-wrap gap-1">
          {TOPIC_FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`filter-${f.id}`} className={cn("min-h-8 rounded-lg border px-2.5 text-[12.5px]", filter === f.id ? "border-accent bg-accent-soft text-text" : "border-line text-dim hover:bg-hover")}>
              {f.label} <span className="font-mono text-[10.5px] text-faint">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <label className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[13px]">
          <Search size={13} className="text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tema" aria-label="Buscar tema" className="w-40 bg-transparent outline-none" />
        </label>
      </div>
      <Status s={s} empty="Esta área aún no tiene temas." />
      {s.rows.length > 0 && !rows.length && <p className="text-[13px] text-faint" data-testid="areas-no-match">Ningún tema coincide con el filtro.</p>}
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]" data-testid="topic-grid">
        {rows.slice(0, shown).map((t) => (
          <li key={t.folder} data-testid="topic-card" className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-start gap-3">
              <Ring pct={t.pct} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] text-faint">{t.code || "—"}</p>
                <p className="break-words text-[13.5px] font-semibold text-text" title={t.title}>{t.title}</p>
                <p className="text-[12px] text-dim">
                  {t.exercisesDone}
                  {t.exercisesTotal ? `/${t.exercisesTotal}` : ""} ejercicios
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Chip colour={STATE_COLOUR[t.state]}>{STATE_LABEL[t.state]}</Chip>
              {t.nextReview && <Chip colour={t.reviewDue ? "var(--nv-warn)" : "var(--nv-dim)"}>{t.reviewDue ? "Repaso pendiente" : `Repaso ${t.nextReview}`}</Chip>}
              {badge?.folders.has(t.folder) && <Chip colour="var(--nv-mint)">En tu plan: {badge.planName}</Chip>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <GhostButton onClick={() => void openTopic(t.folder)} data-testid="topic-open">Abrir tema</GhostButton>
              <GhostButton onClick={() => void openTopicNote(t.folder)} data-testid="topic-theory">Teoría</GhostButton>
              <GhostButton onClick={() => void openExercises(t.folder)} data-testid="topic-exercises">Ejercicios</GhostButton>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > shown && (
        <div className="mt-3 flex justify-center">
          <GhostButton onClick={() => setShown((n) => n + PAGE)} data-testid="topics-more">Mostrar más ({rows.length - shown})</GhostButton>
        </div>
      )}
    </>
  );
}

/** «Ejercicios»: abre el primer ejercicio de la carpeta `Ejercicios` del tema; sin ella, la vista de práctica del tema. */
export async function openExercises(folder: string): Promise<void> {
  try {
    const entries = await api.listDir(`${folder}/Ejercicios`);
    const first = entries.filter((e) => e.type === "note").sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))[0];
    if (first) {
      await useApp.getState().openNote(first.path);
      return;
    }
  } catch {
    /* sin carpeta de ejercicios: se abre la vista del tema */
  }
  await openTopic(folder);
}
