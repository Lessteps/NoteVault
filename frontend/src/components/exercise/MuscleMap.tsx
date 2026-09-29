/**
 * Muscle map · the modal.
 *
 * Reads the same state the daily checkboxes read (`ExerciseDay.log`), so a tick
 * anywhere turns the muscles lime → green without a reload: the modal is a view
 * over the day, never a second copy of it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { api } from "../../lib/bridge";
import type { Exercise, ExerciseDay, ExerciseOverview } from "../../lib/types";
import { addDays, weekStart } from "../../lib/habits";
import {
  MUSCLES, bestView, muscleById, muscleMapData, musclesOfExercise, type MuscleExercise,
} from "../../lib/muscles";
import { shortDate, todayIso } from "../../lib/tasks";
import { useExercise } from "../../store/exercise";
import { cn, IconButton } from "../ui";
import { MuscleBody } from "./MuscleBody";
import { useFail } from "./parts";

type Mode = "day" | "week" | "year";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "day", label: "Hoy", hint: "El día abierto" },
  { id: "week", label: "Semana", hint: "La semana del día abierto" },
  { id: "year", label: "Todo", hint: "Todo el año (solo lectura)" },
];

/** A row of the panel: the exercise plus when it can be ticked. */
interface Row extends MuscleExercise {
  /** The day this row belongs to; absent when ticking makes no sense (year). */
  when?: string;
}

