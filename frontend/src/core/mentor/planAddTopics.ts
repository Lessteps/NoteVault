/**
 * «Añadir al plan»: lleva al plan los temas de REFERENCIA que creó el agente externo («Crear con Antigravity») y validó la app.
 *
 * Determinista y aditivo: SOLO añade temas AL FINAL de la ruta de un área (en el orden del catálogo), sin tocar, reordenar ni mover los que ya
 * están. El reparto es POR AVANCE (la ruta manda, no `targetWeek`), así que el calendario se recalcula solo con la ruta nueva. Idempotente: un
 * tema que ya está en cualquier área del plan se omite. Si el área destino no existe en el plan, se crea (Frontend o Java) con su grupo
 * «Conocimientos» y sin entregable.
 *
 * Mapa por defecto (`CURRICULUM_PLAN_TARGET`): html · css · js-reference → Frontend; java → Java.
 */

import { areaDef, CORE_GROUP_ID, type AreaGroup } from "../../lib/planAreas.js";
import { weekRangesOf } from "../../lib/planTime.js";
import type { PlannedTopic, Plan, Subplan, WeekSlice } from "./plan.js";

export interface PlanAreaTarget {
  areaId: string;
  name: string;
  objective: string;
  knowledgeTitle: string;
}

const FRONTEND: PlanAreaTarget = {
  areaId: "frontend",
  name: areaDef("frontend")?.name ?? "Frontend",
  objective: areaDef("frontend")?.objective ?? "Crear interfaces web accesibles y mantenibles",
  knowledgeTitle: areaDef("frontend")?.knowledgeTitle ?? "Conocimientos de frontend",
};
const JAVA: PlanAreaTarget = { areaId: "java", name: "Java", objective: "Dominar Java como lenguaje: sintaxis, librería estándar y buenas prácticas", knowledgeTitle: "Referencia de Java" };

/** Área del currículo de referencia → área del plan donde entra por defecto. */
export const CURRICULUM_PLAN_TARGET: Readonly<Record<string, PlanAreaTarget>> = { html: FRONTEND, css: FRONTEND, "js-reference": FRONTEND, java: JAVA };

/** Cuántos temas nuevos se reparten por semana en el `targetWeek` informativo (el reparto real es por avance). */
const PER_WEEK = 4;

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El área del currículo a la que pertenece una carpeta de tema (`Programación/12 CSS/12.7 …`), o undefined. */
export function curriculumAreaOfFolder(folder: string, areas: ReadonlyArray<{ id: string; space: string; areaFolder: string }>): string | undefined {
  const f = folder.replace(/\\/g, "/");
  const found = areas.find((a) => f.startsWith(`${a.space}/${a.areaFolder}/`))?.id;
  if (found) return found;
  if (f.startsWith("Programación/11 HTML/")) return "html";
  if (f.startsWith("Programación/12 CSS/")) return "css";
  if (f.startsWith("Programación/13 JavaScript Reference/")) return "js-reference";
  return undefined;
}

/** Orden del catálogo: por la numeración de la carpeta (`12.2` antes que `12.10`). */
export const byTopicNumber = (a: string, b: string): number => (a.split("/").pop() ?? a).localeCompare(b.split("/").pop() ?? b, "en", { numeric: true });

/** El subplan del plan que es ese área (por `areaId`, por id o por nombre sin tildes), o undefined. */
export function findAreaSubplan(plan: Pick<Plan, "subplans">, target: PlanAreaTarget): Subplan | undefined {
  return (
    plan.subplans.find((s) => s.areaId === target.areaId) ??
    plan.subplans.find((s) => fold(s.id) === target.areaId) ??
    plan.subplans.find((s) => fold(s.area) === fold(target.name))
  );
}

export interface AddTopicItem {
  folder: string;
  title: string;
  estMinutes: number;
  /** destino: el subplan elegido a mano (id) o el área por defecto del mapa */
  subplanId?: string;
  target?: PlanAreaTarget;
}

export interface AddTopicsResult {
  plan: Plan;
  /** carpetas añadidas, por subplan */
  added: Array<{ folder: string; subplanId: string }>;
  skipped: Array<{ folder: string; reason: string }>;
  /** subplans creados por esta operación */
  created: Array<{ id: string; area: string }>;
}

