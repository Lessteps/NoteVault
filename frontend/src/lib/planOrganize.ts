// «Organizar» un plan: el orden de los temas de un área sale de sus NÚMEROS e ids (la jerarquía `N.M` → `N.M.K` de las carpetas), no de en qué orden se fueron
// añadiendo. Dentro de cada asignatura de referencia (HTML, CSS, JavaScript Reference…) va primero el tema general y luego cada pieza, de la 1 a la última; los
// temas genéricos antiguos («HTML: practicar con contenedores…») pasan a opcionales cuando ya hay piezas de verdad. Una IA puede PROPONER el orden (`order`);
// la app lo valida contra los temas del plan y lo aplica: la IA da la lógica, la app la muestra. Puro: sin disco ni red.

import type { AreaGroup } from "./planAreas.js";

/** Carpetas de las áreas de referencia y de las de conocimiento con temario por dependencia (`6 Databases`…): aquí el número de carpeta ES el orden de aprendizaje. */
export const REFERENCE_FOLDER_RE = /\/(?:5 Frontend\/(?:HTML|CSS|Atomic Design)|11 HTML|12 CSS|13 JavaScript Reference|14 Java|1 Fundamentals|4 Backend|6 Databases|7 Automation|9 Tooling and Quality)\//;

/** Temas genéricos que creó la antigua «Corregir metodología» (3 de HTML, 4 de CSS): las piezas atómicas los sustituyen. */
export const LEGACY_STUB_RE = /\/5\.18\.[1-3] HTML practicar con |\/5\.19\.[1-4] CSS practicar con /;

/** Las piezas de una asignatura a partir de las cuales los temas genéricos antiguos sobran. */
export const MIN_PIECES_TO_DEMOTE = 20;

/** `5.18.11.1 p element` → [5, 18, 11, 1]; sin número → null. */
export function numberKey(folder: string): number[] | null {
  const name = folder.replace(/\\/g, "/").split("/").pop() ?? "";
  const m = /^(\d+(?:\.\d+)*)\s/.exec(name);
  return m ? m[1]!.split(".").map(Number) : null;
}

/** Orden numérico por segmentos; el prefijo corto va antes (`5.18.4` antes que `5.18.4.1`). */
export function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

export interface OrganizeTopic {
  folder: string;
  group?: string;
  route?: "core" | "optional" | "skipped";
}

export interface OrganizeResult<T> {
  topics: T[];
  /** carpetas que cambiaron de sitio */
  moved: string[];
  /** carpetas que pasan a opcionales (temas genéricos antiguos) */
  demoted: string[];
}

/**
 * Ordena los temas de un área: por el orden de sus grupos y, dentro de cada uno, por `order` (lo que proponga una IA, ya validado) o, si no hay, por número de
 * carpeta SOLO en las asignaturas de referencia (el orden que eligió el estudiante o la IA en las demás se respeta). Estable: lo que no tiene número se queda donde está.
 */
export function organizeTopics<T extends OrganizeTopic>(topics: readonly T[], groups: readonly AreaGroup[] | undefined, o: { order?: readonly string[] } = {}): OrganizeResult<T> {
  const rank = new Map((groups ?? []).map((g, i) => [g.id, g.order * 1000 + i]));
  const proposed = o.order?.length ? new Map(o.order.map((f, i) => [f, i])) : null;
  const idx = new Map(topics.map((t, i) => [t.folder, i]));
  const byGroup = new Map<string, T[]>();
  for (const t of topics) byGroup.set(t.group ?? "", [...(byGroup.get(t.group ?? "") ?? []), t]);
  const sortGroup = (list: T[]): T[] => {
    if (proposed) {
      const inOrder = list.filter((t) => proposed.has(t.folder)).sort((a, b) => proposed.get(a.folder)! - proposed.get(b.folder)!);
      return inOrder.length ? [...inOrder, ...list.filter((t) => !proposed.has(t.folder))] : list;
    }
    if (!list.some((t) => REFERENCE_FOLDER_RE.test(t.folder.replace(/\\/g, "/")))) return list;
    return list
      .map((t) => ({ t, k: numberKey(t.folder), i: idx.get(t.folder)! }))
      .sort((a, b) => (a.k && b.k ? compareKeys(a.k, b.k) || a.i - b.i : a.i - b.i))
      .map((x) => x.t);
  };
  const orderedGroups = [...byGroup.keys()].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  const out = orderedGroups.flatMap((g) => sortGroup(byGroup.get(g)!));
  const moved = out.filter((t, i) => topics[i]!.folder !== t.folder).map((t) => t.folder);
  const demoted: string[] = [];
  const counts = new Map<string, number>();
  for (const t of out) if (!LEGACY_STUB_RE.test(t.folder.replace(/\\/g, "/"))) counts.set(t.group ?? "", (counts.get(t.group ?? "") ?? 0) + 1);
  const final = out.map((t) => {
    if (LEGACY_STUB_RE.test(t.folder.replace(/\\/g, "/")) && (counts.get(t.group ?? "") ?? 0) >= MIN_PIECES_TO_DEMOTE && (t.route ?? "core") === "core") {
      demoted.push(t.folder);
      return { ...t, route: "optional" as const };
    }
    return t;
  });
  return { topics: final, moved, demoted };
}

/** ¿Hay algo que organizar en el plan? (temas de referencia fuera de orden o genéricos antiguos por jubilar). La interfaz lo usa para organizar SOLA, una vez. */
export function planNeedsOrganize(plan: { subplans: ReadonlyArray<{ groups?: readonly AreaGroup[]; topics: ReadonlyArray<OrganizeTopic> }> }): boolean {
  return plan.subplans.some((s) => {
    const r = organizeTopics(s.topics, s.groups);
    return r.moved.length > 0 || r.demoted.length > 0;
  });
}
