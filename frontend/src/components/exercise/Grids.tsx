// Semanal y Mensual: un ejercicio por fila, los días del periodo en columnas y
// una casilla en cada celda que toca. Rellenar desde aquí es el punto: la
// rejilla marca el ejercicio en su día sin abrir nada.
//
// La vista Anual no marca nada a propósito (ver `Yearly.tsx`): un año entero de
// casillas activas es demasiado fácil de tocar sin querer.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../../lib/bridge";
import { addDays, daysBetween, monthBounds, weekStart } from "../../lib/habits";
import { appliesOn } from "../../lib/exercise";
import { MONTHS, shortDate, todayIso, WEEKDAYS } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import type { ExerciseDay } from "../../lib/types";
import type { MuscleExercise } from "../../lib/muscles";
import { cn } from "../ui";
import { Header, NavButtons } from "../habits/parts";
import { MuscleMini, muscleRows } from "./MuscleFocus";
import { ORANGE, useFail } from "./parts";

/** The square a cell gets, same idea as the habit check. */
function ExerciseCheck({ done, disabled, label, onToggle }: {
  done: boolean; disabled?: boolean; label: string; onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onToggle(!done)}
      className={cn(
        "grid h-[20px] w-[20px] place-items-center rounded-md border transition-colors",
        done ? "border-transparent text-white" : "border-line-strong hover:border-accent",
        disabled && "cursor-default opacity-30 hover:border-line-strong",
      )}
      style={{ background: done ? ORANGE : undefined }}
    >
      {done && <Check size={13} strokeWidth={3} />}
    </button>
  );
}

/** `focus` añade la fila del enfoque muscular: el cuerpo de cada día, en
 *  pequeño. La rejilla del mes no la lleva (31 columnas no caben). */
