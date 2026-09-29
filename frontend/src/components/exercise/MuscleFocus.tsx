/**
 * Enfoque muscular · las piezas que comparten las vistas del módulo.
 *
 * Una sola regla: pasar el puntero por un músculo dice cómo se llama y qué
 * ejercicio de la rutina lo trabaja (el principal primero) — y lo mismo al
 * revés, pasando el puntero por la pastilla del músculo.
 *
 * Y una sola estética: círculos. El cuerpo va sobre un halo en vez de dentro de
 * una caja, los grupos son pastillas redondas, la leyenda son puntos y el
 * recuento de series es un anillo. Nada de rejillas de rectángulos.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { Exercise, ExerciseDay } from "../../lib/types";
import {
  expandMuscles, granularGroup, granularName, muscleMapData,
  type MuscleExercise, type MuscleMapData, type MuscleState,
} from "../../lib/muscles";
import { cn } from "../ui";
import { BodyFigure, BodyPair } from "./BodyFigure";
import { ORANGE } from "./parts";

/** Las filas de un día, con los identificadores que pinta el cuerpo. */
export function muscleRows(day: ExerciseDay | null | undefined, list: Exercise[]): MuscleExercise[] {
  const byId = new Map(list.map((e) => [e.id, e]));
  return (day?.exercises ?? []).flatMap((e) => {
    const ex = byId.get(e.id);
    if (!ex) return [];
    return [{
      id: e.id,
      name: ex.name,
      primary: expandMuscles(ex.muscles?.primary ?? []),
      secondary: expandMuscles(ex.muscles?.secondary ?? []),
      done: Boolean(day?.log[e.id]?.done),
    }];
  });
}

/** Los músculos con trabajo, el principal primero y los más repetidos arriba. */
export function focusMuscles(data: MuscleMapData): Array<{ id: string; state: MuscleState }> {
  const rank = (state: string) => (state === "primary" ? 0 : state === "secondary" ? 2 : 1);
  return Object.entries(data.states)
    .filter(([, state]) => state !== "idle")
    .sort(([a, sa], [b, sb]) =>
      rank(sa) - rank(sb)
      || (data.byMuscle[b]?.length ?? 0) - (data.byMuscle[a]?.length ?? 0)
      || granularName(a).localeCompare(granularName(b)))
    .map(([id, state]) => ({ id, state }));
}

/** El color de un músculo, allí donde no llega una clase (puntos y pastillas). */
export function stateColour(state: MuscleState): string {
  if (state === "primary") return ORANGE;
  if (state === "done") return "var(--nv-muscle-done)";
  if (state === "secondary") return "var(--nv-muscle-secondary)";
  return "var(--nv-muscle-idle)";
}

export interface MuscleTip {
  id: string;
  x: number;
  y: number;
  /** Los ejercicios que lo trabajan en el rango que se está mirando. */
  exercises: MuscleExercise[];
}

/** El músculo bajo el puntero y su posición: lo que pinta `MuscleTipCard`. */
export function useMuscleTip(data: MuscleMapData) {
  const [tip, setTip] = useState<MuscleTip | null>(null);
  const onHover = (id: string | null, at?: { x: number; y: number }) =>
    setTip(id && at ? { id, x: at.x, y: at.y, exercises: data.byMuscle[id] ?? [] } : null);
  return { tip, onHover, clear: () => setTip(null) };
}

/** La tarjeta que sigue al puntero: el músculo, su grupo y sus ejercicios. */
export function MuscleTipCard({ tip }: { tip: MuscleTip | null }) {
  if (!tip) return null;
  return (
    <div
      data-muscle-tip={tip.id}
      className="pointer-events-none fixed z-50 w-[224px] rounded-2xl border border-line-strong px-2.5 py-2 shadow-2xl"
      style={{
        left: Math.min(tip.x + 14, Math.max(8, window.innerWidth - 240)),
        top: Math.min(tip.y + 14, Math.max(8, window.innerHeight - 150)),
        background: "var(--nv-elevated)",
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="h-2 w-2 flex-none self-center rounded-full" style={{ background: ORANGE }} />
        <span className="truncate text-[12px] font-semibold text-text">{granularName(tip.id)}</span>
        <span className="ml-auto flex-none text-[9.5px] uppercase tracking-[0.12em] text-faint">
          {granularGroup(tip.id)}
        </span>
      </div>
      {tip.exercises.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {tip.exercises.slice(0, 4).map((e) => (
            <li key={e.id} data-tip-exercise={e.id} className="flex items-center gap-1.5 text-[11.5px]">
              <span
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: e.done ? "var(--nv-muscle-done)" : stateColour(e.primary.includes(tip.id) ? "primary" : "secondary") }}
              />
              <span className={cn("truncate", e.done ? "text-faint line-through" : "text-dim")}>{e.name}</span>
              <span className="ml-auto flex-none text-[10px] text-faint">
                {e.primary.includes(tip.id) ? "principal" : "secundario"}
              </span>
            </li>
          ))}
          {tip.exercises.length > 4 && <li className="text-[10.5px] text-faint">y {tip.exercises.length - 4} más</li>}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-faint">Ningún ejercicio de la rutina lo trabaja.</p>
      )}
    </div>
  );
}

