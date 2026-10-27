// Mentor — «Áreas»: un índice de SOLO LECTURA del avance de cada espacio de estudio, área y tema, sin depender de ningún plan. Tres niveles
// (espacios -> áreas -> temas) con migas de pan; el desglose se recuerda en `mentor.areas.path`. Los datos salen de una sola llamada por nivel
// (`mentor_areas_overview`) y las acciones abren las vistas de siempre de Notas: aquí no se edita ni se genera nada.

import { ChevronRight, LayoutGrid, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import {
  filterTopics, joinPath, parsePath, planMembership, sortAreas, STATE_LABEL, TOPIC_FILTERS,
  type AreaRow, type AreaSort, type PlanMembership, type SpaceRow, type TopicFilter, type TopicRow, type TopicState,
} from "../../lib/mentorAreasOverview";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState, usePersistedNav } from "../../store/navState";
import { Chip, GhostButton } from "../common/forms";
import type { SidebarItem } from "../ModuleSidebar";
import { cn } from "../ui";
import { openTopic, openTopicNote } from "./openTopic";
import type { AreaCoverage } from "../../lib/curriculum";
import { isLacking, pendingAreas, relatedCoverage } from "../../lib/curriculumView";
import { useCoverage } from "../../store/curriculum";
import { CoverageChip, PendingAreaCard } from "../study/CurriculumBadges";
import { CurriculumGaps } from "../study/CurriculumGaps";

export const AREAS_PATH_KEY = "mentor.areas.path";
export const AREAS_TAB_KEY = "mentor.areas.tab";
/** Prefijo de los ítems de la barra lateral de «Áreas»: `areas:` = todas, `areas:<espacio>` = la página de esa materia. */
export const AREAS_NAV_PREFIX = "areas:";

/** Las pestañas de la página de un espacio (como las de un área de un plan). */
const SPACE_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "areas", label: "Áreas" },
  { id: "temas", label: "Temas" },
  { id: "repasos", label: "Repasos" },
] as const;
type SpaceTab = (typeof SPACE_TABS)[number]["id"];
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
export interface Loaded<T> {
  rows: T[];
  areas?: AreaRow[];
  loading: boolean;
  error: string;
}
/** Una llamada por nivel; se repite mientras el índice de la vault aún se calienta. `enabled=false` no lee nada. */
function useLevel<T>(level: Level, space: string, area: string, version: number, enabled = true): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ rows: [], loading: true, error: "" });
  useEffect(() => {
    if (!enabled) return;
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
          setState({ rows: r.rows as T[], areas: (r as { areas?: AreaRow[] }).areas, loading: false, error: "" });
        })
        .catch((e: unknown) => live && setState({ rows: [], loading: false, error: (e as Error).message }));
    };
    setState((s) => ({ ...s, loading: true }));
    run();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [level, space, area, version, enabled]);
  return state;
}

/** Los espacios (materias): UNA sola lectura, compartida por la barra lateral y la pantalla. */
export function useSpaces(enabled: boolean): Loaded<SpaceRow> {
  const version = useMentor((s) => s.planVersion);
  return useLevel<SpaceRow>("spaces", "", "", version, enabled);
}

/** Los ítems de la barra lateral en «Áreas»: «Todas las áreas», cada materia y sus sub-áreas anidadas con su propio avance. */
export function areasSidebarItems(spaces: Loaded<SpaceRow>): SidebarItem[] {
  const bySpace = new Map<string, AreaRow[]>();
  for (const a of spaces.areas ?? []) {
    const list = bySpace.get(a.space);
    if (list) list.push(a);
    else bySpace.set(a.space, [a]);
  }
  return [
    { id: AREAS_NAV_PREFIX, label: "Todas las áreas", hint: "Resumen de todas las materias", icon: <LayoutGrid /> },
    ...spaces.rows.map((r): SidebarItem => {
      const spaceAreas = bySpace.get(r.space) ?? [];
      return {
        id: `${AREAS_NAV_PREFIX}${r.space}`,
        label: r.space,
        hint: `${r.areas} ${r.areas === 1 ? "área" : "áreas"} · ${r.topics} temas · ${r.completed}/${r.topics}`,
        icon: <Ring pct={r.pct} size={26} />,
        badge: r.reviewsDue,
        badgeTone: "danger",
        ...(r === spaces.rows[0] ? { sectionLabel: "Materias" } : {}),
        subItems: spaceAreas.map((a): SidebarItem => ({
          id: `${AREAS_NAV_PREFIX}${joinPath(r.space, a.area)}`,
          label: a.name,
          hint: `${a.completed}/${a.topics} temas · ${a.pct}%`,
          icon: <Ring pct={a.pct} size={20} />,
          badge: a.reviewsDue,
          badgeTone: "danger",
        })),
      };
    }),
  ];
}

