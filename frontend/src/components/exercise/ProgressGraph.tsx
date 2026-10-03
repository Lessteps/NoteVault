// La gráfica de Progreso: una línea por grupo muscular a lo largo del periodo,
// como un chart de cotizaciones. El eje X son los días; el Y, las reps del día.
//
// Los grupos se encienden y apagan: con seis líneas encima ya es la mitad de la
// pantalla, y cada uno solo quiere mirar las suyas. La selección se recuerda
// entre visitas.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { LineChart } from "../common/charts";
import { MUSCLE_GROUPS } from "../../lib/muscles";
import {
  periodRange,
  type MetricDay,
  type ProgressPeriod,
} from "../../lib/muscleMetrics";
import { useExercise } from "../../store/exercise";
import { usePersistedNav } from "../../store/navState";
import { cn } from "../ui";
import { useFail } from "./parts";
import { volumeSeries } from "../../lib/volumeSeries";

const PERIOD_TITLE: Record<ProgressPeriod, string> = {
  semana: "la semana",
  mes: "el mes",
  anio: "el año",
};

/**
 * `ex_days` rechaza los rangos de más de 31 días (`Rango de fechas inválido`),
 * así que un año entero se pide a trozos y se unen. Con 31 de salto, un año son
 * 12 llamadas: pocas y en paralelo.
 */
const MAX_SPAN = 30;

async function fetchRange(from: string, to: string): Promise<MetricDay[]> {
  if (from >= to) return api.exDays(from, to);
  const chunks: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 100 && cursor <= to; guard += 1) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + MAX_SPAN);
    const end = d > new Date(to) ? to : isoOf(d);
    chunks.push(cursor, end);
    if (end >= to) break;
    cursor = addDaysIso(end, 1);
  }
  const out: MetricDay[] = [];
  for (let i = 0; i < chunks.length; i += 2) {
    out.push(...(await api.exDays(chunks[i]!, chunks[i + 1]!)));
  }
  return out;
}

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + n);
  return isoOf(date);
};

/** Un color por grupo, en el orden del catálogo, para que no cambien de sitio. */
const COLOURS: Record<string, string> = {
  Pecho: "#f97316",
  Espalda: "#38bdf8",
  Piernas: "#a3e635",
  Hombros: "#e879f9",
  Brazos: "#facc15",
  Core: "#34d399",
};

const shortLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};

export function ProgressGraph({ period }: { period: ProgressPeriod }) {
  const fail = useFail();
  const list = useExercise((s) => s.list);
  const [days, setDays] = useState<MetricDay[]>([]);
  // `usePersistedNav` guarda un valor, no un updater: hay que calcular la lista
// nueva fuera, a partir del estado actual.
const [off, setOff] = usePersistedNav<string[]>("ejercicio.grafico.grupos", []);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [from, to] = periodRange(period, iso);
    fetchRange(from, to)
      .then((rows) => {
        if (alive) setDays(rows);
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [period, list.length]);

  // Todo encendido por defecto: apagar es la decisión del usuario.
  const hidden = new Set(off);
  const toggle = (g: string) =>
    setOff(off.includes(g) ? off.filter((x) => x !== g) : [...off, g]);

  const { labels, values } = useMemo(
    () => volumeSeries(list, days, MUSCLE_GROUPS),
    [list, days],
  );
  const series = MUSCLE_GROUPS.filter(
    (g) => values[g] && !hidden.has(g),
  ).map((g) => ({
    name: g,
    colour: COLOURS[g] ?? "var(--nv-accent)",
    values: values[g]!,
  }));

  return (
    <div data-progress-graph className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6 pt-3">
      <div className="flex flex-none flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[13px] font-semibold text-text">Volumen por grupo</span>
        <span className="mr-2 text-[11.5px] text-faint">
          Reps por día en {PERIOD_TITLE[period]} · los huecos son días sin entrenar
        </span>
        {MUSCLE_GROUPS.map((g) => {
          const on = !hidden.has(g);
          const has = Boolean(values[g]);
          return (
            <button
              key={g}
              type="button"
              data-group-toggle={g}
              aria-pressed={on}
              onClick={() => toggle(g)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] transition-colors",
                on ? "text-text" : "text-faint",
                !has && "opacity-40",
              )}
              style={{ borderColor: on ? COLOURS[g] : "var(--nv-line)" }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: on ? COLOURS[g] : "var(--nv-line)" }}
              />
              {g}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-card p-4">
        {series.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-faint">
            {days.length
              ? "Ninguna línea visible: enciende algún grupo."
              : "Sin registros en este periodo."}
          </p>
        ) : (
          <LineChart
            series={series}
            labels={labels.map(shortLabel)}
            height={260}
            format={(v) => `${Math.round(v)} reps`}
          />
        )}
        {series.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
            {series.map((s) => {
              const done = s.values.filter((v): v is number => v !== null).length;
              const total = s.values.reduce((a: number, b) => a + (b ?? 0), 0);
              return (
                <span key={s.name}>
                  {s.name}: <span className="font-mono">{done}</span> días ·{" "}
                  <span className="font-mono">{total}</span> reps
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}