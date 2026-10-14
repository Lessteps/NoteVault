// Tipos compartidos entre Main (src/core/ y src/api/) y Renderer (src/store/ y src/components/)
// para el módulo de ejercicio, en un fichero aparte y sin imports a propósito (ver libraryTypes.ts).

export type ExerciseGoal =
  | "hipertrofia"
  | "fuerza"
  | "definicion"
  | "resistencia"
  | "salud"
  | "otro";

export type ExerciseGender = "hombre" | "mujer" | "otro" | "";

export interface WeightRecord {
  date: string; // ISO YYYY-MM-DD
  weight: number; // in kg (e.g. 74.5)
}

export interface BodyProfile {
  goal: ExerciseGoal;
  goal_note: string;
  weight_history: WeightRecord[];
  health_limitations?: string;
  gender?: ExerciseGender;
  age?: number | null;
  updated_at?: string;
}

export const DEFAULT_BODY_PROFILE: BodyProfile = {
  goal: "salud",
  goal_note: "",
  weight_history: [],
  health_limitations: "",
  gender: "",
  age: null,
};
