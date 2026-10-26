// Motor de regeneración elegido en el diálogo de confirmación (la IA de la app, Claude o un agente externo) y las tareas para agentes externos que
// están a medias. La elección se RECUERDA entre sesiones (preferencia de esta persona en este equipo); las tareas viven mientras la app está abierta.
// El diálogo de confirmación del lote no pasa el motor por props (lo monta PlanAreaTopics): lo deja aquí y `useRegenQueue.start` lo lee.

import { create } from "zustand";
import type { RegenEngineId, RegenEnginesView, RegenHandoff } from "../lib/types";

const KEY = "nv.regen.engine";
const IDS: readonly RegenEngineId[] = ["app", "claude", "handoff"];

function readChoice(): RegenEngineId | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return IDS.includes(v as RegenEngineId) ? (v as RegenEngineId) : null;
  } catch {
    return null;
  }
}

interface RegenEngineState {
  /** lo que la persona eligió la última vez (puede no estar disponible hoy) */
  choice: RegenEngineId | null;
  /** el motor que se usará de verdad: la elección si se puede, si no el recomendado */
  effective: RegenEngineId;
  setChoice: (e: RegenEngineId) => void;
  /** al conocer los motores disponibles: resuelve el efectivo */
  resolve: (view: RegenEnginesView | null) => RegenEngineId;
  handoffs: Record<string, RegenHandoff>;
  putHandoff: (h: RegenHandoff) => void;
  dropHandoff: (id: string) => void;
}

export function resolveEngine(choice: RegenEngineId | null, view: RegenEnginesView | null): RegenEngineId {
  if (!view?.engines?.length) return choice ?? "app";
  const ok = (id: RegenEngineId | null): id is RegenEngineId => !!id && !!view.engines.find((e) => e.id === id)?.available;
  if (ok(choice)) return choice;
  return ok(view.recommended) ? view.recommended : "handoff";
}

export const useRegenEngine = create<RegenEngineState>((set, get) => ({
  choice: readChoice(),
  effective: readChoice() ?? "app",
  setChoice: (e) => {
    try {
      window.localStorage.setItem(KEY, e);
    } catch {
      /* sin almacenamiento: vale solo para esta sesión */
    }
    set({ choice: e, effective: e });
  },
  resolve: (view) => {
    const eff = resolveEngine(get().choice, view);
    set({ effective: eff });
    return eff;
  },
  handoffs: {},
  putHandoff: (h) => set((s) => ({ handoffs: { ...s.handoffs, [h.id]: h } })),
  dropHandoff: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.handoffs;
      return { handoffs: rest };
    }),
}));
