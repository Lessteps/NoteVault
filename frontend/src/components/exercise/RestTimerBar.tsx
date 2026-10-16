// Floating rest timer bar: visual countdown between sets with interactive controls and sound.

import { Check, Pause, Play, Plus, Volume2, VolumeX, X, Zap } from "lucide-react";
import { useRestTimer } from "../../store/restTimer";
import { cn } from "../ui";

function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RestTimerBar() {
  const active = useRestTimer((s) => s.active);
  const running = useRestTimer((s) => s.running);
  const exerciseName = useRestTimer((s) => s.exerciseName);
  const totalSeconds = useRestTimer((s) => s.totalSeconds);
  const remainingSeconds = useRestTimer((s) => s.remainingSeconds);
  const completed = useRestTimer((s) => s.completed);
  const sound = useRestTimer((s) => s.sound);

  const pause = useRestTimer((s) => s.pause);
  const resume = useRestTimer((s) => s.resume);
  const addSeconds = useRestTimer((s) => s.addSeconds);
  const completeNow = useRestTimer((s) => s.completeNow);
  const stop = useRestTimer((s) => s.stop);
  const toggleSound = useRestTimer((s) => s.toggleSound);

  if (!active) return null;

  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, (totalSeconds - remainingSeconds) / totalSeconds)) : 1;

  return (
    <div
      role="region"
      aria-label="Temporizador de descanso"
      className={cn(
        "fixed bottom-5 right-6 z-40 flex w-[340px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300",
        completed
          ? "border-emerald-500/40 bg-emerald-950/80 text-emerald-100"
          : "border-line-strong bg-card/95 text-text",
      )}
    >
      {/* Top progress line */}
      <div className="h-1 w-full bg-surface/50">
        <div
          className={cn(
            "h-full transition-all duration-500 ease-linear",
            completed ? "bg-emerald-400" : "bg-amber-400",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <div className="p-3.5 space-y-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {completed ? (
              <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-500 text-white">
                <Check size={12} />
              </span>
            ) : (
              <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-amber-500/20 text-amber-400">
                <Zap size={11} />
              </span>
            )}
            <span className="truncate text-[12px] font-semibold">
              {completed ? "¡Ejercicio completado automáticamente! ✓" : exerciseName}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title={sound ? "Silenciar aviso sonoro" : "Activar aviso sonoro"}
              onClick={toggleSound}
              className="grid h-6 w-6 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text transition-colors"
            >
              {sound ? <Volume2 size={13} /> : <VolumeX size={13} className="text-faint" />}
            </button>
            <button
              type="button"
              title="Cerrar temporizador"
              onClick={stop}
              className="grid h-6 w-6 place-items-center rounded-lg text-dim hover:bg-hover hover:text-text transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Big countdown and controls */}
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <div className="flex flex-col">
            <span
              className={cn(
                "font-mono text-[26px] font-bold tracking-tight leading-none",
                completed ? "text-emerald-300" : "text-text",
              )}
            >
              {formatTime(remainingSeconds)}
            </span>
            <span className="mt-1 text-[10.5px] text-faint">
              {completed ? "Guardado con éxito en el vault" : `Cronómetro activo (${totalSeconds}s)`}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Añadir 30 segundos"
              onClick={() => addSeconds(30)}
              className="flex items-center gap-0.5 rounded-xl border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-dim hover:bg-hover hover:text-text transition-colors"
            >
              <Plus size={11} /> 30s
            </button>

            {!completed && (
              <>
                <button
                  type="button"
                  title="Completar ejercicio ahora"
                  onClick={completeNow}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors"
                >
                  <Check size={12} /> Listo
                </button>
                <button
                  type="button"
                  title={running ? "Pausar descanso" : "Reanudar descanso"}
                  onClick={running ? pause : resume}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl text-white transition-colors",
                    running
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-emerald-600 hover:bg-emerald-500",
                  )}
                >
                  {running ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
              </>
            )}

            {completed && (
              <button
                type="button"
                onClick={stop}
                className="rounded-xl bg-emerald-500 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Continuar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
