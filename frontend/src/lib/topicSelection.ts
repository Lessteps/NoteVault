// «Temas por área»: filtro por estado y reglas de la regeneración en lote (qué se puede regenerar de cada tema y cuánto cuesta).
// Puro y sin React: lo usan la tabla, la barra de acciones y los tests.

import type { AreaTopicRow } from "./planAreaTopics";

export type StatusFilter = "all" | "noTheory" | "noMap" | "noPractice" | "noExercises" | "complete";
export type RegenKind = "theory" | "map" | "practice" | "exercises" | "all";

export const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "noTheory", label: "Falta nota" },
  { key: "noMap", label: "Falta mapa" },
  { key: "noPractice", label: "Falta práctica" },
  { key: "noExercises", label: "Falta ejercicios" },
  { key: "complete", label: "Completo" },
];

/** ¿Tiene el tema todo lo que se puede generar (nota, mapa, .practica y ejercicios)? */
export const isComplete = (r: AreaTopicRow): boolean => r.theory && r.canvas && r.manifest && r.exercises > 0;

export function matchesStatus(r: AreaTopicRow, f: StatusFilter): boolean {
  switch (f) {
    case "noTheory": return !r.theory;
    case "noMap": return !r.canvas;
    case "noPractice": return !r.manifest;
    case "noExercises": return r.exercises === 0;
    case "complete": return isComplete(r);
    default: return true;
  }
}

export const LABEL: Record<RegenKind, string> = {
  theory: "Regenerar teoría",
  map: "Regenerar mapa",
  practice: "Regenerar práctica",
  exercises: "Regenerar ejercicios",
  all: "Regenerar todo",
};
/** «la teoría», «el mapa»… para los mensajes. */
export const OBJECT: Record<RegenKind, string> = { theory: "la teoría", map: "el mapa", practice: "la práctica", exercises: "los ejercicios", all: "todo" };
/** Forma corta para el progreso («teoría…»). */
export const SHORT: Record<RegenKind, string> = { theory: "teoría", map: "mapa", practice: "práctica", exercises: "ejercicios", all: "todo" };

/** Por qué NO se puede regenerar eso de ese tema ("" si se puede). */
export function regenBlockedReason(row: AreaTopicRow, what: RegenKind, bridge: boolean): string {
  if (row.route === "skipped") return "El tema está fuera del plan: no se regenera.";
  if (!row.exists) return "El tema aún no existe en la vault: usa «Generar todo».";
  if (bridge) return "La IA está en modo puente: no puede regenerar automáticamente. Cambia de proveedor en los ajustes de IA.";
  if ((what === "theory" || what === "map") && !row.theory) return "Este tema no tiene teoría todavía: usa «Generar todo».";
  if (what === "exercises" && !row.manifest) return "Primero genera la práctica (.practica) del tema: de ahí salen las competencias.";
  return "";
}

/** Llamadas a la IA que aproximadamente cuesta regenerar `what` en un tema (el mapa no usa IA). */
export function estimateAiCalls(row: AreaTopicRow, what: RegenKind): number {
  const exercises = Math.max(3, row.planExercises ?? row.exercises);
  const per: Record<Exclude<RegenKind, "all">, number> = { theory: 1, map: 0, practice: 1, exercises };
  return what === "all" ? per.theory + per.practice + per.exercises : per[what];
}

export interface BulkPlan {
  what: RegenKind;
  /** temas que sí se regeneran */
  run: AreaTopicRow[];
  /** temas omitidos y por qué */
  skipped: Array<{ row: AreaTopicRow; reason: string }>;
  aiCalls: number;
}

export function planBulk(rows: ReadonlyArray<AreaTopicRow>, what: RegenKind, bridge: boolean): BulkPlan {
  const run: AreaTopicRow[] = [];
  const skipped: BulkPlan["skipped"] = [];
  for (const row of rows) {
    // «todo» regenera antes la práctica: de la que salen los ejercicios, así que no exige que ya exista
    const reason = what === "all" ? regenBlockedReason(row, "practice", bridge) : regenBlockedReason(row, what, bridge);
    if (reason) skipped.push({ row, reason });
    else run.push(row);
  }
  return { what, run, skipped, aiCalls: run.reduce((n, r) => n + estimateAiCalls(r, what), 0) };
}
