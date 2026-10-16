// Plan, sub-vista «Temas por área»: las pestañas (una por área del plan, calculadas a partir del plan) y, dentro de cada área, las pestañas de
// sus grupos (Bases, Lenguaje, Conocimientos…) y las filas de temas con lo que existe de cada uno. Módulo PURO: no lee nada; une el plan con
// el catálogo de la vault (`lib/planTopicCatalog.ts`), para que la vista se actualice sola cuando cambian las áreas o los temas del plan.

import { areaKeyOf } from "./planCoverage.js";
import type { PlanTopicRow } from "./planTopicCatalog.js";
import type { MentorPlan, MentorSubplan } from "./types.js";

/** Una pestaña de área. */
export interface AreaTab {
  /** clave estable del área (`areaId` o id del subplan): es la que usa el alcance de «Ejecutar plan» */
  key: string;
  area: string;
  subplanId: string;
  total: number;
  done: number;
  /** temas del plan (en ruta) a los que aún les falta nota, mapa, .practica o ejercicios */
  missing: number;
}

/** Una pestaña de grupo dentro de un área; `id === ""` es «Todos». */
export interface GroupTab {
  id: string;
  title: string;
  total: number;
  missing: number;
}

/** Una fila: un tema del plan con lo que existe de él en la vault. */
export interface AreaTopicRow {
  folder: string;
  title: string;
  week: number;
  group: string;
  completed: boolean;
  route: "core" | "optional" | "skipped";
  /** lo que existe; sin fila de catálogo (tema del plan que aún no está en la vault) todo es «falta» */
  exists: boolean;
  theory: boolean;
  canvas: boolean;
  manifest: boolean;
  exercises: number;
  planExercises?: number;
  /** le falta algo de lo que se puede generar */
  incomplete: boolean;
}

const routeOf = (r: string | undefined): AreaTopicRow["route"] => (r === "optional" || r === "skipped" ? r : "core");

/** Lo que le falta a una fila para poder generarse (el catálogo ya dice si está «completo» según el diseño). */
export const needsGenerate = (r: PlanTopicRow | undefined): boolean => !r || !r.complete || !r.theory || !r.canvas || !r.manifest || r.exercises === 0;

/** Las filas de un área, en el orden de la ruta (semana y luego orden del plan). */
export function areaTopicRows(sub: MentorSubplan, catalog: ReadonlyArray<PlanTopicRow>): AreaTopicRow[] {
  const by = new Map(catalog.map((r) => [r.folder, r] as const));
  return sub.topics
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.targetWeek - b.t.targetWeek || a.i - b.i)
    .map(({ t }) => {
      const c = by.get(t.folder);
      return {
        folder: t.folder,
        title: t.title,
        week: t.targetWeek,
        group: t.group ?? "",
        completed: !!t.completedAt,
        route: routeOf(t.route),
        exists: !!c?.exists,
        theory: !!c?.theory,
        canvas: !!c?.canvas,
        manifest: !!c?.manifest,
        exercises: c?.exercises ?? 0,
        ...(c?.planExercises ? { planExercises: c.planExercises } : {}),
        incomplete: needsGenerate(c),
      };
    });
}

/** Un tema cuenta como «por generar» si está en ruta, sin completar y le falta algo. */
export const pendingGenerate = (r: AreaTopicRow): boolean => r.route !== "skipped" && !r.completed && r.incomplete;

/** Las pestañas de área, en el orden del plan. */
export function areaTabsOf(plan: Pick<MentorPlan, "subplans">, catalog: ReadonlyArray<PlanTopicRow>): AreaTab[] {
  return plan.subplans.map((s) => {
    const rows = areaTopicRows(s, catalog);
    return { key: areaKeyOf(s), area: s.area, subplanId: s.id, total: rows.length, done: rows.filter((r) => r.completed).length, missing: rows.filter(pendingGenerate).length };
  });
}

/** Las pestañas de grupo de un área: «Todos» y cada grupo con temas (los temas sin grupo conocido caen en «Otros»). Sin grupos, solo «Todos». */
export function groupTabsOf(sub: MentorSubplan, rows: ReadonlyArray<AreaTopicRow>): GroupTab[] {
  const groups = sub.groups ?? [];
  const all: GroupTab = { id: "", title: "Todos", total: rows.length, missing: rows.filter(pendingGenerate).length };
  if (!groups.length) return [all];
  const known = new Set(groups.map((g) => g.id));
  const tabs: GroupTab[] = [...groups].sort((a, b) => a.order - b.order).map((g) => {
    const list = rows.filter((r) => r.group === g.id);
    return { id: g.id, title: g.title, total: list.length, missing: list.filter(pendingGenerate).length };
  });
  const rest = rows.filter((r) => !known.has(r.group));
  if (rest.length) tabs.push({ id: "__otros", title: "Otros", total: rest.length, missing: rest.filter(pendingGenerate).length });
  return [all, ...tabs.filter((t) => t.total > 0)];
}

/** Las filas de un grupo (`""` = todas). */
export function rowsOfGroup(sub: MentorSubplan, rows: ReadonlyArray<AreaTopicRow>, groupId: string): AreaTopicRow[] {
  if (!groupId) return [...rows];
  if (groupId === "__otros") {
    const known = new Set((sub.groups ?? []).map((g) => g.id));
    return rows.filter((r) => !known.has(r.group));
  }
  return rows.filter((r) => r.group === groupId);
}
