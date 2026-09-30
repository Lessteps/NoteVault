// Biblioteca de ejercicios (solo módulo Ejercicio).
//
// Envuelve `@bryllim/workout-guide` (302 ejercicios, MIT + CC BY-SA 4.0 en
// assets, ver CREDITS) y mapea su `primaryMuscle` a los ids locales de
// `muscles.ts` para reutilizar el mapa corporal existente.

import { searchExercises, type Exercise as GuideExercise } from "@bryllim/workout-guide";
import instructionsData from "./exerciseInstructions.json";
import customInstructions from "./exerciseInstructions.custom.json";
import lote3Instructions from "./exerciseInstructions.lote3.json";
import grupoPecho from "./exerciseInstructions.grupo-pecho.json";
import grupoHombros from "./exerciseInstructions.grupo-hombros.json";
import grupoTriceps from "./exerciseInstructions.grupo-triceps.json";
import grupoEspalda from "./exerciseInstructions.grupo-espalda.json";

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
  frames: Array<string | null>;
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

export interface ExerciseInstructions {
  slug: string;
  name: string;
  matched: string;
  steps_es: string[];
  steps_en: string[];
}

const instructionsBySlug = new Map(
  [
    ...(instructionsData as ExerciseInstructions[]),
    ...(customInstructions as ExerciseInstructions[]),
    ...(lote3Instructions as ExerciseInstructions[]),
    ...(grupoPecho as ExerciseInstructions[]),
    ...(grupoHombros as ExerciseInstructions[]),
    ...(grupoTriceps as ExerciseInstructions[]),
    ...(grupoEspalda as ExerciseInstructions[]),
  ].map((r) => [r.slug, r]),
);

/** Pasos en español (respaldo inglés) o null si el dataset no lo cubre. */
export function getInstructions(slug: string): ExerciseInstructions | null {
  return instructionsBySlug.get(slug) ?? null;
}
