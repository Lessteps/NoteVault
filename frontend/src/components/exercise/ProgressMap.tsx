// El mapa grande de Progreso: el mismo cuerpo y el mismo panel del modal, pero
// embebido en la pantalla y con las métricas del periodo (sesiones y reps por
// músculo) en vez de las casillas de marcado.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { api } from "../../lib/bridge";
import {
  GRANULAR_MUSCLES,
  bestView,
  expandMuscles,
  granularGroup,
  granularName,
  muscleMapData,
  type MuscleExercise,
} from "../../lib/muscles";
import {
  muscleMetrics,
  periodRange,
  type MetricDay,
  type ProgressPeriod,
} from "../../lib/muscleMetrics";
import { useExercise } from "../../store/exercise";
import { cn } from "../ui";
import { BodyFigure } from "./BodyFigure";
import { useFail } from "./parts";

const PERIOD_LABEL: Record<ProgressPeriod, string> = {
  semana: "la semana",
  mes: "el mes",
  anio: "el año",
};

export function ProgressMap({ period }: { period: ProgressPeriod }) {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const [days, setDays] = useState<MetricDay[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);

  // El periodo se pide al backend por rango, como hace la rejilla.
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [from, to] = periodRange(period, iso);
    api
      .exDays(from, to)
      .then((rows) => {
        if (alive) setDays(rows);
      })
      // `useFail` returns a new closure on every render, so it cannot be a
      // dependency: incluirla recargaba el periodo en bucle infinito.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [period, list.length]);

  /** Los ejercicios del periodo, expandidos a los ids que pinta el cuerpo. */
  const grain = useMemo<MuscleExercise[]>(() => {
    const byId = new Map(list.map((e) => [e.id, e]));
    const out: MuscleExercise[] = [];
    const seen = new Set<string>();
    for (const day of days) {
      for (const e of day.exercises) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        const ex = byId.get(e.id);
        if (!ex) continue;
        out.push({
          id: e.id,
          name: ex.name,
          primary: expandMuscles(ex.muscles?.primary ?? []),
          secondary: expandMuscles(ex.muscles?.secondary ?? []),
          done: days.some((d) => d.log[e.id]?.done),
        });
      }
    }
    return out;
  }, [days, list]);

  const data = useMemo(() => muscleMapData(grain), [grain]);
  const metrics = useMemo(() => muscleMetrics(list, days), [list, days]);

  const openSide = useMemo(() => bestView(data), [data]);
  useEffect(() => {
    setFlipped(openSide === "back");
  }, [openSide]);

  const active = picked ?? null;
  const panelRows = active ? (data.byMuscle[active] ?? []) : grain;
  const metric = active ? metrics.get(active) : undefined;
  const sideLabel = flipped ? "Posterior" : "Anterior";

  return (
    <div data-progress-map className="flex min-h-0 flex-1 gap-3 overflow-hidden p-6 pt-3">
      {/* Cuerpo grande, a la altura de la pantalla. */}
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-card">
        <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[13px] font-semibold text-text">Mapa muscular</span>
          <span className="text-[11.5px] text-faint">En {PERIOD_LABEL[period]}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFlipped((v) => !v)}
            title="Cambiar de vista (anterior / posterior)"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:bg-hover hover:text-text"
          >
            <ArrowLeftRight size={13} /> {sideLabel}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <BodyFigure
            view={flipped ? "back" : "front"}
            fit="height"
            states={data.states}
            active={active}
            label={granularName}
            onMuscle={(id) => setPicked((p) => (p === id ? null : id))}
            onHover={(id, at) => setTip(id && at ? { id, x: at.x, y: at.y } : null)}
          />
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-line px-4 py-2 text-[11.5px] text-faint">
          {(["idle", "primary", "secondary", "done"] as const).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span className={`nv-legend nv-legend--${state}`} />
              {{ idle: "sin entrenar", primary: "principal", secondary: "secundario", done: "hecho" }[state]}
            </span>
          ))}
          <span className="ml-auto">
            {GRANULAR_MUSCLES.length} músculos · {grain.length} ejercicios
          </span>
        </div>
      </section>

      {/* Las métricas del músculo elegido. */}
      <aside className="flex w-[320px] flex-none flex-col rounded-xl border border-line bg-card">
        <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
          <span className="text-[13px] font-semibold text-text">
            {active ? granularName(active) : "Todo el periodo"}
          </span>
          {active && <span className="text-[11px] text-faint">{granularGroup(active)}</span>}
          {active && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="ml-auto text-[11px] text-faint hover:text-text"
            >
              quitar filtro
            </button>
          )}
        </div>

        <div className="flex flex-none gap-2 px-3 py-2">
          <Metric label="sesiones" value={active ? metric?.sessions ?? 0 : [...metrics.values()].reduce((a, b) => Math.max(a, b.sessions), 0)} />
          <Metric label="reps" value={active ? metric?.reps ?? 0 : [...metrics.values()].reduce((a, b) => a + b.reps, 0)} />
          <Metric label="ejercicios" value={active ? metric?.exercises ?? 0 : grain.length} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {!panelRows.length && (
            <p className="py-6 text-center text-[12px] text-faint">
              {active
                ? "Ningún ejercicio del periodo toca ese músculo."
                : "Sin ejercicios programados en este periodo."}
            </p>
          )}
          {panelRows.map((row) => (
            <div
              key={row.id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
              onClick={() => setPicked(active ? null : (row.primary[0] ?? row.secondary[0] ?? null))}
            >
              <span
                className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: row.done ? "var(--nv-muscle-done)" : "var(--nv-muscle-idle)" }}
              />
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-[12.5px]", row.done ? "text-faint line-through" : "text-text")}>
                  {row.name}
                </div>
                <div className="text-[10.5px] text-faint">
                  {row.primary.length + row.secondary.length} músculos
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {tip && (
        <div
          data-muscle-tip={tip.id}
          className="pointer-events-none fixed z-50 rounded-md border border-line-strong px-2 py-1 text-[11.5px] text-text shadow-lg"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 190), top: tip.y + 14, background: "var(--nv-elevated)" }}
        >
          {granularName(tip.id)}
          <span className="ml-1.5 text-faint">{granularGroup(tip.id)}</span>
          {metrics.has(tip.id) && (
            <span className="ml-1.5 font-mono text-faint">
              {metrics.get(tip.id)!.sessions} sesiones · {metrics.get(tip.id)!.reps} reps
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-lg border border-line px-2 py-1.5 text-center">
      <div className="font-mono text-[15px] font-semibold" style={{ color: "var(--nv-accent-text)" }}>
        {value.toLocaleString("es")}
      </div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-faint">{label}</div>
    </div>
  );
}