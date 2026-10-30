// Marca de VERSIÓN de la skill en cada pieza generada: `skill_version: <8 hex>` en el frontmatter de la nota (resumen_teorico_skill) y del `.practica.md`
// (practica_skill). El valor es el hash del texto de la skill con la que se generó o validó la pieza. Así la app sabe «esta pieza se hizo con ESTA versión»
// sin adivinar por fechas: si la marca coincide con la skill actual, está al día; si difiere, está hecha con otra versión; sin marca, se cae a la heurística
// (fecha, estructura, longitud). Puro: sin disco.

export const SKILL_VERSION_KEY = "skill_version";

/** La versión de una skill: los 8 primeros hex del sha1 de su texto normalizado (LF). El cálculo del hash vive donde se lee el archivo. */
export const shortVersion = (sha1hex: string): string => sha1hex.slice(0, 8);

/** El `skill_version` de un texto con frontmatter, o null si no lo tiene. */
export function stampOf(text: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!fm) return null;
  return new RegExp(`^${SKILL_VERSION_KEY}:\\s*"?([0-9a-f]{8})"?\\s*$`, "m").exec(fm)?.[1] ?? null;
}

/** Pone (o cambia) `skill_version` en el frontmatter. Sin frontmatter, devuelve el texto igual (no se inventa uno). */
export function withStamp(text: string, version: string): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!m) return text;
  const line = `${SKILL_VERSION_KEY}: "${version}"`;
  const re = new RegExp(`^${SKILL_VERSION_KEY}:.*$`, "m");
  const body = re.test(m[2]!) ? m[2]!.replace(re, line) : `${m[2]}\n${line}`;
  return `${m[1]}${body}${m[3]}${text.slice(m[0].length)}`;
}
