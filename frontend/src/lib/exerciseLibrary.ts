// Biblioteca de ejercicios (solo módulo Ejercicio).
//
// Envuelve `@bryllim/workout-guide` (302 ejercicios, MIT + CC BY-SA 4.0 en
// assets, ver CREDITS) y mapea su `primaryMuscle` a los ids locales de
// `muscles.ts` para reutilizar el mapa corporal existente.
//
// Las instrucciones son propias (exerciseInstructions.*.json), escritas para
// NoteVault: no queda texto de terceros en el pipeline.

import { searchExercises, type Exercise as GuideExercise } from "@bryllim/workout-guide";

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

/** Búsqueda por texto sobre el catálogo de 302 (vacío = todo). */
export function searchLibrary(query = ""): LibraryEntry[] {
  return searchExercises(query || undefined).map(toEntry);
}

/** Filtra por músculo local (id de `muscles.ts`, ej. `pectoral`). */
export function filterByLocalMuscle(localId: string): LibraryEntry[] {
  return searchExercises()
    .map(toEntry)
    .filter((e) => e.localPrimary.includes(localId));
}

/** 1RM estimado (Epley): w * (1 + r/30). Sin reps → peso tal cual. */
export function estimate1RM(weight: number, reps: number): number {
  if (!reps || reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

const instructionsBySlug = new Map(INSTRUCCIONES.map((r) => [r.slug, r]));

/** Pasos en español de la redacción propia, o null si no hay cobertura. */
export function getInstructions(slug: string): ExerciseInstructions | null {
  return instructionsBySlug.get(slug) ?? null;
}