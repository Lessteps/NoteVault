import type { CurriculumEntry, CurriculumImportance } from "../../../lib/curriculum";

/** Fila compacta: [slug, título, importancia (e|r|o), elementos separados por coma, palabras clave separadas por coma]. */
export type Row = readonly [slug: string, title: string, imp: "e" | "r" | "o", items: string, keywords?: string];

const IMPORTANCE: Record<"e" | "r" | "o", CurriculumImportance> = { e: "esencial", r: "recomendado", o: "opcional" };

const split = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Expande `{categoría: filas}` en entradas con id `<prefijo>.<slug>`; el orden de las categorías y las filas es el del catálogo. */
export function buildEntries(prefix: string, categories: Record<string, readonly Row[]>): CurriculumEntry[] {
  const out: CurriculumEntry[] = [];
  for (const [category, rows] of Object.entries(categories)) {
    for (const [slug, title, imp, items, keywords] of rows) {
      const kws = new Set<string>([title.toLowerCase(), ...split((keywords ?? "").toLowerCase())]);
      out.push({ id: `${prefix}.${slug}`, category, title, importance: IMPORTANCE[imp], items: split(items), keywords: [...kws] });
    }
  }
  return out;
}
