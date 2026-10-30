// Salud del plan: comprueba, sin IA y sin disco, los errores que ya nos han pasado, para que no vuelvan en silencio. Cada regla es una clase de fallo real:
//   missing-topics    temas de la vault, de un área que SÍ está en el plan, que el plan no tiene (y nadie quitó a propósito)
//   ungrouped         un área con un solo grupo general aunque el índice de la vault define varias asignaturas
//   similar-sections  dos secciones del índice con nombres casi iguales en la misma área («Foundations» y «Fundamentals»)
//   out-of-order      temas de un grupo fuera del orden de sus números
//   scan-truncated    el escaneo de la vault se cortó por el tope y faltan notas
// Puro: recibe los datos ya leídos. La capa de la API los lee y llama aquí (`mentor_plan_health`).

import { numberKey, compareKeys } from "./planOrganize.js";
import { parseUnitsIndex, worthGrouping } from "./planUnits.js";

export type HealthCode = "over-capacity" | "missing-topics" | "ungrouped" | "similar-sections" | "out-of-order" | "scan-truncated";

export interface HealthIssue {
  code: HealthCode;
  area: string;
  message: string;
  /** carpetas o nombres implicados (acotado) */
  items?: string[];
}

export interface HealthPlan {
  subplans: ReadonlyArray<{ id: string; area: string; areaId?: string; groups?: ReadonlyArray<{ id: string; title: string; kind: string }>; topics: ReadonlyArray<{ folder: string; group?: string; route?: string }> }>;
}

export interface HealthInput {
  plan: HealthPlan;
  /** carpetas de tema de la vault con el área del plan a la que irían (`null` = no es de ningún área del plan) */
  vaultTopics: ReadonlyArray<{ folder: string; areaId: string | null }>;
  /** carpetas que la persona quitó o ya se ofrecieron: no cuentan como «faltan» */
  offered?: ReadonlySet<string>;
  /** texto del índice `00 Units` por id de área del plan */
  unitsIndexOf?: (areaId: string) => string | null;
  scanTruncated?: boolean;
  /** minutos de teoría que faltan por hacer y minutos que el calendario ofrece de hoy al fin */
  capacity?: { neededMin: number; availableMin: number };
}

const cap = <T,>(a: readonly T[], n = 8): T[] => a.slice(0, n);
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras que significan «lo básico» en un título de sección: dos secciones con ellas, en la misma área, se confunden. */
const BASICS = /^(foundations?|fundamentals?|basics?|basic|fundamentos|bases?|introduction|intro|getting started)$/;

export function planHealth(input: HealthInput): HealthIssue[] {
  const out: HealthIssue[] = [];
  const inPlan = new Set(input.plan.subplans.flatMap((s) => s.topics.map((t) => t.folder)));
  const areaOf = new Map(input.plan.subplans.filter((s) => s.areaId).map((s) => [s.areaId!, s] as const));

  if (input.scanTruncated) {
    out.push({ code: "scan-truncated", area: "", message: "El escaneo de la vault se cortó por el tope de notas: faltan temas en la app. Sube MAX_SCAN_NOTES." });
  }

  const cap0 = input.capacity;
  if (cap0 && cap0.availableMin > 0 && cap0.neededMin > cap0.availableMin) {
    const h = (m: number): number => Math.round(m / 60);
    out.push({ code: "over-capacity", area: "", message: `El plan no cabe en su fecha de fin: faltan ${h(cap0.neededMin)} h de temas y el calendario ofrece ${h(cap0.availableMin)} h (${h(cap0.neededMin - cap0.availableMin)} h de más). Hay que ampliar la fecha, subir los minutos diarios o recortar temas.` });
  }

  const missing = new Map<string, string[]>();
  for (const v of input.vaultTopics) {
    if (!v.areaId || !areaOf.has(v.areaId) || inPlan.has(v.folder) || input.offered?.has(v.folder)) continue;
    missing.set(v.areaId, [...(missing.get(v.areaId) ?? []), v.folder]);
  }
  for (const [areaId, folders] of missing) {
    out.push({ code: "missing-topics", area: areaOf.get(areaId)!.area, message: `Faltan ${folders.length} temas de la vault en ${areaOf.get(areaId)!.area}.`, items: cap(folders.map((f) => f.split("/").pop() ?? f)) });
  }

  for (const s of input.plan.subplans) {
    const md = s.areaId ? input.unitsIndexOf?.(s.areaId) ?? null : null;
    if (md) {
      const idx = parseUnitsIndex(md);
      const knowledge = (s.groups ?? []).filter((g) => g.kind === "knowledge");
      if (worthGrouping(idx) && knowledge.length <= 1 && s.topics.length >= idx.sections.length * 2) {
        out.push({ code: "ungrouped", area: s.area, message: `${s.area} tiene todos sus temas en un solo grupo, pero la vault define ${idx.sections.length} asignaturas.`, items: cap(idx.sections.map((x) => x.title)) });
      }
      const basics = idx.sections.filter((x) => BASICS.test(fold(x.title).replace(/[^a-z ]/g, "").trim()) || /^(foundations?|fundamentals?|basics?)\b/.test(fold(x.title)));
      if (basics.length >= 2) {
        out.push({ code: "similar-sections", area: s.area, message: `Dos secciones del índice se confunden entre sí: ${basics.map((b) => `«${b.title}»`).join(" y ")}. Dales nombres que digan qué contienen.`, items: basics.map((b) => b.title) });
      }
    }
    // fuera de orden: dentro de cada grupo, los temas con número deben ir por número
    const bad: string[] = [];
    const byGroup = new Map<string, string[]>();
    // solo las asignaturas de conocimiento van por número; las de lenguaje y las Bases siguen el orden pedagógico que se les dio
    const numbered = new Set((s.groups ?? []).filter((g) => g.kind === "knowledge").map((g) => g.id));
    for (const t of s.topics) if (t.route !== "skipped" && numbered.has(t.group ?? "")) byGroup.set(t.group ?? "", [...(byGroup.get(t.group ?? "") ?? []), t.folder]);
    for (const list of byGroup.values()) {
      let prev: number[] | null = null;
      for (const f of list) {
        const k = numberKey(f);
        if (!k) continue;
        if (prev && compareKeys(prev, k) > 0) bad.push(f.split("/").pop() ?? f);
        prev = k;
      }
    }
    if (bad.length && s.areaId && ["backend", "databases", "automation", "tooling"].includes(s.areaId)) {
      out.push({ code: "out-of-order", area: s.area, message: `${bad.length} temas de ${s.area} van fuera del orden de sus números.`, items: cap(bad) });
    }
  }
  return out;
}
