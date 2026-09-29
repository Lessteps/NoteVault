/**
 * Piezas compartidas del mapa muscular: el modal del día y la cara del panel
 * derecho usan exactamente la misma lógica y la misma lista, para que no haya
 * dos verdades sobre qué músculo está entrenado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import type { Exercise, ExerciseDay, ExerciseOverview } from "../../lib/types";
import { addDays, weekStart } from "../../lib/habits";
import { bestView, muscleMapData, type MuscleExercise } from "../../lib/muscles";
import { shortDate } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import { cn } from "../ui";
import { useFail } from "./parts";

export type Mode = "day" | "week" | "year";

export const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "day", label: "Hoy", hint: "El día abierto" },
  { id: "week", label: "Semana", hint: "La semana del día abierto" },
  { id: "year", label: "Todo", hint: "Todo el año (solo lectura)" },
];

/** Una fila del panel: el ejercicio y el día al que pertenece, si se puede marcar. */
export interface Row extends MuscleExercise {
  when?: string;
}

export function modeLabel(mode: Mode, date: string): string {
  if (mode === "day") return shortDate(date);
  if (mode === "week") return `Semana del ${shortDate(weekStart(date))}`;
  return `Año ${date.slice(0, 4)}`;
}

/** Los ejercicios del rango abierto, con sus músculos y su estado. */
export function useMuscleRows(mode: Mode, date: string, day: ExerciseDay | null) {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const [week, setWeek] = useState<ExerciseDay[] | null>(null);
  const [year, setYear] = useState<ExerciseOverview | null>(null);

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);

  const reloadWeek = useCallback(() => {
    const from = weekStart(date);
    api.exDays(from, addDays(from, 6)).then(setWeek).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (mode === "week") reloadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  useEffect(() => {
    if (mode !== "year") return;
    const y = Number(date.slice(0, 4));
    api.exOverview(Number.isFinite(y) ? y : 0, "").then(setYear).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  const rows = useMemo<Row[]>(() => {
    const build = (id: string, done: boolean, when?: string): Row | null => {
      const ex = byId.get(id);
      if (!ex) return null;
      return { id, name: ex.name, primary: ex.muscles?.primary ?? [], secondary: ex.muscles?.secondary ?? [], done, when };
    };
    if (mode === "day") {
      return (day?.exercises ?? []).flatMap((e) => {
        const r = build(e.id, Boolean(day?.log[e.id]?.done), date);
        return r ? [r] : [];
      });
    }
    if (mode === "week") {
      const out = new Map<string, Row>();
      for (const d of week ?? []) {
        for (const e of d.exercises) {
          const done = Boolean(d.log[e.id]?.done);
          const prev = out.get(e.id);
          if (prev) {
            if (done && !prev.done) out.set(e.id, { ...prev, done: true, when: d.date });
            continue;
          }
          const r = build(e.id, done, d.date);
          if (r) out.set(e.id, r);
        }
      }
      return [...out.values()];
    }
    const out: Row[] = [];
    for (const block of year?.breakdown ?? []) {
      for (const r of block.rows) {
        const row = build(r.id, r.done > 0);
        if (row && !out.some((x) => x.id === row.id)) out.push(row);
      }
    }
    return out;
  }, [mode, day, date, week, year, byId]);

  const data = useMemo(() => muscleMapData(rows), [rows]);

  /** La cara con más músculos activos **del día** decide qué se abre primero. */
  const openSide = useMemo(() => bestView(muscleMapData((day?.exercises ?? []).flatMap((e) => {
    const ex = byId.get(e.id);
    if (!ex) return [];
    return [{
      id: e.id, name: ex.name, primary: ex.muscles?.primary ?? [], secondary: ex.muscles?.secondary ?? [],
      done: Boolean(day?.log[e.id]?.done),
    }];
  }))), [day, byId]);

  const toggle = useCallback(async (row: Row) => {
    if (!row.when) throw new Error("En «Todo» la marca es de solo lectura: ábrelo en el día o la semana.");
    const entry = (mode === "day" ? day?.log[row.id] : week?.find((d) => d.date === row.when)?.log[row.id]) ?? {};
    await api.exMark(row.when, row.id, !row.done, entry.weight ?? 0, entry.reps ?? 0, entry.notes ?? "");
    if (mode === "week") reloadWeek();
  }, [mode, day, week, reloadWeek]);

  return { rows, data, openSide, byId, toggle };
}

export function MuscleLegend({ count }: { count?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {([["idle", "sin entrenar"], ["primary", "principal"], ["secondary", "secundario"], ["done", "hecho"]] as Array<[string, string]>).map(([state, label]) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className={`nv-legend nv-legend--${state}`} />
          {label}
        </span>
      ))}
      {count !== undefined && <span className="ml-auto">{count} ejercicios</span>}
    </span>
  );
}

/** La lista de ejercicios (con la sección de sin asignar) que comparten modal y panel. */
export function MuscleRows({ rows, data, picked, mode, toggle, onHover, onPin, onVideo, byId }: {
  rows: Row[];
  /** El músculo elegido: la lista se limita a sus ejercicios. */
  picked: string | null;
  data: ReturnType<typeof muscleMapData>;
  mode: Mode;
  toggle: (row: Row) => Promise<void>;
  onHover: (id: string | null) => void;
  onPin: (id: string | null) => void;
  onVideo?: (ex: Exercise) => void;
  byId: Map<string, Exercise>;
}) {
  const fail = useFail();
  const list: Row[] = picked ? data.byMuscle[picked] ?? [] : rows;
  const empty = !list.length;
  return (
    <>
      {empty && (
        <p className="py-6 text-center text-[12px] text-faint">
          {picked ? "Ningún ejercicio de este rango toca ese músculo." : "Sin ejercicios en este rango."}
        </p>
      )}
      {list.map((row) => {
        const isPrimary = picked ? row.primary.includes(picked) : false;
        const isSecondary = picked ? row.secondary.includes(picked) : false;
        return (
          <div key={row.id} data-exercise={row.id}
            onMouseEnter={() => onHover(row.id)}
            onMouseLeave={() => onHover(null)}
            onMouseDown={() => onPin(row.id)}
            className="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
            <input type="checkbox" aria-label={`Hecho: ${row.name}`} checked={row.done}
              onChange={() => void toggle(row).catch(fail)}
              style={{ accentColor: "var(--nv-muscle-done)", marginTop: 2 }} />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[12.5px]", row.done ? "text-faint line-through" : "text-text")}>{row.name}</div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-faint">
                {!row.primary.length && !row.secondary.length && <span style={{ color: "var(--nv-warn)" }}>sin músculos</span>}
                {isPrimary && <span style={{ color: "var(--nv-muscle-primary)" }}>principal</span>}
                {isSecondary && <span style={{ color: "var(--nv-muscle-secondary-text)" }}>secundario</span>}
                {!picked && (row.primary.length + row.secondary.length) > 0 && <span>{row.primary.length + row.secondary.length} músculos</span>}
                {row.when && mode !== "day" && <span>· {shortDate(row.when)}</span>}
              </div>
            </div>
            {onVideo && byId.get(row.id)?.has_video && (
              <button type="button" title="Ver video" onClick={() => { const ex = byId.get(row.id); if (ex) onVideo(ex); }}
                className="text-[11px] text-faint hover:text-text">▷</button>
            )}
          </div>
        );
      })}

      {data.unassigned.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-[11.5px] font-semibold" style={{ color: "var(--nv-warn)" }}>
              Sin asignar · {data.unassigned.length}
            </span>
          </div>
          <p className="px-2 pb-1 text-[11px] text-faint">
            Estos ejercicios no tienen músculos, así que no pintan nada en el mapa. Asígnalos en «Gestionar ejercicios».
          </p>
          {data.unassigned.map((row) => (
            <div key={`u-${row.id}`} data-unassigned={row.id} className="rounded-md px-2 py-1 text-[12px] text-dim">
              {row.name}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
