// Vista general: los cuatro dashboards circulares arriba del todo (hoy, semana,
// mes, año), la racha y los días entrenados de cada periodo.

import { StatTile } from "../common/StatTile";
import { Header } from "../habits/parts";
import { useExercise } from "../../store/exercise";
import { ORANGE, PeriodRings, StreakLine } from "./parts";

export function Overview() {
  const stats = useExercise((s) => s.stats);
  return (
    <>
      <Header title="Vista general">
        <span className="text-[11.5px] text-faint">Ejercicio</span>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <PeriodRings />
        <StreakLine />
        <div className="grid grid-cols-3 gap-3">
          <StatTile value={stats?.week.trained ?? 0} label="Esta semana · días entrenados" colour={ORANGE} />
          <StatTile value={stats?.month.trained ?? 0} label="Este mes · días entrenados" colour={ORANGE} />
          <StatTile
            value={stats?.anual.trained ?? 0}
            label={`${stats?.year ?? new Date().getFullYear()} · días entrenados`}
            colour={ORANGE}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile value={`${stats?.week.due ?? 0}`} label="Días con rutina esta semana" />
          <StatTile value={`${stats?.month.due ?? 0}`} label="Días con rutina este mes" />
          <StatTile value={`${stats?.streak.best ?? 0}`} label="Mejor racha del año (días)" />
        </div>
      </div>
    </>
  );
}
