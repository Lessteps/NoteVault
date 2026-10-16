// Weekly Muscle Volume Analytics: computes and visualises effective hypertrophy sets per muscle group.

import { CheckCircle2, Dumbbell, Flame, Info, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { addDays, weekStart } from "../../lib/habits";
import { todayIso } from "../../lib/tasks";
import type { ExerciseDay } from "../../lib/types";
import { calculateWeeklyVolume, type MuscleGroupVolume } from "../../lib/volumeCalculator";
import { useExercise } from "../../store/exercise";
import { cn } from "../ui";

export function WeeklyMuscleVolume() {
  const list = useExercise((s) => s.list);
  const [weekDays, setWeekDays] = useState<ExerciseDay[]>([]);
  const [loading, setLoading] = useState(true);

  const today = todayIso();
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.exDays(monday, sunday)
      .then((days) => {
        if (alive) {
          setWeekDays(days || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [monday, sunday]);

  const volume = useMemo(() => {
    return calculateWeeklyVolume(list, weekDays);
  }, [list, weekDays]);

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
      {/* Executive KPI summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent">
            <Dumbbell size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-mono uppercase text-faint">Series semanales</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-[20px] font-bold text-text">
                {volume.totalCompletedSets}
              </span>
              <span className="text-[12.5px] text-dim">
                de {volume.totalPlannedSets} planificadas
              </span>
            </div>
            <span className="text-[11px] text-faint">{volume.completionPct}% completado esta semana</span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Flame size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-mono uppercase text-faint">Mayor estímulo</span>
            <span className="font-semibold text-[15px] text-text mt-0.5 block">
              {volume.topFocusedGroup || "Sin rutina"}
            </span>
            <span className="text-[11px] text-faint">Grupo muscular prioritario</span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-sky-500/10 text-sky-400">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-mono uppercase text-faint">Menor volumen</span>
            <span className="font-semibold text-[15px] text-text mt-0.5 block">
              {volume.leastFocusedGroup || "Equilibrado"}
            </span>
            <span className="text-[11px] text-faint">Oportunidad de progresión</span>
          </div>
        </div>
      </div>

      {/* Hypertrophy benchmark scale legend */}
      <div className="rounded-xl border border-line bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-dim font-medium">
          <Info size={13} className="text-faint" />
          <span>Rangos de volumen semanal basados en ciencia de hipertrofia:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/60 px-2 py-0.5 text-slate-300 border border-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> &lt;6 series: Mantenimiento
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-950/60 px-2 py-0.5 text-sky-300 border border-sky-800">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> 6 - 9 series: Estímulo base
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/60 px-2 py-0.5 text-emerald-300 border border-emerald-800 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 10 - 20 series: Óptimo hipertrofia
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-950/60 px-2 py-0.5 text-amber-300 border border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> &gt;20 series: Fatiga alta / MRV
          </span>
        </div>
      </div>

      {/* Muscle groups volume cards grid */}
      <div className="space-y-3">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-faint">
          Desglose por grupo muscular (Lunes a Domingo)
        </h3>

        {loading ? (
          <div className="p-8 text-center text-[13px] text-faint">Calculando volumen semanal…</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {volume.groups.map((grp) => (
              <MuscleGroupCard key={grp.group} data={grp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MuscleGroupCard({ data }: { data: MuscleGroupVolume }) {
  const maxBenchmark = 22;
  const plannedPct = Math.min(100, Math.round((data.plannedSets / maxBenchmark) * 100));
  const completedPct = Math.min(100, Math.round((data.completedSets / maxBenchmark) * 100));

  return (
    <div className="rounded-2xl border border-line bg-card p-4 space-y-3 transition-colors hover:border-line-strong">
      {/* Title & Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-bold text-text">{data.group}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold border"
          style={{
            color: data.levelColor,
            borderColor: `color-mix(in srgb, ${data.levelColor} 30%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${data.levelColor} 10%, transparent)`,
          }}
        >
          {data.levelLabel}
        </span>
      </div>

      {/* Volume numbers */}
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-dim">
          <b className="font-mono text-[16px] text-text">{data.completedSets}</b>{" "}
          de {data.plannedSets} series hechas
        </span>
        <span className="font-mono text-[11px] text-faint">
          meta semanal: 10–20
        </span>
      </div>

      {/* Multi-layered progress bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface">
        {/* Planned volume background fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full opacity-30 transition-all duration-500"
          style={{ width: `${plannedPct}%`, backgroundColor: data.levelColor }}
        />
        {/* Completed volume solid fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${completedPct}%`, backgroundColor: data.levelColor }}
        />
      </div>

      <p className="text-[11.5px] text-faint leading-tight">
        {data.levelDescription}
      </p>

      {/* Exercises contributing */}
      {data.exercises.length > 0 && (
        <div className="pt-1 border-t border-line/60">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-faint">
            Ejercicios asignados
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.exercises.map((ex, i) => (
              <span
                key={`${ex.id}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors",
                  ex.done
                    ? "bg-emerald-500/10 text-emerald-300 font-medium"
                    : "bg-surface text-dim",
                )}
              >
                {ex.done && <CheckCircle2 size={11} className="text-emerald-400" />}
                <span>{ex.name}</span>
                <span className="font-mono text-[10px] text-faint">({ex.sets}s)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
