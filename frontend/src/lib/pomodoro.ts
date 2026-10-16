// Mentor — Pomodoro de una sesión de estudio. Estado puro basado en marcas de tiempo (no en un contador que se pierde al cambiar de
// pestaña): `endsAt` si corre, `leftMs` si está en pausa. Las funciones devuelven estados nuevos; el reloj lo pone quien llama.

export type PomodoroPhase = "idle" | "focus" | "break";

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
}

export const FOCUS_CHOICES = [15, 25, 50] as const;
export const BREAK_CHOICES = [5, 10] as const;

export const idlePomodoro = (planId = "", areaKey = "", focusMin = 25, breakMin = 5): PomodoroState => ({ planId, areaKey, phase: "idle", running: false, endsAt: 0, leftMs: 0, focusMin, breakMin });

export const startFocus = (s: PomodoroState, planId: string, areaKey: string, now: number): PomodoroState =>
  ({ ...s, planId, areaKey, phase: "focus", running: true, endsAt: now + s.focusMin * 60_000, leftMs: s.focusMin * 60_000 });

export const remainingMs = (s: PomodoroState, now: number): number => (s.phase === "idle" ? 0 : s.running ? Math.max(0, s.endsAt - now) : s.leftMs);

export const pause = (s: PomodoroState, now: number): PomodoroState => (s.running ? { ...s, running: false, leftMs: Math.max(0, s.endsAt - now) } : s);
export const resume = (s: PomodoroState, now: number): PomodoroState => (s.phase !== "idle" && !s.running ? { ...s, running: true, endsAt: now + s.leftMs } : s);

/** Minutos de foco ya hechos en la fase actual (0 si no es de foco). */
export const focusDoneMinutes = (s: PomodoroState, now: number): number =>
  s.phase === "focus" ? Math.max(0, Math.floor((s.focusMin * 60_000 - remainingMs(s, now)) / 60_000)) : 0;

/** ¿Terminó la fase (corriendo y sin tiempo)? */
export const phaseOver = (s: PomodoroState, now: number): boolean => s.phase !== "idle" && s.running && now >= s.endsAt;

/**
 * Pasa a la fase siguiente: un foco completo da `logMinutes` (el foco entero) y abre el descanso; un descanso termina en reposo.
 * Con `stop` (detener a mano) un foco da los minutos hechos y vuelve a reposo.
 */
export function advance(s: PomodoroState, now: number, stop = false): { state: PomodoroState; logMinutes: number } {
  const reset = idlePomodoro(s.planId, s.areaKey, s.focusMin, s.breakMin);
  if (s.phase === "focus") {
    if (stop) return { state: reset, logMinutes: focusDoneMinutes(s, now) };
    return { state: { ...s, phase: "break", running: true, endsAt: now + s.breakMin * 60_000, leftMs: s.breakMin * 60_000 }, logMinutes: s.focusMin };
  }
  return { state: reset, logMinutes: 0 };
}

/** «24:59». */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
