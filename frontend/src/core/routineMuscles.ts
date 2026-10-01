// Músculos de los ejercicios de la rutina por defecto, para que el mapa, la
// gráfica de Progreso y el enfoque del día tengan algo que teach.
//
// Los 33 ejercicios con nombre reconocible se mapearon contra el catálogo de
// la Biblioteca (workout-guide). Los 18 sin equivalente se.redactan aquí a mano
// o se dejan sin asignar, con `null`.
//
// Los ids son los de `frontend/src/lib/muscles.ts`.

export type MuscleMap = { primary: string[]; secondary: string[] };

/** `null` = sin mapeo: son estiramientos y calistenia que no pintan nada. */
export const ROUTINE_MUSCLES: Record<string, MuscleMap | null> = {
  // ── Lunes ──────────────────────────────────────────────────────────────
  lunes_0: null, // Calentamiento (Bench + OHP)
  lunes_1: { primary: ["pectoral"], secondary: ["triceps", "deltoid-front"] },
  lunes_2: { primary: ["trapezius", "deltoid-rear"], secondary: ["deltoid-front"] },
  lunes_3: { primary: ["deltoid-front"], secondary: ["triceps"] },
  lunes_4: { primary: ["lats", "trapezius"], secondary: ["biceps"] },
  lunes_5: { primary: ["trapezius", "deltoid-rear"], secondary: ["deltoid-front"] },
  lunes_6: { primary: ["quads"], secondary: [] },
  lunes_7: { primary: ["biceps"], secondary: ["forearm"] },
  lunes_8: { primary: ["forearm"], secondary: ["biceps"] },
  lunes_99: null, // Estiramientos

  // ── Martes ─────────────────────────────────────────────────────────────
  martes_0: null, // Calentamiento (Squat + RDL)
  martes_1: { primary: ["quads"], secondary: ["glutes", "abs", "obliques"] },
  martes_2: { primary: ["hamstrings"], secondary: ["glutes", "lower-back"] },
  martes_3: { primary: ["glutes"], secondary: ["hamstrings"] },
  martes_4: { primary: ["calves"], secondary: [] },
  martes_5: { primary: ["abs"], secondary: ["obliques"] },
  martes_6: { primary: ["trapezius"], secondary: ["biceps", "forearm"] }, // Farmer's Walk
  martes_7: { primary: ["abductors"], secondary: ["glutes"] }, // Abducción de cadera
  martes_8: { primary: ["quads"], secondary: [] },
  martes_99: null, // Estiramientos

  // ── Miércoles ─────────────────────────────────────────────────────────
  miercoles_1: { primary: ["forearm", "lats"], secondary: ["abs", "obliques"] }, // Dead Hang
  miercoles_2: { primary: ["forearm"], secondary: [] }, // Plate Pinch Hold
  miercoles_3: null, // Neck Flexion/Extension
  miercoles_99: null, // Estiramientos

  // ── Jueves ─────────────────────────────────────────────────────────────
  jueves_0: { primary: ["pectoral"], secondary: ["deltoid-front", "triceps"] },
  jueves_1: { primary: ["lats", "trapezius"], secondary: ["biceps", "deltoid-rear"] },
  jueves_2: { primary: ["pectoral"], secondary: ["deltoid-front", "triceps"] },
  jueves_3: { primary: ["lats"], secondary: ["biceps"] },
  jueves_4: { primary: ["trapezius", "deltoid-front"], secondary: ["abs"] }, // Rack Carry
  jueves_5: { primary: ["lats", "trapezius"], secondary: ["biceps", "deltoid-rear"] },
  jueves_6: { primary: ["triceps"], secondary: ["deltoid-front"] },
  jueves_7: { primary: ["deltoid-front"], secondary: ["trapezius"] },
  jueves_8: { primary: ["forearm"], secondary: ["biceps"] },
  jueves_99: null, // Estiramientos

  // ── Viernes ────────────────────────────────────────────────────────────
  viernes_0: { primary: ["glutes", "hamstrings"], secondary: ["lower-back", "lats", "trapezius"] },
  viernes_1: { primary: ["glutes", "hamstrings"], secondary: ["lower-back", "lats", "trapezius"] },
  viernes_2: { primary: ["quads"], secondary: ["glutes", "hamstrings"] },
  viernes_3: { primary: ["quads"], secondary: ["glutes", "abs", "obliques"] },
  viernes_4: { primary: ["hamstrings"], secondary: ["glutes", "abs", "obliques"] },
  viernes_5: { primary: ["quads"], secondary: [] },
  viernes_6: { primary: ["abductors"], secondary: ["glutes"] }, // Abducción de cadera
  viernes_7: { primary: ["abs", "obliques"], secondary: ["deltoid-front"] },
  viernes_8: { primary: ["calves"], secondary: [] },
  viernes_99: null, // Estiramientos

  // ── Sábado ─────────────────────────────────────────────────────────────
  sabado_1: { primary: ["lats"], secondary: ["forearm", "abs"] }, // Towel/Barbell Hang
  sabado_2: { primary: ["forearm"], secondary: [] },
  sabado_99: null, // Estiramientos

  // ── Domingo ────────────────────────────────────────────────────────────
  domingo_1: { primary: ["calves", "quads"], secondary: ["glutes"] }, // Trote
  domingo_2: null, // Neck Flexion/Extension
  domingo_99: null, // Estiramientos
};

/** Los músculos de un ejercicio de la rutina, o `null` si no tiene. */
export function routineMuscles(id: string): MuscleMap | null {
  return ROUTINE_MUSCLES[id] ?? null;
}