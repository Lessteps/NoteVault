// Vista general: los cuatro dashboards circulares (hoy, semana, mes, año), la racha,
// los días entrenados de cada periodo y, debajo, la sesión de hoy —con sus casillas,
// kg y reps, para poder rellenarla sin salir de aquí— junto al enfoque muscular del
// día: las zonas que se van a trabajar, encendidas en naranja sobre el cuerpo.

import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { api } from "../../lib/bridge";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { expandMuscles, granularGroup, granularName, muscleMapData, type MuscleExercise } from "../../lib/muscles";
import type { Exercise, ExerciseDay } from "../../lib/types";
import { StatTile } from "../common/StatTile";
import { Header } from "../habits/parts";
import { useExercise } from "../../store/exercise";
import { cn } from "../ui";
import { BodyFigure, BodyPair } from "./BodyFigure";
import { ExerciseRow } from "./Daily";
import { MuscleMap } from "./MuscleMap";
import { ORANGE, PeriodRings, StreakLine, useFail } from "./parts";

/** "4x5", "3 x 12", "3x20-30m" → the leading number of series. */
function seriesOf(prescription?: string): number {
  const m = /^\s*(\d+)\s*[x×]/i.exec(prescription ?? "");
  return m ? Number(m[1]) : 0;
}

