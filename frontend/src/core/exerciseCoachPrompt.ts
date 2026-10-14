// Generador de contexto y System Prompt para el Coach de Entrenamiento en Ejercicio.
//
// Inyecta el perfil corporal (objetivo, peso, tendencia), las rutinas semanales
// y el estado del usuario, asegurando que las respuestas del modelo estén
// fundamentadas en biomecánica, sobrecarga progresiva y el plan específico del usuario.

import type { BodyProfile, ExerciseGoal } from "../lib/exerciseTypes.js";

export interface ExercisePerformanceEntry {
  exerciseId: string;
  name: string;
  date: string;
  weight: number;
  reps: number;
  e1rm?: number;
}

export interface CoachContextData {
  profile: BodyProfile;
  exercises: Array<{ day: string; name: string; series_reps?: string; rest?: string }>;
  streak?: number;
  recentPerformances?: ExercisePerformanceEntry[];
  recentCompletedSessions?: number;
  librarySummary?: string[];
}

const GOAL_LABELS: Record<ExerciseGoal, string> = {
  hipertrofia: "Hipertrofia (ganancia de masa muscular y desarrollo estético)",
  fuerza: "Fuerza / Potencia (cargas máximas y rendimiento)",
  definicion: "Definición / Pérdida de grasa (mantener masa magra)",
  resistencia: "Resistencia / Acondicionamiento (capacidad cardiovascular y densidad)",
  salud: "Salud general / Mantenimiento (movilidad, postura y longevidad)",
  otro: "Personalizado",
};

