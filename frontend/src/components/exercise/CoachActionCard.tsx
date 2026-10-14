// Tarjeta de acción del Coach de Entrenamiento.
//
// Muestra propuestas de ejercicios para añadir a la rutina semanal de un día
// específico y permite aplicarlos al vault con un solo clic a través de `api.exSave`.

import { BookOpen, Check, Dumbbell, Loader2, Plus, Scale, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CoachAction } from "../../lib/exerciseCoachActions";
import { normalizeLibraryName } from "../../lib/libraryTypes";
import { todayIso } from "../../lib/tasks";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useExercise } from "../../store/exercise";
import { cn } from "../ui";

const DAY_LABELS: Record<string, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

export function CoachActionCard({
  action,
  onApplied,
}: {
  action: CoachAction;
  onApplied?: () => void;
}) {
  const toast = useApp((s) => s.toast);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const isRoutine = action.action === "add_exercise" || action.action === "remove_exercise";
  const dayCap = isRoutine
    ? DAY_LABELS[action.day] || action.day.charAt(0).toUpperCase() + action.day.slice(1)
    : "";

  const handleApply = async () => {
    if (applying || applied || discarded) return;
    setApplying(true);

    try {
      if (action.action === "add_exercise") {
        for (const ex of action.exercises) {
          await api.exSave("", {
            day: action.day,
            name: ex.name,
            series_reps: ex.series_reps || "",
            rest: ex.rest || "",
            how_to: ex.how_to || "",
            muscles: ex.muscles,
          });
        }
        await useExercise.getState().refresh();
        setApplied(true);
        toast("info", `Ejercicios añadidos a la rutina del ${dayCap}`);
      } else if (action.action === "add_to_library") {
        await api.exLibrarySave({
          name: action.exercise.name,
          equipment: action.exercise.equipment,
          muscles: action.exercise.muscles,
          how_to: action.exercise.how_to,
        });
        setApplied(true);
        toast("info", `Ejercicio "${action.exercise.name}" guardado en tu Biblioteca`);
      } else if (action.action === "remove_exercise") {
        const list = useExercise.getState().list;
        const normTarget = normalizeLibraryName(action.exercise_name);
        const match = list.find((e) => e.day === action.day && (normalizeLibraryName(e.name) === normTarget || e.id === action.exercise_id || normalizeLibraryName(e.name).includes(normTarget) || normTarget.includes(normalizeLibraryName(e.name))));
        if (!match) {
          throw new Error(`No se encontró «${action.exercise_name}» en la rutina del ${dayCap}`);
        }
        await api.exRemove(match.id);
        await useExercise.getState().refresh();
        setApplied(true);
        toast("info", `«${match.name}» eliminado de la rutina del ${dayCap}`);
      } else if (action.action === "remove_from_library") {
        let slug = action.slug;
        if (!slug) {
          const libList = await api.exLibraryList();
          const target = normalizeLibraryName(action.exercise_name);
          const found = libList.find((e) => normalizeLibraryName(e.name) === target || normalizeLibraryName(e.name).includes(target));
          slug = found?.slug;
        }
        if (!slug) {
          throw new Error(`No se encontró el ejercicio «${action.exercise_name}» en tu biblioteca propia.`);
        }
        await api.exLibraryRemove(slug);
        setApplied(true);
        toast("info", `Ejercicio «${action.exercise_name}» eliminado de tu Biblioteca`);
      } else if (action.action === "record_weight") {
        const date = action.date || todayIso();
        await api.exWeightAdd(date, action.weight);
        await useExercise.getState().refreshProfile();
        setApplied(true);
        toast("info", `Pesaje de ${action.weight} kg registrado en tu historial`);
      }
      onApplied?.();
    } catch (e) {
      toast("error", `Error al guardar: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  if (discarded) {
    return (
      <div className="mt-2.5 rounded-lg border border-line bg-surface/40 p-2 text-[11px] text-faint">
        Propuesta descartada.
      </div>
    );
  }

  if (action.action === "record_weight") {
    return (
      <div className="mt-2.5 rounded-lg border border-accent/40 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-accent-text">
            <Scale size={14} />
            <span className="text-[12px] font-semibold text-text">
              Registro de peso corporal
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Pesaje guardado
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <p className="text-text">
            ¿Deseas registrar <strong className="font-bold text-accent-text">{action.weight} kg</strong> en tu historial de peso{action.date ? ` para la fecha ${action.date}` : " de hoy"}?
          </p>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Guardar {action.weight} kg en mi historial
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "remove_from_library") {
    return (
      <div className="mt-2.5 rounded-lg border border-danger/30 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-danger">
            <Trash2 size={14} />
            <span className="text-[12px] font-semibold">
              Eliminar de la Biblioteca
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Eliminado de tu Biblioteca
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <p className="text-text">
            ¿Deseas eliminar <strong className="text-danger">{action.exercise_name}</strong> de tu biblioteca propia?
          </p>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Conservar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-danger px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-danger/80 disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Eliminando…
                </>
              ) : (
                <>
                  <Trash2 size={12} /> Eliminar de mi Biblioteca
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "remove_exercise") {
    return (
      <div className="mt-2.5 rounded-lg border border-danger/30 bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5 text-danger">
            <Trash2 size={14} />
            <span className="text-[12px] font-semibold">
              Quitar ejercicio de rutina · {dayCap}
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Eliminado de tu rutina
            </span>
          )}
        </div>

        <div className="my-2.5 rounded bg-panel/70 p-2.5 text-[12px]">
          <p className="text-text">
            ¿Deseas quitar <strong className="text-danger">{action.exercise_name}</strong> de tu rutina del {dayCap}?
          </p>
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              Conservar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-danger px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-danger/80 disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Quitando…
                </>
              ) : (
                <>
                  <Trash2 size={12} /> Quitar de mi rutina del {dayCap}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (action.action === "add_to_library") {
    const ex = action.exercise;
    return (
      <div className="mt-2.5 rounded-lg border border-line-strong bg-surface p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-1.5">
            <BookOpen size={14} className="text-accent-text" />
            <span className="text-[12px] font-semibold text-text">
              Nuevo ejercicio para tu Biblioteca
            </span>
          </div>
          {applied && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check size={12} /> Guardado en Biblioteca
            </span>
          )}
        </div>

        <div className="my-2.5 space-y-1.5 rounded bg-panel/70 p-2.5 text-[11.5px]">
          <div className="flex items-center justify-between font-medium text-text">
            <span className="text-[12.5px] font-semibold">{ex.name}</span>
            {ex.equipment && (
              <span className="rounded bg-hover px-1.5 py-0.5 text-[10px] text-dim capitalize">
                {ex.equipment}
              </span>
            )}
          </div>

          {ex.muscles && (
            <div className="space-y-0.5 text-[10.5px] text-dim">
              {ex.muscles.primary.length > 0 && (
                <div>
                  <span className="font-medium text-text">Músculos primarios:</span>{" "}
                  {ex.muscles.primary.join(", ")}
                </div>
              )}
              {ex.muscles.secondary.length > 0 && (
                <div>
                  <span className="font-medium text-text">Secundarios:</span>{" "}
                  {ex.muscles.secondary.join(", ")}
                </div>
              )}
            </div>
          )}

          {ex.how_to && (
            <p className="mt-1 text-[10.5px] text-faint italic leading-relaxed">
              {ex.how_to}
            </p>
          )}
        </div>

        {!applied && (
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDiscarded(true)}
              disabled={applying}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
            >
              <Trash2 size={11} /> Descartar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className={cn(
                "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
              )}
            >
              {applying ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Plus size={12} /> Guardar en mi Biblioteca
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-lg border border-line-strong bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5">
          <Dumbbell size={14} className="text-accent-text" />
          <span className="text-[12px] font-semibold text-text">
            Modificación de rutina sugerida · {dayCap}
          </span>
        </div>
        {applied && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
            <Check size={12} /> Añadido a tu rutina
          </span>
        )}
      </div>

      {/* Lista de ejercicios */}
      <div className="my-2.5 space-y-2">
        {action.exercises.map((ex, idx) => (
          <div key={idx} className="rounded bg-panel/70 p-2 text-[11.5px]">
            <div className="flex items-center justify-between font-medium text-text">
              <span>{ex.name}</span>
              {(ex.series_reps || ex.rest) && (
                <span className="text-[10.5px] text-dim">
                  {[ex.series_reps, ex.rest ? `descanso ${ex.rest}` : ""].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            {ex.how_to && (
              <p className="mt-1 text-[10.5px] text-faint italic leading-relaxed">
                {ex.how_to}
              </p>
            )}
            {ex.muscles && (ex.muscles.primary.length > 0 || ex.muscles.secondary.length > 0) && (
              <div className="mt-1 text-[10px] text-dim">
                {[
                  ex.muscles.primary.length ? `Músculos: ${ex.muscles.primary.join(", ")}` : "",
                  ex.muscles.secondary.length ? `Secundarios: ${ex.muscles.secondary.join(", ")}` : "",
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Acciones */}
      {!applied && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setDiscarded(true)}
            disabled={applying}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-faint hover:bg-hover hover:text-text disabled:opacity-50 transition-colors"
          >
            <Trash2 size={11} /> Descartar
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={applying}
            className={cn(
              "flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-60 transition-colors",
            )}
          >
            {applying ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Guardando…
              </>
            ) : (
              <>
                <Plus size={12} /> Añadir a mi rutina del {dayCap}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

