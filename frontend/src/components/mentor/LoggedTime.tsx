// «Tiempo registrado: 1 h 20 min · Teoría 45 · Práctica 35»: SOLO lo que se estudió de verdad (bloques guardados del Pomodoro o a mano).
// No muestra nada si no hay tiempo registrado y nunca estima ni usa los minutos previstos del plan. Pensado para montarse en cabeceras de
// semana, mes o área: `<LoggedTime planId={plan.id} areaKey="backend" from="2026-10-19" to="2026-10-25" />`, o con `entries` ya cargadas.

import { WORK_KINDS, WORK_LABEL, minutesText, summarizeTimeLog, type TimeEntry } from "../../lib/timeLog";
import { useTimeLog } from "./AreaSession";

interface Common {
  /** un área concreta; sin él se suman todas */
  areaKey?: string;
  /** rango de fechas `YYYY-MM-DD` (ambas incluidas); sin él, todo el registro */
  from?: string;
  to?: string;
  className?: string;
}

/** Presentación pura sobre entradas ya cargadas. */
export function LoggedTime({ entries, areaKey, from, to, className }: Common & { entries: ReadonlyArray<TimeEntry> }) {
  const sum = summarizeTimeLog(entries, { ...(areaKey ? { areaKey } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  if (!sum.hasAny || sum.totalMinutes <= 0) return null;
  const parts = [...WORK_KINDS.filter((k) => sum.byKind[k] > 0).map((k) => `${WORK_LABEL[k]} ${sum.byKind[k]}`), ...(sum.byKind.unclassified > 0 ? [`Sin clasificar ${sum.byKind.unclassified}`] : [])];
  return (
    <p className={className ?? "text-[13px] text-dim"} data-testid="logged-time">
      Tiempo registrado: <strong className="text-text">{minutesText(sum.totalMinutes)}</strong>
      {parts.length > 0 && <span> · {parts.join(" · ")}</span>}
    </p>
  );
}

/** Igual, pero carga el registro del plan (y se actualiza cuando se guarda un bloque). */
export function LoggedTimeForPlan({ planId, ...rest }: Common & { planId: string }) {
  const { entries } = useTimeLog(planId);
  return <LoggedTime entries={entries} {...rest} />;
}
