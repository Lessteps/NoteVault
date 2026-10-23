// Mentor — navegación: la ruta recordada (`mentor.view`), el modo global Planeación | Ejecución (`mentor.mode`) y los ítems que cada modo
// pone en la barra lateral. Módulo PURO (sin React): la barra y los paneles solo leen y escriben las mismas claves de `navState`.

import { AGENDA_VIEWS } from "../../lib/planSchedule";
import { reviewsOfTopics, type ReviewItemLike } from "../../lib/planReviews";
import { areaRouteTopics, basesRouteTopics, orderedAreas } from "../../lib/planTopicsByArea";
import type { MentorBuildSummary, MentorPlan, MentorPlanRow } from "../../lib/types";
import { useEffect } from "react";
import { useNavState, usePersistedNav } from "../../store/navState";
import { DEFAULT_SECTION } from "./PlanSections";
import { agendaViewKey, MODE_KEY, PLAN_TABS, planSectionKey, planTabKey, type PlanTab } from "./planShared";

/** Modo GLOBAL del Mentor: cambia los ítems de la barra y lo que enseña el panel del plan elegido. */
export type MentorMode = "planeacion" | "ejecucion";
export { MODE_KEY };
export const MODES: ReadonlyArray<{ id: MentorMode; label: string; hint: string }> = [
  { id: "planeacion", label: "Planeación", hint: "Armar y ajustar el plan: agenda, entregables y cambios" },
  { id: "ejecucion", label: "Ejecución", hint: "El día a día: qué toca hoy y cómo vas" },
];

/** Sin elegir, un plan mantenido y no archivado abre en Ejecución; uno propuesto (por decidir) o terminado, en Planeación. */
export function defaultModeOf(plan: Pick<MentorPlanRow, "status"> | undefined): MentorMode {
  return plan && plan.status !== "propuesto" && plan.status !== "terminado" ? "ejecucion" : "planeacion";
}
/** De qué estado sacar el modo por defecto: el del listado de planes (store) y, si aún no cargó, el del propio plan. */
export function modeSubject(row: Pick<MentorPlanRow, "status"> | undefined, plan: Pick<MentorPlan, "proposed" | "archived"> | null): Pick<MentorPlanRow, "status"> | undefined {
  return row ?? (plan ? { status: plan.proposed ? "propuesto" : plan.archived ? "terminado" : "activo" } : undefined);
}
export const asMode = (raw: unknown, fallback: MentorMode): MentorMode => (raw === "planeacion" || raw === "ejecucion" ? raw : fallback);

/** Clave del modo que antes se guardaba por plan (antes del modo global): se adopta una vez si aún no hay modo global. */
export const legacyModeKey = (planId: string): string => `mentor.planMode.${planId}`;
/** El modo guardado: el global y, si nunca se eligió, el antiguo del plan (si lo hay). */
export const storedModeOf = (values: Record<string, unknown>, planId: string | undefined): string => {
  const g = values[MODE_KEY];
  if (g === "planeacion" || g === "ejecucion") return g;
  const old = planId ? values[legacyModeKey(planId)] : undefined;
  return old === "planeacion" || old === "ejecucion" ? old : "";
};

/** El modo vigente (el guardado, o el de por defecto según el plan) y cómo cambiarlo. `planId` permite adoptar el modo antiguo de ese plan. */
export function useMentorMode(plan: Pick<MentorPlanRow, "status"> | undefined, planId?: string): [MentorMode, (m: MentorMode) => void] {
  const [raw, set] = usePersistedNav<string>(MODE_KEY, "");
  const legacy = useNavState((s) => storedModeOf(s.values, planId));
  const effective = raw === "planeacion" || raw === "ejecucion" ? raw : legacy;
  useEffect(() => {
    if (!raw && legacy) set(legacy);
  }, [raw, legacy, set]);
  return [asMode(effective, defaultModeOf(plan)), set];
}

// ── Ruta ────────────────────────────────────────────────────────────────

export const PLAN_PREFIX = "plan:";
export const BUILD_PREFIX = "build:";
/** Paneles que ya no están en la barra lateral pero siguen existiendo: se llega a ellos desde botones de otras vistas y se vuelve con «Volver a mi plan». */
export const AUX_VIEWS = ["hoy", "cierre", "metas", "proyectos", "notas"] as const;
export type AuxView = (typeof AUX_VIEWS)[number];
export const OVERVIEW_VIEW = "plan";
export const CREATE_VIEW = "nuevo";

export type MentorRoute =
  | { kind: "plan"; planId: string }
  | { kind: "build"; buildId: string }
  | { kind: "aux"; view: AuxView }
  /** «Todos los planes» (resumen, borrador pendiente y creación); `creating` abre el formulario de plan nuevo */
  | { kind: "overview"; creating: boolean };

interface RouteInput {
  stored: string;
  plans: ReadonlyArray<Pick<MentorPlanRow, "id" | "status">>;
  plansLoaded: boolean;
  builds: ReadonlyArray<Pick<MentorBuildSummary, "id">>;
  buildsLoaded: boolean;
}

