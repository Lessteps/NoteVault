/**
 * El día que está mirando la vista de Ejercicio.
 *
 * La cara del panel derecho vive fuera del módulo, así que no puede leer el
 * estado de `Daily`: el día se guarda aquí y el mapa —modal y panel— muestran
 * siempre el mismo. Sin nadie que lo fije, es hoy.
 */
import { create } from "zustand";
import { todayIso } from "../lib/tasks";

interface MuscleMapState {
  date: string;
  /** La vista diaria avisa cada vez que cambia de día. */
  setDate: (date: string) => void;
}

export const useMuscleMap = create<MuscleMapState>((set) => ({
  date: todayIso(),
  setDate: (date) => set({ date }),
}));
