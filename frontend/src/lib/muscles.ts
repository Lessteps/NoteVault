/**
 * Muscle map · the renderer's side of the muscle catalogue.
 *
 * Mirror of `src/core/exerciseMuscles.ts` (the renderer project cannot import
 * from `core/`); `muscles.test.ts` asserts the two lists stay identical. It also
 * owns the little bit of logic the map needs: which exercises hit a muscle and
 * what colour that muscle should be today.
 */

export interface MuscleDef {
  id: string;
  name_es: string;
  view: "front" | "back";
  group: string;
}

export const MUSCLES: MuscleDef[] = [
  { id: "pectoral", name_es: "Pectoral", view: "front", group: "Pecho" },
  { id: "deltoid-front", name_es: "Deltoides anterior", view: "front", group: "Hombros" },
  { id: "biceps", name_es: "Bíceps", view: "front", group: "Brazos" },
  { id: "forearm", name_es: "Antebrazo", view: "front", group: "Brazos" },
  { id: "abs", name_es: "Abdominales", view: "front", group: "Core" },
  { id: "obliques", name_es: "Oblicuos", view: "front", group: "Core" },
  { id: "neck", name_es: "Cuello", view: "front", group: "Hombros" },
  { id: "quads", name_es: "Cuádriceps", view: "front", group: "Piernas" },
  { id: "adductors", name_es: "Aductores", view: "front", group: "Piernas" },

  { id: "trapezius", name_es: "Trapecio", view: "back", group: "Espalda" },
  { id: "deltoid-rear", name_es: "Deltoides posterior", view: "back", group: "Hombros" },
  { id: "triceps", name_es: "Tríceps", view: "back", group: "Brazos" },
  { id: "lats", name_es: "Dorsales", view: "back", group: "Espalda" },
  { id: "lower-back", name_es: "Lumbar", view: "back", group: "Espalda" },
  { id: "glutes", name_es: "Glúteos", view: "back", group: "Piernas" },
  { id: "hamstrings", name_es: "Isquiotibiales", view: "back", group: "Piernas" },
  { id: "abductors", name_es: "Abductores", view: "back", group: "Piernas" },
  { id: "calves", name_es: "Gemelos", view: "back", group: "Piernas" },
];

export const MUSCLE_GROUPS: string[] = ["Pecho", "Hombros", "Brazos", "Core", "Espalda", "Piernas"];

/** How a muscle looks right now: idle grey, pending lime, secondary dim lime, done green. */
export type MuscleState = "idle" | "primary" | "secondary" | "done";

export interface MuscleExercise {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  done: boolean;
}

export interface MuscleMapData {
  /** muscle id → state */
  states: Record<string, MuscleState>;
  /** muscle id → the exercises that hit it, primary ones first */
  byMuscle: Record<string, MuscleExercise[]>;
  /** exercises with no muscle assigned: never hidden, always listed */
  unassigned: MuscleExercise[];
  /** how many muscles are not idle, per view (to pick the opening view) */
  active: { front: number; back: number };
}

export function muscleById(id: string): MuscleDef | undefined {
  return MUSCLES.find((m) => m.id === id);
}

export function muscleName(id: string): string {
  return muscleById(id)?.name_es ?? id;
}

export function musclesOfView(view: "front" | "back"): MuscleDef[] {
  return MUSCLES.filter((m) => m.view === view);
}

/** Primary + secondary, deduplicated: what an exercise paints. */
export function musclesOfExercise(ex: { primary?: string[]; secondary?: string[] }): string[] {
  const primary = ex.primary ?? [];
  return [...primary, ...(ex.secondary ?? []).filter((m) => !primary.includes(m))];
}

/**
 * Works out, per muscle, how the given exercises leave it:
 * green once any exercise that trains it is done, lime while its main work is
 * still pending, dim lime when only helpers touch it, grey when nobody does.
 */
export function muscleMapData(exercises: MuscleExercise[]): MuscleMapData {
  const states: Record<string, MuscleState> = {};
  const byMuscle: Record<string, MuscleExercise[]> = {};
  const unassigned: MuscleExercise[] = [];

  for (const ex of exercises) {
    const touched = musclesOfExercise(ex);
    if (!touched.length) unassigned.push(ex);
    for (const id of touched) {
      (byMuscle[id] ??= []).push(ex);
    }
  }
  for (const m of MUSCLES) {
    const all = byMuscle[m.id] ?? [];
    const primary = all.filter((e) => e.primary.includes(m.id));
    const secondary = all.filter((e) => e.secondary.includes(m.id));
    if (primary.some((e) => e.done)) {
      states[m.id] = "done";
    } else if (primary.length) {
      states[m.id] = "primary";
    } else if (secondary.some((e) => e.done)) {
      states[m.id] = "done";
    } else if (secondary.length) {
      states[m.id] = "secondary";
    } else {
      states[m.id] = "idle";
    }
    // Primary work first in the panel.
    if (all.length) {
      byMuscle[m.id] = [
        ...all.filter((e) => e.primary.includes(m.id)),
        ...all.filter((e) => !e.primary.includes(m.id)),
      ];
    }
  }
  const count = (view: "front" | "back") =>
    musclesOfView(view).filter((m) => states[m.id] !== "idle").length;
  return { states, byMuscle, unassigned, active: { front: count("front"), back: count("back") } };
}

/** The view with more active muscles for the day (front on a tie). */
export function bestView(data: MuscleMapData): "front" | "back" {
  return data.active.back > data.active.front ? "back" : "front";
}
