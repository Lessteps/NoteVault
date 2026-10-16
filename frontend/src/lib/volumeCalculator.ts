// Weekly muscle volume calculator: computes effective sets per muscle group
// and benchmarks them against established hypertrophy science (MEV, MAV, MRV).

import type { Exercise, ExerciseDay } from "./types";

export type VolumeLevel = "mantenimiento" | "minimo" | "optimo" | "alto";

export interface MuscleGroupVolume {
  group: string;
  plannedSets: number;
  completedSets: number;
  level: VolumeLevel;
  levelLabel: string;
  levelColor: string;
  levelDescription: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: number;
    done: boolean;
    day: string;
  }>;
}

export interface WeeklyVolumeSummary {
  totalPlannedSets: number;
  totalCompletedSets: number;
  completionPct: number;
  groups: MuscleGroupVolume[];
  topFocusedGroup: string | null;
  leastFocusedGroup: string | null;
}

/**
 * Standard muscle group taxonomy mapped to muscle IDs.
 */
export const MUSCLE_GROUP_MAP: Record<string, string[]> = {
  Pecho: ["pectoral"],
  Espalda: ["lats", "trapezius", "lower-back"],
  Piernas: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  Hombros: ["deltoid-front", "deltoid-rear", "neck"],
  Brazos: ["biceps", "triceps", "forearm"],
  Core: ["abs", "obliques"],
};

/**
 * Parses series count from series_reps string (e.g. "4x10" -> 4, "3 x 8-12" -> 3).
 */
export function parseExerciseSets(seriesReps: string): number {
  if (!seriesReps) return 3;
  const s = seriesReps.toLowerCase().trim();

  // Pattern: "4x10", "4 x 10", "4*10"
  const multMatch = s.match(/^(\d+)\s*[*xX×]\s*\d+/);
  if (multMatch) {
    const val = Number(multMatch[1]);
    if (Number.isFinite(val) && val > 0 && val <= 20) return val;
  }

  // Single number
  const singleMatch = s.match(/^(\d+)/);
  if (singleMatch) {
    const val = Number(singleMatch[1]);
    if (Number.isFinite(val) && val > 0 && val <= 20) return val;
  }

  return 3;
}

/**
 * Infers muscle group from exercise muscle IDs or keywords in exercise name.
 */
export function inferMuscleGroups(ex: {
  name: string;
  muscles?: { primary?: string[]; secondary?: string[] } | string[];
}): string[] {
  const result = new Set<string>();

  // 1. Check explicit muscle IDs
  const muscleIds: string[] = [];
  if (Array.isArray(ex.muscles)) {
    muscleIds.push(...ex.muscles);
  } else if (ex.muscles && typeof ex.muscles === "object") {
    if (Array.isArray(ex.muscles.primary)) muscleIds.push(...ex.muscles.primary);
    if (Array.isArray(ex.muscles.secondary)) muscleIds.push(...ex.muscles.secondary);
  }

  if (muscleIds.length > 0) {
    for (const mId of muscleIds) {
      for (const [grp, ids] of Object.entries(MUSCLE_GROUP_MAP)) {
        if (ids.includes(mId)) {
          result.add(grp);
        }
      }
    }
  }

  if (result.size > 0) {
    return Array.from(result);
  }

  // 2. Keyword fallback on exercise name
  const name = ex.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/banca|pecho|chest|press plano|press inclinado|fondos|aperturas|cruce de poleas|push up|flexiones/.test(name)) {
    result.add("Pecho");
  }
  if (/espalda|remo|dominada|jalon|pull up|lat pull|dorsal|peso muerto|deadlift|trapecio/.test(name)) {
    result.add("Espalda");
  }
  if (/sentadilla|squat|prensa|cuadriceps|femoral|isquio|biserie pierna|gemelos|pantorrilla|extension de pierna|curl femoral|zancadas|lunge|gluteo|hip thrust/.test(name)) {
    result.add("Piernas");
  }
  if (/hombro|militar|press militar|elevaciones laterales|pajaro|deltoide|face pull|arnold/.test(name)) {
    result.add("Hombros");
  }
  if (/biceps|triceps|curl|martillo|frances|copa|fondos entre bancos|tricep/.test(name)) {
    result.add("Brazos");
  }
  if (/abdomen|abs|plancha|crunch|elevacion de piernas|core|rueda abdominal|oblicuos/.test(name)) {
    result.add("Core");
  }

  // Fallback if nothing matched
  if (result.size === 0) {
    result.add("Pecho");
  }

  return Array.from(result);
}