export function MuscleMap({ date, day, onChanged, onClose, onVideo }: {
  /** The day the Exercise view is showing. */
  date: string;
  day: ExerciseDay | null;
  onChanged: () => void;
  onClose: () => void;
  onVideo?: (ex: Exercise) => void;
}) {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const [mode, setMode] = useState<Mode>("day");
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [week, setWeek] = useState<ExerciseDay[] | null>(null);
  const [year, setYear] = useState<ExerciseOverview | null>(null);

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);

  /** The exercises of the current mode, with when they were/are trained. */
  const rows = useMemo<Row[]>(() => {
    const build = (id: string, done: boolean, when: string): Row | null => {
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
    const rowsOut: Row[] = [];
    for (const block of year?.breakdown ?? []) {
      for (const r of block.rows) {
        const row = build(r.id, r.done > 0, "");
        if (row && !rowsOut.some((x) => x.id === row.id)) rowsOut.push(row);
      }
    }
    return rowsOut;
  }, [mode, day, date, week, year, byId]);

  const data = useMemo(() => muscleMapData(rows), [rows]);

  // The view with more active muscles for the day decides what opens first.
  const openSide = useMemo(() => bestView(muscleMapData(
    (day?.exercises ?? []).flatMap((e) => {
      const ex = byId.get(e.id);
      return ex ? [{ id: e.id, name: ex.name, primary: ex.muscles?.primary ?? [], secondary: ex.muscles?.secondary ?? [], done: Boolean(day?.log[e.id]?.done) }] : [];
    }),
  )), [day, byId]);

  useEffect(() => { setFlipped(openSide === "back"); }, [openSide]);

  useEffect(() => {
    if (mode !== "week") return;
    const from = weekStart(date);
    const to = addDays(from, 6);
    api.exDays(from, to).then(setWeek).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  useEffect(() => {
    if (mode !== "year") return;
    const y = Number(date.slice(0, 4));
    api.exOverview(Number.isFinite(y) ? y : 0, "").then(setYear).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const muscle = picked ? muscleById(picked) : undefined;
  const panelRows = useMemo<Row[]>(() => {
    // byMuscle carries the same rows, only regrouped.
    if (picked) return data.byMuscle[picked] ?? [];
    return rows;
  }, [picked, data, rows]);

  const [pinnedExercise, setPinnedExercise] = useState<string | null>(null);

  const highlight = useMemo(() => {
    if (pinned && picked) return new Set([picked]);
    const focused = rows.find((r) => r.id === pinnedExercise);
    return focused ? new Set(musclesOfExercise(focused)) : null;
  }, [pinned, picked, pinnedExercise, rows]);

  const toggle = useCallback(async (row: Row) => {
    if (!row.when) {
      fail(new Error("En «Todo» la marca es de solo lectura: ábrelo en el día o la semana."));
      return;
    }
    const entry = (mode === "day" ? day?.log[row.id] : week?.find((d) => d.date === row.when)?.log[row.id]) ?? {};
    try {
      await api.exMark(row.when, row.id, !row.done, entry.weight ?? 0, entry.reps ?? 0, entry.notes ?? "");
      onChanged();
      if (mode === "week") {
        api.exDays(weekStart(date), addDays(weekStart(date), 6)).then(setWeek).catch(fail);
      }
    } catch (e) {
      fail(e);
    }
  }, [mode, day, week, date, onChanged, fail]);

  const today = todayIso();
  const sideLabel = flipped ? "Posterior" : "Anterior";

  return (
    <div className="nv-fade fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onMouseDown={onClose}>
      <div role="dialog" aria-label="Mapa muscular" onMouseDown={(e) => e.stopPropagation()}
        className="nv-peek flex flex-col overflow-hidden rounded-xl border border-line-strong shadow-2xl"
        style={{ width: "min(940px, 94vw)", height: "min(88vh, 760px)", background: "var(--nv-elevated)" }}>

        <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
          <h2 className="text-[14px] font-semibold text-text">Mapa muscular</h2>
          <span className="text-[12px] text-faint">{mode === "day" ? shortDate(date) : mode === "week" ? `Semana del ${shortDate(weekStart(date))}` : `Año ${date.slice(0, 4)}`}</span>
          {date === today && <span className="rounded-md px-1.5 py-0.5 text-[10.5px]" style={{ background: "var(--nv-accent-soft)", color: "var(--nv-accent-text)" }}>hoy</span>}
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-line p-0.5">
              {MODES.map((m) => (
                <button key={m.id} type="button" title={m.hint} onClick={() => { setMode(m.id); setPicked(null); setPinnedExercise(null); }}
                  className={cn("rounded-md px-2 py-0.5 text-[12px]", mode === m.id ? "bg-hover text-text" : "text-dim hover:text-text")}>
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setFlipped((v) => !v)} title="Cambiar de vista (anterior / posterior)"
              className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text">
              <ArrowLeftRight size={13} /> {sideLabel}
            </button>
            <IconButton title="Cerrar" onClick={onClose}><X size={15} /></IconButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Cuerpo */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="nv-flip min-h-0 flex-1 px-4 py-3">
              <div className="nv-flip-inner" data-face={flipped ? "back" : "front"}>
                <div className="nv-flip-face">
                  <MuscleBody view="front" states={data.states} highlight={highlight} active={picked}
                    label={(id) => muscleById(id)?.name_es ?? id}
                    onMuscle={(id) => setPicked((p) => (p === id ? null : id))}
                    onHover={(id, at) => setTip(id && at ? { id, x: at.x, y: at.y } : null)} />
                </div>
                <div className="nv-flip-face nv-flip-face--back">
                  <MuscleBody view="back" states={data.states} highlight={highlight} active={picked}
                    label={(id) => muscleById(id)?.name_es ?? id}
                    onMuscle={(id) => setPicked((p) => (p === id ? null : id))}
                    onHover={(id, at) => setTip(id && at ? { id, x: at.x, y: at.y } : null)} />
                </div>
              </div>
            </div>
            <div className="flex h-9 flex-none items-center gap-3 border-t border-line px-4 text-[11.5px] text-faint">
              {([["idle", "sin entrenar"], ["primary", "principal"], ["secondary", "secundario"], ["done", "hecho"]] as Array<[string, string]>).map(([state, label]) => (
                <span key={state} className="flex items-center gap-1.5">
                  <span className={`nv-legend nv-legend--${state}`} />
                  {label}
                </span>
              ))}
              <span className="ml-auto">{MUSCLES.length} músculos · {rows.length} ejercicios</span>
            </div>
          </div>

          {/* Panel */}
          <div className="flex w-[300px] flex-none flex-col border-l border-line">
            <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
              <span className="text-[12px] font-semibold text-text">
                {muscle ? muscle.name_es : "Ejercicios"}
              </span>
              {muscle && <span className="text-[11px] text-faint">{muscle.group}</span>}
              <button type="button" onClick={() => { setPicked(null); setPinned(false); setPinnedExercise(null); }}
                className={cn("ml-auto text-[11px] text-faint hover:text-text", picked ? "" : "invisible")}>
                quitar filtro
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {!panelRows.length && (
                <p className="py-6 text-center text-[12px] text-faint">
                  {picked ? "Ningún ejercicio de este rango toca ese músculo." : "Sin ejercicios en este rango."}
                </p>
              )}
              {panelRows.map((row) => {
                const isPrimary = picked ? row.primary.includes(picked) : false;
                const isSecondary = picked ? row.secondary.includes(picked) : false;
                return (
                  <div key={row.id} data-exercise={row.id}
                    onMouseEnter={() => setPinnedExercise(row.id)}
                    onMouseLeave={() => setPinnedExercise(null)}
                    onMouseDown={() => { setPinnedExercise(row.id); setPinned(true); }}
                    className="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
                    <input type="checkbox" aria-label={`Hecho: ${row.name}`} checked={row.done}
                      onChange={() => void toggle(row)} style={{ accentColor: "var(--nv-muscle-done)", marginTop: 2 }} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[12.5px]", row.done ? "text-faint line-through" : "text-text")}>{row.name}</div>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-faint">
                        {!row.primary.length && !row.secondary.length && <span style={{ color: "var(--nv-warn)" }}>sin músculos</span>}
                        {isPrimary && <span style={{ color: "var(--nv-muscle-primary)" }}>principal</span>}
                        {isSecondary && <span style={{ color: "var(--nv-muscle-secondary-text)" }}>secundario</span>}
                        {!picked && row.primary.length > 0 && <span>{row.primary.length + row.secondary.length} músculos</span>}
                        {row.when && mode !== "day" && <span>· {shortDate(row.when)}</span>}
                      </div>
                    </div>
                    {onVideo && row.primary.length + row.secondary.length > 0 && byId.get(row.id)?.has_video && (
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
                    <div key={`u-${row.id}`} data-unassigned={row.id}
                      onMouseEnter={() => { setPinnedExercise(null); }}
                      className="rounded-md px-2 py-1 text-[12px] text-dim">
                      {row.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* El nombre del músculo bajo el puntero, sin robar el hover. */}
        {tip && (
          <div data-muscle-tip={tip.id}
            className="pointer-events-none fixed z-50 rounded-md border border-line-strong px-2 py-1 text-[11.5px] text-text shadow-lg"
            style={{ left: Math.min(tip.x + 14, window.innerWidth - 190), top: tip.y + 14, background: "var(--nv-elevated)" }}>
            {muscleById(tip.id)?.name_es ?? tip.id}
            <span className="ml-1.5 text-faint">{muscleById(tip.id)?.group}</span>
          </div>
        )}
      </div>
    </div>
  );
}
