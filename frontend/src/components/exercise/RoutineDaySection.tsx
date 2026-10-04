// Un día del programa: cabecera plegable con contador y, al abrir, sus filas.
//
// Los días vacíos nacen plegados para no enterrar la lista en siete
// «Sin ejercicios». Los que tienen algo nacen abiertos.

import { useState } from "react";
import { ArrowRight, ChevronDown, Copy, Film, History, Pencil, X } from "lucide-react";
import type { Exercise } from "../../lib/types";
import { confirmAction, IconButton } from "../ui";
import { cn } from "../ui";
import { MuscleCount } from "./MusclePicker";
import { ORANGE } from "./parts";
import type { ExerciseDayMeta } from "../../store/exercise";

export function RoutineDaySection({
  day,
  days,
  exercises,
  editing,
  expanded,
  onToggle,
  onEdit,
  onRemove,
  onHistory,
  onDuplicate,
  onMove,
}: {
  day: ExerciseDayMeta;
  days: ExerciseDayMeta[];
  exercises: Exercise[];
  editing: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onHistory?: (id: string) => void;
  onDuplicate?: (from: string, to: string) => void;
  onMove?: (id: string, to: string) => void;
}) {
  // Duplicar día y mover ejercicio comparten patrón: botón → selector de día
  // destino → confirmar. Inline en la fila para no montar otro drawer.
  const [dupOpen, setDupOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  return (
    <section data-routine-day={day.key}>
      <button
        type="button"
        data-routine-day-toggle={day.key}
        aria-expanded={expanded}
        onClick={onToggle}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-hover"
      >
        <ChevronDown
          size={13}
          className={cn("flex-none text-faint transition-transform", !expanded && "-rotate-90")}
        />
        <span className="text-[12.5px] font-semibold" style={{ color: ORANGE }}>
          {day.glyph} {day.name}
        </span>
        <span className="text-[11px] font-normal text-faint">· {day.subtitle}</span>
        <span className="ml-auto rounded-full bg-elevated px-2 py-0.5 font-mono text-[10.5px] text-dim">
          {exercises.length}
        </span>
        {onDuplicate && exercises.length > 0 && (
          <span onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-duplicate-day={day.key}
              title={`Duplicar ${day.name}`}
              aria-label={`Duplicar ${day.name}`}
              onClick={() => { setDupOpen((v) => !v); setDupTarget(""); }}
              className="grid h-7 w-7 place-items-center rounded-md text-dim transition-colors hover:bg-hover hover:text-text"
            >
              <Copy size={12} />
            </button>
          </span>
        )}
      </button>
      {dupOpen && (
        <div className="mb-1 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-[12px]">
          <span className="text-faint">Duplicar a</span>
          <select
            data-duplicate-target
            aria-label="Día destino"
            value={dupTarget}
            onChange={(e) => setDupTarget(e.target.value)}
            className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[12px] text-text"
          >
            <option value="">Elige día…</option>
            {days.filter((d) => d.key !== day.key).map((d) => (
              <option key={d.key} value={d.key}>{d.name}</option>
            ))}
          </select>
          <button
            type="button"
            data-duplicate-confirm
            disabled={!dupTarget}
            onClick={() => {
              if (!dupTarget) return;
              onDuplicate?.(day.key, dupTarget);
              setDupOpen(false);
            }}
            className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-dim hover:bg-hover hover:text-text disabled:opacity-40"
          >
            Duplicar
          </button>
        </div>
      )}
      {expanded && (
        <div className="divide-y divide-line rounded-lg border border-line bg-card">
          {exercises.map((e) => (
            <div
              key={e.id}
              data-routine-exercise={e.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 text-[12.5px]",
                editing === e.id && "bg-accent-soft",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-text">{e.name}</span>
              <span className="text-[11.5px] text-dim">{e.series_reps}</span>
              <MuscleCount muscles={e.muscles} />
              <span
                title={e.has_video ? e.video_name : "Sin video"}
                className={e.has_video ? "text-mint" : "text-faint"}
              >
                <Film size={13} />
              </span>
              <IconButton title="Editar" onClick={() => onEdit(e.id)}>
                <Pencil size={12} />
              </IconButton>
              {onHistory && (
                <IconButton title="Historial" onClick={() => onHistory(e.id)}>
                  <History size={12} />
                </IconButton>
              )}
              {onMove && (
                <span>
                  <button
                    type="button"
                    data-move-exercise={e.id}
                    title={`Mover ${e.name}`}
                    aria-label={`Mover ${e.name}`}
                    onClick={() => { setMovingId(movingId === e.id ? null : e.id); setMoveTarget(""); }}
                    className="grid h-7 w-7 place-items-center rounded-md text-dim transition-colors hover:bg-hover hover:text-text"
                  >
                    <ArrowRight size={12} />
                  </button>
                </span>
              )}
              <IconButton title="Quitar" onClick={() => onRemove(e.id)}>
                <X size={12} />
              </IconButton>
            </div>
          ))}
          {movingId && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
              <span className="text-faint">Mover a</span>
              <select
                data-move-target={movingId}
                aria-label="Día destino"
                value={moveTarget}
                onChange={(ev) => setMoveTarget(ev.target.value)}
                className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[12px] text-text"
              >
                <option value="">Elige día…</option>
                {days.map((d) => (
                  <option key={d.key} value={d.key}>{d.name}</option>
                ))}
              </select>
              <button
                type="button"
                data-move-confirm={movingId}
                disabled={!moveTarget}
                onClick={() => {
                  if (!moveTarget || !movingId) return;
                  onMove?.(movingId, moveTarget);
                  setMovingId(null);
                }}
                className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-dim hover:bg-hover hover:text-text disabled:opacity-40"
              >
                Mover
              </button>
            </div>
          )}
          {!exercises.length && (
            <div className="px-3 py-2 text-[12px] text-faint">Sin ejercicios.</div>
          )}
        </div>
      )}
    </section>
  );
}

// Reexportado para que `Routine.tsx` no importe la confirmación: quitar sigue
// pidiendo confirmación y conservando los registros, como antes.
export async function confirmRemove(name: string): Promise<boolean> {
  return confirmAction(
    "Quitar ejercicio",
    `¿Quitar «${name}» de la rutina? Los registros pasados se conservan.`,
    "Quitar",
    true,
  );
}