export function Overview({ onVideo }: { onVideo?: (ex: Exercise) => void }) {
  const fail = useFail();
  const stats = useExercise((s) => s.stats);
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refreshStats = useExercise((s) => s.refreshStats);

  const today = todayIso();
  const meta = days.find((d) => d.key === weekdayKeyOf(today));
  const [day, setDay] = useState<ExerciseDay | null>(null);
  const [map, setMap] = useState(false);
  /** Dual shows both figures; the other two show one of them, bigger. */
  const [side, setSide] = useState<"dual" | "front" | "back">("dual");

  const load = () => api.exDays(today, today).then((d) => setDay(d[0] ?? null)).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);

  /** Today's routine with the asset's granular ids, so the figure can paint it. */
  const rows = useMemo<MuscleExercise[]>(
    () => (day?.exercises ?? []).flatMap((e) => {
      const ex = byId.get(e.id);
      if (!ex) return [];
      return [{
        id: e.id,
        name: ex.name,
        primary: expandMuscles(ex.muscles?.primary ?? []),
        secondary: expandMuscles(ex.muscles?.secondary ?? []),
        done: Boolean(day?.log[e.id]?.done),
      }];
    }),
    [day, byId],
  );
  const data = useMemo(() => muscleMapData(rows), [rows]);

  /** Today's muscles: main work first, the ones hit by more exercises ahead. */
  const focus = useMemo(() => {
    const rank = (state: string) => (state === "primary" ? 0 : state === "secondary" ? 2 : 1);
    return Object.entries(data.states)
      .filter(([, state]) => state !== "idle")
      .sort(([a, sa], [b, sb]) =>
        rank(sa) - rank(sb)
        || (data.byMuscle[b]?.length ?? 0) - (data.byMuscle[a]?.length ?? 0)
        || granularName(a).localeCompare(granularName(b)))
      .map(([id, state]) => ({ id, state }));
  }, [data]);
  const mainMuscles = focus.filter((f) => f.state !== "secondary");
  const groups = useMemo(
    () => [...new Set(mainMuscles.map((m) => granularGroup(m.id)).filter(Boolean))],
    [mainMuscles],
  );

  const done = day ? day.exercises.filter((e) => day.log[e.id]?.done).length : 0;
  const total = day?.exercises.length ?? 0;
  const series = (day?.exercises ?? []).reduce((sum, e) => sum + seriesOf(byId.get(e.id)?.series_reps), 0);
  const reload = () => { void load(); void refreshStats(); };

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

        {/* La sesión de hoy y, a la derecha, lo que trabaja. */}
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 360px" }}>
          <section className="rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <span className="text-[13.5px] font-semibold text-text">
                {meta ? `${meta.glyph} ${meta.name}` : "Hoy"}
              </span>
              {meta?.subtitle && <span className="text-[12px] text-faint">· {meta.subtitle}</span>}
              <span className="flex-1" />
              {total > 0 && (
                <span className="rounded-md px-2 py-0.5 font-mono text-[12px]"
                  style={{ background: `color-mix(in srgb, ${ORANGE} 18%, transparent)`, color: ORANGE }}>
                  {done}/{total}
                </span>
              )}
              {total > 0 && (
                <button type="button" onClick={() => setMap(true)} title="Mapa muscular del día"
                  className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
                  <MapIcon size={13} /> Mapa
                </button>
              )}
            </div>
            <div className="space-y-2 p-3">
              {!day || !day.exercises.length ? (
                <p className="py-8 text-center text-[13px] text-faint">
                  Día de descanso: hoy no hay ejercicios programados.
                </p>
              ) : (
                day.exercises.map((ex) => {
                  const full = byId.get(ex.id);
                  return full ? (
                    <ExerciseRow key={ex.id} day={today} ex={full} entry={day.log[ex.id] ?? {}}
                      onVideo={onVideo} onChanged={reload} />
                  ) : (
                    <div key={ex.id} className="rounded-lg border border-line px-3 py-2 text-[13px] text-dim">
                      {ex.name}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">Enfoque muscular</span>
              <span className="flex-1" />
              {groups.map((g) => (
                <span key={g} className="rounded-full border px-2 py-0.5 text-[10.5px]"
                  style={{ borderColor: `color-mix(in srgb, ${ORANGE} 45%, transparent)`, color: ORANGE }}>
                  {g}
                </span>
              ))}
            </div>

            <div className="border-b border-line px-3 py-2">
              <div className="mb-1 flex items-center gap-1">
                {([["dual", "Dual"], ["front", "Anterior"], ["back", "Posterior"]] as Array<["dual" | "front" | "back", string]>).map(([id, label]) => (
                  <button key={id} type="button" data-side={id} onClick={() => setSide(id)}
                    className={cn("rounded-md px-2 py-0.5 text-[11px]",
                      side === id ? "bg-hover text-text" : "text-faint hover:text-text")}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">Target</span>
                <span data-target className="text-[11.5px] font-semibold" style={{ color: ORANGE }}>
                  {mainMuscles.slice(0, 3).map((m) => granularName(m.id)).join(" & ") || "sin foco"}
                </span>
              </div>

              <div className="rounded-lg border border-line py-1" style={{ background: "var(--nv-card)" }}>
                {side === "dual" ? (
                  <BodyPair states={data.states} width={112} gap={6} />
                ) : (
                  <div className="flex justify-center">
                    <BodyFigure view={side} states={data.states} interactive={false}
                      width={190} strokeWidth={0.16} />
                  </div>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] uppercase tracking-[0.14em] text-faint">
                <span>{side === "front" ? "Vista anterior" : side === "back" ? "Vista posterior" : "Anterior + posterior"}</span>
                <span style={{ color: ORANGE }}>
                  {total > 0 && done === total ? "Sesión completa" : "Estímulo previsto"}
                </span>
              </div>
            </div>

            <div className="space-y-2 px-3 py-2">
              <div className="text-[11.5px] font-semibold text-text">Grupos principales activados</div>
              {!focus.length ? (
                <p className="text-[11.5px] text-faint">Hoy no hay músculos asignados a la rutina.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {focus.map((m) => (
                    <span key={m.id} data-focus={m.id}
                      className="rounded-md border px-1.5 py-0.5 text-[10.5px]"
                      style={m.state === "secondary"
                        ? { borderColor: "var(--nv-line)", color: "var(--nv-muscle-secondary-text)" }
                        : { borderColor: `color-mix(in srgb, ${ORANGE} 55%, transparent)`, color: "var(--nv-text)" }}>
                      {granularName(m.id)}
                      {m.state === "done" && <span className="ml-1" style={{ color: "var(--nv-muscle-done)" }}>✓</span>}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-line pt-2 text-[11.5px] text-dim">
                <span>Series totales prescritas</span>
                <span className="flex-1" />
                <span className="font-mono text-text">{series} series</span>
              </div>

              {data.unassigned.length > 0 && (
                <div data-unassigned-count className="rounded-md border px-2 py-1.5 text-[11.5px]"
                  style={{ borderColor: "var(--nv-warn)", color: "var(--nv-warn)" }}>
                  Sin músculos asignados: {data.unassigned.map((r) => r.name).join(", ")}. Asígnalos en
                  «Gestionar ejercicios» para que pinten en el mapa.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {map && (
        <MuscleMap
          date={today}
          day={day}
          onVideo={onVideo}
          onChanged={reload}
          onClose={() => setMap(false)}
        />
      )}
    </>
  );
}
