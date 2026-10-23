// Mentor — Plan: piezas compartidas entre el resumen de planes y la sub-interfaz de un plan (carga con reintento de
// la vault fría, etiquetas y colores de estado, ayudantes de formato). Sin interfaz propia.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorDeliverableStatus, MentorPlanGet, MentorPlanStatus, MentorSubplan, MentorTopicState } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { useProjects } from "../../store/projects";

export type Loaded = Extract<MentorPlanGet, { loading: false }>;

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export const PALETTE = ["#2383e2", "#33b679", "#e67c73", "#f6bf26", "#8e24aa", "#0b8043", "#d50000", "#039be5"];

export const STATE_LABEL: Record<MentorTopicState, string> = {
  sin_tratar: "Sin tratar",
  practicando: "Practicando",
  consolidado: "Consolidado",
  completo: "Completo",
  examen_pendiente: "Examen pendiente",
  no_encontrado: "No encontrado",
};
export const STATE_COLOUR: Record<MentorTopicState, string> = {
  sin_tratar: "var(--nv-faint)",
  practicando: "var(--nv-accent)",
  consolidado: "var(--nv-warn)",
  completo: "var(--nv-mint)",
  examen_pendiente: "var(--nv-warn)",
  no_encontrado: "var(--nv-danger)",
};
/** Un símbolo por estado: el estado no depende solo del color. */
export const STATE_GLYPH: Record<MentorTopicState, string> = { sin_tratar: "○", practicando: "◐", consolidado: "◑", completo: "●", examen_pendiente: "◔", no_encontrado: "⚠" };
export const DELIVERABLE_LABEL: Record<MentorDeliverableStatus, string> = { idea: "Idea", en_curso: "En curso", hecho: "Hecho" };
export const DELIVERABLE_COLOUR: Record<MentorDeliverableStatus, string> = { idea: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)" };
export const STATUS_LABEL: Record<MentorPlanStatus, string> = { activo: "Activo", futuro: "Futuro", terminado: "Terminado", propuesto: "Propuesto" };
export const STATUS_COLOUR: Record<MentorPlanStatus, string> = { activo: "var(--nv-mint)", futuro: "var(--nv-accent)", terminado: "var(--nv-faint)", propuesto: "var(--nv-warn)" };