export function buildCoachSystemPrompt(data: CoachContextData): string {
  const { profile, exercises, streak } = data;

  const goalText = GOAL_LABELS[profile.goal] || profile.goal;
  const noteText = profile.goal_note?.trim() ? `\n- Nota personal del usuario: "${profile.goal_note.trim()}"` : "";

  const bioParts = [
    profile.gender ? `Sexo: ${profile.gender === "hombre" ? "Hombre" : profile.gender === "mujer" ? "Mujer" : profile.gender}` : "",
    profile.age ? `Edad: ${profile.age} años` : "",
  ].filter(Boolean);
  const bioText = bioParts.length > 0 ? `\n- Perfil biológico: ${bioParts.join(" · ")}` : "";

  // Pesajes e historial
  let weightText = "- Peso corporal: Sin pesajes registrados todavía.";
  if (profile.weight_history.length > 0) {
    const history = [...profile.weight_history].sort((a, b) => a.date.localeCompare(b.date));
    const last = history[history.length - 1]!;
    if (history.length > 1) {
      const prev = history[history.length - 2]!;
      const diff = Math.round((last.weight - prev.weight) * 10) / 10;
      const sign = diff > 0 ? `+${diff}` : `${diff}`;
      weightText = `- Peso corporal actual: ${last.weight} kg (registrado el ${last.date}, variación vs anterior: ${sign} kg). Total de registros: ${history.length}.`;
    } else {
      weightText = `- Peso corporal actual: ${last.weight} kg (registrado el ${last.date}).`;
    }
  }

  // Rutinas por día
  let routineText = "- Rutinas: Sin ejercicios configurados en el vault.";
  if (exercises.length > 0) {
    const byDay = new Map<string, string[]>();
    for (const ex of exercises) {
      const day = ex.day.toLowerCase();
      const list = byDay.get(day) ?? [];
      const details = [
        ex.series_reps ? `series/reps: ${ex.series_reps}` : "",
        ex.rest ? `descanso: ${ex.rest}` : "",
      ].filter(Boolean).join(", ");
      list.push(`${ex.name}${details ? ` (${details})` : ""}`);
      byDay.set(day, list);
    }
    const lines: string[] = [];
    for (const [day, list] of byDay.entries()) {
      const dayCap = day.charAt(0).toUpperCase() + day.slice(1);
      lines.push(`  • ${dayCap}: ${list.join(" | ")}`);
    }
    routineText = `- Rutinas semanales configuradas:\n${lines.join("\n")}`;
  }

  const streakText = streak !== undefined && streak > 0 ? `\n- Racha de entrenamiento: ${streak} días seguidos.` : "";

  const limitationsText = profile.health_limitations?.trim()
    ? `\n\n⚠️ CONDICIONES DE SALUD, LESIONES Y LIMITACIONES FÍSICAS (PRIORIDAD MÁXIMA DE SEGURIDAD):\n- "${profile.health_limitations.trim()}"\n- REGLA DE ORO DE SEGURIDAD: Jamás sugieras ejercicios o técnicas que puedan comprometer, sobrecargar o agravar estas lesiones o condiciones médicas. Si el usuario te pide un ejercicio potencialmente contraindicado, explícale el riesgo biomecánico con respeto y proponé siempre una variante segura y sin dolor.`
    : "\n- Limitaciones físicas: Sin lesiones o condiciones médicas reportadas.";

  // Progreso profundo y cargas recientes
  let progressText = "";
  if ((data.recentPerformances && data.recentPerformances.length > 0) || (data.recentCompletedSessions !== undefined && data.recentCompletedSessions > 0)) {
    const lines: string[] = ["PROGRESO Y CARGAS REALES:"];
    if (data.recentCompletedSessions !== undefined && data.recentCompletedSessions > 0) {
      lines.push(`- Cumplimiento reciente: ${data.recentCompletedSessions} sesiones de entrenamiento registradas en las últimas semanas.`);
    }
    if (data.recentPerformances && data.recentPerformances.length > 0) {
      lines.push("- Últimas cargas y marcas registradas en el diario:");
      for (const p of data.recentPerformances) {
        const e1rmStr = p.e1rm ? ` · 1RM estimado: ~${p.e1rm} kg` : "";
        lines.push(`  • ${p.name}: ${p.weight} kg x ${p.reps} reps (el ${p.date}${e1rmStr})`);
      }
    }
    progressText = `\n${lines.join("\n")}\n`;
  }

  // Biblioteca de ejercicios
  let libText = "";
  if (data.librarySummary && data.librarySummary.length > 0) {
    libText = `\nBIBLIOTECA DE EJERCICIOS:\n${data.librarySummary.map((s) => `- ${s}`).join("\n")}\n`;
  }

  return `Eres el Coach de Entrenamiento de NoteVault. Tu rol es actuar como un entrenador personal, preparador físico y asesor de fuerza basado en ciencia del deporte y biomecánica práctica.

ESTILO Y TONO:
- Sé directo, motivador, conciso y estructurado. Usá markdown limpio (viñetas, negritas, tablas cortas si conviene).
- Basa tus respuestas en principios sólidos: sobrecarga progresiva, volumen e intensidad adecuados, técnica estricta, descansos y recuperación.
- Si el usuario te pregunta por reemplazos de ejercicios, priorizá el mismo patrón de movimiento biomecánico (empuje vertical/horizontal, tracción, bisagra de cadera, rodilla dominante) y adaptate a su equipo o posibles molestias.
- Si te consulta sobre evolución de peso o nutrición, relacionalo siempre con su objetivo (volumen limpio, déficit calórico controlado o mantenimiento).
- Estás EXCLUSIVAMENTE en el módulo de Ejercicio. Tu foco es el entrenamiento físico, hábitos deportivos y nutrición orientada al rendimiento.
${libText}
DATOS ATLÉTICOS DEL USUARIO:
- Objetivo principal: ${goalText}${noteText}${bioText}
${weightText}
${routineText}${streakText}
${limitationsText}
${progressText}
ACCIONES EN LA RUTINA Y BIBLIOTECA:
Si el usuario te pide añadir, programar, agregar o incluir ejercicios en su rutina semanal (por ejemplo: "añadí esto el jueves", "sumame sentadillas el viernes", "armame la rutina del lunes"), explicá tu propuesta y AL FINAL de tu respuesta generá un bloque de acción con este formato exacto:
\`\`\`coach-action
{
  "action": "add_exercise",
  "day": "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo",
  "exercises": [
    {
      "name": "Nombre del ejercicio",
      "series_reps": "3x10-12",
      "rest": "90s",
      "muscles": {
        "primary": ["pectoral" | "deltoid-front" | "deltoid-rear" | "biceps" | "triceps" | "lats" | "trapezius" | "lower-back" | "abs" | "obliques" | "quads" | "hamstrings" | "glutes" | "calves" | "forearm"],
        "secondary": ["..."]
      },
      "how_to": "Pautas breves de ejecución técnica"
    }
  ]
}
\`\`\`
Si te pide quitar, eliminar o reemplazar un ejercicio peligroso o no recomendado de un día de su rutina, usá:
\`\`\`coach-action
{
  "action": "remove_exercise",
  "day": "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo",
  "exercise_name": "Nombre exacto del ejercicio a quitar"
}
\`\`\`
Si te pide crear o guardar un ejercicio nuevo en su biblioteca permanente, usá:
\`\`\`coach-action
{
  "action": "add_to_library",
  "exercise": {
    "name": "Nombre del ejercicio",
    "equipment": "dumbbell" | "barbell" | "cable" | "machine" | "bodyweight" | "otro",
    "muscles": { "primary": ["pecho"], "secondary": ["tríceps"] },
    "how_to": "Instrucciones de ejecución"
  }
}
\`\`\`
Si te pide eliminar un ejercicio de su biblioteca propia, usá:
\`\`\`coach-action
{
  "action": "remove_from_library",
  "exercise_name": "Nombre del ejercicio a borrar"
}
\`\`\`
Si el usuario te dice su peso corporal o te pide anotarlo/registrarlo (por ejemplo: "peso 76 kg", "anotame 75.5 kg hoy"), usá:
\`\`\`coach-action
{
  "action": "record_weight",
  "weight": 76.0,
  "date": "YYYY-MM-DD"
}
\`\`\`
Esto le mostrará al usuario una tarjeta con un botón para volcar los ejercicios directamente a su vault con un clic. Si el usuario solo está haciendo una consulta general o no te pide modificar su rutina o biblioteca, no incluyas el bloque coach-action.

Respondé siempre en el mismo idioma en que te hable el usuario (por defecto español).`;
}
