/**
 * Timer specs for practice sessions (pure logic).
 * Ported from notevault_app/core/practice/timer.py.
 */

export const POMODORO_WORK = 25 * 60;
export const POMODORO_BREAK = 5 * 60;

const _MINUTES_RE = /^(\d+)\s*(?:m|min|mins|minute|minutes|minuto|minutos)?$/i;

export interface TimerSpec {
  readonly kind: "pomodoro" | "stopwatch" | "countdown" | "off";
  readonly seconds: number;
  readonly break_seconds: number;
}

function _parse(value: unknown): TimerSpec | null {
  if (value === false) {
    return { kind: "off", seconds: 0, break_seconds: 0 };
  }
  const text = String(value !== null && value !== undefined ? value : "")
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }
  if (text === "pomodoro") {
    return { kind: "pomodoro", seconds: POMODORO_WORK, break_seconds: POMODORO_BREAK };
  }
  if (text === "stopwatch" || text === "cronometro" || text === "cronómetro" || text === "libre") {
    return { kind: "stopwatch", seconds: 0, break_seconds: 0 };
  }
  if (text === "off" || text === "none" || text === "no" || text === "false") {
    return { kind: "off", seconds: 0, break_seconds: 0 };
  }
  const m = _MINUTES_RE.exec(text);
  if (m && parseInt(m[1]!, 10) > 0) {
    return { kind: "countdown", seconds: parseInt(m[1]!, 10) * 60, break_seconds: 0 };
  }
  return null;
}

export function parseTimer(
  value: unknown,
  minutes = 0,
  defaultMode = "stopwatch",
): TimerSpec {
  const spec = _parse(value);
  if (spec) return spec;
  const mins = Math.trunc(Number(minutes) || 0);
  if (mins > 0) {
    return { kind: "countdown", seconds: mins * 60, break_seconds: 0 };
  }
  return _parse(defaultMode) || { kind: "stopwatch", seconds: 0, break_seconds: 0 };
}
export const parse_timer = parseTimer;
