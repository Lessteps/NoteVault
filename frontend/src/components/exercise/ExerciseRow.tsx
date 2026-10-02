// Una fila de ejercicio en la sesión: casilla, peso, reps y notas.
//
// Vive en su propio fichero porque lo usan Vista general y Diaria, y porque
// `ExerciseRow.test.tsx` lo prueba sin levantar el módulo entero.

import { useEffect, useRef, useState } from "react";
import type { Exercise } from "../../lib/types";
import { inputBase } from "../common/forms";
import { cn } from "../ui";
import { ORANGE, useFail } from "./parts";
import { api } from "../../lib/bridge";
import { todayIso } from "../../lib/tasks";

/** One exercise row: tick, weight, reps, notes (saved on change / blur). */
export function ExerciseRow({ day, ex, entry, onChanged, onVideo }: {
  day: string; ex: Exercise; entry: { done?: boolean; weight?: number; reps?: number; notes?: string };
  onChanged: () => void; onVideo?: (ex: Exercise) => void;
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
  const hasVideo = Boolean(onVideo) && (ex.has_video || Boolean(ex.video_path));
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label={`Hecho: ${ex.name}`} checked={done} disabled={future} style={{ accentColor: ORANGE }}
          onChange={(e) => { setDone(e.target.checked); void save({ done: e.target.checked }); }} />
        {/* El nombre es el control del video: si tiene, se pulsa aquí. Antes
            había además un botón «▶ Video» al final de la fila con la misma
            acción, y se veían dos controles separados por los campos. */}
        {hasVideo ? (
          <button
            type="button"
            onClick={() => onVideo?.(ex)}
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
        {ex.rest && <span className="text-[11px] text-faint">⏱ {ex.rest}</span>}
        <input className={small} placeholder="kg" aria-label={`Peso: ${ex.name}`} value={weight} disabled={future}
          onChange={(e) => { setWeight(e.target.value); change({ weight: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <input className={small} placeholder="reps" aria-label={`Reps: ${ex.name}`} value={reps} disabled={future}
          onChange={(e) => { setReps(e.target.value); change({ reps: e.target.value }); }} onBlur={() => void save()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        {/* Sin caja de notas a propósito. El dato existe en el modelo, el
            backend lo guarda y esta fila lo envía, pero **nadie ha pedido poder
            escribirlo** y el input ocupaba 176 px en la fila que más se usa.
            Antes vivía detrás de `compact`, que nadie activaba, así que
            nunca se vio. Ponerlo son tres líneas si algún día hace falta. */}
      </div>
      {ex.how_to && <p className="mt-1.5 pl-7 text-[12px] leading-relaxed text-faint">{ex.how_to}</p>}
    </div>
  );
}