/**
 * La ruta a pintar. Los valores antiguos («hoy», «cierre», «metas», «proyectos», «notas») siguen siendo rutas válidas pero ocultas; «plan» es el
 * resumen de todos los planes; vacío (nunca elegido) o un plan/construcción que ya no existe, se resuelve al plan en curso (o el primero).
 */
export function resolveRoute({ stored, plans, plansLoaded, builds, buildsLoaded }: RouteInput): MentorRoute {
  const fallback = (): MentorRoute => {
    const p = plansLoaded ? plans.find((x) => x.status === "activo") ?? plans[0] : undefined;
    return p ? { kind: "plan", planId: p.id } : { kind: "overview", creating: false };
  };
  if (stored.startsWith(PLAN_PREFIX)) {
    const id = stored.slice(PLAN_PREFIX.length);
    return !plansLoaded || plans.some((p) => p.id === id) ? { kind: "plan", planId: id } : fallback();
  }
  if (stored.startsWith(BUILD_PREFIX)) {
    const id = stored.slice(BUILD_PREFIX.length);
    return !buildsLoaded || builds.some((b) => b.id === id) ? { kind: "build", buildId: id } : fallback();
  }
  if ((AUX_VIEWS as readonly string[]).includes(stored)) return { kind: "aux", view: stored as AuxView };
  if (stored === OVERVIEW_VIEW) return { kind: "overview", creating: false };
  if (stored === CREATE_VIEW) return { kind: "overview", creating: true };
  return fallback();
}

// ── Ítems de la barra ───────────────────────────────────────────────────

export interface NavLink {
  id: string;
  label: string;
  /** una línea de apoyo bajo el nombre (p. ej. «1 pendiente de decidir») */
  hint?: string;
  /** el contador de la insignia (p. ej. entregables por decidir) */
  badge?: number;
  subs?: ReadonlyArray<NavLink>;
}

export const PLAN_NAV_PREFIX = "pl:";
export const RUN_NAV_PREFIX = "ej:";
/** Las sub-vistas de «Mi plan», en el orden de `planSectionsOf` (PlanSections.tsx). */
export const PLAN_SECTION_LINKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "temas", label: "Temas por área" },
  { id: "registros", label: "Registros" },
  { id: "preparar", label: "Preparar" },
];

/** Los ítems del modo Planeación: las pestañas del plan, con sub-vistas en «Mi plan» y la Agenda. */
export function planeacionLinks(plan: Pick<MentorPlan, "programmingPractice">, pendingDeliverables = 0): NavLink[] {
  return [
    { id: `${PLAN_NAV_PREFIX}plan`, label: "Mi plan", subs: PLAN_SECTION_LINKS.map((s) => ({ id: `${PLAN_NAV_PREFIX}plan/${s.id}`, label: s.label })) },
    { id: `${PLAN_NAV_PREFIX}agenda`, label: "Agenda", subs: AGENDA_VIEWS.map((v) => ({ id: `${PLAN_NAV_PREFIX}agenda/${v.id}`, label: v.label })) },
    ...(plan.programmingPractice ? [{ id: `${PLAN_NAV_PREFIX}practica`, label: "Práctica" }] : []),
    { id: `${PLAN_NAV_PREFIX}entregables`, label: "Entregables", ...(pendingDeliverables ? { badge: pendingDeliverables, hint: `${pendingDeliverables} ${pendingDeliverables === 1 ? "pendiente" : "pendientes"} de decidir` } : {}) },
    { id: `${PLAN_NAV_PREFIX}cambios`, label: "Preguntas y ajustes" },
  ];
}

/** Las vistas de la Ejecución: «Hoy», una por área, «Bases» (si el plan las tiene), «Proyectos» y «Registros». */
export const RUN_TAB_GENERAL = "general";
export const RUN_TAB_RECORDS = "registros";
export const runAreaTab = (subplanId: string): string => `area:${subplanId}`;
export function hasBasesRoute(plan: Pick<MentorPlan, "subplans">): boolean {
  return plan.subplans.some((s) => {
    const g = (s.groups ?? []).find((x) => x.kind === "bases");
    return !!g && s.topics.some((t) => t.group === g.id && t.route !== "skipped");
  });
}
export interface RunLink extends NavLink {
  /** id de la vista en `PlanRun` (la clave persistida `mentor.runTab.<plan>`) */
  tab: string;
  areaId?: string;
}
/** Lo que enseña la pista de un ítem de la Ejecución: temas hechos de su ruta y repasos que tocan hoy o están vencidos. */
export interface RunHint {
  done: number;
  total: number;
  due: number;
}
/** «3/12 · 2 ⟳» (sin temas no hay avance; sin repasos no hay «⟳»); vacío si no hay nada que decir. */
export function runHintText(h: RunHint | undefined): string {
  if (!h) return "";
  return [h.total ? `${h.done}/${h.total}` : "", h.due ? `${h.due} ⟳` : ""].filter(Boolean).join(" · ");
}
/**
 * El avance (temas hechos / de la ruta) y los repasos de hoy de cada área y de las Bases, por id de vista de la Ejecución. Puro: solo recorre la ruta
 * del plan (`areaRouteTopics` / `basesRouteTopics`, la misma regla que la Agenda) y los repasos ya cargados.
 */
