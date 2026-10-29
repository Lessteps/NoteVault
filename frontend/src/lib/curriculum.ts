/**
 * Currículo de referencia: lista de lo que un área DEBERÍA cubrir (categorías y grupos de propiedades,
 * elementos, métodos…) frente a los temas que ya existen en la vault. Sirve para señalar huecos
 * («falta de desarrollo») y para crear los temas que faltan con un agente externo.
 *
 * Contrato compartido entre el catálogo/cobertura (core + api), el generador de tareas para el agente
 * externo y la interfaz. Solo tipos y utilidades puras: sin acceso a disco ni a la red.
 */

export type CurriculumImportance = "esencial" | "recomendado" | "opcional";

/** Un tema de referencia por crear o ya cubierto. Es un GRUPO pequeño (no una propiedad suelta). */
export interface CurriculumEntry {
  /** Estable y único dentro del área, p. ej. `css.flex-container`. */
  id: string;
  /** Categoría para agrupar en la interfaz, p. ej. `Layout`, `Tipografía`. */
  category: string;
  /** Título del tema tal como se creará, en inglés (la vault de Programación va en inglés). */
  title: string;
  importance: CurriculumImportance;
  /** Qué cubre exactamente el tema: propiedades, elementos, métodos… (una tarjeta de referencia cada uno). */
  items: string[];
  /** Palabras clave para reconocer temas existentes que ya lo cubren (minúsculas). */
  keywords: string[];
  /** Subtema ATÓMICO (una propiedad, un elemento, un método): id de la entrada-grupo de la que sale. Se crea una nota por cada uno. */
  parentId?: string;
}

export interface CurriculumArea {
  /** `css`, `html`, `js-reference`, `java`. */
  id: string;
  title: string;
  /** Espacio de la vault, p. ej. `Programación`. */
  space: string;
  /** Carpeta del área donde se crearán los temas nuevos, p. ej. `5 Frontend/HTML` o `14 Java`. */
  areaFolder: string;
  /** Prefijo numérico opcional para los temas (ej. `5.1` para HTML, `5.2` para CSS); si no se especifica se extrae de `areaFolder`. */
  prefix?: string;
  /** Si true, cada elemento/propiedad de una entrada importante es su PROPIO subtema (una nota por propiedad); la entrada-grupo queda como repaso. */
  atomic?: boolean;
  entries: CurriculumEntry[];
}

export type CoverageStatus = "cubierto" | "parcial" | "faltante";

export interface CoverageRow {
  entry: CurriculumEntry;
  status: CoverageStatus;
  /** Carpetas existentes que lo cubren total o parcialmente (rutas relativas a la vault). */
  matchedFolders: string[];
  /** Carpeta propuesta si hay que crearlo, p. ej. `Programación/12 CSS/12.7 Flexbox container`. */
  suggestedFolder: string;
}

/** `ok`: ≥ 80 % cubierto; `bajo`: 40–79 %; `critico`: < 40 %. */
export type CoverageLevel = "ok" | "bajo" | "critico";

export interface AreaCoverage {
  areaId: string;
  title: string;
  space: string;
  areaFolder: string;
  total: number;
  covered: number;
  partial: number;
  missing: number;
  /** 0..100, cubiertos + mitad de parciales. */
  pct: number;
  level: CoverageLevel;
  rows: CoverageRow[];
}

export interface CurriculumCoverage {
  areas: AreaCoverage[];
}

export function coverageLevel(pct: number): CoverageLevel {
  return pct >= 80 ? "ok" : pct >= 40 ? "bajo" : "critico";
}

export function coveragePct(covered: number, partial: number, total: number): number {
  return total > 0 ? Math.round(((covered + partial / 2) / total) * 100) : 100;
}

/** Texto corto para la marca de «falta de desarrollo» en áreas y tablas. */
export function coverageBadge(c: Pick<AreaCoverage, "pct" | "level" | "missing">): string {
  if (c.level === "ok") return "";
  return `${c.level === "critico" ? "Desarrollo insuficiente" : "Desarrollo parcial"} · ${c.pct} % · faltan ${c.missing}`;
}

/**
 * Reparte lo que falta en LOTES para las tareas del agente externo (una tarea admite pocos temas). Las categorías se mantienen juntas —el grupo y
 * sus piezas viajan en la misma tarea—, en el orden del catálogo; una categoría más grande que el lote se parte, con el grupo siempre en el primero.
 * `only` limita por importancia («esencial» primero y por separado).
 */
export function planBatches(rows: readonly CoverageRow[], size: number, only?: CurriculumImportance): string[][] {
  const todo = rows.filter((r) => r.status !== "cubierto" && (!only || r.entry.importance === only));
  const byCategory: string[][] = [];
  let last = "";
  for (const r of todo) {
    // un subtema cuelga de la categoría de su grupo: la `category` del subtema es el título del grupo, y el grupo está en SU categoría
    const key = r.entry.parentId ? `${r.entry.parentId}` : r.entry.id;
    if (!byCategory.length || key !== last) {
      byCategory.push([]);
      last = key;
    }
    byCategory[byCategory.length - 1]!.push(r.entry.id);
  }
  const out: string[][] = [];
  let cur: string[] = [];
  for (const chunk of byCategory) {
    if (chunk.length > size) {
      if (cur.length) out.push(cur), (cur = []);
      for (let i = 0; i < chunk.length; i += size) out.push(chunk.slice(i, i + size));
      continue;
    }
    if (cur.length + chunk.length > size) out.push(cur), (cur = []);
    cur.push(...chunk);
  }
  if (cur.length) out.push(cur);
  return out;
}