function Grid({ days, focus = false }: { days: string[]; focus?: boolean }) {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const days_ = useExercise((s) => s.days);
  const refreshStats = useExercise((s) => s.refreshStats);
  const [data, setData] = useState<Record<string, ExerciseDay>>({});
  const today = todayIso();
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const load = () =>
    api
      .exDays(first, last)
      .then((rows) => setData(Object.fromEntries(rows.map((d) => [d.date, d]))))
      .catch(fail);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, list.length]);

  const toggle = async (date: string, exerciseId: string, next: boolean) => {
    const entry = data[date]?.log[exerciseId];
    try {
      await api.exMark(date, exerciseId, next, entry?.weight ?? 0, entry?.reps ?? 0, entry?.notes ?? "");
      await load();
      void refreshStats();
    } catch (e) {
      fail(e);
    }
  };

  /** The exercises of the routine, grouped by weekday, in the week's order. */
  const grouped = useMemo(
    () => days_.map((d) => ({ day: d, exercises: list.filter((e) => e.day === d.key) })).filter((g) => g.exercises.length),
    [days_, list],
  );

  /** Lo que trabaja cada fecha del periodo, ya listo para el cuerpo pequeño. */
  const mini = useMemo(() => {
    const out: Record<string, MuscleExercise[]> = {};
    for (const d of days) out[d] = muscleRows(data[d] ?? null, list);
    return out;
  }, [days, data, list]);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-mono text-[10.5px] font-normal uppercase tracking-wider text-faint">
              Ejercicio
            </th>
            {days.map((d) => {
              const wd = WEEKDAYS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7];
              return (
                <th
                  key={d}
                  className={cn("px-0.5 py-2 text-center font-mono text-[10px] font-normal", d === today ? "text-accent-text" : "text-faint")}
                >
                  <div>{wd}</div>
                  <div className="text-[11px]">{Number(d.slice(8))}</div>
                </th>
              );
            })}
            <th className="px-3 font-mono text-[10.5px] font-normal text-faint">%</th>
          </tr>
        </thead>
        {focus && (
          <tbody>
            {/* Qué se trabaja cada día de la semana, de un vistazo. */}
            <tr className="border-b border-line bg-elevated/20">
              <td className="sticky left-0 z-10 bg-card px-4 py-1.5">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Enfoque muscular</span>
              </td>
              {days.map((d) => (
                <td key={d} className={cn("px-0.5 py-1.5 align-middle", d === today && "bg-accent-soft/40")}>
                  <MuscleMini date={d} rows={mini[d] ?? []} width={34} />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        )}
        <tbody>
          {grouped.map((group) => (
            <Fragment key={group.day.key}>
              <tr className="border-b border-line bg-elevated/40">
                <td colSpan={days.length + 2} className="px-4 py-1 text-[11px] font-semibold" style={{ color: ORANGE }}>
                  {group.day.glyph} {group.day.name}
                  <span className="ml-2 font-normal text-faint">{group.day.subtitle}</span>
                </td>
              </tr>
              {group.exercises.map((ex) => {
                let active = 0;
                let done = 0;
                return (
                  <tr key={ex.id} className="border-b border-line last:border-b-0">
                    <td className="sticky left-0 z-10 max-w-[240px] truncate bg-card px-4 py-1.5 text-text">{ex.name}</td>
                    {days.map((d) => {
                      const due = appliesOn(ex.day, d);
                      const isDone = Boolean(data[d]?.log[ex.id]?.done);
                      if (due && d <= today) {
                        active += 1;
                        if (isDone) done += 1;
                      }
                      return (
                        <td key={d} className={cn("py-1", d === today && "bg-accent-soft/40")}>
                          <div className="flex justify-center">
                            {due ? (
                              <ExerciseCheck
                                done={isDone}
                                disabled={d > today}
                                label={`${ex.name} · ${shortDate(d)}`}
                                onToggle={(next) => void toggle(d, ex.id, next)}
                              />
                            ) : (
                              <span className="grid h-[20px] w-[20px] place-items-center text-[11px] text-faint/40">·</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 text-right font-mono text-[11px] text-dim">
                      {active ? `${Math.round((done / active) * 100)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line">
            <td className="sticky left-0 z-10 bg-card px-4 py-1.5 text-[11px] text-faint">Hechos</td>
            {days.map((d) => {
              const day = data[d];
              const total = day?.exercises.length ?? 0;
              const dn = day ? day.exercises.filter((e) => day.log[e.id]?.done).length : 0;
              return (
                <td key={d} className="px-0.5 py-1.5 text-center font-mono text-[10.5px] text-faint">
                  {d > today ? "" : total ? `${dn}/${total}` : "—"}
                </td>
              );
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ExerciseWeek() {
  const [start, setStart] = useState(() => weekStart(todayIso()));
  const days = useMemo(() => daysBetween(start, addDays(start, 6)), [start]);
  return (
    <>
      <Header title="Semanal">
        <span className="mr-2 text-[11.5px] text-faint">Marca los ejercicios directamente en la rejilla</span>
        <NavButtons
          label={`${shortDate(days[0]!)} – ${shortDate(days[6]!)}`}
          onPrev={() => setStart(addDays(start, -7))}
          onNext={() => setStart(addDays(start, 7))}
          onToday={() => setStart(weekStart(todayIso()))}
        />
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Grid days={days} focus />
      </div>
    </>
  );
}

export function ExerciseMonth() {
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [first, last] = monthBounds(ym[0], ym[1]);
  const days = useMemo(() => daysBetween(first, last), [first, last]);
  const shift = (n: number) => {
    const d = new Date(ym[0], ym[1] + n, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  };
  return (
    <>
      <Header title="Mensual">
        <span className="mr-2 text-[11.5px] text-faint">Marca los ejercicios directamente en la rejilla</span>
        <NavButtons
          label={`${MONTHS[ym[1]]} ${ym[0]}`}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={() => setYm([now.getFullYear(), now.getMonth()])}
        />
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Grid days={days} />
      </div>
    </>
  );
}