/** Pulsar un ítem de la barra de «Áreas»: abre la página de esa materia o sub-área (o el resumen de todas). */
export function selectAreasItem(id: string): void {
  if (!id.startsWith(AREAS_NAV_PREFIX)) return;
  useNavState.getState().set(AREAS_PATH_KEY, id.slice(AREAS_NAV_PREFIX.length));
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

export function AreasOverview({ spaces }: { spaces: Loaded<SpaceRow> }) {
  const [raw, setRaw] = usePersistedNav<string>(AREAS_PATH_KEY, "");
  const { space, area } = parsePath(raw);
  const level: Level = !space ? "spaces" : !area ? "areas" : "topics";
  const version = useMentor((s) => s.planVersion);
  const badge = usePlanBadge();
  const go = useCallback((s: string, a = ""): void => setRaw(joinPath(s, a)), [setRaw]);
  const areaName = area.split("/").pop() ?? area;
  const parentArea = area.includes("/") ? area.slice(0, area.lastIndexOf("/")) : "";
  // «Temas por crear» del currículo de referencia: un cuarto nivel que se abre aquí mismo y vuelve con «Volver»
  const [gapsId, setGapsId] = useState<string | null>(null);
  const { areas: coverage } = useCoverage();

  if (gapsId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="areas-overview" data-view="gaps">
        <CurriculumGaps areaId={gapsId} onBack={() => setGapsId(null)} />
      </div>
    );
  }

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
          {parentArea && parentArea !== space && (
            <>
              <ChevronRight size={13} className="text-faint" aria-hidden />
              <Crumb label={parentArea.split("/").pop() ?? parentArea} on={false} onClick={() => go(space, parentArea)} />
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
        {level === "spaces" && <SpacesLevel s={spaces} onOpen={(s) => go(s)} coverage={coverage} onGaps={setGapsId} />}
        {level === "areas" && <SpacePage space={space} row={spaces.rows.find((r) => r.space === space)} version={version} badge={badge} onOpenArea={(a) => go(space, a)} coverage={coverage} onGaps={setGapsId} />}
        {level === "topics" && <AreaPage space={space} area={area} version={version} badge={badge} onBackToSpace={() => go(space)} coverage={coverage} onGaps={setGapsId} />}
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

function SpacesLevel({ s, onOpen, coverage, onGaps }: { s: Loaded<SpaceRow>; onOpen: (space: string) => void; coverage: AreaCoverage[]; onGaps: (areaId: string) => void }) {
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
            <LackingChips list={coverage.filter((c) => c.space === r.space && isLacking(c))} onGaps={onGaps} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Las marcas de «falta de desarrollo» de un renglón (espacio o área) con su acción «Ver temas por crear». */
function LackingChips({ list, onGaps }: { list: AreaCoverage[]; onGaps: (areaId: string) => void }) {
  if (!list.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1 px-1" data-testid="lacking-chips">
      {list.map((c) => <CoverageChip key={c.areaId} coverage={c} showTitle onOpen={onGaps} />)}
    </div>
  );
}

/** La página de una materia, como la de un área de un plan: cabecera con su avance y pestañas Resumen · Áreas · Temas · Repasos (solo lectura). */
function SpacePage({ space, row, version, badge, onOpenArea, coverage, onGaps }: { space: string; row: SpaceRow | undefined; version: number; badge: PlanMembership | null; onOpenArea: (area: string) => void; coverage: AreaCoverage[]; onGaps: (areaId: string) => void }) {
  const [stored, setTab] = usePersistedNav<string>(AREAS_TAB_KEY, "resumen");
  const tab: SpaceTab = SPACE_TABS.some((t) => t.id === stored) ? (stored as SpaceTab) : "resumen";
  return (
    <div data-testid="space-page" data-space={space}>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-4">
        <Ring pct={row?.pct ?? 0} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-text">{space}</h2>
          {row ? (
            <>
              <p className="text-[13px] text-dim">{row.areas} {row.areas === 1 ? "área" : "áreas"} · {row.topics} temas</p>
              <Counts r={row} />
              <p className="text-[11px] text-faint">Última actividad: {fmtDate(row.lastActivity)}</p>
            </>
          ) : (
            <p className="text-[13px] text-faint">Leyendo tus notas…</p>
          )}
        </div>
      </div>
      <div role="tablist" aria-label={`Vistas de ${space}`} className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {SPACE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`space-tab-${t.id}`}
            className={cn("-mb-px min-h-9 border-b-2 px-3 text-[13.5px]", tab === t.id ? "border-accent font-semibold text-text" : "border-transparent text-dim hover:text-text")}
          >
            {t.label}
            {t.id === "repasos" && row?.reviewsDue ? <span className="ml-1.5 rounded-md bg-danger-soft px-1.5 font-mono text-[10.5px] text-danger">{row.reviewsDue}</span> : null}
          </button>
        ))}
      </div>
      {tab === "resumen" && <SpaceSummary space={space} row={row} version={version} badge={badge} />}
      {tab === "areas" && <AreasLevel space={space} version={version} badge={badge} onOpen={onOpenArea} coverage={coverage} onGaps={onGaps} />}
      {tab === "temas" && <TopicsLevel key="temas" space={space} area="" version={version} badge={badge} showArea />}
      {tab === "repasos" && <TopicsLevel key="repasos" space={space} area="" version={version} badge={badge} showArea initialFilter="repaso" />}
    </div>
  );
}

/** «Resumen» de una materia: cifras, por dónde seguir (en curso) y repasos pendientes. */
function SpaceSummary({ space, row, version, badge }: { space: string; row: SpaceRow | undefined; version: number; badge: PlanMembership | null }) {
  const s = useLevel<TopicRow>("topics", space, "", version);
  const inProgress = useMemo(() => s.rows.filter((t) => t.state === "en_curso").slice(0, 6), [s.rows]);
  const due = useMemo(() => s.rows.filter((t) => t.reviewDue).slice(0, 6), [s.rows]);
  const tiles = row
    ? [
        { id: "done", label: "Temas completos", value: `${row.completed}/${row.topics}` },
        { id: "going", label: "En curso", value: String(Math.max(0, row.started - row.completed)) },
        { id: "todo", label: "Sin tratar", value: String(Math.max(0, row.topics - row.started)) },
        { id: "ex", label: "Ejercicios", value: `${row.exercisesDone}${row.exercisesTotal ? `/${row.exercisesTotal}` : ""}` },
        { id: "rev", label: "Repasos pendientes", value: String(row.reviewsDue) },
      ]
    : [];
  const list = (title: string, rows: TopicRow[], empty: string, testid: string) => (
    <section className="rounded-xl border border-line bg-card p-3.5" data-testid={testid}>
      <h3 className="mb-2 text-[13.5px] font-semibold text-text">{title}</h3>
      {!rows.length ? <p className="text-[12.5px] text-faint">{empty}</p> : (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={t.folder} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate" title={t.folder}>{t.code ? `${t.code} ` : ""}{t.title}</span>
              {badge?.folders.has(t.folder) && <Chip colour="var(--nv-mint)">En tu plan</Chip>}
              <GhostButton onClick={() => void openTopic(t.folder)}>Abrir</GhostButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div className="space-y-4" data-testid="space-summary">
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {tiles.map((t) => (
          <li key={t.id} className="rounded-xl border border-line bg-card p-3" data-testid={`space-tile-${t.id}`}>
            <p className="text-[11.5px] text-faint">{t.label}</p>
            <p className="text-[20px] font-bold text-text">{t.value}</p>
          </li>
        ))}
      </ul>
      <Status s={s} empty="Esta materia aún no tiene temas." />
      <div className="grid gap-3 @3xl:grid-cols-2">
        {list("Por dónde seguir", inProgress, "Nada en curso todavía.", "space-going")}
        {list("Repasos pendientes", due, "No tienes repasos pendientes.", "space-due")}
      </div>
    </div>
  );
}

function AreasLevel({ space, version, badge, onOpen, coverage, onGaps }: { space: string; version: number; badge: PlanMembership | null; onOpen: (area: string) => void; coverage: AreaCoverage[]; onGaps: (areaId: string) => void }) {
  const s = useLevel<AreaRow>("areas", space, "", version);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<AreaSort>("nombre");
  const isDirectChild = (areaPath: string): boolean => {
    const rel = areaPath.startsWith(space + "/") ? areaPath.slice(space.length + 1) : areaPath;
    return !rel.includes("/");
  };
  const rows = useMemo(() => sortAreas(s.rows.filter((r) => isDirectChild(r.area) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))), sort), [s.rows, q, sort, space]);
  // áreas del currículo que aún no existen en la vault: tarjetas «Por crear» con borde discontinuo (solo de nivel superior, las anidadas van en su área)
  const toCreate = useMemo(() => (s.loading && !s.rows.length ? [] : pendingAreas(coverage.filter((c) => c.level !== "ok" && !c.areaFolder.includes("/")), space, s.rows.map((r) => r.area))), [coverage, space, s.rows, s.loading]);
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
            <LackingChips list={relatedCoverage(coverage, space, r.area)} onGaps={onGaps} />
          </li>
        ))}
        {toCreate.map((c) => (
          <li key={c.areaId} data-testid="pending-area-item">
            <PendingAreaCard coverage={c} onOpen={onGaps} />
          </li>
        ))}
      </ul>
    </>
  );
}

