// Biblioteca de ejercicios (solo módulo Ejercicio).
//
// Envuelve `@bryllim/workout-guide` (302 ejercicios, MIT + CC BY-SA 4.0 en
// assets, ver CREDITS) y mapea su `primaryMuscle` a los ids locales de
// `muscles.ts` para reutilizar el mapa corporal existente.
//
// Las instrucciones son propias (exerciseInstructions.*.json), escritas para
// NoteVault: no queda texto de terceros en el pipeline.

import { searchExercises, type Exercise as GuideExercise } from "@bryllim/workout-guide";
import type { LibraryUserEntry } from "./libraryTypes";
import { muscleName } from "./muscles";

import instruccionesPecho from "./exerciseInstructions.grupo-pecho.json";
import instruccionesHombros from "./exerciseInstructions.grupo-hombros.json";
import instruccionesTriceps from "./exerciseInstructions.grupo-triceps.json";
import instruccionesEspalda from "./exerciseInstructions.grupo-espalda.json";
import instruccionesBiceps from "./exerciseInstructions.grupo-biceps.json";
import instruccionesCuadriceps from "./exerciseInstructions.grupo-cuadriceps.json";
import instruccionesGluteos from "./exerciseInstructions.grupo-gluteos.json";
import instruccionesCore from "./exerciseInstructions.grupo-core.json";
import instruccionesLote1 from "./exerciseInstructions.custom.json";
import instruccionesLote3 from "./exerciseInstructions.lote3.json";
import instruccionesFinal from "./exerciseInstructions.grupo-final.json";

export interface ExerciseInstructions {
  slug: string;
  name: string;
  matched: string;
  source: string;
  steps_es: string[];
  steps_en: string[];
}

/**
 * Todas las redacciones propias. El orden es inverso al de escritura: el
 * último grupo (los más antiguos) va primero, para que si un slug se repite
 * gane la redacción más reciente.
 */
const INSTRUCCIONES: ExerciseInstructions[] = [
  ...(instruccionesFinal as ExerciseInstructions[]),
  ...(instruccionesCore as ExerciseInstructions[]),
  ...(instruccionesGluteos as ExerciseInstructions[]),
  ...(instruccionesCuadriceps as ExerciseInstructions[]),
  ...(instruccionesBiceps as ExerciseInstructions[]),
  ...(instruccionesEspalda as ExerciseInstructions[]),
  ...(instruccionesTriceps as ExerciseInstructions[]),
  ...(instruccionesHombros as ExerciseInstructions[]),
  ...(instruccionesPecho as ExerciseInstructions[]),
  ...(instruccionesLote3 as ExerciseInstructions[]),
  ...(instruccionesLote1 as ExerciseInstructions[]),
];

/** Mapeo guía → músculos locales (`frontend/src/lib/muscles.ts`). */
const GUIDE_TO_LOCAL: Record<string, string[]> = {
  Chest: ["pectoral"],
  Shoulders: ["deltoid-front"],
  Biceps: ["biceps"],
  Forearms: ["forearm"],
  Core: ["abs", "obliques"],
  Quads: ["quads"],
  Adductors: ["adductors"],
  "Rear Delts": ["deltoid-rear"],
  Triceps: ["triceps"],
  Lats: ["lats"],
  "Lower Back": ["lower-back"],
  Glutes: ["glutes"],
  Hamstrings: ["hamstrings"],
  Calves: ["calves"],
  Back: ["lats", "trapezius"],
  "Upper Back": ["trapezius"],
  Hips: ["glutes", "abductors"],
  Legs: ["quads", "hamstrings", "glutes", "calves"],
  "Posterior Chain": ["glutes", "hamstrings", "lower-back"],
  Mobility: [],
};

export function mapGuideMuscle(primary: string): string[] {
  return GUIDE_TO_LOCAL[primary] ?? [];
}

export interface LibraryEntry {
  id: string;
  slug: string;
  name: string;
  equipment: string;
  exerciseType: string;
  guidePrimary: string;
  guideSecondary: string[];
  localPrimary: string[];
  localSecondary: string[];
  /** Rutas locales de los tres frames (public/workout-guide-assets). */
  frames: string[];
  frame1: string | null;
  /**
   * Pasos escritos por la persona, en crudo y solo para las entradas propias.
   * Vacío significa «déjalo como estaba»: la redacción del catálogo sigue viva.
   */
  how_toPropia?: string;
  /** Marca que esta entrada la escribió la persona y no viene del paquete. */
  own?: boolean;
}

function toEntry(e: GuideExercise): LibraryEntry {
  const localPrimary = mapGuideMuscle(e.primaryMuscle);
  const localSecondary = [...new Set(e.secondaryMuscles.flatMap(mapGuideMuscle))].filter(
    (m) => !localPrimary.includes(m),
  );
  // Local offline (public/workout-guide-assets, copiado en postinstall):
  // relativo para que funcione con base './' en Electron y en vite dev.
  const frames = [1, 2, 3].map((i) => `workout-guide-assets/${e.slug}/frame-${i}.png`);
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    equipment: e.equipment,
    exerciseType: e.exerciseType,
    guidePrimary: e.primaryMuscle,
    guideSecondary: e.secondaryMuscles,
    localPrimary,
    localSecondary,
    frames,
    frame1: frames[0] ?? null,
  };
}

