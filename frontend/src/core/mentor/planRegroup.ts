/**
 * Las ASIGNATURAS de un área de conocimiento (Backend, Databases, Automation, Tooling) salen del índice de la vault `00 Units — <área>.md`: cada sección es una
 * asignatura. Determinista y sin IA. La app MANTIENE esos grupos (llevan `auto: "units"`): si el índice renombra, añade o reordena secciones, los temas se
 * recolocan solos. Los grupos que creó la persona (sin marca) y los temas que movió a ellos no se tocan. Idempotente: devuelve el mismo plan si no hay cambios.
 */

import { areaDef, CORE_GROUP_ID, type AreaGroup } from "../../lib/planAreas.js";
import { classifyBranch } from "../../lib/planTime.js";
import { branchOfFolder } from "../../lib/planTopicCatalog.js";
import { parseUnitsIndex, sectionOfTopic, slugTitle, worthGrouping, type UnitsIndex } from "../../lib/planUnits.js";
import type { Plan, PlannedTopic, Subplan } from "./plan.js";

const SECTION_ORDER0 = 110;
const REGROUPABLE = new Set(["backend", "databases", "automation", "tooling"]);
/** grupos con significado propio: nunca se reasignan */
const RESERVED = (g: AreaGroup): boolean => g.id === CORE_GROUP_ID || g.kind !== "knowledge" || g.id === "html" || g.id === "css" || g.id === "js-reference";

/** La carpeta de área de un subplan (`Programación/6 Databases`): la más frecuente entre sus temas cuya rama es de ese área. */
export function areaFolderOf(areaId: string, folders: readonly string[]): string | undefined {
  const count = new Map<string, number>();
  for (const f of folders) {
    const parts = f.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length < 3 || classifyBranch(branchOfFolder(f)) !== areaId) continue;
    const key = `${parts[0]}/${parts[1]}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** ¿Es un grupo que mantiene la app? Los marcados, y los que creó una versión anterior de esta regla (id = título sin tildes y todos sus temas están en el índice). */
function isAuto(g: AreaGroup, topics: readonly PlannedTopic[], idx: UnitsIndex): boolean {
  if (RESERVED(g)) return false;
  if (g.auto === "units") return true;
  const mine = topics.filter((t) => t.group === g.id);
  return g.id === slugTitle(g.title) && mine.length > 0 && mine.every((t) => sectionOfTopic(idx, t.folder) >= 0);
}

function regroupSubplan(s: Subplan, idx: UnitsIndex): Subplan {
  const groups = s.groups ?? [];
  const auto = new Set(groups.filter((g) => isAuto(g, s.topics, idx)).map((g) => g.id));
  const target = new Map<string, number>();
  for (const t of s.topics) {
    const g = t.group ?? CORE_GROUP_ID;
    if (g !== CORE_GROUP_ID && !auto.has(g)) continue;
    const sec = sectionOfTopic(idx, t.folder);
    if (sec >= 0) target.set(t.folder, sec);
  }
  if (!target.size) return s;
  const topics = s.topics.map((t) => {
    const sec = target.get(t.folder);
    if (sec === undefined) return t;
    const id = idx.sections[sec]!.id;
    return t.group === id ? t : { ...t, group: id };
  });
  const used = [...new Set(target.values())].sort((a, b) => a - b);
  const kept = groups.filter((g) => !auto.has(g.id));
  const created: AreaGroup[] = used.map((sec) => ({ id: idx.sections[sec]!.id, title: idx.sections[sec]!.title, kind: "knowledge" as const, order: SECTION_ORDER0 + sec * 10, auto: "units" as const }));
  // el grupo general se retira cuando ya no le queda ningún tema
  const stillCore = topics.some((t) => (t.group ?? CORE_GROUP_ID) === CORE_GROUP_ID);
  const next = [...kept.filter((g) => stillCore || g.id !== CORE_GROUP_ID), ...created].sort((a, b) => a.order - b.order);
  const final = next.length ? next : [{ id: CORE_GROUP_ID, title: areaDef(s.areaId ?? "")?.knowledgeTitle ?? "Temas", kind: "knowledge" as const, order: 100 }];
  const same = JSON.stringify(final) === JSON.stringify(groups) && topics.every((t, i) => t === s.topics[i]);
  return same ? s : { ...s, topics, groups: final };
}

/** `readIndex(areaFolder)` devuelve el texto de `<areaFolder>/00 Units — <área>.md` o null. */
export function regroupByUnits(plan: Plan, readIndex: (areaFolder: string) => string | null): Plan {
  let changed = false;
  const subplans = plan.subplans.map((s) => {
    const areaId = s.areaId ?? "";
    if (!REGROUPABLE.has(areaId)) return s;
    const areaFolder = areaFolderOf(areaId, s.topics.map((t) => t.folder));
    const md = areaFolder ? readIndex(areaFolder) : null;
    if (!md) return s;
    const idx = parseUnitsIndex(md);
    if (!worthGrouping(idx)) return s;
    const next = regroupSubplan(s, idx);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...plan, subplans } : plan;
}
