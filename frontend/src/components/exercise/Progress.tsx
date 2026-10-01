// Progreso: semanal, mensual y anual en una sola pantalla.
//
// Las tres rejillas son el mismo `Grid` con distinto rango de días (el año es
// su propio heatmap de solo lectura). El conmutador está arriba y el periodo
// se recuerda entre visitas, como el resto de vistas del módulo.

import { Header } from "../habits/parts";
import { ExerciseMonth, ExerciseWeek } from "./Grids";
import { Yearly } from "./Yearly";
import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";

const PERIODS = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

export function Progress() {
  const [period, setPeriod] = usePersistedNav("ejercicio.progreso", "semana");

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
              onClick={() => setPeriod(p.id as PeriodId)}
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
        {period === "semana" ? <ExerciseWeek /> : period === "mes" ? <ExerciseMonth /> : <Yearly />}
      </div>
    </div>
  );
}