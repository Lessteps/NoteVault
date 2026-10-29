/**
 * Las ASIGNATURAS de un área de conocimiento (Backend, Databases, Automation, Tooling) salen del índice de la vault `00 Units — <área>.md`: cada sección es una
 * asignatura. Determinista y sin IA: reparte los temas que están sin asignatura (grupo «core») en los grupos de esas secciones y deja el resto como está.
 * Idempotente: sin nada nuevo que repartir devuelve el mismo plan.
 */

import { areaDef, type AreaGroup } from "../../lib/planAreas.js";
import { classifyBranch } from "../../lib/planTime.js";
import { branchOfFolder } from "../../lib/planTopicCatalog.js";
import { parseUnitsIndex, sectionOfTopic, worthGrouping } from "../../lib/planUnits.js";
import { CORE_GROUP_ID } from "../../lib/planAreas.js";
import type { Plan } from "./plan.js";

const SECTION_ORDER0 = 110;
const REGROUPABLE = new Set(["backend", "databases", "automation", "tooling"]);

/** La carpeta de área de un subplan (`Programación/6 Databases`): la más frecuente entre sus temas cuya rama es de ese área. */
function areaFolderOf(areaId: string, folders: readonly string[]): string | undefined {
  const count = new Map<string, number>();
  for (const f of folders) {
    const parts = f.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length < 3 || classifyBranch(branchOfFolder(f)) !== areaId) continue;
    const key = `${parts[0]}/${parts[1]}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
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
    const target = new Map<string, number>();
    for (const t of s.topics) {
      if ((t.group ?? CORE_GROUP_ID) !== CORE_GROUP_ID) continue;
      const sec = sectionOfTopic(idx, t.folder);
      if (sec >= 0) target.set(t.folder, sec);
    }
    if (!target.size) return s;
    const used = new Set(target.values());
    const groups: AreaGroup[] = [...(s.groups ?? [])];
    for (const sec of [...used].sort((a, b) => a - b)) {
      const def = idx.sections[sec]!;
      if (!groups.some((g) => g.id === def.id)) groups.push({ id: def.id, title: def.title, kind: "knowledge", order: SECTION_ORDER0 + sec * 10 });
    }
    const topics = s.topics.map((t) => (target.has(t.folder) ? { ...t, group: idx.sections[target.get(t.folder)!]!.id } : t));
    // el grupo general se retira cuando ya no le queda ningún tema
    const stillCore = topics.some((t) => (t.group ?? CORE_GROUP_ID) === CORE_GROUP_ID);
    const finalGroups = (stillCore ? groups : groups.filter((g) => g.id !== CORE_GROUP_ID)).sort((a, b) => a.order - b.order);
    changed = true;
    return { ...s, topics, groups: finalGroups.length ? finalGroups : [{ id: CORE_GROUP_ID, title: areaDef(areaId)?.knowledgeTitle ?? "Temas", kind: "knowledge" as const, order: 100 }] };
  });
  return changed ? { ...plan, subplans } : plan;
}
