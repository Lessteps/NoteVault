/**
 * Muscle map · the renderer's side of the muscle catalogue.
 *
 * Mirror of `src/core/exerciseMuscles.ts` (the renderer project cannot import
 * from `core/`); `muscles.test.ts` asserts the two lists stay identical. It also
 * owns the little bit of logic the map needs: which exercises hit a muscle and
 * what colour that muscle should be today.
 */
import { shapesForMuscle } from "./bodyMuscleMap";

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

/** Which view shows a muscle: the coarse catalogue, or the asset when granular. */
export function viewOfMuscle(id: string): "front" | "back" | null {
  const coarse = muscleById(id);
  if (coarse) return coarse.view;
  const front = shapesForMuscle(id, "front").length;
  const back = shapesForMuscle(id, "back").length;
  if (front && !back) return "front";
  if (back && !front) return "back";
  if (front && back) return "front"; // neck and forearms show on both: count them once
  return null;
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
  // Both catalogues, plus whatever the rows mention: the exercises still store
  // the coarse ids while the figure paints the asset's granular ones.
  const ids = [...new Set([...MUSCLES.map((m) => m.id), ...GRANULAR_MUSCLES.map((m) => m.id), ...Object.keys(byMuscle)])];
  for (const id of ids) {
    const all = byMuscle[id] ?? [];
    const primary = all.filter((e) => e.primary.includes(id));
    const secondary = all.filter((e) => e.secondary.includes(id));
    if (primary.some((e) => e.done)) {
      states[id] = "done";
    } else if (primary.length) {
      states[id] = "primary";
    } else if (secondary.some((e) => e.done)) {
      states[id] = "done";
    } else if (secondary.length) {
      states[id] = "secondary";
    } else {
      states[id] = "idle";
    }
    // Primary work first in the panel.
    if (all.length) {
      byMuscle[id] = [
        ...all.filter((e) => e.primary.includes(id)),
        ...all.filter((e) => !e.primary.includes(id)),
      ];
    }
  }
  const count = (view: "front" | "back") =>
    ids.filter((id) => viewOfMuscle(id) === view && states[id] !== "idle").length;
  return { states, byMuscle, unassigned, active: { front: count("front"), back: count("back") } };
}

/** The view with more active muscles for the day (front on a tie). */
export function bestView(data: MuscleMapData): "front" | "back" {
  return data.active.back > data.active.front ? "back" : "front";
}

/* ─────────────────────────────────────────────────────────────────────────
   Granular catalogue (the accepted asset's ids) + the bridge from the coarse
   ids the saved exercises still use. Nothing writes granular ids yet: that is
   the migration the review table awaits.
   ───────────────────────────────────────────────────────────────────────── */

export interface GranularMuscle {
  id: string;
  name_es: string;
  group: string;
}

