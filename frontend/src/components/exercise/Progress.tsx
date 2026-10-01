// Progreso: semanal, mensual y anual en una sola pantalla.
//
// Las tres rejillas son el mismo `Grid` con distinto rango de días (el año es
// su propio heatmap de solo lectura). El conmutador está arriba y el periodo
// se recuerda entre visitas, como el resto de vistas del módulo.

import { useState } from "react";
import { Header } from "../habits/parts";
import { ExerciseMonth, ExerciseWeek } from "./Grids";
import { ProgressGraph } from "./ProgressGraph";
import { ProgressMap } from "./ProgressMap";
import { Yearly } from "./Yearly";
import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";

const PERIODS = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
  { id: "mapa", label: "Mapa" },
  { id: "grafica", label: "Gráfica" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];
/** Los tres periodos de rejilla; el resto son pantallas aparte. */
type GridPeriod = Exclude<PeriodId, "mapa" | "grafica">;

export function Progress() {
  const [period, setPeriod] = usePersistedNav("ejercicio.progreso", "semana") as [PeriodId, (v: PeriodId) => void];
  // Al elegir Mapa se recuerda qué rejilla se estaba viendo, para que el mapa
  // abra en ese periodo y no siempre en el mismo.
  const [previous, setPrevious] = useState<GridPeriod>("semana");

  const pick = (id: PeriodId) => {
    if (id === "semana" || id === "mes" || id === "anio") setPrevious(id);
    setPeriod(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Progreso">
        <div data-progress-tabs className="flex items-center gap-1" role="tablist" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              data-progress-tab={p.id}
              onClick={() => pick(p.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[12.5px] transition-colors",
                period === p.id
                  ? "bg-accent-soft text-text"
                  : "text-dim hover:bg-hover hover:text-text",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Header>
      <div data-progress-view className="flex min-h-0 flex-1 flex-col">
        {period === "mapa" ? (
          // Mapa y gráfica siguen el periodo de la rejilla activa: si venías en
          // Mes, enseñan el mes. Para cambiarlo se vuelve a Semana/Mes/Año.
          <ProgressMap period={previous} />
        ) : period === "grafica" ? (
          <ProgressGraph period={previous} />
        ) : period === "semana" ? (
          <ExerciseWeek />
        ) : period === "mes" ? (
          <ExerciseMonth />
        ) : (
          <Yearly />
        )}
      </div>
    </div>
  );
}