// Operaciones PURAS para llevar una carpeta de la vault a un plan: qué temas hay bajo la carpeta, cómo se reparten en grupos
// (sub-asignaturas) y qué id le toca a un área propia. Las usa `applyOps` (ops `add_folder_area` y `add_folder_subject`), la API y los tests.

import type { AreaGroup } from "../../lib/planAreas.js";
import { CORE_GROUP_ID } from "../../lib/planAreas.js";
import { labelOfFolder, normFolder } from "../../lib/folderRoles.js";
import { fold, type CatalogTopic } from "./goalDraft.js";

const naturalCmp = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** Texto → id corto sin tildes (`HTML y Semántica` → `html-y-semantica`). */
export function slugOf(text: string, max = 32): string {
  return fold(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "") || "x";
}

/** Los temas pendientes (no completos) que cuelgan de una carpeta, en orden natural. La propia carpeta no cuenta como tema. */
export function topicsUnder(all: readonly CatalogTopic[], folder: string, opts: { includeDone?: boolean } = {}): CatalogTopic[] {
  const f = normFolder(folder);
  if (!f) return [];
  return all
    .filter((t) => normFolder(t.folder).startsWith(`${f}/`) && (opts.includeDone || t.completenessPct < 100))
    .sort((a, b) => naturalCmp(a.folder, b.folder));
}

/** Id de un área propia (`x-<slug>`) que no choca con las ya usadas: `x-html`, `x-html-2`… */
export function uniqueAreaId(folder: string, taken: Iterable<string | undefined>): string {
  const used = new Set([...taken].filter(Boolean) as string[]);
  const base = `x-${slugOf(labelOfFolder(folder), 24)}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Id de grupo que no pisa los fijos del sistema (`core`, `bases`, `lang-*`). */
export function groupIdOf(title: string): string {
  const s = slugOf(title);
  return s === CORE_GROUP_ID || s === "bases" || s.startsWith("lang-") ? `${s}-tema` : s;
}

export interface FolderSplit<T> {
  groups: AreaGroup[];
  topics: Array<T & { group: string }>;
}

/**
 * Reparte los temas de una carpeta en grupos: cada subcarpeta directa con temas es un grupo (sub-asignatura); los temas sueltos van al grupo
 * «Conocimientos de <nombre>». El orden de los grupos sigue el de las carpetas.
 */
export function splitByChildFolder<T extends { folder: string }>(folder: string, topics: readonly T[], name: string): FolderSplit<T> {
  const root = normFolder(folder);
  const loose: T[] = [];
  const children = new Map<string, T[]>();
  for (const t of topics) {
    const rest = normFolder(t.folder).slice(root.length + 1).split("/");
    if (rest.length <= 1) loose.push(t);
    else children.set(rest[0]!, [...(children.get(rest[0]!) ?? []), t]);
  }
  const groups: AreaGroup[] = [];
  const out: Array<T & { group: string }> = [];
  if (loose.length) {
    groups.push({ id: CORE_GROUP_ID, title: `Conocimientos de ${name}`, kind: "knowledge", order: 100 });
    for (const t of loose) out.push({ ...t, group: CORE_GROUP_ID });
  }
  [...children.keys()].sort(naturalCmp).forEach((child, i) => {
    const title = labelOfFolder(child);
    let id = groupIdOf(title);
    while (groups.some((g) => g.id === id)) id += "-2";
    groups.push({ id, title, kind: "knowledge", order: 110 + i * 10 });
    for (const t of children.get(child)!) out.push({ ...t, group: id });
  });
  return { groups, topics: out };
}