export const GRANULAR_MUSCLES: GranularMuscle[] = [
  { id: "pectoral-upper", name_es: "Pectoral superior", group: "Pecho" },
  { id: "pectoral-lower", name_es: "Pectoral inferior", group: "Pecho" },
  { id: "serratus", name_es: "Serrato anterior", group: "Pecho" },
  { id: "deltoid-front", name_es: "Deltoides anterior", group: "Hombros" },
  { id: "deltoid-side", name_es: "Deltoides lateral", group: "Hombros" },
  { id: "deltoid-rear", name_es: "Deltoides posterior", group: "Hombros" },
  { id: "rotator-cuff", name_es: "Manguito rotador", group: "Hombros" },
  { id: "neck", name_es: "Cuello", group: "Hombros" },
  { id: "trapezius-upper", name_es: "Trapecio superior", group: "Espalda" },
  { id: "trapezius-mid", name_es: "Trapecio medio", group: "Espalda" },
  { id: "trapezius-lower", name_es: "Trapecio inferior", group: "Espalda" },
  { id: "lats", name_es: "Dorsal ancho", group: "Espalda" },
  { id: "teres", name_es: "Redondo mayor", group: "Espalda" },
  { id: "lower-back", name_es: "Lumbar", group: "Espalda" },
  { id: "biceps", name_es: "Bíceps", group: "Brazos" },
  { id: "brachialis", name_es: "Braquial", group: "Brazos" },
  { id: "triceps", name_es: "Tríceps", group: "Brazos" },
  { id: "forearm-flexors", name_es: "Antebrazo flexor", group: "Brazos" },
  { id: "forearm-extensors", name_es: "Antebrazo extensor", group: "Brazos" },
  { id: "abs-upper", name_es: "Abdominales altos", group: "Core" },
  { id: "abs-lower", name_es: "Abdominales bajos", group: "Core" },
  { id: "obliques", name_es: "Oblicuos", group: "Core" },
  { id: "hip-flexors", name_es: "Flexores de cadera", group: "Core" },
  { id: "quads-rectus-femoris", name_es: "Recto femoral", group: "Piernas" },
  { id: "quads-vastus-lateralis", name_es: "Vasto lateral", group: "Piernas" },
  { id: "quads-vastus-medialis", name_es: "Vasto medial", group: "Piernas" },
  { id: "hamstrings-biceps-femris", name_es: "Bíceps femoral", group: "Piernas" },
  { id: "hamstrings-semi", name_es: "Semitendinoso", group: "Piernas" },
  { id: "glutes-max", name_es: "Glúteo mayor", group: "Piernas" },
  { id: "glutes-med", name_es: "Glúteo medio", group: "Piernas" },
  { id: "abductors", name_es: "Abductores", group: "Piernas" },
  { id: "adductors", name_es: "Aductores", group: "Piernas" },
  { id: "calves-gastrocnemius", name_es: "Gemelos", group: "Piernas" },
  { id: "soleus", name_es: "Sóleo", group: "Piernas" },
  { id: "tibialis", name_es: "Tibial anterior", group: "Piernas" },
  { id: "calves-front", name_es: "Gemelos (frontal)", group: "Piernas" },
];

export const GRANULAR_GROUPS: string[] = ["Pecho", "Hombros", "Espalda", "Brazos", "Core", "Piernas"];

/** The coarse ids still stored in the exercises → the granular ids they cover. */
export const LEGACY_TO_GRANULAR: Record<string, string[]> = {
  pectoral: ["pectoral-upper", "pectoral-lower"],
  "deltoid-front": ["deltoid-front"],
  biceps: ["biceps"],
  forearm: ["forearm-flexors", "forearm-extensors"],
  abs: ["abs-upper", "abs-lower"],
  obliques: ["obliques"],
  neck: ["neck"],
  quads: ["quads-rectus-femoris"],
  adductors: ["adductors"],
  trapezius: ["trapezius-upper", "trapezius-mid", "trapezius-lower"],
  "deltoid-rear": ["deltoid-rear"],
  triceps: ["triceps"],
  lats: ["lats"],
  "lower-back": ["lower-back"],
  glutes: ["glutes-max", "glutes-med"],
  hamstrings: ["hamstrings-biceps-femris", "hamstrings-semi"],
  // El asset no tiene forma de abductor. El glúteo medio es el abductor de la
  // cadera, así que es lo más cerca que se puede dibujar. Sin esta línea,
  // elegir abductores no encendía nada y la app no decía nada.
  abductors: ["glutes-med"],
  calves: ["calves-gastrocnemius", "soleus"],
};

/** Granular ids for whatever is stored (granular ids pass through untouched). */
export function expandMuscles(ids: string[] | undefined): string[] {
  const out: string[] = [];
  for (const id of ids ?? []) {
    const mapped = LEGACY_TO_GRANULAR[id] ?? [id];
    for (const g of mapped) if (!out.includes(g)) out.push(g);
  }
  return out;
}

export function granularName(id: string): string {
  return GRANULAR_MUSCLES.find((m) => m.id === id)?.name_es ?? muscleName(id);
}

export function granularGroup(id: string): string {
  return GRANULAR_MUSCLES.find((m) => m.id === id)?.group ?? "";
}
