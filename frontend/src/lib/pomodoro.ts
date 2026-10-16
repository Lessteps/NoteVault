// Mentor — Pomodoro de una sesión de estudio. Estado puro basado en marcas de tiempo (no en un contador que se pierde al cambiar de
// pestaña): `endsAt` si corre, `leftMs` si está en pausa. Las funciones devuelven estados nuevos; el reloj lo pone quien llama.

export type PomodoroPhase = "idle" | "focus" | "break";
export type PomodoroTimerMode = "timer" | "stopwatch";

/** Lo que se trabaja en un bloque: un tema del plan, una tarea manual o un proyecto. */
export interface AssignedTopic {
  /** carpeta del tema; en una tarea o proyecto manual, un id `manual:<tipo>:<n>` */
  folder: string;
  title: string;
  kind?: "topic" | "task" | "project";
}

export const ASSIGN_KIND_LABEL: Record<NonNullable<AssignedTopic["kind"]>, string> = { topic: "Tema", task: "Tarea", project: "Proyecto" };

/** Una tarea o proyecto escrito a mano (o sugerido): lleva un id propio para poder quitarlo. */
export const manualAssignment = (kind: "task" | "project", title: string, seed = Date.now()): AssignedTopic => ({ folder: `manual:${kind}:${seed.toString(36)}`, title: title.replace(/\s+/g, " ").trim().slice(0, 120), kind });

export interface PomodoroAssessment {
  planId: string;
  areaKey: string;
  minutes: number;
  topics: AssignedTopic[];
  finishedAt: number;
}

export interface PomodoroState {
  planId: string;
  areaKey: string;
  phase: PomodoroPhase;
  running: boolean;
  /** si corre: cuándo termina la fase (ms epoch) */
  endsAt: number;
  /** si está en pausa: lo que queda de la fase (ms) */
  leftMs: number;
  focusMin: number;
  breakMin: number;
  /** modo: 'timer' (cuenta atrás) o 'stopwatch' (hacia adelante) */
  mode: PomodoroTimerMode;
  /** para stopwatch: cuándo empezó a correr */
  startedAt: number;
  /** para stopwatch en pausa: milisegundos transcurridos acumulados */
  elapsedMs: number;
  /** temas asignados al bloque actual */
  assignedTopics: AssignedTopic[];
  /** evaluación pendiente obligatoria al acabar foco */
  pendingAssessment: PomodoroAssessment | null;
}

export const FOCUS_CHOICES = [15, 25, 50] as const;
export const BREAK_CHOICES = [5, 10] as const;

export const idlePomodoro = (planId = "", areaKey = "", focusMin = 25, breakMin = 5, mode: PomodoroTimerMode = "timer"): PomodoroState => ({
  planId,
  areaKey,
  phase: "idle",
  running: false,
  endsAt: 0,
  leftMs: 0,
  focusMin,
  breakMin,
  mode,
  startedAt: 0,
  elapsedMs: 0,
  assignedTopics: [],
  pendingAssessment: null,
});

export const startFocus = (s: PomodoroState, planId: string, areaKey: string, now: number): PomodoroState => {
  if (s.mode === "stopwatch") {
    return {
      ...s,
      planId,
      areaKey,
      phase: "focus",
      running: true,
      startedAt: now,
      elapsedMs: 0,
      endsAt: 0,
      leftMs: 0,
    };
  }
  return {
    ...s,
    planId,
    areaKey,
    phase: "focus",
    running: true,
    endsAt: now + s.focusMin * 60_000,
    leftMs: s.focusMin * 60_000,
  };
};

export const remainingMs = (s: PomodoroState, now: number): number => {
  if (s.phase === "idle") return 0;
  if (s.mode === "stopwatch" && s.phase === "focus") {
    return s.running ? s.elapsedMs + Math.max(0, now - s.startedAt) : s.elapsedMs;
  }
  return s.running ? Math.max(0, s.endsAt - now) : s.leftMs;
};

export const pause = (s: PomodoroState, now: number): PomodoroState => {
  if (!s.running) return s;
  if (s.mode === "stopwatch" && s.phase === "focus") {
    return { ...s, running: false, elapsedMs: s.elapsedMs + Math.max(0, now - s.startedAt) };
  }
  return { ...s, running: false, leftMs: Math.max(0, s.endsAt - now) };
};

export const resume = (s: PomodoroState, now: number): PomodoroState => {
  if (s.phase === "idle" || s.running) return s;
  if (s.mode === "stopwatch" && s.phase === "focus") {
    return { ...s, running: true, startedAt: now };
  }
  return { ...s, running: true, endsAt: now + s.leftMs };
};

/** Minutos de foco ya hechos en la fase actual (0 si no es de foco). */
export const focusDoneMinutes = (s: PomodoroState, now: number): number => {
  if (s.phase !== "focus") return 0;
  if (s.mode === "stopwatch") {
    const ms = s.running ? s.elapsedMs + Math.max(0, now - s.startedAt) : s.elapsedMs;
    return Math.max(0, Math.floor(ms / 60_000));
  }
  return Math.max(0, Math.floor((s.focusMin * 60_000 - remainingMs(s, now)) / 60_000));
};

/** ¿Terminó la fase (corriendo y sin tiempo)? (stopwatch nunca se pasa solo, corre hasta que lo detengan) */
export const phaseOver = (s: PomodoroState, now: number): boolean => {
  if (s.phase === "idle" || !s.running) return false;
  if (s.mode === "stopwatch" && s.phase === "focus") return false;
  return now >= s.endsAt;
};

/**
 * Pasa a la fase siguiente: un foco completo da `logMinutes` (el foco entero) y abre el descanso; un descanso termina en reposo.
 * Con `stop` (detener a mano) un foco da los minutos hechos y vuelve a reposo.
 */
export function advance(s: PomodoroState, now: number, stop = false): { state: PomodoroState; logMinutes: number; assessment: PomodoroAssessment | null } {
  const reset = idlePomodoro(s.planId, s.areaKey, s.focusMin, s.breakMin, s.mode);
  if (s.phase === "focus") {
    const mins = s.mode === "stopwatch" ? focusDoneMinutes(s, now) : (stop ? focusDoneMinutes(s, now) : s.focusMin);
    const assessment: PomodoroAssessment | null = mins >= 1 ? {
      planId: s.planId,
      areaKey: s.areaKey,
      minutes: mins,
      topics: [...s.assignedTopics],
      finishedAt: now,
    } : null;

    if (stop || s.mode === "stopwatch") {
      return {
        state: { ...reset, pendingAssessment: assessment },
        logMinutes: mins,
        assessment,
      };
    }
    return {
      state: {
        ...s,
        phase: "break",
        running: true,
        endsAt: now + s.breakMin * 60_000,
        leftMs: s.breakMin * 60_000,
        pendingAssessment: assessment,
      },
      logMinutes: mins,
      assessment,
    };
  }
  return { state: reset, logMinutes: 0, assessment: null };
}

/** «24:59» o «01:25:00». */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
