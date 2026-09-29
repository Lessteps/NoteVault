/**
 * El esquema muscular como cara del panel derecho, solo dentro de Ejercicio.
 *
 * La cara vive fuera del módulo (el panel es de la app), así que pide el día de
 * hoy por su cuenta y se refresca cuando el módulo marca algo — `stats` es un
 * objeto nuevo en cada `refreshStats`, así que sirve de aviso. El cuerpo, la
 * leyenda y el «pasa el puntero por un músculo» son los mismos de la vista
 * general: aquí, en estrecho.
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";
import type { ExerciseDay } from "../../lib/types";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import { IconButton } from "../ui";
import { MuscleFocusCard, muscleRows } from "./MuscleFocus";
import { useFail } from "./parts";

export function MuscleSchemaPanel() {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const stats = useExercise((s) => s.stats);
  const setMuscleOpen = useApp((s) => s.setMuscleOpen);
  const today = todayIso();
  const [day, setDay] = useState<ExerciseDay | null>(null);

  useEffect(() => {
    api.exDays(today, today).then((d) => setDay(d[0] ?? null)).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, stats, list.length]);

  const rows = useMemo(() => muscleRows(day, list), [day, list]);

  return (
    <aside aria-label="Esquema muscular" className="flex w-[320px] flex-none flex-col border-l border-line bg-panel">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <span className="truncate text-[12.5px] font-semibold text-text">Esquema muscular</span>
        <span className="text-[11px] text-faint">hoy</span>
        <span className="flex-1" />
        <IconButton title="Cerrar el esquema muscular" onClick={() => setMuscleOpen(false)}><X size={14} /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MuscleFocusCard rows={rows} size="panel" />
      </div>
    </aside>
  );
}