const SIDES: Array<["dual" | "front" | "back", string]> = [
  ["dual", "Dual"], ["front", "Anterior"], ["back", "Posterior"],
];

const LEGEND: Array<[MuscleState, string]> = [
  ["idle", "sin trabajar"], ["primary", "principal"], ["secondary", "secundario"], ["done", "hecho"],
];

/**
 * La tarjeta de enfoque muscular: lo que trabaja un día, con el cuerpo en el
 * centro. La usan la vista general, la diaria y el panel derecho.
 */
export function MuscleFocusCard({ rows, series, size = "card", footer, className }: {
  rows: MuscleExercise[];
  /** Series prescritas del día: sin número no se pinta el anillo. */
  series?: number;
  /** `panel` es el ancho estrecho del panel derecho. */
  size?: "card" | "panel";
  /** Lo que cada vista quiera añadir al pie. */
  footer?: ReactNode;
  className?: string;
}) {
  const data = useMemo(() => muscleMapData(rows), [rows]);
  const { tip, onHover } = useMuscleTip(data);
  const [side, setSide] = useState<"dual" | "front" | "back">("dual");
  /** El músculo con el puntero encima, y el que se dejó fijado con un clic. */
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const focus = useMemo(() => focusMuscles(data), [data]);
  const main = focus.filter((f) => f.state !== "secondary");
  const groups = useMemo(
    () => [...new Set(main.map((m) => granularGroup(m.id)).filter(Boolean))],
    [main],
  );
  const marked = picked ?? hovered;
  const highlight = marked ? new Set([marked]) : null;
  const done = rows.filter((r) => r.done).length;

  const figure = {
    states: data.states,
    highlight,
    active: marked,
    /* El cuerpo de la tarjeta sí escucha al puntero: ahí está la gracia. */
    interactive: true,
    onMuscle: (id: string) => setPicked((p) => (p === id ? null : id)),
    /* Pasar el puntero ilumina el músculo y apaga el resto, como las pastillas. */
    onHover: (id: string | null, at?: { x: number; y: number }) => {
      setHovered(id);
      onHover(id, at);
    },
  };
  const dual = size === "panel" ? 86 : 112;
  const single = size === "panel" ? 156 : 190;

  return (
    <div data-muscle-focus className={cn(size === "panel" ? "px-3 py-3" : "p-3", className)}>
      {/* Rótulo y los grupos que se trabajan, en pastillas. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">Enfoque muscular</span>
        <span className="flex-1" />
        {groups.map((g) => (
          <span
            key={g}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]"
            style={{
              color: ORANGE,
              background: `color-mix(in srgb, ${ORANGE} 12%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 32%, transparent)`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ORANGE }} />
            {g}
          </span>
        ))}
      </div>

      {/* Las vistas, tres botones redondos. */}
      <div className="mt-2 flex items-center gap-1.5">
        {SIDES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-side={id}
            onClick={() => setSide(id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
              side === id ? "text-text" : "text-faint hover:text-text",
            )}
            style={side === id
              ? {
                background: `color-mix(in srgb, ${ORANGE} 15%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 34%, transparent)`,
              }
              : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">Target</span>
        <span data-target className="text-[11.5px] font-semibold" style={{ color: ORANGE }}>
          {main.slice(0, 3).map((m) => granularName(m.id)).join(" & ") || "sin foco"}
        </span>
      </div>

      {/* El cuerpo sobre un halo, sin caja: es el protagonista, no un dato. */}
      <div
        className="mt-1 px-2 pt-1"
        style={{
          background: "radial-gradient(118% 74% at 50% 40%, color-mix(in srgb, var(--nv-muscle-primary) 12%, transparent), transparent 72%)",
        }}
      >
        {side === "dual" ? (
          <BodyPair width={dual} gap={6} caption={false} {...figure} />
        ) : (
          <div className="flex justify-center">
            <BodyFigure view={side} width={single} strokeWidth={0.16} {...figure} />
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] uppercase tracking-[0.14em] text-faint">
        <span>{side === "front" ? "Vista anterior" : side === "back" ? "Vista posterior" : "Anterior + posterior"}</span>
        <span style={{ color: ORANGE }}>
          {rows.length > 0 && done === rows.length ? "Sesión completa" : "Estímulo previsto"}
        </span>
      </div>

      {/* Los músculos del día: pastillas redondas con su punto de color. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {focus.map((m) => (
          <span
            key={m.id}
            data-focus={m.id}
            data-state={m.state}
            onMouseEnter={(e) => {
              setHovered(m.id);
              onHover(m.id, { x: e.clientX, y: e.clientY });
            }}
            onMouseLeave={() => {
              setHovered((h) => (h === m.id ? null : h));
              onHover(null);
            }}
            onClick={() => setPicked((p) => (p === m.id ? null : m.id))}
            title={`${granularName(m.id)} · ${(data.byMuscle[m.id] ?? []).map((e) => e.name).join(", ")}`}
            className={cn(
              "flex cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
              marked === m.id ? "text-text" : "text-dim",
            )}
            style={{
              borderColor: marked === m.id
                ? `color-mix(in srgb, ${stateColour(m.state)} 70%, transparent)`
                : "var(--nv-line)",
              background: marked === m.id
                ? `color-mix(in srgb, ${stateColour(m.state)} 14%, transparent)`
                : "transparent",
            }}
          >
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: stateColour(m.state) }} />
            {granularName(m.id)}
            {m.state === "done" && <Check size={10} strokeWidth={3} style={{ color: "var(--nv-muscle-done)" }} />}
          </span>
        ))}
        {!focus.length && (
          <p className="text-[11.5px] text-faint">La rutina de este día no tiene músculos asignados.</p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[10px] uppercase tracking-[0.1em] text-faint">
        {LEGEND.map(([state, label]) => (
          <span key={state} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: stateColour(state) }} />
            {label}
          </span>
        ))}
      </div>

      {(series !== undefined || footer) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2 text-[11.5px] text-dim">
          {series !== undefined && (
            <>
              <span
                className="grid h-7 w-7 flex-none place-items-center rounded-full font-mono text-[11px]"
                style={{
                  color: ORANGE,
                  background: `color-mix(in srgb, ${ORANGE} 14%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ORANGE} 32%, transparent)`,
                }}
              >
                {series}
              </span>
              <span>series prescritas</span>
            </>
          )}
          <span className="flex-1" />
          {footer}
        </div>
      )}

      {data.unassigned.length > 0 && (
        <div
          data-unassigned-count
          className="mt-2 rounded-2xl px-3 py-1.5 text-[11px]"
          style={{ background: "var(--nv-warn-soft)", color: "var(--nv-warn)" }}
        >
          Sin músculos asignados: {data.unassigned.map((r) => r.name).join(", ")}. Asígnalos en
          «Gestionar ejercicios» para que pinten en el mapa.
        </div>
      )}

      <MuscleTipCard tip={tip} />
    </div>
  );
}

/**
 * El cuerpo en pequeño, para la fila de enfoque de la semana: un día, un par de
 * figuras. Donde no cabe una lista de nombres, el color del músculo lo dice.
 */
export function MuscleMini({ date, rows, width = 34 }: { date: string; rows: MuscleExercise[]; width?: number }) {
  const data = useMemo(() => muscleMapData(rows), [rows]);
  const { tip, onHover } = useMuscleTip(data);
  return (
    <div data-muscle-mini={date} className="relative flex flex-col items-center">
      <BodyPair states={data.states} width={width} gap={3} caption={false} interactive onHover={onHover} />
      <MuscleTipCard tip={tip} />
    </div>
  );
}
