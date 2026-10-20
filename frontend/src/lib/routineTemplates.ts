// Plantillas de rutinas clásicas predefinidas para NoteVault Ejercicio.
//
// Rutinas estructuradas con ejercicios reales del catálogo @bryllim/workout-guide,
// series y descansos probados para arrancar o cambiar de programa en 1 clic.

export interface TemplateExercise {
  slug: string;
  name: string;
  series_reps: string;
  rest: string;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  badge: string;
  description: string;
  days: Record<string, TemplateExercise[]>;
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "ppl",
    name: "Push / Pull / Legs (PPL)",
    badge: "3 días · Empuje / Tirón / Pierna",
    description: "La división clásica más efectiva para hipertrofia y fuerza equilibrada.",
    days: {
      lunes: [
        { slug: "bench-press", name: "Bench Press", series_reps: "4×6-8", rest: "2 min" },
        { slug: "overhead-press", name: "Overhead Press", series_reps: "3×8-10", rest: "90s" },
        { slug: "incline-bench-press", name: "Incline Bench Press", series_reps: "3×10", rest: "90s" },
        { slug: "lateral-raise", name: "Lateral Raise", series_reps: "3×12-15", rest: "60s" },
        { slug: "tricep-pushdown", name: "Tricep Pushdown", series_reps: "3×12", rest: "60s" },
      ],
      miércoles: [
        { slug: "barbell-row", name: "Barbell Row", series_reps: "4×6-8", rest: "2 min" },
        { slug: "lat-pulldown", name: "Lat Pulldown", series_reps: "3×8-10", rest: "90s" },
        { slug: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", series_reps: "3×10-12", rest: "90s" },
        { slug: "bicep-curl", name: "Bicep Curl", series_reps: "3×10-12", rest: "60s" },
        { slug: "hammer-curl", name: "Hammer Curl", series_reps: "3×12", rest: "60s" },
      ],
      viernes: [
        { slug: "squat", name: "Squat", series_reps: "4×6-8", rest: "2-3 min" },
        { slug: "romanian-deadlift", name: "Romanian Deadlift", series_reps: "3×8-10", rest: "2 min" },
        { slug: "hack-squat", name: "Hack Squat", series_reps: "3×10-12", rest: "90s" },
        { slug: "standing-calf-raise", name: "Standing Calf Raise", series_reps: "4×12-15", rest: "60s" },
      ],
    },
  },
  {
    id: "upper-lower",
    name: "Torso / Pierna (Upper / Lower)",
    badge: "4 días · Alta frecuencia",
    description: "Divide el cuerpo en tren superior e inferior con 2 sesiones dedicadas para cada uno.",
    days: {
      lunes: [
        { slug: "bench-press", name: "Bench Press", series_reps: "4×6-8", rest: "2 min" },
        { slug: "barbell-row", name: "Barbell Row", series_reps: "4×6-8", rest: "2 min" },
        { slug: "overhead-press", name: "Overhead Press", series_reps: "3×8-10", rest: "90s" },
        { slug: "lat-pulldown", name: "Lat Pulldown", series_reps: "3×10", rest: "90s" },
        { slug: "tricep-pushdown", name: "Tricep Pushdown", series_reps: "3×12", rest: "60s" },
      ],
      martes: [
        { slug: "squat", name: "Squat", series_reps: "4×6-8", rest: "2-3 min" },
        { slug: "romanian-deadlift", name: "Romanian Deadlift", series_reps: "3×8-10", rest: "2 min" },
        { slug: "hack-squat", name: "Hack Squat", series_reps: "3×10-12", rest: "90s" },
        { slug: "standing-calf-raise", name: "Standing Calf Raise", series_reps: "4×12-15", rest: "60s" },
      ],
      jueves: [
        { slug: "incline-bench-press", name: "Incline Bench Press", series_reps: "4×8-10", rest: "90s" },
        { slug: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", series_reps: "4×8-10", rest: "90s" },
        { slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", series_reps: "3×10", rest: "90s" },
        { slug: "lateral-raise", name: "Lateral Raise", series_reps: "3×12-15", rest: "60s" },
        { slug: "bicep-curl", name: "Bicep Curl", series_reps: "3×10-12", rest: "60s" },
      ],
      viernes: [
        { slug: "deadlift", name: "Deadlift", series_reps: "4×5", rest: "3 min" },
        { slug: "front-squat", name: "Front Squat", series_reps: "3×8-10", rest: "2 min" },
        { slug: "leg-curl", name: "Leg Curl", series_reps: "3×10-12", rest: "90s" },
        { slug: "standing-calf-raise", name: "Standing Calf Raise", series_reps: "4×12-15", rest: "60s" },
      ],
    },
  },
  {
    id: "fullbody",
    name: "Full Body (Cuerpo Completo)",
    badge: "3 días · Principiante / Eficiente",
    description: "Estimula todos los grupos musculares tres veces por semana con movimientos compuestos.",
    days: {
      lunes: [
        { slug: "squat", name: "Squat", series_reps: "3×8-10", rest: "2 min" },
        { slug: "bench-press", name: "Bench Press", series_reps: "3×8-10", rest: "2 min" },
        { slug: "barbell-row", name: "Barbell Row", series_reps: "3×8-10", rest: "90s" },
        { slug: "overhead-tricep-extension", name: "Overhead Tricep Extension", series_reps: "3×12", rest: "60s" },
      ],
      miércoles: [
        { slug: "deadlift", name: "Deadlift", series_reps: "3×6-8", rest: "2-3 min" },
        { slug: "overhead-press", name: "Overhead Press", series_reps: "3×8-10", rest: "90s" },
        { slug: "lat-pulldown", name: "Lat Pulldown", series_reps: "3×10", rest: "90s" },
        { slug: "bicep-curl", name: "Bicep Curl", series_reps: "3×12", rest: "60s" },
      ],
      viernes: [
        { slug: "front-squat", name: "Front Squat", series_reps: "3×8-10", rest: "2 min" },
        { slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", series_reps: "3×10", rest: "90s" },
        { slug: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", series_reps: "3×10", rest: "90s" },
        { slug: "lateral-raise", name: "Lateral Raise", series_reps: "3×12-15", rest: "60s" },
      ],
    },
  },
];
