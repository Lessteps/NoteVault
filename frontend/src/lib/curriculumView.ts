// Currículo de referencia — lógica pura de las vistas: qué áreas del currículo se relacionan con una carpeta de la vault, cuáles faltan por crear,
// y cómo se agrupan, filtran y seleccionan los temas faltantes. Sin React ni acceso a disco.

import type { AreaCoverage, CoverageRow, CoverageStatus, CurriculumImportance } from "./curriculum";

/** A partir de cuántos temas seleccionados se avisa, y el tope duro (una tarea más grande no la termina bien un agente). */
export const SOFT_LIMIT = 25;
export const HARD_LIMIT = 40;

const norm = (p: string): string => String(p ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
const within = (folder: string, scope: string): boolean => {
  const f = norm(folder);
  const s = norm(scope);
  return !s || f === s || f.startsWith(`${s}/`);
};

/** Carpeta del área del currículo en la vault: `Programación/12 CSS`. */
export const areaPath = (c: Pick<AreaCoverage, "space" | "areaFolder">): string => `${norm(c.space)}/${norm(c.areaFolder)}`;

/** ¿Tiene esta área poco desarrollo (merece marca)? */
export const isLacking = (c: Pick<AreaCoverage, "level" | "missing">): boolean => c.level !== "ok" && c.missing > 0;

/**
 * Áreas del currículo relacionadas con una carpeta (área o materia) de la vault: la propia, o las que tienen temas existentes dentro de ella.
 * `scope` vacío = toda la materia `space`. Solo las que tienen falta de desarrollo.
 */
export function relatedCoverage(areas: AreaCoverage[], space: string, scope: string): AreaCoverage[] {
  const root = norm(scope) || norm(space);
  return areas.filter((c) => {
    if (norm(c.space) !== norm(space) || !isLacking(c)) return false;
    if (within(areaPath(c), root) && (norm(scope) === "" || norm(areaPath(c)) === root)) return true;
    return c.rows.some((r) => r.matchedFolders.some((f) => within(f, root)));
  });
}

/** Áreas del currículo de una materia que aún no existen en la vault (11 HTML, 12 CSS…): no hay carpeta de área con su nombre. */
export function pendingAreas(areas: AreaCoverage[], space: string, existingAreaPaths: string[]): AreaCoverage[] {
  const have = new Set(existingAreaPaths.map((p) => norm(p).toLowerCase()));
  return areas.filter((c) => norm(c.space) === norm(space) && !have.has(areaPath(c).toLowerCase()));
}

export type StatusFilter = "todos" | CoverageStatus;
export type ImportanceFilter = "todas" | CurriculumImportance;

export const STATUS_LABEL: Record<CoverageStatus, string> = { cubierto: "Cubierto", parcial: "Parcial", faltante: "Falta" };
export const IMPORTANCE_LABEL: Record<CurriculumImportance, string> = { esencial: "Esencial", recomendado: "Recomendado", opcional: "Opcional" };

export interface GapFilters {
  status: StatusFilter;
  importance: ImportanceFilter;
  /** vacío = todas las categorías */
  categories: string[];
  query: string;
}
export const DEFAULT_FILTERS: GapFilters = { status: "faltante", importance: "todas", categories: [], query: "" };

const fold = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function filterRows(rows: CoverageRow[], f: GapFilters): CoverageRow[] {
  const q = fold(f.query.trim());
  return rows.filter((r) => {
    if (f.status !== "todos" && r.status !== f.status) return false;
    if (f.importance !== "todas" && r.entry.importance !== f.importance) return false;
    if (f.categories.length && !f.categories.includes(r.entry.category)) return false;
    if (q && !fold(`${r.entry.title} ${r.entry.category} ${r.entry.items.join(" ")}`).includes(q)) return false;
    return true;
  });
}

export interface CategoryGroup {
  category: string;
  rows: CoverageRow[];
}

/** Agrupa por categoría conservando el orden en que aparecen en el catálogo. */
export function groupByCategory(rows: CoverageRow[]): CategoryGroup[] {
  const map = new Map<string, CoverageRow[]>();
  for (const r of rows) {
    const list = map.get(r.entry.category);
    if (list) list.push(r);
    else map.set(r.entry.category, [r]);
  }
  return [...map.entries()].map(([category, list]) => ({ category, rows: list }));
}

export const categoriesOf = (rows: CoverageRow[]): string[] => groupByCategory(rows).map((g) => g.category);

/** Se puede crear lo que falta o está a medias; lo cubierto no se selecciona. */
export const selectable = (r: CoverageRow): boolean => r.status !== "cubierto";

export const essentialMissing = (rows: CoverageRow[]): string[] => rows.filter((r) => r.status === "faltante" && r.entry.importance === "esencial").map((r) => r.entry.id);
export const idsOf = (rows: CoverageRow[]): string[] => rows.filter(selectable).map((r) => r.entry.id);

export function addAll(selected: string[], ids: string[]): string[] {
  const set = new Set(selected);
  for (const id of ids) set.add(id);
  return [...set];
}
export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export type SelectionState = "vacio" | "ok" | "aviso" | "tope";
export function selectionState(n: number): SelectionState {
  return n === 0 ? "vacio" : n > HARD_LIMIT ? "tope" : n > SOFT_LIMIT ? "aviso" : "ok";
}

export const countLabel = (n: number): string => `${n} ${n === 1 ? "tema seleccionado" : "temas seleccionados"}`;