/**
 * Un campo propio gana solo si tiene algo. Vacío significa «déjalo como
 * estaba», no «bórralo»: es lo que hace que editar Bench Press no te deje sin
 * las instrucciones del catálogo ni sin sus imágenes.
 */
function propio(mio: string | undefined, suyo: string): string {
  return mio && mio.trim() ? mio : suyo;
}

/**
 * La biblioteca completa: el catálogo del paquete con las entradas propias
 * encima, fusionadas por `slug`.
 *
 * Fusionar en vez de apilar es lo que hace imposible el duplicado: solo hay un
 * `bench-press`, y si hay una entrada propia con ese slug, es **la misma**,
 * editada. Una entrada con slug propio (`mia-…`) se añade al final.
 */
/**
 * Fusionar son 302 entradas y varios filtros lo piden en el mismo render. Se
 * guarda el resultado por la **referencia** del array de entradas propias: si no
 * ha cambiado, la fusión no se repite. Sin esto, `libraryEquipment` y
 * `libraryMuscles` rehacían las 302 en cada repintado.
 */
let cacheFor: LibraryUserEntry[] | null = null;
let cacheOf: LibraryEntry[] = [];

export function mergeLibrary(userEntries: LibraryUserEntry[] = []): LibraryEntry[] {
  if (userEntries === cacheFor) return cacheOf;
  cacheFor = userEntries;
  cacheOf = mergeUncached(userEntries);
  return cacheOf;
}

function mergeUncached(userEntries: LibraryUserEntry[]): LibraryEntry[] {
  const bySlug = new Map(userEntries.filter((e) => e.slug).map((e) => [e.slug, e]));
  const merged = searchExercises().map(toEntry).map((base) => {
    const own = bySlug.get(base.slug);
    if (!own) return base;
    return {
      ...base,
      name: propio(own.name, base.name),
      equipment: propio(own.equipment, base.equipment),
      localPrimary: own.muscles.primary.length ? own.muscles.primary : base.localPrimary,
      localSecondary: own.muscles.secondary.length ? own.muscles.secondary : base.localSecondary,
      guidePrimary: own.muscles.primary.length
        ? own.muscles.primary.map(muscleName).join(", ")
        : base.guidePrimary,
      how_toPropia: own.how_to,
    };
  });
  const delPaquete = new Set(searchExercises().map((e) => e.slug));
  const propias = userEntries
    .filter((e) => e.slug && !delPaquete.has(e.slug))
    .map(toOwnEntry);
  return [...merged, ...propias];
}

/** Una entrada propia tal cual: sin imágenes, y con sus músculos ya locales. */
function toOwnEntry(own: LibraryUserEntry): LibraryEntry {
  return {
    id: own.slug,
    slug: own.slug,
    name: own.name,
    equipment: own.equipment,
    exerciseType: "own",
    guidePrimary: own.muscles.primary.map(muscleName).join(", "),
    guideSecondary: [],
    localPrimary: own.muscles.primary,
    localSecondary: own.muscles.secondary,
    frames: [],
    frame1: null,
    how_toPropia: own.how_to,
    own: true,
  };
}

/** Búsqueda por texto sobre el catálogo de 302 (vacío = todo). */
export function searchLibrary(query = "", userEntries: LibraryUserEntry[] = []): LibraryEntry[] {
  const all = mergeLibrary(userEntries);
  if (!query) return all;
  // El texto se busca sobre la lista ya mezclada: así una entrada propia se
  // encuentra por su nombre, que es lo que se ha escrito.
  const q = query.trim().toLowerCase();
  return all.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.equipment.toLowerCase().includes(q) ||
      e.guidePrimary.toLowerCase().includes(q),
  );
}

/** Un ejercicio de la biblioteca por su slug, propio o del paquete. */
export function libraryEntry(slug: string, userEntries: LibraryUserEntry[] = []): LibraryEntry | null {
  const own = userEntries.find((e) => e.slug === slug);
  if (own) return mergeLibrary([own]).find((e) => e.slug === slug) ?? toOwnEntry(own);
  const raw = searchExercises(slug).find((e) => e.slug === slug);
  return raw ? toEntry(raw) : null;
}

/**
 * Las copias del programa que se quedaron atrás: su entrada de origen cambió
 * desde que las copias.
 *
 * El orden importa: primero se localiza la entrada **entre las tuyas**, y solo
 * después se hashea la forma ya mezclada. Al revés se compararía una entrada
 * propia con una del catálogo y la huella no quadraría nunca.
 *
 * Un `source` que ya no está en la biblioteca se ignora: no hay con qué
 * compararlo, y marcarlo de desfasado sería un aviso mentiroso.
 */