/**
 * Classifies volume according to hypertrophy science benchmarks.
 */
export function classifyVolumeLevel(sets: number): {
  level: VolumeLevel;
  levelLabel: string;
  levelColor: string;
  levelDescription: string;
} {
  if (sets < 6) {
    return {
      level: "mantenimiento",
      levelLabel: "Mantenimiento",
      levelColor: "#94a3b8", // Slate
      levelDescription: "Mantiene la masa muscular actual con baja fatiga sistémica.",
    };
  }
  if (sets < 10) {
    return {
      level: "minimo",
      levelLabel: "Estímulo base",
      levelColor: "#38bdf8", // Sky blue
      levelDescription: "Volumen mínimo efectivo (MEV) para progresar gradualmente.",
    };
  }
  if (sets <= 20) {
    return {
      level: "optimo",
      levelLabel: "Óptimo hipertrofia",
      levelColor: "#4ade80", // Emerald green
      levelDescription: "Rango adaptativo ideal (MAV) para máxima ganancia y congestión.",
    };
  }
  return {
    level: "alto",
    levelLabel: "Volumen alto",
    levelColor: "#fb923c", // Orange
    levelDescription: "Cerca del volumen máximo recuperable (MRV). Vigilar descanso y fatiga.",
  };
}

/**
 * Computes weekly muscle volume from routine exercises and completed week days.
 */
export function calculateWeeklyVolume(
  exercises: Exercise[],
  weekDays: ExerciseDay[] = [],
): WeeklyVolumeSummary {
  const groupsOrder = ["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Core"];

  // Create lookup of done exercise IDs in the current week
  const doneExerciseIds = new Set<string>();
  for (const day of weekDays) {
    if (day && day.log && typeof day.log === "object") {
      for (const [id, entry] of Object.entries(day.log)) {
        if (entry && entry.done) {
          doneExerciseIds.add(id);
        }
      }
    }
  }

  const groupBuckets: Record<string, {
    plannedSets: number;
    completedSets: number;
    exercises: MuscleGroupVolume["exercises"];
  }> = {};

  for (const g of groupsOrder) {
    groupBuckets[g] = { plannedSets: 0, completedSets: 0, exercises: [] };
  }

  for (const ex of exercises) {
    const sets = parseExerciseSets(ex.series_reps);
    const grps = inferMuscleGroups(ex);
    const isDone = doneExerciseIds.has(ex.id);

    for (const g of grps) {
      if (!groupBuckets[g]) {
        groupBuckets[g] = { plannedSets: 0, completedSets: 0, exercises: [] };
      }
      groupBuckets[g]!.plannedSets += sets;
      if (isDone) {
        groupBuckets[g]!.completedSets += sets;
      }
      groupBuckets[g]!.exercises.push({
        id: ex.id,
        name: ex.name,
        sets,
        done: isDone,
        day: ex.day || "General",
      });
    }
  }

  let totalPlannedSets = 0;
  let totalCompletedSets = 0;

  const groups: MuscleGroupVolume[] = groupsOrder.map((g) => {
    const b = groupBuckets[g]!;
    totalPlannedSets += b.plannedSets;
    totalCompletedSets += b.completedSets;
    const classification = classifyVolumeLevel(b.plannedSets);

    return {
      group: g,
      plannedSets: b.plannedSets,
      completedSets: b.completedSets,
      level: classification.level,
      levelLabel: classification.levelLabel,
      levelColor: classification.levelColor,
      levelDescription: classification.levelDescription,
      exercises: b.exercises,
    };
  });

  const completionPct = totalPlannedSets > 0 ? Math.round((totalCompletedSets / totalPlannedSets) * 100) : 0;

  const sortedByPlanned = [...groups].sort((a, b) => b.plannedSets - a.plannedSets);
  const topFocusedGroup = sortedByPlanned.length > 0 && sortedByPlanned[0]!.plannedSets > 0 ? sortedByPlanned[0]!.group : null;
  const leastFocusedGroup = sortedByPlanned.length > 0 && sortedByPlanned[sortedByPlanned.length - 1]!.plannedSets >= 0
    ? sortedByPlanned[sortedByPlanned.length - 1]!.group
    : null;

  return {
    totalPlannedSets,
    totalCompletedSets,
    completionPct,
    groups,
    topFocusedGroup,
    leastFocusedGroup,
  };
}
