// Vista de un kata para la pestaña «Práctica»: el enunciado troceado en filas (Context / Task / Deliverable / Time box) y una plantilla de
// arranque copiable. Módulo PURO: todo sale del kata determinista (`areaPracticeSystem.ts`), nada se inventa ni se guarda.

import type { AreaKata } from "./areaPracticeSystem.js";

export interface KataDefRow {
  /** Context · Task · Deliverable · Time box */
  term: string;
  /** el nivel entre paréntesis de «Task (principiante)» */
  note?: string;
  text: string;
}

const LABEL_RE = /^\*\*(Context|Task|Deliverable|Time box)(?: \(([^)]*)\))?\.\*\*\s*(.*)$/;

/** El enunciado del kata como filas de una lista de definición. Lo que no encaja en una fila (el "This level asks you to") se cuelga de la anterior. */
export function kataDefinition(statement: string): KataDefRow[] {
  const rows: KataDefRow[] = [];
  for (const para of statement.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    const m = LABEL_RE.exec(p);
    if (m) {
      rows.push({ term: m[1]!, ...(m[2] ? { note: m[2] } : {}), text: m[3]!.trim() });
    } else if (rows.length && !p.startsWith("*Stretch")) {
      const last = rows[rows.length - 1]!;
      last.text = `${last.text} ${p.replace(/\*\*/g, "")}`;
    }
  }
  return rows;
}

const COMMENT: Record<string, string> = { databases: "--", automation: "#", tooling: "#" };
const EXT: Record<string, string> = { databases: "sql", automation: "py", tooling: "sh", frontend: "tsx", logic: "py" };

/** Extensión sugerida del archivo de la plantilla (por área). */
export const kataTemplateExt = (areaId: string): string => EXT[areaId] ?? "ts";

/** Una plantilla de arranque: el entregable y los criterios como comentarios, y un hueco para la respuesta. */
export function kataTemplate(k: AreaKata): string {
  const c = COMMENT[k.areaId] ?? "//";
  const deliverable = kataDefinition(k.statement).find((r) => r.term === "Deliverable")?.text ?? "";
  return [
    `${c} ${k.title} (${k.minutes} min)`,
    `${c} Deliverable: ${deliverable}`,
    `${c}`,
    `${c} Checklist`,
    ...k.criteria.map((x) => `${c} [ ] ${x}`),
    "",
    `${c} TODO: your answer`,
    "",
  ].join("\n");
}
