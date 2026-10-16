// Rest timer store: manages global countdown between exercise sets with sound and controls.

import { create } from "zustand";

/**
 * Parses user-configured rest strings into seconds.
 * Supports: "90s", "60-90s", "2m", "1:30", "120", "2 min".
 */
export function parseRestSeconds(raw: string): number {
  if (!raw) return 90;
  const s = raw.toLowerCase().trim();

  // Range format like "60-90s" or "60-90": take the higher bound for full recovery
  const rangeMatch = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const higher = Number(rangeMatch[2]);
    if (Number.isFinite(higher) && higher > 0) return higher;
  }

  // MM:SS format like "1:30"
  const colonMatch = s.match(/^(\d+):(\d{2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]);
    const secs = Number(colonMatch[2]);
    return mins * 60 + secs;
  }

  // Minutes like "2m" or "2 min" or "2.5m"
  const minMatch = s.match(/^([\d.,]+)\s*m(?:in)?/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]!.replace(",", "."));
    if (Number.isFinite(mins) && mins > 0) return Math.round(mins * 60);
  }

  // Seconds like "90s" or plain integer "90"
  const secMatch = s.match(/^(\d+)/);
  if (secMatch) {
    const secs = Number(secMatch[1]);
    if (Number.isFinite(secs) && secs > 0) return secs;
  }

  return 90;
}

/**
 * Plays a pleasant two-tone completion chime via Web Audio API.
 */
export function playRestBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // First tone (587.33 Hz - D5)
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(587.33, ctx.currentTime);
    g1.gain.setValueAtTime(0.15, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.2);

    // Second tone (880 Hz - A5)
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    g2.gain.setValueAtTime(0.18, ctx.currentTime + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(ctx.currentTime + 0.15);
    o2.stop(ctx.currentTime + 0.45);

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Audio context not allowed or unsupported
  }
}

interface RestTimerState {
  active: boolean;
  running: boolean;
  exerciseName: string;
  totalSeconds: number;
  remainingSeconds: number;
  completed: boolean;
  sound: boolean;
  onComplete?: () => Promise<void> | void;

  start: (
    exerciseName: string,
    seconds: number | string,
    onComplete?: () => Promise<void> | void,
  ) => void;
  pause: () => void;
  resume: () => void;
  addSeconds: (delta: number) => void;
  completeNow: () => void;
  stop: () => void;
  toggleSound: () => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

function clearStoreInterval() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export const useRestTimer = create<RestTimerState>((set, get) => ({
  active: false,
  running: false,
  exerciseName: "",
  totalSeconds: 90,
  remainingSeconds: 90,
  completed: false,
  sound: true,
  onComplete: undefined,

  start: (
    exerciseName: string,
    seconds: number | string,
    onComplete?: () => Promise<void> | void,
  ) => {
    clearStoreInterval();
    const parsedSecs = typeof seconds === "number" ? seconds : parseRestSeconds(seconds);
    const secs = Math.max(5, Math.min(600, parsedSecs));

    set({
      active: true,
      running: true,
      exerciseName: exerciseName.trim() || "Ejercicio",
      totalSeconds: secs,
      remainingSeconds: secs,
      completed: false,
      onComplete,
    });

    timerInterval = setInterval(() => {
      const state = get();
      if (!state.running) return;

      if (state.remainingSeconds <= 1) {
        clearStoreInterval();
        if (state.sound) {
          playRestBeep();
        }
        if (state.onComplete) {
          try {
            void state.onComplete();
          } catch (e) {
            console.error("Error executing rest timer onComplete:", e);
          }
        }
        set({
          remainingSeconds: 0,
          running: false,
          completed: true,
        });
      } else {
        set({ remainingSeconds: state.remainingSeconds - 1 });
      }
    }, 1000);
  },

  pause: () => {
    set({ running: false });
  },

  resume: () => {
    const { remainingSeconds, completed } = get();
    if (completed || remainingSeconds <= 0) return;

    set({ running: true });
    if (timerInterval === null) {
      timerInterval = setInterval(() => {
        const state = get();
        if (!state.running) return;

        if (state.remainingSeconds <= 1) {
          clearStoreInterval();
          if (state.sound) {
            playRestBeep();
          }
          set({
            remainingSeconds: 0,
            running: false,
            completed: true,
          });
        } else {
          set({ remainingSeconds: state.remainingSeconds - 1 });
        }
      }, 1000);
    }
  },

  addSeconds: (delta: number) => {
    const { remainingSeconds, totalSeconds, completed, exerciseName, start } = get();
    if (completed) {
      // If completed and user adds 30s, restart timer with 30s
      start(exerciseName, Math.max(10, delta));
      return;
    }
    const next = Math.max(5, remainingSeconds + delta);
    set({
      remainingSeconds: next,
      totalSeconds: Math.max(totalSeconds, next),
    });
  },

  completeNow: () => {
    clearStoreInterval();
    const state = get();
    if (state.sound) {
      playRestBeep();
    }
    if (state.onComplete) {
      try {
        void state.onComplete();
      } catch (e) {
        console.error("Error executing rest timer onComplete:", e);
      }
    }
    set({
      remainingSeconds: 0,
      running: false,
      completed: true,
    });
  },

  stop: () => {
    clearStoreInterval();
    set({
      active: false,
      running: false,
      remainingSeconds: 0,
      completed: false,
      onComplete: undefined,
    });
  },

  toggleSound: () => {
    set((s) => ({ sound: !s.sound }));
  },
}));