export const monthNow = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (m: string): string => {
  const [y, mm] = m.split("-").map(Number);
  const t = new Date(y!, mm! - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const num1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
/** «3 Desktop Apps (Electron)» → «Desktop Apps (Electron)». */
export const cleanBranch = (n: string): string => n.replace(/^[\d.\s_-]+/, "");

/** La rama de la vault a la que pertenece sobre todo un subplan (el 2.º tramo de la ruta de sus temas), para rotular su tarjeta. */
export function branchOf(sub: MentorSubplan): string {
  const count = new Map<string, number>();
  for (const t of sub.topics) {
    const seg = t.folder.split("/")[1];
    if (seg) count.set(seg, (count.get(seg) ?? 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? cleanBranch(top) : "";
}

export async function openProjectInProyectos(id: string): Promise<void> {
  await useProjects.getState().open(id);
  useApp.getState().setModule("proyectos");
}

/** Clave de la pestaña recordada de un plan (el mismo almacén que la navegación persistida). */
export const planTabKey = (planId: string): string => `mentor.planTab.${planId}`;
/**
 * Las dos caras de un plan: «plan» (para armarlo y ajustarlo: pestañas) y «ejecucion» (solo lectura: qué hago hoy y cómo voy). Se recuerda por
 * plan; sin elegir, un plan mantenido abre en ejecución y uno propuesto (aún por decidir) en plan.
 */
export const planModeKey = (planId: string): string => `mentor.planMode.${planId}`;
export type PlanMode = "plan" | "ejecucion";
export const PLAN_TABS = ["plan", "agenda", "practica", "entregables", "cambios"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

/** Clave de la sub-vista recordada de «Mi plan» (Resumen, Temas, Cobertura, Ejecutar plan…), por plan. */
export const planSectionKey = (planId: string): string => `mentor.planSection.${planId}`;
/** La opción elegida dentro de «Preparar» (ejecutar · cobertura · antigravity), por plan. */
export const prepareTabKey = (planId: string): string => `mentor.prepareTab.${planId}`;

/**
 * Abre una sub-vista de «Mi plan» (`id` con o sin el prefijo `sec-`: «ejecutar», «sec-ejecutar») y, ya pintada, se coloca en ella.
 * Sustituye al antiguo «saltar a la sección» de la tabla de contenido: ahora cada sección es una sub-vista, no un tramo de la página.
 * Quien la llame desde otra pestaña debe cambiar también la pestaña (`openPlanTab` / `changeTab("plan")`).
 */
export function openPlanSection(planId: string, id: string): void {
  const key = id.replace(/^sec-/, "");
  useNavState.getState().set(planSectionKey(planId), key);
  if (key === "ejecutar" || key === "cobertura" || key === "antigravity") useNavState.getState().set(prepareTabKey(planId), key);
  setTimeout(() => {
    const el = document.getElementById(`sec-${key}`);
    el?.scrollIntoView?.({ block: "start" });
    el?.focus?.({ preventScroll: true });
  }, 60);
}

/** Abre un plan en una pestaña concreta (enlace profundo interno: «Ver cambios», «Ver entregables»…). */
export function openPlanTab(planId: string, tab: PlanTab): void {
  const nav = useNavState.getState();
  nav.set(planTabKey(planId), tab);
  nav.set(planModeKey(planId), "plan");
  nav.set("mentor.view", `plan:${planId}`);
}

/** Abre la sub-vista «Registros» del plan (desde la Ejecución, el botón «Registros»). */
export function openPlanRecords(planId: string): void {
  openPlanTab(planId, "plan");
  openPlanSection(planId, "registros");
}

/**
 * Fecha pedida para la Agenda de un plan (AAAA-MM-DD), escrita por un enlace profundo («ver este mes en la Agenda») y consumida una sola
 * vez: la Agenda puede leerla al montarse; si no lo hace, la sub-interfaz del plan la aplica con el selector «Ir a la fecha».
 */
export const agendaDateKey = (planId: string): string => `mentor.agendaDate.${planId}`;

/** Abre la pestaña Agenda de un plan en una fecha y una vista (por defecto, la vista Mes de ese mes). */
export function openAgendaAt(planId: string, date: string, view: "dia" | "semana" | "mes" | "calendario" = "mes"): void {
  const nav = useNavState.getState();
  nav.set(`mentor.agendaView.${planId}`, view);
  nav.set(agendaDateKey(planId), date);
  nav.set(planTabKey(planId), "agenda");
  nav.set(planModeKey(planId), "plan");
  nav.set("mentor.view", `plan:${planId}`);
}

/** Carga un plan (o, sin id, el resumen: el plan por defecto con todos los planes) con el reintento de la vault fría. */
export function usePlanData(id: string | undefined) {
  const planVersion = useMentor((s) => s.planVersion);
  const [data, setData] = useState<Loaded | null>(null);
  const [warming, setWarming] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setError("");
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorPlanGet(id);
        if (!alive.current) return;
        if (!r.loading) {
          setData(r);
          setWarming(false);
          return;
        }
        setWarming(true);
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (!alive.current) return;
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    } catch (e) {
      if (alive.current) {
        setWarming(false);
        setError((e as Error).message);
      }
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  // El plan vive en un archivo de `.notevault/` que el vigilante de la vault ignora (carpetas con punto): si otra instancia o una
  // herramienta lo cambia con la ventana abierta, la vista se quedaba con la copia vieja. Al volver a la ventana se vuelve a leer.
  useEffect(() => {
    let last = Date.now();
    const refresh = (): void => {
      if (document.visibilityState === "hidden" || Date.now() - last < 3000) return;
      last = Date.now();
      void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  return { data, warming, error, reload: load, setData };
}
