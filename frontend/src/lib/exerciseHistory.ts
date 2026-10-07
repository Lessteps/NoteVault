// Historial de un ejercicio: sesiones con volumen y 1RM, más el PR.
//
// Las sesiones las da la API (`ex_history`); aquí solo se ordena y se agrega,
// con las mismas reglas de `volumeSeries`: kg×reps con peso, reps sin peso,
// una serie si se marcó sin números. El PR es el mayor 1RM estimado (Epley).

import { estimate1RM } from "./exerciseLibrary";

export interface HistoryInput {
  date: string;
  weight: number;
  reps: number;
}

export interface HistorySession extends HistoryInput {
  volume: number;
  e1rm: number | null;
}

export interface HistorySummary {
  sessions: HistorySession[];
  pr: HistorySession | null;
}

export function summarizeHistory(input: HistoryInput[]): HistorySummary {
  const sessions = [...input]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => {
      const reps = s.reps > 0 ? s.reps : 0;
      const weight = s.weight > 0 ? s.weight : 0;
      const volume = reps > 0 ? (weight > 0 ? weight * reps : reps) : 1;
      const e1rm = weight > 0 && reps > 0 ? estimate1RM(weight, reps) : null;
      return { ...s, weight, reps, volume, e1rm };
    });
  let pr: HistorySession | null = null;
  for (const s of sessions) {
    if (s.e1rm === null) continue;
    if (!pr || s.e1rm > (pr.e1rm ?? 0)) pr = s;
  }
  return { sessions, pr };
}
