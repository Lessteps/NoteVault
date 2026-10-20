/**
 * Muscle catalogue for the Ejercicio module.
 *
 * The ids are fixed and referenced from `exercises.json` (`muscles.primary` /
 * `muscles.secondary`), so they are the contract between the data on disk and the
 * body map. One view per muscle, as the brief asks: nine on the front, nine on
 * the back. The renderer keeps a mirror of this list in `src/lib/muscles.ts`
 * (the app project cannot import from `core/`), and a test asserts both agree.
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

export const MUSCLE_IDS: string[] = MUSCLES.map((m) => m.id);

/** Groups in the order they should be shown in a menu. */
export const MUSCLE_GROUPS: string[] = [
  "Pecho",
  "Hombros",
  "Brazos",
  "Core",
  "Espalda",
  "Piernas",
];

/** Mapeo guía (Workout Guide) → músculos locales. */
export const GUIDE_TO_LOCAL: Record<string, string[]> = {
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

/**
 * Cleans whatever came from the UI: unknown ids are dropped, duplicates are
 * collapsed, a muscle cannot be primary and secondary at once (primary wins) and
 * the order follows the catalogue so the file stays stable.
 */
export function normalizeMuscles(value: unknown): { primary: string[]; secondary: string[] } {
  const src = (value ?? {}) as Record<string, unknown>;
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? MUSCLE_IDS.filter((id) => (v as unknown[]).some((x) => String(x) === id))
      : [];
  const primary = list(src.primary);
  const secondary = list(src.secondary).filter((id) => !primary.includes(id));
  return { primary, secondary };
}

export function isMuscleId(id: unknown): boolean {
  return MUSCLE_IDS.includes(String(id));
}