export function staleCopies<T extends { source?: string; sourceFp?: string }>(
  list: T[],
  userEntries: LibraryUserEntry[] = [],
): T[] {
  const out: T[] = [];
  for (const ex of list) {
    if (!ex.source) continue;
    if (!userEntries.some((e) => e.slug === ex.source)) continue;
    const entry = libraryEntry(ex.source, userEntries);
    if (!entry) continue;
    if (libraryFingerprint(entry) !== (ex.sourceFp ?? "")) out.push(ex);
  }
  return out;
}

/** Filtra por músculo local (id de `muscles.ts`, ej. `pectoral`). */
export function filterByLocalMuscle(
  localId: string,
  userEntries: LibraryUserEntry[] = [],
): LibraryEntry[] {
  return mergeLibrary(userEntries).filter((e) => e.localPrimary.includes(localId));
}

/**
 * Los equipos, para el desplegable de filtros. Ya no es una constante: depende
 * de lo que haya en el fichero del vault, así que un equipo que solo usen tus
 * ejercicios también tiene que salir.
 */
export function libraryEquipment(userEntries: LibraryUserEntry[] = []): string[] {
  return [...new Set(mergeLibrary(userEntries).map((e) => e.equipment).filter(Boolean))].sort();
}

/** Los músculos guía, para el filtro. */
export function libraryMuscles(userEntries: LibraryUserEntry[] = []): string[] {
  return [...new Set(mergeLibrary(userEntries).map((e) => e.guidePrimary).filter(Boolean))].sort();
}

/** Los músculos locales (ids de `muscles.ts`) que la biblioteca tiene de principal. */
export function localMusclesInCatalog(userEntries: LibraryUserEntry[] = []): string[] {
  const ids = new Set<string>();
  for (const e of mergeLibrary(userEntries)) for (const m of e.localPrimary) ids.add(m);
  return [...ids].sort();
}

/** Como `filterLibrary`, pero por músculo local (el que pinta el cuerpo). */
export function filterLibraryByLocalMuscle(
  localId: string,
  filters: Omit<LibraryFilters, "muscle"> = {},
  userEntries: LibraryUserEntry[] = [],
): LibraryEntry[] {
  return searchLibrary(filters.query, userEntries).filter(
    (e) =>
      e.localPrimary.includes(localId) &&
      (!filters.equipment || e.equipment === filters.equipment),
  );
}

export interface LibraryFilters {
  query?: string;
  equipment?: string;
  muscle?: string;
}

/**
 * Búsqueda + filtros sobre la biblioteca completa. Sin filtros devuelve todo:
 * la lista es corta para el navegador y así se ven de una vez.
 */
export function filterLibrary(
  { query = "", equipment = "", muscle = "" }: LibraryFilters = {},
  userEntries: LibraryUserEntry[] = [],
): LibraryEntry[] {
  const byText = searchLibrary(query, userEntries);
  return byText.filter(
    (e) => (!equipment || e.equipment === equipment) && (!muscle || e.guidePrimary === muscle),
  );
}

/** 1RM estimado (Epley): w * (1 + r/30). Sin reps → peso tal cual. */
export function estimate1RM(weight: number, reps: number): number {
  if (!reps || reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

const instructionsBySlug = new Map(INSTRUCCIONES.map((r) => [r.slug, r]));

/**
 * Pasos en español: los de la persona si los escribió, los de la redacción
 * propia si no. Un catálogo de 302 con los pasos متر一时 conserva los suyos.
 */
export function getInstructions(
  slug: string,
  userEntries: LibraryUserEntry[] = [],
): ExerciseInstructions | null {
  const own = userEntries.find((e) => e.slug === slug)?.how_to;
  if (own && own.trim()) {
    const entry = userEntries.find((e) => e.slug === slug)!;
    return {
      slug,
      name: entry.name,
      matched: "mia",
      source: "mia",
      steps_es: own.split("\n"),
      steps_en: [],
    };
  }
  return instructionsBySlug.get(slug) ?? null;
}

/**
 * Huella de lo que una entrada aporta desde la Biblioteca: nombre, pasos y
 * músculos. Una copia del programa está desfasada cuando su huella ya no
 * coincide con esta.
 *
 * No hay contador de revisiones: la huella **es** la versión. Así no hay
 * relojes que se desincronicen, y si editas algo y luego lo dejas como estaba,
 * deja de estar desfasado.
 *
 * Los músculos van **ordenados**: si no, el mismo ejercicio daría dos huellas
 * según el orden en que se guardó, y todo el programa parecería desfasado.
 */
export function libraryFingerprint(e: {
  slug: string;
  name: string;
  how_toPropia?: string;
  localPrimary: string[];
  localSecondary: string[];
}): string {
  const raw = [
    e.slug,
    e.name,
    e.how_toPropia ?? "",
    [...e.localPrimary].sort().join(","),
    [...e.localSecondary].sort().join(","),
  ].join("\u0000");
  // FNV-1a de 32 bits: corto, determinista y sin dependencias.
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}