export function runHints(plan: Pick<MentorPlan, "subplans">, isDone: (t: { folder: string; completedAt?: string }) => boolean, reviews: ReadonlyArray<ReviewItemLike>): Map<string, RunHint> {
  const out = new Map<string, RunHint>();
  const hint = (topics: ReadonlyArray<{ folder: string; title: string; completedAt?: string }>): RunHint => ({
    done: topics.filter(isDone).length,
    total: topics.length,
    due: reviews.length ? reviewsOfTopics(topics, reviews).filter((r) => r.inDays <= 0).length : 0,
  });
  for (const a of orderedAreas(plan)) out.set(runAreaTab(a.subplanId), hint(areaRouteTopics(plan, a.subplanId)));
  out.set("bases", hint(basesRouteTopics(plan)));
  return out;
}

export interface RunLinkOptions {
  hints?: ReadonlyMap<string, RunHint>;
  /** hoy hay fundamentos (aplicados) en el reparto aunque la ruta no tenga un grupo de Bases */
  basesToday?: boolean;
}
export function ejecucionLinks(plan: Pick<MentorPlan, "subplans">, opts: RunLinkOptions = {}): RunLink[] {
  const link = (tab: string, label: string, extra: Partial<RunLink> = {}): RunLink => {
    const hint = runHintText(opts.hints?.get(tab));
    return { id: `${RUN_NAV_PREFIX}${tab}`, tab, label, ...(hint ? { hint } : {}), ...extra };
  };
  return [
    link(RUN_TAB_GENERAL, "Hoy"),
    ...orderedAreas(plan).map((a) => link(runAreaTab(a.subplanId), a.area, a.areaId ? { areaId: a.areaId } : {})),
    ...(hasBasesRoute(plan) || opts.basesToday ? [link("bases", "Bases")] : []),
    link("proyectos", "Proyectos"),
    link(RUN_TAB_RECORDS, "Registros"),
  ];
}

// ── Claves persistidas por plan ─────────────────────────────────────────

/** La vista elegida de la Ejecución, por plan (antes era estado local de `PlanRun`). */
export const runTabKey = (planId: string): string => `mentor.runTab.${planId}`;

/** La pestaña del plan a enseñar: la guardada si existe (la antigua «semana» es la Agenda; «Práctica» solo si el plan la tiene); si no, «Mi plan». */
export function normalizeTab(stored: string, hasPractice: boolean): PlanTab {
  const t = stored === "semana" ? "agenda" : stored;
  return (PLAN_TABS as readonly string[]).includes(t) && (t !== "practica" || hasPractice) ? (t as PlanTab) : "plan";
}

/** El id de ítem de la barra de Planeación que corresponde al estado guardado del plan (pestaña, sub-vista de «Mi plan», vista de la Agenda). */
export function activePlaneacionId(tab: string, section: string, agendaView: string): string {
  if (tab === "plan") return `${PLAN_NAV_PREFIX}plan/${PLAN_SECTION_LINKS.some((s) => s.id === section) ? section : DEFAULT_SECTION}`;
  if (tab === "agenda") return `${PLAN_NAV_PREFIX}agenda/${AGENDA_VIEWS.some((v) => v.id === agendaView) ? agendaView : "semana"}`;
  return `${PLAN_NAV_PREFIX}${tab}`;
}

/** Aplica la elección de un ítem de Planeación: escribe las mismas claves que leen `PlanView` y la Agenda (y los enlaces profundos). */
export function selectPlaneacion(planId: string, id: string): void {
  const nav = useNavState.getState();
  const [tab, sub] = id.slice(PLAN_NAV_PREFIX.length).split("/") as [PlanTab, string | undefined];
  nav.set(planTabKey(planId), tab);
  if (tab === "plan" && sub) nav.set(planSectionKey(planId), sub);
  if (tab === "agenda" && sub) nav.set(agendaViewKey(planId), sub);
}

/** La vista de la Ejecución donde vive un tema: la de Bases (fundamentos) o la de su área. */
export const runTabOfTopic = (t: { bases?: boolean; subplanId: string }): string => (t.bases ? "bases" : runAreaTab(t.subplanId));

/** Abre la Ejecución de un plan en una vista (enlace profundo interno: «Ver en Ejecución»). */
export function openRunView(planId: string, tab: string = RUN_TAB_GENERAL): void {
  const nav = useNavState.getState();
  nav.set(runTabKey(planId), tab);
  nav.set(MODE_KEY, "ejecucion");
  nav.set("mentor.view", `${PLAN_PREFIX}${planId}`);
}

export function selectEjecucion(planId: string, id: string): void {
  useNavState.getState().set(runTabKey(planId), id.slice(RUN_NAV_PREFIX.length));
}
