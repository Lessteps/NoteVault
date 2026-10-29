/**
 * Granularidad atómica del currículo de referencia: en las áreas donde se aprende PATRÓN A PATRÓN (HTML: cada elemento; CSS: cada
 * propiedad; JavaScript: cada método/función) una nota por grupo no sirve — es como estudiar todos los huesos en una sola hoja.
 * `expandAtomic` convierte cada elemento de una entrada importante en su propio subtema, numerado bajo el grupo (`5.19.7.1`, `5.19.7.2`…),
 * en orden lineal: primero el repaso del grupo, luego cada pieza. Puro: sin disco ni red.
 */
import type { CurriculumArea, CurriculumEntry } from "../../lib/curriculum";

/** Las entradas opcionales se quedan agrupadas: no merece la pena una nota por pieza de lo que casi no se usa. */
const EXPAND = new Set<CurriculumEntry["importance"]>(["esencial", "recomendado"]);
/** Un elemento con más palabras que esto es prosa («when to use semantic vs generic containers»), no una pieza que memorizar. */
const MAX_WORDS = 4;
const MIN_ATOMS = 2;
const MAX_ATOMS = 24;

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const slugAtom = (s: string): string => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

/** Une los trozos que `buildEntries` partió dentro de un paréntesis: «specificity weights (inline», «id», «class)» → una sola pieza. */
export function mergeParens(items: readonly string[]): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const raw of items) {
    buf = buf ? `${buf}, ${raw}` : raw;
    depth += (raw.match(/\(/g) ?? []).length - (raw.match(/\)/g) ?? []).length;
    if (depth <= 0) {
      out.push(buf.trim());
      buf = "";
      depth = 0;
    }
  }
  if (buf) out.push(buf.trim());
  return out;
}

/** Nombre de carpeta de una pieza: «<img src alt>» → «img element»; «:nth-child()» → «:nth-child»; sin los caracteres prohibidos. */
export function atomTitle(item: string): string {
  let t = item.replace(/\s*\(.*\)\s*/g, " ").trim();
  const tag = /^<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>?$/i.exec(t);
  if (tag) t = `${tag[1]} element`;
  t = t.replace(/[<>]/g, "").replace(/[=:|]+/g, " ").replace(/[\\/*?"]+/g, " ").replace(/\s+/g, " ").trim();
  return t || item.replace(/[^\w-]+/g, " ").trim();
}

export function atomsOf(entry: CurriculumEntry): string[] {
  const seen = new Set<string>([slugAtom(entry.title)]);
  const out: string[] = [];
  for (const raw of mergeParens(entry.items)) {
    const title = atomTitle(raw);
    if (!title || title.split(/\s+/).length > MAX_WORDS) continue;
    const key = slugAtom(title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= MAX_ATOMS) break;
  }
  return out;
}

/** El área con cada pieza importante como subtema. Las áreas no atómicas (o sin piezas suficientes) quedan igual. */
export function expandAtomic(area: CurriculumArea): CurriculumArea {
  if (!area.atomic) return area;
  const entries: CurriculumEntry[] = [];
  for (const e of area.entries) {
    entries.push(e);
    if (!EXPAND.has(e.importance)) continue;
    const atoms = atomsOf(e);
    if (atoms.length < MIN_ATOMS) continue;
    for (const title of atoms) {
      entries.push({
        id: `${e.id}.${slugAtom(title)}`,
        category: e.title,
        title,
        importance: e.importance,
        items: [title],
        keywords: [title.toLowerCase()],
        parentId: e.id,
      });
    }
  }
  return { ...area, entries };
}
