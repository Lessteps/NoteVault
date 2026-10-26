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
}

export interface CurriculumArea {
  /** `css`, `html`, `js-reference`, `java`. */
  id: string;
  title: string;
  /** Espacio de la vault, p. ej. `Programación`. */
  space: string;
  /** Carpeta del área donde se crearán los temas nuevos, p. ej. `12 CSS` (nivel 1, hermana de las actuales). */
  areaFolder: string;
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
