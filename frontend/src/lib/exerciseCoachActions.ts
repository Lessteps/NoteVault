// Parser y tipos para acciones ejecutables del Coach de Entrenamiento.
//
// Permite que el modelo sugiera adiciones o ajustes a la rutina semanal mediante
// bloques estructurados ```coach-action { ... } ``` que la UI transforma en tarjetas
// interactivas con botones de confirmación ("Añadir a mi rutina").

export const COACH_DAYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type CoachDayKey = (typeof COACH_DAYS)[number];

const DAY_MAP: Record<string, CoachDayKey> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  miércoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sabado",
  sábado: "sabado",
  domingo: "domingo",
};

export function normalizeCoachDay(day: string): CoachDayKey | null {
  const clean = String(day || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes

  return DAY_MAP[clean] ?? null;
}

export interface CoachExerciseItem {
  name: string;
  series_reps?: string;
  rest?: string;
  how_to?: string;
  muscles?: { primary: string[]; secondary: string[] };
}

export interface CoachActionAddExercise {
  action: "add_exercise";
  day: CoachDayKey;
  exercises: CoachExerciseItem[];
}

export interface CoachLibraryExercise {
  name: string;
  equipment?: string;
  muscles?: { primary: string[]; secondary: string[] };
  how_to?: string;
}

export interface CoachActionAddToLibrary {
  action: "add_to_library";
  exercise: CoachLibraryExercise;
}

export interface CoachActionRemoveExercise {
  action: "remove_exercise";
  day: CoachDayKey;
  exercise_name: string;
  exercise_id?: string;
}

export interface CoachActionRemoveFromLibrary {
  action: "remove_from_library";
  exercise_name: string;
  slug?: string;
}

export interface CoachActionRecordWeight {
  action: "record_weight";
  weight: number;
  date?: string;
}

export type CoachAction =
  | CoachActionAddExercise
  | CoachActionAddToLibrary
  | CoachActionRemoveExercise
  | CoachActionRemoveFromLibrary
  | CoachActionRecordWeight;

export interface SplitCoachActionResult {
  text: string;
  action: CoachAction | null;
}

const COACH_ACTION_RE = /```coach-action\s*([\s\S]*?)\s*```/;

export function splitCoachAction(content: string): SplitCoachActionResult {
  if (!content || typeof content !== "string") {
    return { text: "", action: null };
  }

  const match = COACH_ACTION_RE.exec(content);
  if (!match || !match[1]) {
    return { text: content, action: null };
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === "object") {
      if (parsed.action === "add_exercise") {
        const day = normalizeCoachDay(parsed.day);
        if (day && Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
          const cleanExercises: CoachExerciseItem[] = [];
          for (const raw of parsed.exercises) {
            if (raw && typeof raw === "object" && raw.name) {
              const rawMuscles = (raw.muscles ?? {}) as Record<string, unknown>;
              const primary = Array.isArray(rawMuscles.primary) ? rawMuscles.primary.map(String) : [];
              const secondary = Array.isArray(rawMuscles.secondary) ? rawMuscles.secondary.map(String) : [];

              cleanExercises.push({
                name: String(raw.name).trim(),
                series_reps: raw.series_reps ? String(raw.series_reps).trim() : undefined,
                rest: raw.rest ? String(raw.rest).trim() : undefined,
                how_to: raw.how_to ? String(raw.how_to).trim() : undefined,
                muscles: primary.length || secondary.length ? { primary, secondary } : undefined,
              });
            }
          }

          if (cleanExercises.length > 0) {
            const textWithoutBlock = content.replace(COACH_ACTION_RE, "").trim();
            return {
              text: textWithoutBlock,
              action: {
                action: "add_exercise",
                day,
                exercises: cleanExercises,
              },
            };
          }
        }
      } else if (parsed.action === "add_to_library" && parsed.exercise && typeof parsed.exercise === "object") {
        const rawEx = parsed.exercise;
        if (rawEx.name) {
          const musclesRaw = (rawEx.muscles ?? {}) as Record<string, unknown>;
          const primary = Array.isArray(musclesRaw.primary) ? musclesRaw.primary.map(String) : [];
          const secondary = Array.isArray(musclesRaw.secondary) ? musclesRaw.secondary.map(String) : [];

          const cleanEx: CoachLibraryExercise = {
            name: String(rawEx.name).trim(),
            equipment: rawEx.equipment ? String(rawEx.equipment).trim() : undefined,
            muscles: primary.length || secondary.length ? { primary, secondary } : undefined,
            how_to: rawEx.how_to ? String(rawEx.how_to).trim() : undefined,
          };

          const textWithoutBlock = content.replace(COACH_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "add_to_library",
              exercise: cleanEx,
            },
          };
        }
      } else if (parsed.action === "remove_exercise") {
        const day = normalizeCoachDay(parsed.day);
        const name = String(parsed.exercise_name || parsed.name || "").trim();
        if (day && name) {
          const textWithoutBlock = content.replace(COACH_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "remove_exercise",
              day,
              exercise_name: name,
              exercise_id: parsed.exercise_id ? String(parsed.exercise_id) : undefined,
            },
          };
        }
      } else if (parsed.action === "remove_from_library") {
        const name = String(parsed.exercise_name || parsed.name || "").trim();
        if (name) {
          const textWithoutBlock = content.replace(COACH_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "remove_from_library",
              exercise_name: name,
              slug: parsed.slug ? String(parsed.slug) : undefined,
            },
          };
        }
      } else if (parsed.action === "record_weight") {
        const weight = Number(parsed.weight);
        if (!Number.isNaN(weight) && weight > 0 && weight < 500) {
          const textWithoutBlock = content.replace(COACH_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "record_weight",
              weight: Math.round(weight * 10) / 10,
              date: parsed.date ? String(parsed.date).trim() : undefined,
            },
          };
        }
      }
    }
  } catch {
    /* JSON malformado o incompleto durante streaming; se muestra como texto regular */
  }

  return { text: content, action: null };
}
