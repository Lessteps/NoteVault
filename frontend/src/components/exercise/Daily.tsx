// Diaria: la rutina de una fecha, con peso, reps y notas por ejercicio — y al
// lado el enfoque muscular de esa misma fecha: el cuerpo con las zonas que
// trabaja, y al pasar el puntero por un músculo, el ejercicio que lo entrena.
//
// El cuerpo se sincroniza solo: relee el día cada vez que se marca algo.

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { api } from "../../lib/bridge";
import { addDays } from "../../lib/habits";
import { shortDate, todayIso } from "../../lib/tasks";
import { weekdayKeyOf } from "../../lib/exercise";
import { useExercise } from "../../store/exercise";
import type { Exercise, ExerciseDay } from "../../lib/types";
import { inputBase, GhostButton } from "../common/forms";
import { NavButtons } from "../habits/parts";
import { cn } from "../ui";
import { MuscleFocusCard, muscleRows } from "./MuscleFocus";
import { MuscleMap } from "./MuscleMap";
import { ORANGE, seriesOf, useFail } from "./parts";

/** One exercise row: tick, weight, reps, notes (saved on change / blur). */
export function ExerciseRow({ day, ex, entry, onChanged, onVideo, compact }: {
  day: string; ex: Exercise; entry: { done?: boolean; weight?: number; reps?: number; notes?: string };
  onChanged: () => void; onVideo?: (ex: Exercise) => void; compact?: boolean;
}) {
  const fail = useFail();
  const [done, setDone] = useState(Boolean(entry.done));
  const [weight, setWeight] = useState(entry.weight ? String(entry.weight) : "");
  const [reps, setReps] = useState(entry.reps ? String(entry.reps) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  // The latest values, read by every save: a blur and a click can fire two
  // saves before React re-renders, and the second must not send stale fields.
  const latest = useRef({ done, weight, reps, notes });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const future = day > todayIso();
  useEffect(() => {
    const v = { done: Boolean(entry.done), weight: entry.weight ? String(entry.weight) : "", reps: entry.reps ? String(entry.reps) : "", notes: entry.notes ?? "" };
    latest.current = v;
    setDone(v.done);
    setWeight(v.weight);
    setReps(v.reps);
    setNotes(v.notes);
    // Only when another day or exercise is shown: after that the row owns its
    // values, so a reload after a save never wipes what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, ex.id]);
  const change = (patch: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...patch };
  };
  const save = (patch: Partial<typeof latest.current> = {}) => {
    change(patch);
    // One write at a time, in order.
    queue.current = queue.current.then(async () => {
      const v = latest.current;
      try {
        await api.exMark(day, ex.id, v.done, v.weight || 0, v.reps || 0, v.notes);
        onChanged();
      } catch (e) {
        fail(e);
      }
    });
    return queue.current;
  };
  const small = cn(inputBase, "w-16 py-1 text-right text-[12px]");
  return (
    <div className={cn("rounded-2xl border border-line bg-card px-3", compact ? "py-1.5" : "py-2.5")}>
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label={`Hecho: ${ex.name}`} checked={done} disabled={future} style={{ accentColor: ORANGE }}
          onChange={(e) => { setDone(e.target.checked); void save({ done: e.target.checked }); }} />
        {onVideo && (ex.has_video || Boolean(ex.video_path)) ? (
          <button
            type="button"
            onClick={() => onVideo(ex)}
            title={`Ver video: ${ex.name}`}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate text-left text-[13px] hover:underline",
              done ? "text-faint line-through" : "text-text hover:text-accent-text"
            )}
          >
            <span>{ex.name}</span>
            <span className="flex-none text-[11px] text-amber-400">▶</span>
          </button>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", done ? "text-faint line-through" : "text-text")}>{ex.name}</span>
        )}
        {ex.series_reps && <span className="text-[11.5px] text-dim">{ex.series_reps}</span>}
        {!compact && ex.rest && <span className="text-[11px] text-faint">⏱ {ex.rest}</span>}
        <input className={small} placeholder="kg" aria-label={`Peso: ${ex.name}`} value={weight} disabled={future}
          onChange={(e) => { setWeight(e.target.value); change({ weight: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <input className={small} placeholder="reps" aria-label={`Reps: ${ex.name}`} value={reps} disabled={future}
          onChange={(e) => { setReps(e.target.value); change({ reps: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        {compact && (
          <input className={cn(inputBase, "w-44 py-1 text-[12px]")} placeholder="Notas" value={notes} disabled={future}
            onChange={(e) => { setNotes(e.target.value); change({ notes: e.target.value }); }} onBlur={() => void save()} />
        )}
        {onVideo && (ex.has_video || Boolean(ex.video_path)) && <GhostButton onClick={() => onVideo(ex)} className="py-1">▶ Video</GhostButton>}
      </div>
      {!compact && ex.how_to && <p className="mt-1.5 pl-7 text-[12px] leading-relaxed text-faint">{ex.how_to}</p>}
    </div>
  );
}

/** The rows of one date; `compact` is for the week accordion. */
export function DayList({ date, day, onVideo, onChanged, compact }: {
  date: string;
  day: ExerciseDay | null;
  onVideo: (ex: Exercise) => void;
  onChanged: () => void;
  compact?: boolean;
}) {
  if (!day || !day.exercises.length) {
    return <p className="py-10 text-center text-[13px] text-faint">Día de descanso: no hay ejercicios. Añádelos en «Gestionar ejercicios».</p>;
  }
  return (
    <div className="space-y-2">
      {day.exercises.map((ex) => (
        <ExerciseRow key={ex.id} day={date} ex={ex} entry={day.log[ex.id] ?? {}} onChanged={onChanged} onVideo={onVideo} compact={compact} />
      ))}
    </div>
  );
}

export function Daily({ onVideo }: { onVideo: (ex: Exercise) => void }) {
  const fail = useFail();
  const days = useExercise((s) => s.days);
  const list = useExercise((s) => s.list);
  const refreshStats = useExercise((s) => s.refreshStats);
  const [date, setDate] = useState(() => todayIso());
  const [day, setDay] = useState<ExerciseDay | null>(null);
  const [map, setMap] = useState(false);
  const key = weekdayKeyOf(date);
  const meta = days.find((d) => d.key === key);

  const load = () => api.exDays(date, date).then((d) => setDay(d[0] ?? null)).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  /** La fecha abierta, con los identificadores que pinta el cuerpo. */
  const rows = useMemo(() => muscleRows(day, list), [day, list]);
  const series = (day?.exercises ?? []).reduce((sum, e) => sum + seriesOf(byId.get(e.id)?.series_reps), 0);

  const done = day ? day.exercises.filter((e) => day.log[e.id]?.done).length : 0;
  const isToday = date === todayIso();

  return (
    <>
      <div className="flex h-12 flex-none items-center gap-3 border-b border-line px-6">
        <h1 className="text-[15px] font-semibold text-text">
          {meta ? `${meta.glyph} ${meta.name}` : "Diaria"}
        </h1>
        {meta && <span className="text-[12px] text-faint">{meta.subtitle}</span>}
        <div className="ml-auto flex items-center gap-2">
          {day && day.exercises.length > 0 && (
            <span className="rounded-full px-2.5 py-0.5 font-mono text-[12px]" style={{ background: `color-mix(in srgb, ${ORANGE} 18%, transparent)`, color: ORANGE }}>
              {done}/{day.exercises.length}
            </span>
          )}
          <button type="button" onClick={() => setMap(true)} title="Mapa muscular del día"
            className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
            <MapIcon size={13} /> Mapa
          </button>
          <NavButtons
            label={`${shortDate(date)}${isToday ? " · hoy" : ""}`}
            onPrev={() => setDate(addDays(date, -1))}
            onNext={() => setDate(addDays(date, 1))}
            onToday={() => setDate(todayIso())}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {/* Los ejercicios y, al lado, lo que se trabaja con ellos. */}
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 372px" }}>
          <DayList
            date={date}
            day={day}
            onVideo={onVideo}
            onChanged={() => {
              void load();
              void refreshStats();
            }}
          />
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
          onChanged={() => { void load(); void refreshStats(); }}
          onClose={() => setMap(false)}
        />
      )}
    </>
  );
}
