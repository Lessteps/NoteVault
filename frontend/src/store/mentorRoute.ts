// La RUTA del Mentor dentro de NoteVault (notas y estudio): un mapa «carpeta del tema → ruta del plan» que se calcula UNA VEZ por plan y se
// cachea (nunca una llamada por fila). Con él, el árbol de notas y el panel de temas muestran la insignia de ruta, el interruptor «Solo mi ruta»
// filtra y la nota abierta enseña su banner. NADA se borra ni se mueve en la vault: la ruta solo dice qué toca estudiar y qué se puede saltar.
//
// Qué plan manda: el ACTIVO (o el futuro, que ya está mantenido); si solo hay planes PROPUESTOS, la ruta del último solo se previsualiza (con una
// insignia distinta) cuando el estudiante lo pide. El modelo de la ruta (`route` por tema) vive en `lib/planRoute.ts`.

import { create } from "zustand";
import { api } from "../lib/bridge";
import { routeOf, type TopicRoute } from "../lib/planRoute";
import { buildSchedule, progressPlan, type SchedulePlan } from "../lib/planSchedule";
import { todayIso } from "../lib/tasks";
import { weekRangesOf } from "../lib/planTime";
import type { MentorPlan } from "../lib/types";
import { useMentor } from "./mentor";

export interface RouteInfo {
  route: TopicRoute;
  /** semana (1..) del plan en que toca terminarlo */
  week: number;
  /** AAAA-MM-DD: inicio de esa semana */
  weekStart: string;
  title: string;
  area: string;
  areaId?: string;
  /** subplan (área) de origen: con él la Ejecución abre la vista de su área */
  subplanId: string;
  /** es un tema de fundamentos (Bases): en la Ejecución va a su vista aparte */
  bases?: boolean;
  group?: string;
  /** motivo por el que está fuera de ruta */
  reason?: string;
  done: boolean;
}

export type RouteKind = "active" | "proposed" | "none";

export interface RouteCounts {
  /** temas del plan */
  total: number;
  /** `core` + `optional` */
  live: number;
  optional: number;
  skipped: number;
}

export interface RouteSnapshot {
  planId: string;
  planName: string;
  proposed: boolean;
  /** semana actual del plan (1..) y total de semanas */
  currentWeek: number;
  weeks: number;
  byFolder: Map<string, RouteInfo>;
  counts: RouteCounts;
  /** carpetas de los temas vivos y sus carpetas contenedoras (para filtrar el árbol sin recorrerlo todo) */
  liveFolders: Set<string>;
  ancestors: Set<string>;
  plan: MentorPlan;
  schedule?: ReturnType<typeof buildSchedule> | null;
}

const KEY_ONLY = "nv.route.only";
const KEY_SORT = "nv.route.sort";
const KEY_PREVIEW = "nv.route.preview";
const read = (k: string): boolean => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const write = (k: string, v: boolean): void => {
  try {
    localStorage.setItem(k, v ? "1" : "0");
  } catch {
    /* sin almacenamiento: solo vale esta sesión */
  }
};

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

interface RouteState {
  kind: RouteKind;
  /** la ruta del plan activo, o la del propuesto (solo se usa si `previewOn`) */
  snap: RouteSnapshot | null;
  loading: boolean;
  /** hubo un error al leer el plan (se reintenta en la próxima carga) */
  error: string;
  /** versión del plan (store del Mentor) con la que se calculó el mapa */
  loadedVersion: number;
  /** interruptor «Solo mi ruta (Mentor)» */
  only: boolean;
  /** orden «por semana del plan» en el panel de temas */
  sortByWeek: boolean;
  /** vista previa de la ruta de un plan PROPUESTO */
  previewOn: boolean;
  setOnly: (v: boolean) => void;
  setSortByWeek: (v: boolean) => void;
  setPreviewOn: (v: boolean) => void;
  /** carga (una vez por versión del plan; las llamadas simultáneas comparten la misma) */
  ensure: (planVersion: number) => Promise<void>;
  /** vacía el mapa (tests) */
  reset: () => void;
}

let inflight: Promise<void> | null = null;

/** El mapa carpeta → ruta de un plan (barato: un recorrido por sus temas). */
export function buildRouteSnapshot(plan: MentorPlan, currentWeek: number): RouteSnapshot {
  const ranges = weekRangesOf(plan.start, plan.end);
  const startOf = (w: number): string => ranges[Math.min(ranges.length, Math.max(1, w)) - 1]?.start ?? plan.start;
  const byFolder = new Map<string, RouteInfo>();
  const counts: RouteCounts = { total: 0, live: 0, optional: 0, skipped: 0 };
  const liveFolders = new Set<string>();
  const ancestors = new Set<string>();
  for (const s of plan.subplans) {
    for (const t of s.topics) {
      const route = routeOf(t);
      if (byFolder.has(t.folder)) continue;
      byFolder.set(t.folder, {
        route,
        week: t.targetWeek,
        weekStart: startOf(t.targetWeek),
        title: t.title,
        area: s.area,
        subplanId: s.id,
        ...(t.group && s.groups?.some((g) => g.id === t.group && g.kind === "bases") ? { bases: true } : {}),
        ...(s.areaId ? { areaId: s.areaId } : {}),
        ...(t.group ? { group: s.groups?.find((g) => g.id === t.group)?.title ?? t.group } : {}),
        ...(route === "skipped" && t.skippedReason ? { reason: t.skippedReason } : {}),
        done: !!t.completedAt,
      });
      counts.total++;
      if (route === "skipped") counts.skipped++;
      else {
        counts.live++;
        if (route === "optional") counts.optional++;
        liveFolders.add(t.folder);
        const parts = t.folder.split("/");
        for (let i = 1; i < parts.length; i++) ancestors.add(parts.slice(0, i).join("/"));
      }
    }
  }
  return { planId: plan.id, planName: plan.name ?? plan.id, proposed: !!plan.proposed, currentWeek, weeks: ranges.length, byFolder, counts, liveFolders, ancestors, plan };
}