function uniqueId(plan: Pick<Plan, "subplans">, base: string): string {
  const used = new Set(plan.subplans.map((s) => s.id));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Recalcula la parte informativa por semanas de un subplan (la carga del plan lo vuelve a derivar de los temas). */
function weeksOf(plan: Pick<Plan, "start" | "end">, sub: Pick<Subplan, "topics" | "weeks">): WeekSlice[] {
  const ranges = weekRangesOf(plan.start, plan.end);
  return ranges.map((r) => {
    const inWeek = sub.topics.filter((t) => t.route !== "skipped" && Math.min(ranges.length, t.targetWeek) === r.week);
    const saved = sub.weeks.find((w) => w.week === r.week);
    return { week: r.week, start: r.start, end: r.end, topics: inWeek.map((t) => t.folder), minutes: inWeek.reduce((n, t) => n + t.estMinutes, 0), capacityMinutes: saved?.capacityMinutes ?? 0 };
  });
}

function groupForItem(it: AddTopicItem, subAreaId?: string): { id: string; title: string; order: number } | undefined {
  if (!subAreaId) return undefined;
  const f = it.folder.replace(/\\/g, "/");
  if (f.includes("/5 Frontend/HTML/") || f.includes("/11 HTML/")) return { id: "html", title: "HTML", order: 110 };
  if (f.includes("/5 Frontend/CSS/") || f.includes("/12 CSS/")) return { id: "css", title: "CSS", order: 120 };
  if (f.includes("/13 JavaScript Reference/")) return { id: "js-reference", title: "JavaScript Reference", order: 130 };
  return { id: CORE_GROUP_ID, title: it.target?.knowledgeTitle ?? areaDef(subAreaId)?.knowledgeTitle ?? "Temas", order: 100 };
}

/**
 * Añade los temas al final de la ruta de su área. Función pura: devuelve el plan nuevo (el mismo objeto si no cambió nada). `items` ya viene validado
 * contra la vault; aquí solo se decide el destino y el orden.
 */
export function addTopicsToPlan(plan: Plan, items: readonly AddTopicItem[]): AddTopicsResult {
  const weeks = Math.max(1, weekRangesOf(plan.start, plan.end).length);
  const present = new Set(plan.subplans.flatMap((s) => s.topics.map((t) => t.folder)));
  const skipped: AddTopicsResult["skipped"] = [];
  const added: AddTopicsResult["added"] = [];
  const created: AddTopicsResult["created"] = [];
  let subplans: Subplan[] = plan.subplans.map((s) => ({ ...s, topics: [...s.topics] }));

  // agrupa por destino conservando el orden del catálogo dentro de cada grupo
  const groups = new Map<string, { target?: PlanAreaTarget; subplanId?: string; items: AddTopicItem[] }>();
  for (const it of [...items].sort((a, b) => byTopicNumber(a.folder, b.folder))) {
    if (present.has(it.folder)) {
      skipped.push({ folder: it.folder, reason: "ya está en el plan" });
      continue;
    }
    present.add(it.folder);
    const key = it.subplanId ? `s:${it.subplanId}` : `a:${it.target?.areaId ?? ""}`;
    const g = groups.get(key) ?? { ...(it.target ? { target: it.target } : {}), ...(it.subplanId ? { subplanId: it.subplanId } : {}), items: [] };
    g.items.push(it);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    let idx = g.subplanId ? subplans.findIndex((s) => s.id === g.subplanId) : g.target ? subplans.findIndex((s) => findAreaSubplan({ subplans: [s] }, g.target!)) : -1;
    if (idx < 0 && g.subplanId) {
      for (const it of g.items) skipped.push({ folder: it.folder, reason: "esa área ya no existe en el plan" });
      continue;
    }
    if (idx < 0) {
      const t = g.target!;
      const core: AreaGroup = { id: CORE_GROUP_ID, title: t.knowledgeTitle, kind: "knowledge", order: 100 };
      const sub: Subplan = {
        id: uniqueId({ subplans }, t.areaId),
        area: t.name,
        objective: t.objective,
        topics: [],
        weeks: [],
        requiredGoals: [],
        areaId: t.areaId,
        groups: [core],
        phase: { fromWeek: 1, toWeek: weeks },
      };
      subplans = [...subplans, sub];
      idx = subplans.length - 1;
      created.push({ id: sub.id, area: sub.area });
    }
    const sub = subplans[idx]!;
    const lastWeek = Math.min(weeks, Math.max(1, ...sub.topics.map((t) => t.targetWeek)));
    let groupsOf = sub.groups ? [...sub.groups] : [];
    const fresh: PlannedTopic[] = g.items.map((it, i) => {
      const gDef = groupForItem(it, sub.areaId);
      if (gDef && !groupsOf.some((x) => x.id === gDef.id)) {
        groupsOf.push({ id: gDef.id, title: gDef.title, kind: "knowledge", order: gDef.order });
      }
      return {
        folder: it.folder,
        title: it.title,
        targetWeek: Math.min(weeks, lastWeek + Math.floor(i / PER_WEEK)),
        estMinutes: it.estMinutes,
        ...(gDef ? { group: gDef.id } : {}),
        addedFrom: "curriculum" as const,
      };
    });
    groupsOf.sort((a, b) => a.order - b.order);
    const next: Subplan = { ...sub, topics: [...sub.topics, ...fresh], ...(groupsOf.length ? { groups: groupsOf } : {}) };
    subplans[idx] = { ...next, weeks: weeksOf(plan, next) };
    for (const t of fresh) added.push({ folder: t.folder, subplanId: sub.id });
  }

  if (!added.length) return { plan, added, skipped, created };
  return { plan: { ...plan, subplans, updatedAt: new Date().toISOString() }, added, skipped, created };
}
