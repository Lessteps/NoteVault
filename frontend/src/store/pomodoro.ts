// Pomodoro de la sesión de estudio: UN reloj global (no se pierde al cambiar de pestaña del plan). La lógica está en `lib/pomodoro.ts`;
// aquí solo se guarda el estado y se avisa a quien muestra el registro de horas (`logVersion`) cuando se guardó un bloque.

import { create } from "zustand";
import { advance, idlePomodoro, pause, resume, startFocus, type AssignedTopic, type PomodoroAssessment, type PomodoroState, type PomodoroTimerMode } from "../lib/pomodoro";
import type { WorkKind } from "../lib/timeLog";

interface PomodoroStore {
  p: PomodoroState;
  /** sube cada vez que se guarda un bloque en el registro de horas */
  logVersion: number;
  /** si el desplegable/panel flotante exterior está fijado (pinned) */
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  setMode: (mode: PomodoroTimerMode) => void;
  setDurations: (focusMin: number, breakMin: number) => void;
  assignTopic: (topic: AssignedTopic) => void;
  removeAssignedTopic: (folder: string) => void;
  clearAssignedTopics: () => void;
  /** el tipo de trabajo del próximo bloque (o `null`) */
  setWork: (work: WorkKind | null) => void;
  /** `work` (si se da) fija el tipo; si no, se conserva el que ya estuviera elegido */
  start: (planId: string, areaKey: string, work?: WorkKind | null) => void;
  pause: () => void;
  resume: () => void;
  /** pasa de fase; devuelve los minutos de foco a guardar (0 si no hay) */
  next: (stop?: boolean) => { planId: string; areaKey: string; minutes: number; work: WorkKind | null; topics: AssignedTopic[]; assessment: PomodoroAssessment | null };
  bump: () => void;
  clearAssessment: () => void;
  /** abre la evaluación para una sesión hecha sin Pomodoro (el botón «Registrar sesión») */
  requestAssessment: (a: PomodoroAssessment) => void;
}

export const usePomodoro = create<PomodoroStore>((set, get) => ({
  p: idlePomodoro(),
  logVersion: 0,
  pinned: false,
  setPinned: (pinned) => set({ pinned }),
  setMode: (mode) => set((s) => ({ p: { ...s.p, mode } })),
  setDurations: (focusMin, breakMin) => set((s) => (s.p.phase === "idle" ? { p: { ...s.p, focusMin, breakMin } } : s)),
  assignTopic: (topic) => set((s) => {
    // desde el Mentor la fila trae tipo de trabajo y área: con el reloj parado, el bloque ya nace con ellos (un bloque en marcha no cambia)
    const idle = s.p.phase === "idle";
    const prefill = idle ? { ...(topic.work ? { work: topic.work } : {}), ...(topic.areaKey ? { areaKey: topic.areaKey } : {}) } : {};
    if (s.p.assignedTopics.some((t) => t.folder === topic.folder)) {
      return Object.keys(prefill).length ? { p: { ...s.p, ...prefill, assignedTopics: s.p.assignedTopics.map((t) => (t.folder === topic.folder ? { ...t, ...topic } : t)) } } : s;
    }
    return { p: { ...s.p, ...prefill, assignedTopics: [...s.p.assignedTopics, topic] } };
  }),
  removeAssignedTopic: (folder) => set((s) => ({
    p: { ...s.p, assignedTopics: s.p.assignedTopics.filter((t) => t.folder !== folder) },
  })),
  clearAssignedTopics: () => set((s) => ({ p: { ...s.p, assignedTopics: [] } })),
  setWork: (work) => set((s) => ({ p: { ...s.p, work } })),
  start: (planId, areaKey, work) => {
    const cur = get().p;
    if (cur.pendingAssessment) return; // Bloqueado hasta completar evaluación
    set((s) => ({ p: startFocus(work === undefined ? s.p : { ...s.p, work }, planId, areaKey, Date.now()) }));
  },
  pause: () => set((s) => ({ p: pause(s.p, Date.now()) })),
  resume: () => set((s) => ({ p: resume(s.p, Date.now()) })),
  next: (stop = false) => {
    const cur = get().p;
    const r = advance(cur, Date.now(), stop);
    set({ p: r.state });
    return { planId: cur.planId, areaKey: cur.areaKey, minutes: r.logMinutes, work: cur.work, topics: cur.assignedTopics, assessment: r.assessment };
  },
  bump: () => set((s) => ({ logVersion: s.logVersion + 1 })),
  clearAssessment: () => set((s) => ({ p: { ...s.p, pendingAssessment: null } })),
  requestAssessment: (a) => set((s) => (s.p.pendingAssessment ? s : { p: { ...s.p, pendingAssessment: a } })),
}));