export const useRoute = create<RouteState>((set, get) => ({
  kind: "none",
  snap: null,
  loading: false,
  error: "",
  loadedVersion: -1,
  only: read(KEY_ONLY),
  sortByWeek: read(KEY_SORT),
  previewOn: read(KEY_PREVIEW),
  setOnly: (v) => {
    write(KEY_ONLY, v);
    set({ only: v });
  },
  setSortByWeek: (v) => {
    write(KEY_SORT, v);
    set({ sortByWeek: v });
  },
  setPreviewOn: (v) => {
    write(KEY_PREVIEW, v);
    set({ previewOn: v });
  },
  reset: () => {
    inflight = null;
    set({ kind: "none", snap: null, loading: false, error: "", loadedVersion: -1 });
  },
  ensure: (planVersion) => {
    const st = get();
    if (st.loadedVersion === planVersion && !st.error) return Promise.resolve();
    if (inflight) return inflight;
    set({ loading: true });
    inflight = (async () => {
      try {
        const rows = await api.mentorPlanList();
        const list = Array.isArray(rows) ? rows : [];
        const live = list.filter((r) => !r.archived && r.status !== "terminado");
        const active = live.find((r) => r.status === "activo") ?? live.filter((r) => r.status === "futuro").sort((a, b) => a.start.localeCompare(b.start))[0];
        const proposed = [...list].filter((r) => r.status === "propuesto").sort((a, b) => b.start.localeCompare(a.start))[0];
        const row = active ?? proposed;
        if (!row) {
          set({ kind: "none", snap: null, loading: false, error: "", loadedVersion: planVersion });
          return;
        }
        let data = await api.mentorPlanGet(row.id);
        for (let i = 0; data.loading && i < COLD_RETRY_MAX; i++) {
          await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
          data = await api.mentorPlanGet(row.id);
        }
        if (data.loading || !data.plan) throw new Error("No se pudo leer el plan.");
        const snap = buildRouteSnapshot(data.plan, data.derived?.summary.currentWeek ?? 1);
        set({ kind: active ? "active" : "proposed", snap, loading: false, error: "", loadedVersion: planVersion });
      } catch (e) {
        set({ loading: false, error: (e as Error).message || "No se pudo leer la ruta del plan." });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));

// cuando el plan cambia (cambios aplicados, ruta, mantener…) el mapa se recalcula en la próxima lectura
useMentor.subscribe((s, prev) => {
  if (s.planVersion !== prev.planVersion && useRoute.getState().loadedVersion !== -1) {
    void useRoute.getState().ensure(s.planVersion);
  }
});

/** ¿Hay una ruta que mostrar? (plan activo, o propuesto con la vista previa pedida) */
export const routeAvailable = (s: Pick<RouteState, "kind" | "previewOn" | "snap">): boolean => !!s.snap && (s.kind === "active" || (s.kind === "proposed" && s.previewOn));

/** El tema de la ruta al que pertenece una ruta de nota o carpeta (sube por las carpetas contenedoras hasta dar con un tema del plan). */
export function topicOfPath(snap: RouteSnapshot, path: string): { folder: string; info: RouteInfo } | null {
  let p = path.replace(/\/+$/, "");
  for (let i = 0; i < 12 && p; i++) {
    const info = snap.byFolder.get(p);
    if (info) return { folder: p, info };
    const cut = p.lastIndexOf("/");
    p = cut < 0 ? "" : p.slice(0, cut);
  }
  return null;
}

/** Día del plan en que se estudia el tema (calculado una vez con la agenda del plan; null si no se pudo). */
export function dayOfTopic(snap: RouteSnapshot, folder: string): { date: string; dayInWeek: number } | null {
  try {
    if (snap.schedule === undefined) snap.schedule = buildSchedule(progressPlan(snap.plan as unknown as SchedulePlan, { today: todayIso() }));
    const day = snap.schedule?.days.find((d) => d.topics.some((t) => t.folder === folder));
    if (!day) return null;
    const info = snap.byFolder.get(folder);
    const start = info?.weekStart ?? day.date;
    const dayInWeek = Math.max(1, Math.min(7, Math.round((Date.parse(day.date) - Date.parse(start)) / 86400000) + 1));
    return { date: day.date, dayInWeek };
  } catch {
    snap.schedule = null;
    return null;
  }
}

export type MentorTopicStatus = "hecho" | "pendiente" | "fuera";
/** Lo que la nota abierta enseña de su tema en el plan (puro: sale del mapa ya cargado, sin lecturas nuevas). */
export interface MentorTopicLink {
  planId: string;
  folder: string;
  title: string;
  area: string;
  week: number;
  /** día asignado por el reparto (AAAA-MM-DD); null si está fuera de ruta o no se pudo calcular */
  date: string | null;
  dayInWeek: number | null;
  route: TopicRoute;
  status: MentorTopicStatus;
  info: RouteInfo;
}
export function mentorLinkOf(snap: RouteSnapshot, path: string): MentorTopicLink | null {
  const hit = topicOfPath(snap, path);
  if (!hit) return null;
  const { info, folder } = hit;
  const day = info.route === "skipped" ? null : dayOfTopic(snap, folder);
  return {
    planId: snap.planId,
    folder,
    title: info.title,
    area: info.area,
    week: info.week,
    date: day?.date ?? null,
    dayInWeek: day?.dayInWeek ?? null,
    route: info.route,
    status: info.route === "skipped" ? "fuera" : info.done ? "hecho" : "pendiente",
    info,
  };
}
