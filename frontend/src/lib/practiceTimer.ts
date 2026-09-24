// The practice timer as pure state: stopwatch, countdown or pomodoro.

export interface TimerSpec { kind: "stopwatch" | "countdown" | "pomodoro" | "off"; seconds: number; break_seconds: number }

export interface TimerState {
  phase: "work" | "break";
  phaseElapsed: number;
  /** Seconds spent working: what an attempt records. */
  workElapsed: number;
  /** A countdown announces its end once. */
  announced: boolean;
}

export const initialTimer = (): TimerState => ({ phase: "work", phaseElapsed: 0, workElapsed: 0, announced: false });

/** One second later. `alarm` is true when the learner should be told. */
export function tick(spec: TimerSpec, s: TimerState): { state: TimerState; alarm: boolean } {
  const next = { ...s, phaseElapsed: s.phaseElapsed + 1, workElapsed: s.workElapsed + (s.phase === "work" ? 1 : 0) };
  if (spec.kind === "pomodoro") {
    const target = next.phase === "work" ? spec.seconds : spec.break_seconds;
    if (next.phaseElapsed >= target) {
      const phase = next.phase === "work" ? "break" : "work";
      return { state: { ...next, phase, phaseElapsed: 0 }, alarm: phase === "break" };
    }
  } else if (spec.kind === "countdown" && !next.announced && next.phaseElapsed >= spec.seconds) {
    return { state: { ...next, announced: true }, alarm: true };
  }
  return { state: next, alarm: false };
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** What the clock shows and its label. */
export function display(spec: TimerSpec, s: TimerState): { text: string; label: string; over: boolean } {
  if (spec.kind === "stopwatch" || spec.kind === "off") return { text: fmtClock(s.phaseElapsed), label: "Cronómetro", over: false };
  if (spec.kind === "pomodoro") {
    const target = s.phase === "work" ? spec.seconds : spec.break_seconds;
    return { text: fmtClock(target - s.phaseElapsed), label: s.phase === "work" ? "Pomodoro · trabajo" : "Pomodoro · descanso", over: false };
  }
  const remaining = spec.seconds - s.phaseElapsed;
  return remaining < 0
    ? { text: "+" + fmtClock(-remaining), label: "Tiempo extra", over: true }
    : { text: fmtClock(remaining), label: "Cuenta atrás", over: false };
}
