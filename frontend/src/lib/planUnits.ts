// Las ASIGNATURAS de un área de conocimiento salen del índice de la vault `00 Units — <área>.md`: cada `## Sección` es una asignatura y los `[[temas]]`
// que lista debajo (con sus piezas anidadas) son suyos. Es lo que mantiene quien crea los temas, así que el plan lo sigue solo, sin IA. Puro: sin disco.

export interface UnitsSection {
  id: string;
  title: string;
}

export interface UnitsIndex {
  sections: UnitsSection[];
  /** nombre de carpeta del tema (`6.4.1 SELECT statement`) → índice de su sección */
  byName: Map<string, number>;
  /** capítulo (`6.4`, sus dos primeros números) → índice de su sección: recoge las piezas que el índice no lista */
  byChapter: Map<string, number>;
}

const slug = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "seccion";

/** `6.4.1 SELECT statement` → `6.4`; sin número → "". */
export const chapterOf = (name: string): string => {
  const m = /^(\d+(?:\.\d+)?)/.exec(name.trim());
  return m ? m[1]! : "";
};

export function parseUnitsIndex(md: string): UnitsIndex {
  const sections: UnitsSection[] = [];
  const byName = new Map<string, number>();
  const byChapter = new Map<string, number>();
  let cur = -1;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const title = h[1]!.trim();
      let id = slug(title);
      for (let n = 2; sections.some((s) => s.id === id); n++) id = `${slug(title)}-${n}`;
      sections.push({ id, title });
      cur = sections.length - 1;
      continue;
    }
    if (cur < 0) continue;
    for (const m of line.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const name = m[1]!.trim();
      if (!byName.has(name)) byName.set(name, cur);
      const ch = chapterOf(name);
      if (ch && !byChapter.has(ch)) byChapter.set(ch, cur);
    }
  }
  return { sections, byName, byChapter };
}

/** La sección de un tema: por su nombre exacto o, si el índice no lo lista, por su capítulo. -1 si no es de ninguna. */
export function sectionOfTopic(idx: UnitsIndex, folder: string): number {
  const name = folder.replace(/\\/g, "/").split("/").pop() ?? "";
  const exact = idx.byName.get(name);
  if (exact !== undefined) return exact;
  return idx.byChapter.get(chapterOf(name)) ?? -1;
}

/** Con una sola sección no hay nada que repartir. */
export const worthGrouping = (idx: UnitsIndex): boolean => idx.sections.length >= 2;