const AREA_TABS = [
  { id: "temas", label: "Temas" },
  { id: "resumen", label: "Resumen" },
  { id: "repasos", label: "Repasos" },
] as const;
type AreaTab = (typeof AREA_TABS)[number]["id"];

/** La página propia de una sub-área (ej. Backend, Frontend, Álgebra), con su avance, métricas y temas. */
function AreaPage({
  space,
  area,
  version,
  badge,
  onBackToSpace,
  coverage,
  onGaps,
}: {
  coverage: AreaCoverage[];
  onGaps: (areaId: string) => void;
  space: string;
  area: string;
  version: number;
  badge: PlanMembership | null;
  onBackToSpace: () => void;
}) {
  const [storedTab, setTab] = usePersistedNav<string>("mentor.areas.areatab", "temas");
  const tab: AreaTab = AREA_TABS.some((t) => t.id === storedTab) ? (storedTab as AreaTab) : "temas";
  const areasState = useLevel<AreaRow>("areas", space, "", version);
  const row = useMemo(() => areasState.rows.find((r) => r.area === area), [areasState.rows, area]);
  const areaName = row?.name || area.split("/").pop() || area;

  const topicsState = useLevel<TopicRow>("topics", space, area, version);
  const inProgress = useMemo(() => topicsState.rows.filter((t) => t.state === "en_curso").slice(0, 6), [topicsState.rows]);
  const due = useMemo(() => topicsState.rows.filter((t) => t.reviewDue).slice(0, 6), [topicsState.rows]);
  const subAreas = useMemo(() => areasState.rows.filter((r) => r.area.startsWith(`${area}/`)), [areasState.rows, area]);
  const relatedMissing = useMemo(() => relatedCoverage(coverage, space, area), [coverage, space, area]);

  const tiles = row
    ? [
        { id: "done", label: "Temas completos", value: `${row.completed}/${row.topics}` },
        { id: "going", label: "En curso", value: String(Math.max(0, row.started - row.completed)) },
        { id: "todo", label: "Sin tratar", value: String(Math.max(0, row.topics - row.started)) },
        { id: "ex", label: "Ejercicios", value: `${row.exercisesDone}${row.exercisesTotal ? `/${row.exercisesTotal}` : ""}` },
        { id: "rev", label: "Repasos pendientes", value: String(row.reviewsDue) },
      ]
    : [];

  return (
    <div data-testid="area-page" data-space={space} data-area={area}>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card p-4">
        <Ring pct={row?.pct ?? 0} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] font-bold text-text">{areaName}</h2>
            {badge?.areas.has(area) && <Chip colour="var(--nv-mint)">En tu plan: {badge.planName}</Chip>}
            {row && <Chip colour={STATE_COLOUR[row.state]}>{STATE_LABEL[row.state]}</Chip>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Materia: <button type="button" onClick={onBackToSpace} className="text-accent-text hover:underline">{space}</button>
            {row ? ` · ${row.topics} temas · ${row.completed}/${row.topics} completos` : ""}
          </p>
          {row && <Counts r={row} />}
          {row?.lastActivity ? <p className="text-[11px] text-faint">Última actividad: {fmtDate(row.lastActivity)}</p> : null}
          <LackingChips list={relatedMissing} onGaps={onGaps} />
        </div>
      </div>

      <div role="tablist" aria-label={`Vistas de ${areaName}`} className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {AREA_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`area-tab-${t.id}`}
            className={cn("-mb-px min-h-9 border-b-2 px-3 text-[13.5px]", tab === t.id ? "border-accent font-semibold text-text" : "border-transparent text-dim hover:text-text")}
          >
            {t.label}
            {t.id === "repasos" && row?.reviewsDue ? <span className="ml-1.5 rounded-md bg-danger-soft px-1.5 font-mono text-[10.5px] text-danger">{row.reviewsDue}</span> : null}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="space-y-4" data-testid="area-summary">
          {(subAreas.length > 0 || relatedMissing.length > 0) && (
            <section className="rounded-xl border border-line bg-card p-3.5" data-testid="area-subareas">
              <h3 className="mb-2.5 text-[13.5px] font-semibold text-text">Áreas internas de {areaName}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {subAreas.map((sa) => (
                  <button
                    key={sa.area}
                    type="button"
                    onClick={() => {
                      useNavState.getState().set(AREAS_PATH_KEY, joinPath(space, sa.area));
                    }}
                    data-testid={`subarea-${sa.name}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-panel/50 p-3 text-left transition-colors hover:bg-hover"
                  >
                    <Ring pct={sa.pct} size={36} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text text-[13px]">{sa.name}</span>
                      <span className="text-[11.5px] text-dim">{sa.completed}/{sa.topics} temas completos</span>
                    </div>
                    <ChevronRight size={14} className="text-faint" aria-hidden />
                  </button>
                ))}
                {relatedMissing
                  .filter((c) => !subAreas.some((sa) => sa.area.toLowerCase().endsWith(c.areaFolder.toLowerCase())))
                  .map((c) => (
                    <div key={c.areaId} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-warn/60 bg-panel/30 p-3" data-testid={`pending-subarea-${c.areaId}`}>
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold text-text text-[13px]">{c.title}</span>
                        <span className="text-[11.5px] text-warn">Falta de desarrollo · {c.missing} temas por crear</span>
                      </div>
                      <GhostButton onClick={() => onGaps(c.areaId)} data-testid={`open-gaps-${c.areaId}`}>Ver temas por crear</GhostButton>
                    </div>
                  ))}
              </div>
            </section>
          )}
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {tiles.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-card p-3" data-testid={`area-tile-${t.id}`}>
                <p className="text-[11.5px] text-faint">{t.label}</p>
                <p className="text-[20px] font-bold text-text">{t.value}</p>
              </li>
            ))}
          </ul>
          <Status s={topicsState} empty="Esta área aún no tiene temas." />
          <div className="grid gap-3 @3xl:grid-cols-2">
            <section className="rounded-xl border border-line bg-card p-3.5" data-testid="area-going">
              <h3 className="mb-2 text-[13.5px] font-semibold text-text">Por dónde seguir</h3>
              {!inProgress.length ? <p className="text-[12.5px] text-faint">Nada en curso todavía en esta área.</p> : (
                <ul className="space-y-1.5">
                  {inProgress.map((t) => (
                    <li key={t.folder} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate" title={t.folder}>{t.code ? `${t.code} ` : ""}{t.title}</span>
                      {badge?.folders.has(t.folder) && <Chip colour="var(--nv-mint)">En tu plan</Chip>}
                      <GhostButton onClick={() => void openTopic(t.folder)}>Abrir</GhostButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border border-line bg-card p-3.5" data-testid="area-due">
              <h3 className="mb-2 text-[13.5px] font-semibold text-text">Repasos pendientes</h3>
              {!due.length ? <p className="text-[12.5px] text-faint">No tienes repasos pendientes en esta área.</p> : (
                <ul className="space-y-1.5">
                  {due.map((t) => (
                    <li key={t.folder} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate" title={t.folder}>{t.code ? `${t.code} ` : ""}{t.title}</span>
                      <GhostButton onClick={() => void openTopic(t.folder)}>Abrir</GhostButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "temas" && <TopicsLevel space={space} area={area} version={version} badge={badge} />}
      {tab === "repasos" && <TopicsLevel space={space} area={area} version={version} badge={badge} initialFilter="repaso" />}
    </div>
  );
}

function TopicsLevel({ space, area, version, badge, showArea = false, initialFilter = "todos" }: { space: string; area: string; version: number; badge: PlanMembership | null; /** rotula cada tema con su área (página de la materia) */ showArea?: boolean; initialFilter?: TopicFilter }) {
  const s = useLevel<TopicRow>("topics", space, area, version);
  const [filter, setFilter] = useState<TopicFilter>(initialFilter);
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
                <p className="font-mono text-[11px] text-faint">{t.code || "—"}{showArea && t.area !== space ? ` · ${t.area.split("/").pop()}` : ""}</p>
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
