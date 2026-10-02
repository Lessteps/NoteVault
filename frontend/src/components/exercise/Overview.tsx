// Vista general: los cuatro dashboards circulares (hoy, semana, mes, año), la racha,
// los días entrenados de cada periodo y, debajo, la sesión del día que tengas abierto
// —con sus casillas, kg y reps— junto al enfoque muscular: el cuerpo sobre un halo, y
// al pasar el puntero por un músculo, qué ejercicio lo entrena.
//
// Aquí viven las flechas de fecha, que antes eran la única razón de existir de la
// pantalla «Diaria». Era una copia de la mitad inferior de esta con `date = hoy`: dos
// sitios que arreglar cada vez que cambiara algo. Ahora es una sola, y se navega.

import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Dumbbell } from "lucide-react";
import { api } from "../../lib/bridge";
import { addDays } from "../../lib/habits";
import { NavButtons } from "../habits/parts";
import { shortDate, todayIso } from "../../lib/tasks";
import { weekdayKeyOf } from "../../lib/exercise";
import { StatTile } from "../common/StatTile";
import { Header } from "../habits/parts";
import { GhostButton } from "../common/forms";
import { useExercise } from "../../store/exercise";
import type { Exercise, ExerciseDay } from "../../lib/types";
import { ExerciseRow } from "./ExerciseRow";
import { MuscleFocusCard, muscleRows } from "./MuscleFocus";
import { MuscleMap } from "./MuscleMap";
import { ORANGE, PeriodRings, StreakLine, seriesOf, useFail } from "./parts";

export function Overview({
  date,
  onDate,
  onGoProgram,
  onVideo,
}: {
  /** El día abierto. Vive en ExerciseModule para que las flechas sobrevivan a un
   *  cambio de pantalla y para que «Ir a hoy» pueda volver a él. */
  date: string;
  onDate: (iso: string) => void;
  onGoProgram: () => void;
  onVideo?: (ex: Exercise) => void;
}) {
  const fail = useFail();
  const stats = useExercise((s) => s.stats);
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refreshStats = useExercise((s) => s.refreshStats);

  const [day, setDay] = useState<ExerciseDay | null>(null);
  const [map, setMap] = useState(false);

  const key = weekdayKeyOf(date);
  const meta = days.find((d) => d.key === key);
  const isToday = date === todayIso();

  const load = () => api.exDays(date, date).then((d) => setDay(d[0] ?? null)).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  /** La fecha abierta, con los identificadores que pinta el cuerpo. */
  const rows = useMemo(() => muscleRows(day, list), [day, list]);

  const total = day?.exercises.length ?? 0;
  const done = day ? day.exercises.filter((e) => day.log[e.id]?.done).length : 0;
  const series = (day?.exercises ?? []).reduce((sum, e) => sum + seriesOf(byId.get(e.id)?.series_reps), 0);

  const reload = () => {
    void load();
    void refreshStats();
  };

  return (
    <>
      <Header title="Vista general">
        <span className="text-[11.5px] text-faint">Ejercicio</span>
        <GhostButton data-go-program-view onClick={onGoProgram}>
          <Dumbbell size={13} /> Tu programa
        </GhostButton>
        <NavButtons
          label={`${shortDate(date)}${isToday ? " · hoy" : ""}`}
          onPrev={() => onDate(addDays(date, -1))}
          onNext={() => onDate(addDays(date, 1))}
          onToday={() => onDate(todayIso())}
        />
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

        {/* La sesión del día abierto y, a la derecha, lo que trabaja. */}
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 372px" }}>
          <section className="rounded-xl border border-line bg-card" data-session-date={date}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <span className="text-[13.5px] font-semibold text-text">
                {meta ? `${meta.glyph} ${meta.name}` : "Hoy"}
              </span>
              {meta?.subtitle && <span className="text-[12px] text-faint">· {meta.subtitle}</span>}
              <span className="flex-1" />
              {total > 0 && (
                <span className="rounded-full px-2.5 py-0.5 font-mono text-[12px]"
                  style={{ background: `color-mix(in srgb, ${ORANGE} 18%, transparent)`, color: ORANGE }}>
                  {done}/{total}
                </span>
              )}
              {total > 0 && (
                <button type="button" onClick={() => setMap(true)} title="Mapa muscular del día"
                  className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
                  <MapIcon size={13} /> Mapa
                </button>
              )}
            </div>
            <div className="space-y-2 p-3">
              {!day || !day.exercises.length ? (
                <p className="py-8 text-center text-[13px] text-faint">
                  {total === 0 && !day
                    ? "Cargando…"
                    : isToday
                      ? "Día de descanso: hoy no hay ejercicios programados."
                      : "Ese día no hay ejercicios programados."}
                </p>
              ) : (
                day.exercises.map((ex) => {
                  const full = byId.get(ex.id);
                  return full ? (
                    <ExerciseRow key={ex.id} day={date} ex={full} entry={day.log[ex.id] ?? {}}
                      onVideo={onVideo} onChanged={reload} />
                  ) : (
                    <div key={ex.id} className="rounded-2xl border border-line px-3 py-2 text-[13px] text-dim">
                      {ex.name}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-card">
            <MuscleFocusCard rows={rows} series={series} />
          </section>
        </div>
      </div>

      {map && (
        <MuscleMap
          date={date}
          day={day}
          onVideo={onVideo}
          onChanged={reload}
          onClose={() => setMap(false)}
        />
      )}
    </>
  );
}
